import type { Config } from "@netlify/functions";

/**
 * Scheduled function quotidienne — moteur d'automatisation.
 *
 * Pingue séquentiellement :
 * 1. /api/formations/automation-rules/run-cron (mode global formations)
 * 2. /api/documents/process-sign-reminders (relances signatures documents)
 * 3. /api/crm/automations/run (mode cron CRM, ajouté par aut-a-2)
 *
 * Chaque ping est wrappé dans un try/catch INDÉPENDANT (NFR-AUT-REL-3) :
 * un fail sur l'un n'empêche pas les autres d'être tentés.
 *
 * Émet un event structuré `automation_scheduled_run_completed` consommé par :
 * - Bannière UI détection cron > 25h (aut-e-3)
 * - Future page scheduler-health (DD-AUT-2, V2)
 *
 * Schedule : 0 7 * * * (7h UTC quotidien, conservé depuis création)
 */

type PingResult = {
  status: number;
  data?: unknown;
  error?: string;
};

async function pingEndpoint(
  url: string,
  cronSecret: string,
  label: string,
): Promise<PingResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const data = await res.json().catch(() => null);
    console.log(`[cron] ${label} result (status ${res.status}):`, JSON.stringify(data));
    return { status: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron] ${label} failed:`, message);
    return { status: 0, error: message };
  }
}

export default async () => {
  const baseUrl = process.env.URL || "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;
  const ts = new Date().toISOString();
  const start = Date.now();

  if (!cronSecret) {
    console.error("[cron] CRON_SECRET not configured");
    return new Response("CRON_SECRET not configured", { status: 500 });
  }

  // NFR-AUT-REL-3 : 3 pings indépendants — un fail n'interrompt pas les autres
  const formationsResult = await pingEndpoint(
    `${baseUrl}/api/formations/automation-rules/run-cron`,
    cronSecret,
    "automation-rules (formations)",
  );

  const signRemindersResult = await pingEndpoint(
    `${baseUrl}/api/documents/process-sign-reminders`,
    cronSecret,
    "sign-reminders (documents)",
  );

  const crmResult = await pingEndpoint(
    `${baseUrl}/api/crm/automations/run`,
    cronSecret,
    "automations (CRM)",
  );

  const duration_ms = Date.now() - start;
  const anyOk = [formationsResult, signRemindersResult, crmResult].some(
    (r) => r.status >= 200 && r.status < 300,
  );

  // Event structuré consommé par la bannière UI aut-e-3 (détection cron > 25h)
  // et par la future page scheduler-health (DD-AUT-2, V2).
  console.log(
    JSON.stringify({
      event: "automation_scheduled_run_completed",
      ts,
      duration_ms,
      formations_status: formationsResult.status,
      formations_result: formationsResult.data ?? formationsResult.error,
      sign_reminders_status: signRemindersResult.status,
      sign_reminders_result: signRemindersResult.data ?? signRemindersResult.error,
      crm_status: crmResult.status,
      crm_result: crmResult.data ?? crmResult.error,
    }),
  );

  return new Response(
    JSON.stringify({
      ok: anyOk,
      formations: formationsResult,
      sign_reminders: signRemindersResult,
      crm: crmResult,
      duration_ms,
    }),
    { status: anyOk ? 200 : 500, headers: { "Content-Type": "application/json" } },
  );
};

export const config: Config = {
  schedule: "0 7 * * *",
};
