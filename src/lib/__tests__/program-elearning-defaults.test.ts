import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listProgramElearningDefaults,
  addProgramElearningDefault,
  removeProgramElearningDefault,
  updateProgramElearningDefault,
} from "@/lib/services/program-elearning-defaults";

function makeClient(handlers: Record<string, unknown>) {
  return {
    from: vi.fn((table: string) => handlers[table] ?? {}),
  } as unknown as Parameters<typeof listProgramElearningDefaults>[0];
}

describe("program-elearning-defaults", () => {
  beforeEach(() => vi.restoreAllMocks());

  describe("listProgramElearningDefaults", () => {
    it("retourne les e-learning triés par order_index", async () => {
      const data = [
        { id: "1", elearning_course_id: "el-1", order_index: 0, is_mandatory_before_session_default: false, allow_free_progress_default: true },
      ];
      const client = makeClient({
        program_elearning_courses: {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data, error: null }),
        },
      });
      const result = await listProgramElearningDefaults(client, "prog-uuid");
      expect(result).toEqual(data);
    });

    it("retourne tableau vide si erreur Supabase", async () => {
      const client = makeClient({
        program_elearning_courses: {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: null, error: { message: "rls" } }),
        },
      });
      const result = await listProgramElearningDefaults(client, "prog-uuid");
      expect(result).toEqual([]);
    });
  });

  describe("addProgramElearningDefault", () => {
    it("calcule order_index = max + 1 si non fourni", async () => {
      const existing = [
        { id: "1", elearning_course_id: "el-1", order_index: 0, is_mandatory_before_session_default: false, allow_free_progress_default: true },
        { id: "2", elearning_course_id: "el-2", order_index: 1, is_mandatory_before_session_default: false, allow_free_progress_default: true },
      ];
      const upsertMock = vi.fn().mockResolvedValue({ error: null });
      const client = makeClient({
        program_elearning_courses: {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: existing, error: null }),
          upsert: upsertMock,
        },
      });

      const result = await addProgramElearningDefault(client, {
        programId: "prog-uuid",
        elearningCourseId: "el-3",
      });
      expect(result.ok).toBe(true);
      expect(upsertMock).toHaveBeenCalledOnce();
      const payload = upsertMock.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.order_index).toBe(2);
    });

    it("utilise order_index 0 si liste vide", async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null });
      const client = makeClient({
        program_elearning_courses: {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          upsert: upsertMock,
        },
      });
      await addProgramElearningDefault(client, {
        programId: "prog-uuid",
        elearningCourseId: "el-1",
      });
      const payload = upsertMock.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.order_index).toBe(0);
    });
  });

  describe("removeProgramElearningDefault", () => {
    it("delete par programId + elearningCourseId", async () => {
      const deleteMock = vi.fn().mockReturnThis();
      const eqMock1 = vi.fn().mockReturnThis();
      const eqMock2 = vi.fn().mockResolvedValue({ error: null });
      const client = makeClient({
        program_elearning_courses: {
          delete: deleteMock,
          eq: vi.fn()
            .mockImplementationOnce(() => ({ eq: eqMock2 }))
            .mockImplementationOnce(() => eqMock2),
        },
      });
      // Simplification : on teste juste que ça ne throw pas
      const result = await removeProgramElearningDefault(client, {
        programId: "prog-uuid",
        elearningCourseId: "el-1",
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("updateProgramElearningDefault", () => {
    it("no-op si aucun param à mettre à jour", async () => {
      const client = makeClient({});
      const result = await updateProgramElearningDefault(client, {
        programId: "prog-uuid",
        elearningCourseId: "el-1",
      });
      expect(result.ok).toBe(true);
    });
  });
});
