import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
import { requireRole } from "@/lib/auth/require-role";
import { requireElearningCourse, requireElearningEnrollment } from "@/lib/auth/elearning-access";

// Mock minimal d'un client Supabase chainable renvoyant `result`.
function mockSupabase(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return { from: vi.fn(() => chain) } as never;
}

const okAuth = (role: string, supabase: unknown) => ({
  error: null,
  user: { id: "user-1" },
  profile: { id: "user-1", role, entity_id: "ent-A" },
  supabase,
});

describe("requireElearningCourse", () => {
  beforeEach(() => vi.mocked(requireRole).mockReset());

  it("propage l'erreur de requireRole (rôle refusé)", async () => {
    const errResp = { status: 403 } as never;
    vi.mocked(requireRole).mockResolvedValue({ error: errResp, user: null, profile: null } as never);
    const res = await requireElearningCourse("c1", ["admin"]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe(errResp);
  });

  it("refuse (403) un cours d'une autre entité", async () => {
    const supabase = mockSupabase({ data: { id: "c1", entity_id: "ent-B" }, error: null });
    vi.mocked(requireRole).mockResolvedValue(okAuth("admin", supabase) as never);
    const res = await requireElearningCourse("c1", ["admin"]);
    expect(res.ok).toBe(false);
  });

  it("404 si le cours est introuvable", async () => {
    const supabase = mockSupabase({ data: null, error: null });
    vi.mocked(requireRole).mockResolvedValue(okAuth("admin", supabase) as never);
    const res = await requireElearningCourse("c1", ["admin"]);
    expect(res.ok).toBe(false);
  });

  it("succès : cours de la même entité", async () => {
    const supabase = mockSupabase({ data: { id: "c1", entity_id: "ent-A" }, error: null });
    vi.mocked(requireRole).mockResolvedValue(okAuth("admin", supabase) as never);
    const res = await requireElearningCourse("c1", ["admin"]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.course.id).toBe("c1");
  });
});

describe("requireElearningEnrollment", () => {
  beforeEach(() => vi.mocked(requireRole).mockReset());

  it("refuse (403) une inscription d'une autre entité", async () => {
    const supabase = mockSupabase({
      data: {
        id: "e1", course_id: "c1", learner_id: "l1",
        elearning_courses: { entity_id: "ent-B" },
        learners: { profile_id: "user-1" },
      },
      error: null,
    });
    vi.mocked(requireRole).mockResolvedValue(okAuth("admin", supabase) as never);
    const res = await requireElearningEnrollment("e1", ["admin", "learner"]);
    expect(res.ok).toBe(false);
  });

  it("refuse (403) un learner sur une inscription qui n'est pas la sienne", async () => {
    const supabase = mockSupabase({
      data: {
        id: "e1", course_id: "c1", learner_id: "l1",
        elearning_courses: { entity_id: "ent-A" },
        learners: { profile_id: "autre-user" },
      },
      error: null,
    });
    vi.mocked(requireRole).mockResolvedValue(okAuth("learner", supabase) as never);
    const res = await requireElearningEnrollment("e1", ["admin", "learner"]);
    expect(res.ok).toBe(false);
  });

  it("succès : learner sur sa propre inscription", async () => {
    const supabase = mockSupabase({
      data: {
        id: "e1", course_id: "c1", learner_id: "l1",
        elearning_courses: { entity_id: "ent-A" },
        learners: { profile_id: "user-1" },
      },
      error: null,
    });
    vi.mocked(requireRole).mockResolvedValue(okAuth("learner", supabase) as never);
    const res = await requireElearningEnrollment("e1", ["admin", "learner"]);
    expect(res.ok).toBe(true);
  });

  it("succès : un admin n'est pas soumis au contrôle de propriété", async () => {
    const supabase = mockSupabase({
      data: {
        id: "e1", course_id: "c1", learner_id: "l1",
        elearning_courses: { entity_id: "ent-A" },
        learners: { profile_id: "autre-user" },
      },
      error: null,
    });
    vi.mocked(requireRole).mockResolvedValue(okAuth("admin", supabase) as never);
    const res = await requireElearningEnrollment("e1", ["admin", "learner"]);
    expect(res.ok).toBe(true);
  });
});
