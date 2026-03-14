import { describe, it, expect } from "vitest";
import {
  parsePagination,
  createClientSchema,
  createTrainerSchema,
  createUserSchema,
} from "@/lib/validations/index";

// ---------- parsePagination ----------
describe("parsePagination", () => {
  it("returns default values when no params provided", () => {
    const params = new URLSearchParams();
    const result = parsePagination(params);
    expect(result).toEqual({ page: 1, perPage: 20, offset: 0 });
  });

  it("parses page and per_page correctly", () => {
    const params = new URLSearchParams({ page: "3", per_page: "50" });
    const result = parsePagination(params);
    expect(result).toEqual({ page: 3, perPage: 50, offset: 100 });
  });

  it("caps per_page at 100", () => {
    const params = new URLSearchParams({ per_page: "500" });
    const result = parsePagination(params);
    expect(result.perPage).toBe(100);
  });

  it("clamps negative page to 1", () => {
    const params = new URLSearchParams({ page: "-5" });
    const result = parsePagination(params);
    expect(result.page).toBe(1);
  });

  it("clamps negative per_page to 1", () => {
    const params = new URLSearchParams({ per_page: "-10" });
    const result = parsePagination(params);
    expect(result.perPage).toBe(1);
  });

  it("computes offset correctly for page 2 with per_page 25", () => {
    const params = new URLSearchParams({ page: "2", per_page: "25" });
    const result = parsePagination(params);
    expect(result.offset).toBe(25);
  });
});

// ---------- createClientSchema ----------
describe("createClientSchema", () => {
  const validClient = {
    company_name: "Acme Corp",
    email: "contact@acme.fr",
    siret: "12345678901234",
  };

  it("accepts valid data", () => {
    const result = createClientSchema.safeParse(validClient);
    expect(result.success).toBe(true);
  });

  it("accepts minimal data (only company_name)", () => {
    const result = createClientSchema.safeParse({ company_name: "Test" });
    expect(result.success).toBe(true);
  });

  it("rejects missing company_name", () => {
    const result = createClientSchema.safeParse({ email: "a@b.com" });
    expect(result.success).toBe(false);
  });

  it("rejects empty company_name", () => {
    const result = createClientSchema.safeParse({ company_name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid SIRET (not 14 digits)", () => {
    const result = createClientSchema.safeParse({
      company_name: "Acme",
      siret: "123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = createClientSchema.safeParse({
      company_name: "Acme",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("defaults status to active", () => {
    const result = createClientSchema.safeParse({ company_name: "Test" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("active");
    }
  });
});

// ---------- createTrainerSchema ----------
describe("createTrainerSchema", () => {
  const validTrainer = {
    first_name: "Jean",
    last_name: "Dupont",
    email: "jean@example.com",
  };

  it("accepts valid data", () => {
    const result = createTrainerSchema.safeParse(validTrainer);
    expect(result.success).toBe(true);
  });

  it("rejects missing first_name", () => {
    const result = createTrainerSchema.safeParse({
      last_name: "Dupont",
      email: "jean@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing last_name", () => {
    const result = createTrainerSchema.safeParse({
      first_name: "Jean",
      email: "jean@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const result = createTrainerSchema.safeParse({
      first_name: "Jean",
      last_name: "Dupont",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional specialties as array", () => {
    const result = createTrainerSchema.safeParse({
      ...validTrainer,
      specialties: ["JavaScript", "React"],
    });
    expect(result.success).toBe(true);
  });
});

// ---------- createUserSchema ----------
describe("createUserSchema", () => {
  const validUser = {
    email: "user@example.com",
    password: "Secure1pass",
    first_name: "Marie",
    last_name: "Curie",
    role: "learner" as const,
  };

  it("accepts valid data", () => {
    const result = createUserSchema.safeParse(validUser);
    expect(result.success).toBe(true);
  });

  it("rejects password without uppercase", () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      password: "secure1pass",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without lowercase", () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      password: "SECURE1PASS",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without digit", () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      password: "SecurePass",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password shorter than 8 characters", () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      password: "Se1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid role", () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      role: "superadmin",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid roles", () => {
    for (const role of ["admin", "trainer", "client", "learner"]) {
      const result = createUserSchema.safeParse({ ...validUser, role });
      expect(result.success).toBe(true);
    }
  });
});
