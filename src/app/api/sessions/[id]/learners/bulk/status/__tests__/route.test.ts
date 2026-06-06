/**
 * Tests Story E2-S04 — GET /api/sessions/[id]/learners/bulk/status
 *
 * Couvre les 5 acceptance criteria :
 *  - 200 : job trouvé dans l'entité active (admin) → réponse JSON whitelist
 *  - 404 : job inexistant
 *  - 404 : job appartient à une autre entité (anti-énumération, PAS 403)
 *  - 404 : job appartient à une autre session (anti-énumération, PAS 403)
 *  - 400 : query jobId manquant ou non-UUID
 *  - 401 : non authentifié (propagé depuis requireRole)
 *
 * Vérifie aussi que `payload` et `created_by` ne sont JAMAIS renvoyés au client
 * (whitelist explicite — protection PII + données learners pré-création).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Mocks helpers projet — doivent être déclarés AVANT l'import de la route.
const mockRequireRole = vi.fn();
const mockResolveActiveEntityId = vi.fn();
const mockMaybeSingle = vi.fn();

vi.mock("@/lib/auth/require-role", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

vi.mock("@/lib/crm/active-entity", () => ({
  resolveActiveEntityId: (...args: unknown[]) =>
    mockResolveActiveEntityId(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    }),
  }),
}));

// silence sanitizeError logs
vi.mock("@/lib/api-error", () => ({
  sanitizeError: () => "Une erreur interne est survenue",
}));

import { GET } from "../route";

const ACTIVE_ENTITY = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ENTITY = "44444444-4444-4444-8444-444444444444";
const OTHER_SESSION = "55555555-5555-4555-8555-555555555555";

const baseProfile = {
  id: "admin-1",
  role: "admin",
  entity_id: ACTIVE_ENTITY,
};

function makeRequest(jobIdParam: string | null): NextRequest {
  const url = jobIdParam === null
    ? `http://localhost/api/sessions/${SESSION_ID}/learners/bulk/status`
    : `http://localhost/api/sessions/${SESSION_ID}/learners/bulk/status?jobId=${jobIdParam}`;
  return new NextRequest(url);
}

beforeEach(() => {
  mockRequireRole.mockReset();
  mockResolveActiveEntityId.mockReset();
  mockMaybeSingle.mockReset();

  // par défaut : auth admin OK sur l'entité active
  mockRequireRole.mockResolvedValue({
    error: null,
    user: { id: "admin-1" },
    profile: baseProfile,
  });
  mockResolveActiveEntityId.mockReturnValue(ACTIVE_ENTITY);
});

describe("GET /api/sessions/[id]/learners/bulk/status (E2-S04)", () => {
  it("200 — job trouvé dans l'entité active → renvoie le job whitelisté", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: JOB_ID,
        entity_id: ACTIVE_ENTITY,
        session_id: SESSION_ID,
        status: "completed",
        payload_count: 3,
        results: { created_count: 3, error_count: 0 },
        pdf_signed_url: "https://files/x.pdf",
        pdf_signed_url_expires_at: "2026-06-08T10:00:00Z",
        error_message: null,
        created_at: "2026-06-07T09:00:00Z",
        updated_at: "2026-06-07T09:05:00Z",
      },
      error: null,
    });

    const res = await GET(makeRequest(JOB_ID), {
      params: { id: SESSION_ID },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.job).toEqual({
      id: JOB_ID,
      status: "completed",
      payload_count: 3,
      results: { created_count: 3, error_count: 0 },
      pdf_signed_url: "https://files/x.pdf",
      pdf_signed_url_expires_at: "2026-06-08T10:00:00Z",
      error_message: null,
      created_at: "2026-06-07T09:00:00Z",
      updated_at: "2026-06-07T09:05:00Z",
    });
    // SEC : ne jamais exposer payload ni created_by
    expect(body.job).not.toHaveProperty("payload");
    expect(body.job).not.toHaveProperty("created_by");
    expect(body.job).not.toHaveProperty("entity_id");
    expect(body.job).not.toHaveProperty("session_id");
  });

  it("404 — job inexistant", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await GET(makeRequest(JOB_ID), {
      params: { id: SESSION_ID },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("job_not_found");
  });

  it("404 — job appartient à une autre entité (anti-énumération)", async () => {
    // Le job existe mais entity_id ≠ active. On NE DOIT PAS renvoyer 403 (qui
    // révèlerait son existence) — strictement 404 comme un job inexistant.
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: JOB_ID,
        entity_id: OTHER_ENTITY,
        session_id: SESSION_ID,
        status: "completed",
        payload_count: 1,
        results: null,
        pdf_signed_url: null,
        pdf_signed_url_expires_at: null,
        error_message: null,
        created_at: "2026-06-07T09:00:00Z",
        updated_at: "2026-06-07T09:05:00Z",
      },
      error: null,
    });
    const res = await GET(makeRequest(JOB_ID), {
      params: { id: SESSION_ID },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("job_not_found");
  });

  it("404 — job appartient à une autre session de la même entité (anti-énum)", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: JOB_ID,
        entity_id: ACTIVE_ENTITY,
        session_id: OTHER_SESSION,
        status: "completed",
        payload_count: 1,
        results: null,
        pdf_signed_url: null,
        pdf_signed_url_expires_at: null,
        error_message: null,
        created_at: "2026-06-07T09:00:00Z",
        updated_at: "2026-06-07T09:05:00Z",
      },
      error: null,
    });
    const res = await GET(makeRequest(JOB_ID), {
      params: { id: SESSION_ID },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("job_not_found");
  });

  it("400 — jobId manquant", async () => {
    const res = await GET(makeRequest(null), {
      params: { id: SESSION_ID },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_or_invalid_job_id");
    // Pas d'appel DB si la validation a échoué
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it("400 — jobId non-UUID", async () => {
    const res = await GET(makeRequest("not-a-uuid"), {
      params: { id: SESSION_ID },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_or_invalid_job_id");
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it("401 — non authentifié (propagé par requireRole)", async () => {
    mockRequireRole.mockResolvedValue({
      error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }),
      user: null,
      profile: null,
    });
    const res = await GET(makeRequest(JOB_ID), {
      params: { id: SESSION_ID },
    });
    expect(res.status).toBe(401);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it("403 — rôle non autorisé (propagé par requireRole)", async () => {
    mockRequireRole.mockResolvedValue({
      error: NextResponse.json({ error: "Accès non autorisé" }, { status: 403 }),
      user: null,
      profile: null,
    });
    const res = await GET(makeRequest(JOB_ID), {
      params: { id: SESSION_ID },
    });
    expect(res.status).toBe(403);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it("super_admin : utilise resolveActiveEntityId (cookie) pour scoping", async () => {
    const superProfile = {
      id: "super-1",
      role: "super_admin",
      entity_id: OTHER_ENTITY, // profile sur entité B
    };
    mockRequireRole.mockResolvedValue({
      error: null,
      user: { id: "super-1" },
      profile: superProfile,
    });
    // resolveActiveEntityId renvoie l'entité du cookie (A)
    mockResolveActiveEntityId.mockReturnValue(ACTIVE_ENTITY);

    mockMaybeSingle.mockResolvedValue({
      data: {
        id: JOB_ID,
        entity_id: ACTIVE_ENTITY,
        session_id: SESSION_ID,
        status: "queued",
        payload_count: 2,
        results: null,
        pdf_signed_url: null,
        pdf_signed_url_expires_at: null,
        error_message: null,
        created_at: "2026-06-07T09:00:00Z",
        updated_at: "2026-06-07T09:00:00Z",
      },
      error: null,
    });
    const res = await GET(makeRequest(JOB_ID), {
      params: { id: SESSION_ID },
    });
    expect(res.status).toBe(200);
    expect(mockResolveActiveEntityId).toHaveBeenCalledWith(superProfile);
  });

  it("500 — erreur DB → sanitizeError, pas de fuite", async () => {
    mockMaybeSingle.mockRejectedValue(new Error("connection lost"));
    const res = await GET(makeRequest(JOB_ID), {
      params: { id: SESSION_ID },
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Une erreur interne est survenue");
    // Pas de fuite du message brut
    expect(body.error).not.toContain("connection");
  });
});
