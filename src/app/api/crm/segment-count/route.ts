import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import type { SegmentCriteria, SegmentCriterion } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.entity_id) {
      return NextResponse.json({ data: null, error: "Profile not found" }, { status: 403 });
    }

    const body = await request.json();
    const criteria = body.criteria as SegmentCriteria;

    if (!criteria || !criteria.criteria || criteria.criteria.length === 0) {
      return NextResponse.json({ data: { count: 0, prospectCount: 0, clientCount: 0 }, error: null });
    }

    const entityId = profile.entity_id;
    let prospectCount = 0;
    let clientCount = 0;

    if (criteria.targetPool === "prospects" || criteria.targetPool === "both") {
      prospectCount = await countProspects(supabase, criteria.criteria, entityId);
    }

    if (criteria.targetPool === "clients" || criteria.targetPool === "both") {
      clientCount = await countClients(supabase, criteria.criteria, entityId);
    }

    return NextResponse.json({
      data: { count: prospectCount + clientCount, prospectCount, clientCount },
      error: null,
    });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "counting segment") }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countProspects(supabase: any, criteria: SegmentCriterion[], entityId: string): Promise<number> {
  let query = supabase
    .from("crm_prospects")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", entityId);

  for (const c of criteria) {
    switch (c.type) {
      case "prospect_status":
        if (c.values.length > 0) query = query.in("status", c.values);
        break;
      case "prospect_source":
        if (c.values.length > 0) query = query.in("source", c.values);
        break;
      case "prospect_score":
        if (c.min !== undefined && c.min !== null) query = query.gte("score", c.min);
        if (c.max !== undefined && c.max !== null) query = query.lte("score", c.max);
        break;
      case "prospect_training":
        if (c.trainingIds.length > 0) query = query.in("linked_training_id", c.trainingIds);
        break;
      case "prospect_created_at":
        if (c.dateFrom) query = query.gte("created_at", c.dateFrom);
        if (c.dateTo) query = query.lte("created_at", c.dateTo + "T23:59:59");
        break;
      case "tags": {
        if (c.tagIds.length === 0) break;
        const { data: tagRows } = await supabase
          .from("crm_prospect_tags")
          .select("prospect_id")
          .in("tag_id", c.tagIds);
        if (!tagRows || tagRows.length === 0) return 0;

        if (c.operator === "all") {
          // Must have ALL selected tags
          const countMap = new Map<string, number>();
          for (const r of tagRows) {
            countMap.set(r.prospect_id, (countMap.get(r.prospect_id) ?? 0) + 1);
          }
          const matchingIds = [...countMap.entries()]
            .filter(([, count]) => count >= c.tagIds.length)
            .map(([id]) => id);
          if (matchingIds.length === 0) return 0;
          query = query.in("id", matchingIds);
        } else {
          const prospectIds = [...new Set(tagRows.map((r: { prospect_id: string }) => r.prospect_id))];
          if (prospectIds.length === 0) return 0;
          query = query.in("id", prospectIds);
        }
        break;
      }
      // Client-only criteria are ignored for prospect counting
      case "client_status":
      case "client_sector":
      case "client_city":
      case "client_created_at":
      case "training_participation":
        break;
    }
  }

  const { count } = await query;
  return count ?? 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countClients(supabase: any, criteria: SegmentCriterion[], entityId: string): Promise<number> {
  let query = supabase
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", entityId);

  for (const c of criteria) {
    switch (c.type) {
      case "client_status":
        if (c.values.length > 0) query = query.in("status", c.values);
        break;
      case "client_sector":
        if (c.value) {
          if (c.operator === "contains") {
            query = query.ilike("sector", `%${c.value}%`);
          } else {
            query = query.eq("sector", c.value);
          }
        }
        break;
      case "client_city":
        if (c.value) {
          if (c.operator === "contains") {
            query = query.ilike("city", `%${c.value}%`);
          } else {
            query = query.eq("city", c.value);
          }
        }
        break;
      case "client_created_at":
        if (c.dateFrom) query = query.gte("created_at", c.dateFrom);
        if (c.dateTo) query = query.lte("created_at", c.dateTo + "T23:59:59");
        break;
      case "tags": {
        if (c.tagIds.length === 0) break;
        const { data: tagRows } = await supabase
          .from("crm_client_tags")
          .select("client_id")
          .in("tag_id", c.tagIds);
        if (!tagRows || tagRows.length === 0) return 0;

        if (c.operator === "all") {
          const countMap = new Map<string, number>();
          for (const r of tagRows) {
            countMap.set(r.client_id, (countMap.get(r.client_id) ?? 0) + 1);
          }
          const matchingIds = [...countMap.entries()]
            .filter(([, count]) => count >= c.tagIds.length)
            .map(([id]) => id);
          if (matchingIds.length === 0) return 0;
          query = query.in("id", matchingIds);
        } else {
          const clientIds = [...new Set(tagRows.map((r: { client_id: string }) => r.client_id))];
          if (clientIds.length === 0) return 0;
          query = query.in("id", clientIds);
        }
        break;
      }
      case "training_participation": {
        if (c.trainingIds.length === 0) break;
        // Get client_ids from enrollments linked to sessions of the selected trainings
        const { data: sessionData } = await supabase
          .from("sessions")
          .select("id")
          .in("training_id", c.trainingIds);
        if (!sessionData || sessionData.length === 0) return 0;

        const sessionIds = sessionData.map((s: { id: string }) => s.id);
        const { data: enrollmentData } = await supabase
          .from("enrollments")
          .select("client_id")
          .in("session_id", sessionIds)
          .not("client_id", "is", null);
        if (!enrollmentData || enrollmentData.length === 0) return 0;

        const clientIds = [...new Set(enrollmentData.map((e: { client_id: string }) => e.client_id))];
        if (clientIds.length === 0) return 0;
        query = query.in("id", clientIds);
        break;
      }
      // Prospect-only criteria are ignored for client counting
      case "prospect_status":
      case "prospect_source":
      case "prospect_score":
      case "prospect_training":
      case "prospect_created_at":
        break;
    }
  }

  const { count } = await query;
  return count ?? 0;
}
