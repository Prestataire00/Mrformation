import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  copyProgramElearningToSession,
  autoEnrollLearnerToSessionElearning,
} from "@/lib/services/pedagogie-v2-snapshot";

describe("copyProgramElearningToSession", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("insère les e-learning du programme dans session_elearning_courses", async () => {
    const programRows = [
      {
        elearning_course_id: "el-1",
        order_index: 0,
        is_mandatory_before_session_default: true,
        allow_free_progress_default: false,
      },
      {
        elearning_course_id: "el-2",
        order_index: 1,
        is_mandatory_before_session_default: false,
        allow_free_progress_default: true,
      },
    ];
    const insertMock = vi.fn().mockResolvedValue({ data: programRows, error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "program_elearning_courses") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: programRows, error: null }),
          };
        }
        if (table === "session_elearning_courses") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: insertMock,
          };
        }
        return {};
      }),
    } as unknown as Parameters<typeof copyProgramElearningToSession>[0];

    const result = await copyProgramElearningToSession(client, {
      sessionId: "session-uuid",
      programId: "program-uuid",
    });

    expect(result.copied).toBe(2);
    expect(result.alreadyExists).toBe(false);
    expect(insertMock).toHaveBeenCalledOnce();
    const insertedRows = insertMock.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0]).toMatchObject({
      session_id: "session-uuid",
      elearning_course_id: "el-1",
      is_mandatory_before_session: true,
      allow_free_progress: false,
    });
  });

  it("est idempotent : ne ré-insère pas si la session a déjà des e-learning attachés", async () => {
    const existingRows = [{ elearning_course_id: "el-1" }];
    const insertMock = vi.fn();
    const client = {
      from: vi.fn((table: string) => {
        if (table === "session_elearning_courses") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: existingRows, error: null }),
            insert: insertMock,
          };
        }
        return {};
      }),
    } as unknown as Parameters<typeof copyProgramElearningToSession>[0];

    const result = await copyProgramElearningToSession(client, {
      sessionId: "session-uuid",
      programId: "program-uuid",
    });

    expect(result.copied).toBe(0);
    expect(result.alreadyExists).toBe(true);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("no-op si le programme n'a aucun e-learning attaché", async () => {
    const insertMock = vi.fn();
    const client = {
      from: vi.fn((table: string) => {
        if (table === "program_elearning_courses") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === "session_elearning_courses") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: insertMock,
          };
        }
        return {};
      }),
    } as unknown as Parameters<typeof copyProgramElearningToSession>[0];

    const result = await copyProgramElearningToSession(client, {
      sessionId: "session-uuid",
      programId: "program-uuid",
    });

    expect(result.copied).toBe(0);
    expect(result.alreadyExists).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("autoEnrollLearnerToSessionElearning", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("crée elearning_enrollments pour chaque e-learning attaché à la session", async () => {
    const sessionElearning = [
      { elearning_course_id: "el-1" },
      { elearning_course_id: "el-2" },
    ];
    const upsertMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "session_elearning_courses") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: sessionElearning, error: null }),
          };
        }
        if (table === "elearning_enrollments") {
          return { upsert: upsertMock };
        }
        return {};
      }),
    } as unknown as Parameters<typeof autoEnrollLearnerToSessionElearning>[0];

    const result = await autoEnrollLearnerToSessionElearning(client, {
      sessionId: "session-uuid",
      learnerId: "learner-uuid",
      optOutElearningCourseIds: [],
    });

    expect(result.enrolled).toBe(2);
    expect(result.skippedOptOut).toBe(0);
    expect(upsertMock).toHaveBeenCalledOnce();
  });

  it("respecte la liste opt-out (n'enrôle pas aux e-learning exclus)", async () => {
    const sessionElearning = [
      { elearning_course_id: "el-1" },
      { elearning_course_id: "el-2" },
      { elearning_course_id: "el-3" },
    ];
    const upsertMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "session_elearning_courses") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: sessionElearning, error: null }),
          };
        }
        if (table === "elearning_enrollments") {
          return { upsert: upsertMock };
        }
        return {};
      }),
    } as unknown as Parameters<typeof autoEnrollLearnerToSessionElearning>[0];

    const result = await autoEnrollLearnerToSessionElearning(client, {
      sessionId: "session-uuid",
      learnerId: "learner-uuid",
      optOutElearningCourseIds: ["el-2"],
    });

    expect(result.enrolled).toBe(2); // el-1, el-3 (pas el-2)
    expect(result.skippedOptOut).toBe(1);
  });

  it("no-op si la session n'a aucun e-learning attaché", async () => {
    const upsertMock = vi.fn();
    const client = {
      from: vi.fn((table: string) => {
        if (table === "session_elearning_courses") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === "elearning_enrollments") {
          return { upsert: upsertMock };
        }
        return {};
      }),
    } as unknown as Parameters<typeof autoEnrollLearnerToSessionElearning>[0];

    const result = await autoEnrollLearnerToSessionElearning(client, {
      sessionId: "session-uuid",
      learnerId: "learner-uuid",
      optOutElearningCourseIds: [],
    });

    expect(result.enrolled).toBe(0);
    expect(result.skippedOptOut).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
