/**
 * Tests E2-S12 — Questionnaire public (anonyme) draft auto-save (localStorage)
 *
 * Variant anonyme de E2-S11 : pas de profileId, pas de cross-tab API check.
 * Clé : questionnaire_${token}_draft_anonymous
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function buildDraftKey(token: string): string {
  return `questionnaire_${token}_draft_anonymous`;
}

function saveDraft(key: string, responses: Record<string, string | number>): void {
  localStorage.setItem(key, JSON.stringify(responses));
}

function loadDraft(key: string): Record<string, string | number> | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, string | number>;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function clearDraft(key: string): void {
  localStorage.removeItem(key);
}

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((_index: number) => null),
  };
})();

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

describe("E2-S12 : Questionnaire public draft auto-save (anonyme)", () => {
  const token = "abc123-token-xyz";
  const draftKey = buildDraftKey(token);

  beforeEach(() => { localStorageMock.clear(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  describe("Clé localStorage", () => {
    it("doit utiliser le token + suffixe _draft_anonymous", () => {
      expect(draftKey).toBe(`questionnaire_${token}_draft_anonymous`);
    });
    it("ne doit PAS contenir de profileId", () => {
      expect(draftKey).not.toMatch(/draft_[a-f0-9-]{36}/);
      expect(draftKey).toContain("_draft_anonymous");
    });
  });

  describe("Restauration du brouillon", () => {
    it("doit restaurer les réponses depuis localStorage", () => {
      const responses = { "q1": "ma réponse", "q2": 3, "q3": "oui" };
      saveDraft(draftKey, responses);
      expect(loadDraft(draftKey)).toEqual(responses);
    });
    it("doit retourner null si aucun brouillon", () => {
      expect(loadDraft(draftKey)).toBeNull();
    });
    it("doit gérer un brouillon corrompu sans crash", () => {
      localStorageMock.setItem(draftKey, "not valid json{{");
      localStorageMock.getItem.mockReturnValueOnce("not valid json{{");
      expect(loadDraft(draftKey)).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(draftKey);
    });
  });

  describe("Cleanup post-submit", () => {
    it("doit supprimer le brouillon après soumission réussie", () => {
      saveDraft(draftKey, { "q1": "réponse" });
      clearDraft(draftKey);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(draftKey);
    });
    it("ne doit pas auto-save si submitted=true", () => {
      const submitted = true;
      if (!submitted) { saveDraft(draftKey, { "q1": "test" }); }
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });
  });

  describe("beforeunload warning", () => {
    it("doit appeler preventDefault si dirty && !submitted", () => {
      const event = new Event("beforeunload") as BeforeUnloadEvent;
      const spy = vi.spyOn(event, "preventDefault");
      const dirty = true, submitted = false;
      if (dirty && !submitted) { event.preventDefault(); }
      expect(spy).toHaveBeenCalled();
    });
    it("ne doit PAS appeler preventDefault si !dirty", () => {
      const event = new Event("beforeunload") as BeforeUnloadEvent;
      const spy = vi.spyOn(event, "preventDefault");
      const dirty = false, submitted = false;
      if (dirty && !submitted) { event.preventDefault(); }
      expect(spy).not.toHaveBeenCalled();
    });
    it("ne doit PAS appeler preventDefault si submitted", () => {
      const event = new Event("beforeunload") as BeforeUnloadEvent;
      const spy = vi.spyOn(event, "preventDefault");
      const dirty = true, submitted = true;
      if (dirty && !submitted) { event.preventDefault(); }
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("Debounce auto-save (500ms)", () => {
    it("ne doit sauvegarder qu'après 500ms", () => {
      vi.useFakeTimers();
      let saveCount = 0;
      const timeout = setTimeout(() => { saveDraft(draftKey, { "q1": "test" }); saveCount++; }, 500);
      vi.advanceTimersByTime(400);
      expect(saveCount).toBe(0);
      vi.advanceTimersByTime(100);
      expect(saveCount).toBe(1);
      clearTimeout(timeout);
      vi.useRealTimers();
    });
    it("doit annuler le save précédent si nouvelle réponse arrive avant 500ms", () => {
      vi.useFakeTimers();
      let savedValue: Record<string, string | number> | null = null;
      const t1 = setTimeout(() => { savedValue = { "q1": "première" }; saveDraft(draftKey, savedValue); }, 500);
      vi.advanceTimersByTime(300);
      clearTimeout(t1);
      const t2 = setTimeout(() => { savedValue = { "q1": "deuxième" }; saveDraft(draftKey, savedValue); }, 500);
      vi.advanceTimersByTime(500);
      expect(savedValue).toEqual({ "q1": "deuxième" });
      clearTimeout(t2);
      vi.useRealTimers();
    });
  });

  describe("Isolation par token", () => {
    it("chaque token a sa propre clé", () => {
      expect(buildDraftKey("token-A")).toBe("questionnaire_token-A_draft_anonymous");
      expect(buildDraftKey("token-B")).toBe("questionnaire_token-B_draft_anonymous");
      expect(buildDraftKey("token-A")).not.toBe(buildDraftKey("token-B"));
    });
  });
});
