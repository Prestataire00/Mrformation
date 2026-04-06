import { describe, it, expect } from "vitest";
import {
  createSessionSchema,
  updateSessionSchema,
  createTrainingSchema,
  createTimeSlotSchema,
  bulkTimeSlotSchema,
  parsePagination,
} from "@/lib/validations";

describe("createSessionSchema", () => {
  it("accepte une session minimale valide", () => {
    expect(createSessionSchema.safeParse({}).success).toBe(true);
  });

  it("accepte une session complète", () => {
    expect(
      createSessionSchema.safeParse({
        training_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        start_date: "2026-04-15",
        end_date: "2026-04-17",
        location: "Paris",
        status: "planned",
        max_participants: 12,
        notes: "Test",
      }).success
    ).toBe(true);
  });

  it("rejette un UUID invalide", () => {
    expect(createSessionSchema.safeParse({ training_id: "pas-un-uuid" }).success).toBe(false);
  });

  it("rejette un statut invalide", () => {
    expect(createSessionSchema.safeParse({ status: "brouillon" }).success).toBe(false);
  });

  it("rejette max_participants négatif", () => {
    expect(createSessionSchema.safeParse({ max_participants: -5 }).success).toBe(false);
  });

  it("rejette max_participants > 1000", () => {
    expect(createSessionSchema.safeParse({ max_participants: 1500 }).success).toBe(false);
  });

  it("rejette un format de date invalide", () => {
    expect(createSessionSchema.safeParse({ start_date: "15/04/2026" }).success).toBe(false);
  });

  it("accepte null pour les champs optionnels", () => {
    expect(
      createSessionSchema.safeParse({ training_id: null, location: null, notes: null }).success
    ).toBe(true);
  });

  it("rejette des notes > 5000 caractères", () => {
    expect(createSessionSchema.safeParse({ notes: "a".repeat(5001) }).success).toBe(false);
  });
});

describe("updateSessionSchema", () => {
  it("accepte une mise à jour partielle", () => {
    expect(updateSessionSchema.safeParse({ status: "completed" }).success).toBe(true);
  });

  it("accepte un objet vide", () => {
    expect(updateSessionSchema.safeParse({}).success).toBe(true);
  });
});

describe("createTrainingSchema", () => {
  it("rejette un titre vide", () => {
    expect(createTrainingSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("accepte une formation valide", () => {
    expect(createTrainingSchema.safeParse({ title: "Management" }).success).toBe(true);
  });

  it("rejette une durée négative", () => {
    expect(createTrainingSchema.safeParse({ title: "T", duration_hours: -2 }).success).toBe(false);
  });

  it("rejette un prix négatif", () => {
    expect(createTrainingSchema.safeParse({ title: "T", price: -100 }).success).toBe(false);
  });

  it("rejette un niveau invalide", () => {
    expect(createTrainingSchema.safeParse({ title: "T", level: "super" }).success).toBe(false);
  });

  it("accepte tous les niveaux valides", () => {
    for (const level of ["beginner", "intermediate", "advanced"]) {
      expect(createTrainingSchema.safeParse({ title: "T", level }).success).toBe(true);
    }
  });
});

describe("createTimeSlotSchema", () => {
  it("accepte un créneau minimal", () => {
    expect(
      createTimeSlotSchema.safeParse({
        start_time: "2026-04-15T09:00:00Z",
        end_time: "2026-04-15T12:00:00Z",
      }).success
    ).toBe(true);
  });

  it("rejette sans heure de début", () => {
    expect(
      createTimeSlotSchema.safeParse({ start_time: "", end_time: "2026-04-15T12:00:00Z" }).success
    ).toBe(false);
  });

  it("rejette sans heure de fin", () => {
    expect(
      createTimeSlotSchema.safeParse({ start_time: "2026-04-15T09:00:00Z", end_time: "" }).success
    ).toBe(false);
  });
});

describe("bulkTimeSlotSchema", () => {
  const base = { date_from: "2026-04-15", date_to: "2026-04-17", time_start: "09:00", time_end: "17:00" };

  it("accepte une génération valide", () => {
    expect(bulkTimeSlotSchema.safeParse({ ...base, variant: "with_lunch" }).success).toBe(true);
  });

  it("rejette un variant inconnu", () => {
    expect(bulkTimeSlotSchema.safeParse({ ...base, variant: "every_other_day" }).success).toBe(false);
  });

  it("accepte tous les variants valides", () => {
    const variants = ["every_day", "every_day_no_weekends", "with_lunch", "with_lunch_no_weekends", "weekly", "weekly_with_lunch"];
    for (const variant of variants) {
      expect(bulkTimeSlotSchema.safeParse({ ...base, variant }).success).toBe(true);
    }
  });
});

describe("parsePagination", () => {
  it("retourne les valeurs par défaut", () => {
    expect(parsePagination(new URLSearchParams())).toEqual({ page: 1, perPage: 20, offset: 0 });
  });

  it("calcule l'offset correctement", () => {
    expect(parsePagination(new URLSearchParams("page=3&per_page=10"))).toEqual({ page: 3, perPage: 10, offset: 20 });
  });

  it("plafonne per_page à 100", () => {
    expect(parsePagination(new URLSearchParams("per_page=500")).perPage).toBe(100);
  });

  it("force page minimum à 1", () => {
    expect(parsePagination(new URLSearchParams("page=-5")).page).toBe(1);
  });

  it("force per_page minimum à 1", () => {
    expect(parsePagination(new URLSearchParams("per_page=0")).perPage).toBe(1);
  });
});
