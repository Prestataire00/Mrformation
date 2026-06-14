import { describe, it, expect, vi } from "vitest";
import { isTrainerAssignedToSession } from "../trainer-session-access";

type AnyClient = Parameters<typeof isTrainerAssignedToSession>[0];

/**
 * Mock client Supabase pour isTrainerAssignedToSession.
 * Simule : SELECT trainers WHERE profile_id → SELECT formation_trainers WHERE
 * session_id + trainer_id. Enregistre les filtres `.eq()` par table pour
 * vérifier le câblage (résolution profile_id → trainer.id → formation_trainers).
 */
function makeClient(opts: {
  trainer?: { id: string } | null;
  assignment?: { id: string } | null;
}) {
  const calls: Record<string, Record<string, unknown>> = {
    trainers: {},
    formation_trainers: {},
  };

  function chain(table: string, terminal: "single" | "maybeSingle", value: unknown) {
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      eq: vi.fn((col: string, val: unknown) => {
        calls[table][col] = val;
        return builder;
      }),
      single: vi.fn(async () => ({ data: value, error: value ? null : { message: "not found" } })),
      maybeSingle: vi.fn(async () => ({ data: value, error: null })),
    };
    return builder;
  }

  const client = {
    from: vi.fn((table: string) => {
      if (table === "trainers") return chain("trainers", "single", opts.trainer ?? null);
      if (table === "formation_trainers") return chain("formation_trainers", "maybeSingle", opts.assignment ?? null);
      throw new Error(`table inattendue: ${table}`);
    }),
    __calls: calls,
  };

  return client as unknown as AnyClient & { __calls: typeof calls };
}

describe("isTrainerAssignedToSession", () => {
  it("retourne true quand le formateur existe ET est assigné à la session", async () => {
    const client = makeClient({ trainer: { id: "trainer-1" }, assignment: { id: "ft-1" } });
    const result = await isTrainerAssignedToSession(client, "profile-1", "session-1");
    expect(result).toBe(true);
  });

  it("résout le formateur par profile_id, puis formation_trainers par le trainer.id résolu (pas par profile_id)", async () => {
    const client = makeClient({ trainer: { id: "trainer-1" }, assignment: { id: "ft-1" } });
    await isTrainerAssignedToSession(client, "profile-1", "session-1");
    // trainers résolu par profile_id (= auth.uid()), PAS par l'id
    expect(client.__calls.trainers.profile_id).toBe("profile-1");
    // formation_trainers filtré par le trainer.id résolu ET la session
    expect(client.__calls.formation_trainers.trainer_id).toBe("trainer-1");
    expect(client.__calls.formation_trainers.session_id).toBe("session-1");
  });

  it("retourne false si aucune fiche formateur pour ce profile_id", async () => {
    const client = makeClient({ trainer: null });
    const result = await isTrainerAssignedToSession(client, "profile-inconnu", "session-1");
    expect(result).toBe(false);
  });

  it("retourne false si le formateur existe mais n'est pas assigné à la session", async () => {
    const client = makeClient({ trainer: { id: "trainer-1" }, assignment: null });
    const result = await isTrainerAssignedToSession(client, "profile-1", "session-autre");
    expect(result).toBe(false);
  });
});
