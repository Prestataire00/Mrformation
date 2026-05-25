import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { claudeChat } from "@/lib/ai/claude-client";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { z } from "zod";
import { mapStatusToFlags } from "@/lib/utils/document-status";

const SYSTEM = `Tu es un auditeur Qualiopi certifié COFRAC. Tu simules un audit blanc sur un organisme de formation français. Tu connais les 7 critères, 32 indicateurs, le guide de lecture V9. Réponds TOUJOURS en JSON strict, SANS markdown.`;

const Body = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("formation"), session_id: z.string().uuid() }),
  z.object({ mode: z.literal("global") }),
]);

export async function POST(req: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const { allowed, resetAt } = checkRateLimit(`qualiopi-audit-${auth.user.id}`, { limit: 10, windowSeconds: 3600 });
  if (!allowed) return rateLimitResponse(resetAt);

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: "Requête invalide", details: (err as Error).message }, { status: 400 });
  }

  try {
    if (body.mode === "formation") {
      const session_id = body.session_id;
      const [{ data: session }, { data: documentsRows }] = await Promise.all([
        auth.supabase
          .from("sessions")
          .select(`*, formation_evaluation_assignments(evaluation_type), enrollments(id)`)
          .eq("id", session_id)
          .single(),
        auth.supabase
          .from("documents")
          .select("doc_type, status")
          .eq("source_table", "sessions")
          .eq("source_id", session_id),
      ]);

      if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

      const docs = (documentsRows ?? []).map((d) => ({
        doc_type: d.doc_type,
        ...mapStatusToFlags(d.status as string),
      }));
      const evals = session.formation_evaluation_assignments || [];
      const context = {
        title: session.title,
        type: session.type,
        apprenants: session.enrollments?.length || 0,
        convention_signed: docs.some((d: { doc_type: string; is_signed: boolean }) => d.doc_type === "convention_entreprise" && d.is_signed),
        convocation_sent: docs.some((d: { doc_type: string; is_sent: boolean }) => d.doc_type === "convocation" && d.is_sent),
        has_eval_pre: evals.some((e: { evaluation_type: string }) => e.evaluation_type === "eval_preformation"),
        has_eval_post: evals.some((e: { evaluation_type: string }) => e.evaluation_type === "eval_postformation"),
      };

      const response = await claudeChat(
        [{ role: "user", content: `Audit blanc formation :\n${JSON.stringify(context)}\n\nJSON: {"overall_verdict":"conforme"|"conforme_remarques"|"ecarts_mineurs"|"ecarts_majeurs","findings":[{"critere":1-7,"status":"conforme"|"ecart_mineur"|"ecart_majeur","question":"...","recommendation":"..."}],"action_plan":[{"title":"...","priority":"urgent"|"high"|"medium","estimated_effort":"..."}]}` }],
        { system: SYSTEM, maxTokens: 3000, temperature: 0.2 }
      );

      const result = JSON.parse(response.content.replace(/```json|```/g, "").trim());

      await auth.supabase.from("qualiopi_mock_audits").insert({
        entity_id: session.entity_id,
        session_id,
        audit_type: "surveillance",
        scope: "formation",
        overall_verdict: result.overall_verdict,
        findings: result.findings,
        action_plan: result.action_plan,
        generated_by: auth.user.id,
      });

      return NextResponse.json(result);
    }

    if (body.mode === "global") {
      const entityId = auth.profile.entity_id;
      const { data: sessions } = await auth.supabase
        .from("sessions")
        .select("id, title, status, qualiopi_score")
        .eq("entity_id", entityId)
        .gte("start_date", new Date(Date.now() - 365 * 86400000).toISOString())
        .limit(20);

      const avgScore = (sessions || []).reduce((s: number, x: { qualiopi_score: number }) => s + (x.qualiopi_score || 0), 0) / Math.max(1, (sessions || []).length);

      const response = await claudeChat(
        [{ role: "user", content: `Audit global organisme : ${(sessions || []).length} formations, score moyen ${avgScore.toFixed(0)}%.\n\nMême JSON que formation audit, scope="global".` }],
        { system: SYSTEM, maxTokens: 2500, temperature: 0.2 }
      );

      const result = JSON.parse(response.content.replace(/```json|```/g, "").trim());

      await auth.supabase.from("qualiopi_mock_audits").insert({
        entity_id: entityId,
        audit_type: "surveillance",
        scope: "global",
        overall_verdict: result.overall_verdict,
        findings: result.findings,
        action_plan: result.action_plan,
        generated_by: auth.user.id,
      });

      return NextResponse.json(result);
    }
  } catch (err) {
    console.error("[qualiopi-mock-audit]", err);
    return NextResponse.json({ error: "Audit IA échoué" }, { status: 500 });
  }
}
