import { describe, it, expect, vi, beforeEach } from "vitest";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

describe("sanitizeError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns a generic message for an Error object", () => {
    const result = sanitizeError(new Error("secret db connection string"));
    expect(result).toBe("Une erreur interne est survenue");
  });

  it("returns a generic message for a plain string", () => {
    const result = sanitizeError("some internal detail");
    expect(result).toBe("Une erreur interne est survenue");
  });

  it("returns a generic message for undefined", () => {
    const result = sanitizeError(undefined);
    expect(result).toBe("Une erreur interne est survenue");
  });

  it("logs the real error to console.error", () => {
    sanitizeError(new Error("real detail"), "fetchClients");
    expect(console.error).toHaveBeenCalledWith(
      "[API Error] fetchClients:",
      "real detail"
    );
  });

  it("logs without context when none provided", () => {
    sanitizeError(new Error("oops"));
    expect(console.error).toHaveBeenCalledWith("[API Error]:", "oops");
  });
});

describe("sanitizeDbError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns a generic message for a DB error", () => {
    const result = sanitizeDbError({
      message: "relation \"users\" does not exist",
      code: "42P01",
    });
    expect(result).toBe("Une erreur interne est survenue");
  });

  it("returns a generic message when error is null", () => {
    const result = sanitizeDbError(null);
    expect(result).toBe("Une erreur interne est survenue");
  });

  it("logs DB error details to console.error", () => {
    sanitizeDbError(
      { message: "unique violation", code: "23505", details: "Key already exists" },
      "insertClient"
    );
    expect(console.error).toHaveBeenCalledWith("[DB Error] insertClient:", {
      message: "unique violation",
      code: "23505",
      details: "Key already exists",
    });
  });

  it("logs without context when none provided", () => {
    sanitizeDbError({ message: "timeout", code: "57014" });
    expect(console.error).toHaveBeenCalledWith("[DB Error]:", {
      message: "timeout",
      code: "57014",
      details: undefined,
    });
  });
});
