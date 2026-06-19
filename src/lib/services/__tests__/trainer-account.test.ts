import { describe, it, expect, vi } from "vitest";
import {
  ensureTrainerAccount,
  buildTrainerSyntheticEmail,
  resetTrainerPassword,
  listOrphanTrainerAccounts,
  linkTrainerToProfile,
  unlinkTrainerProfile,
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

describe("resetTrainerPassword", () => {
  it("régénère le mot de passe via updateUserById quand la fiche a un profile_id", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue(
      chainResolving({ data: { id: "t1", entity_id: "ENT-A", email: "j@ex.com", profile_id: "p1" }, error: null }),
    );
    const admin = { from, auth: { admin: { updateUserById } } } as never;

    const res = await resetTrainerPassword(admin, { entityId: "ENT-A", trainerId: "t1" });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.email).toBe("j@ex.com");
      expect(res.password).toEqual(expect.any(String));
    }
    expect(updateUserById).toHaveBeenCalledWith("p1", { password: expect.any(String) });
  });

  it("échoue sans toucher à Auth si la fiche n'a pas de profile_id", async () => {
    const updateUserById = vi.fn();
    const from = vi.fn().mockReturnValue(
      chainResolving({ data: { id: "t1", entity_id: "ENT-A", email: null, profile_id: null }, error: null }),
    );
    const admin = { from, auth: { admin: { updateUserById } } } as never;

    const res = await resetTrainerPassword(admin, { entityId: "ENT-A", trainerId: "t1" });

    expect(res.ok).toBe(false);
    expect(updateUserById).not.toHaveBeenCalled();
  });
});

describe("listOrphanTrainerAccounts", () => {
  it("renvoie les profils 'trainer' de l'entité non reliés à une fiche", async () => {
    const from = vi.fn()
      .mockReturnValueOnce(
        chainResolving({
          data: [
            { id: "p1", email: "a@ex.com", first_name: "A", last_name: "A" },
            { id: "p2", email: "b@ex.com", first_name: "B", last_name: "B" },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(chainResolving({ data: [{ profile_id: "p2" }], error: null }));
    const admin = { from } as never;

    const res = await listOrphanTrainerAccounts(admin, "ENT-A");

    expect(res.map((o) => o.id)).toEqual(["p1"]);
    expect(from).toHaveBeenNthCalledWith(1, "profiles");
    expect(from).toHaveBeenNthCalledWith(2, "trainers");
  });
});

describe("linkTrainerToProfile", () => {
  it("refuse un profil qui n'est pas un orphelin (et n'appelle pas update)", async () => {
    // profiles → p1 seul ; linked → vide ⇒ orphelins = [p1]. On tente de lier p9.
    const from = vi.fn()
      .mockReturnValueOnce(chainResolving({ data: [{ id: "p1", email: null, first_name: null, last_name: null }], error: null }))
      .mockReturnValueOnce(chainResolving({ data: [], error: null }));
    const admin = { from } as never;

    const res = await linkTrainerToProfile(admin, { entityId: "ENT-A", trainerId: "t1", profileId: "p9" });

    expect(res.ok).toBe(false);
    expect(from).toHaveBeenCalledTimes(2); // pas de 3e appel (update)
  });

  it("relie la fiche au profil orphelin valide", async () => {
    const updateChain = chainResolving({ error: null });
    const from = vi.fn()
      .mockReturnValueOnce(chainResolving({ data: [{ id: "p1", email: null, first_name: null, last_name: null }], error: null }))
      .mockReturnValueOnce(chainResolving({ data: [], error: null }))
      .mockReturnValueOnce(updateChain);
    const admin = { from } as never;

    const res = await linkTrainerToProfile(admin, { entityId: "ENT-A", trainerId: "t1", profileId: "p1" });

    expect(res.ok).toBe(true);
    expect(updateChain.update).toHaveBeenCalledWith({ profile_id: "p1" });
  });
});

describe("unlinkTrainerProfile", () => {
  it("met profile_id à null sur la fiche", async () => {
    const updateChain = chainResolving({ error: null });
    const from = vi.fn().mockReturnValue(updateChain);
    const admin = { from } as never;

    const res = await unlinkTrainerProfile(admin, { entityId: "ENT-A", trainerId: "t1" });

    expect(res.ok).toBe(true);
    expect(updateChain.update).toHaveBeenCalledWith({ profile_id: null });
  });
});
