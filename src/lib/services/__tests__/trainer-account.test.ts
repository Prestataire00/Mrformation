import { describe, it, expect, vi } from "vitest";
import {
  ensureTrainerAccount,
  buildTrainerSyntheticEmail,
} from "@/lib/services/trainer-account";

/**
 * Mock chaînable d'un query builder Supabase : chaque méthode renvoie `this`,
 * l'objet est thenable → `await` résout `result`.
 */
function chainResolving(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "in", "not", "update", "upsert", "order", "single"]) {
    builder[m] = vi.fn(() => builder);
  }
  (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
  return builder;
}

describe("buildTrainerSyntheticEmail", () => {
  it("génère un email synthétique non routable basé sur nom + id + slug entité", () => {
    const email = buildTrainerSyntheticEmail(
      { id: "abcd1234ef56", first_name: "Jean", last_name: "Dupont" },
      "mr-formation",
    );
    expect(email).toBe("dupont-jean.abcd1234@trainer.mr-formation.local");
  });
});

describe("ensureTrainerAccount", () => {
  it("est idempotent : si déjà relié, ne crée rien (status 'skipped')", async () => {
    const createUser = vi.fn();
    const from = vi.fn();
    const admin = { from, auth: { admin: { createUser } } } as never;

    const res = await ensureTrainerAccount(admin, {
      trainer: { id: "t1", entity_id: "ENT-A", first_name: "J", last_name: "D", email: "j@ex.com", profile_id: "existing" },
      entitySlug: "mr-formation",
    });

    expect(res.status).toBe("skipped");
    expect(createUser).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("crée le compte auth, upsert le profil 'trainer' et relie la fiche (email réel)", async () => {
    const createUser = vi.fn().mockResolvedValue({ data: { user: { id: "new-uid" } }, error: null });
    const profilesUpsert = chainResolving({ error: null });
    const trainersUpdate = chainResolving({ error: null });
    const from = vi.fn()
      .mockReturnValueOnce(profilesUpsert)
      .mockReturnValueOnce(trainersUpdate);
    const admin = { from, auth: { admin: { createUser } } } as never;

    const res = await ensureTrainerAccount(admin, {
      trainer: { id: "t1", entity_id: "ENT-A", first_name: "Jean", last_name: "Dupont", email: "jean@ex.com", profile_id: null },
      entitySlug: "mr-formation",
    });

    expect(res.status).toBe("created");
    expect(res.email).toBe("jean@ex.com");
    expect(res.password).toEqual(expect.any(String));
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "jean@ex.com", email_confirm: true }));
    expect(profilesUpsert.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "new-uid", role: "trainer", entity_id: "ENT-A" }),
      { onConflict: "id" },
    );
    expect(trainersUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: "new-uid", email: "jean@ex.com" }),
    );
  });

  it("utilise un email synthétique quand le formateur n'a pas d'email réel", async () => {
    const createUser = vi.fn().mockResolvedValue({ data: { user: { id: "uid" } }, error: null });
    const from = vi.fn().mockReturnValue(chainResolving({ error: null }));
    const admin = { from, auth: { admin: { createUser } } } as never;

    const res = await ensureTrainerAccount(admin, {
      trainer: { id: "abcd1234ef", entity_id: "ENT-A", first_name: "Jean", last_name: "Dupont", email: null, profile_id: null },
      entitySlug: "mr-formation",
    });

    expect(res.status).toBe("created");
    expect(res.syntheticEmailUsed).toBe(true);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: expect.stringContaining("@trainer.mr-formation.local") }),
    );
  });

  it("renvoie status 'error' si la création auth échoue (et pas de repli si déjà synthétique)", async () => {
    const createUser = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const from = vi.fn();
    const admin = { from, auth: { admin: { createUser } } } as never;

    const res = await ensureTrainerAccount(admin, {
      trainer: { id: "t1", entity_id: "ENT-A", first_name: null, last_name: null, email: null, profile_id: null },
      entitySlug: "s",
    });

    expect(res.status).toBe("error");
    expect(res.error).toBe("boom");
    expect(from).not.toHaveBeenCalled();
  });
});
