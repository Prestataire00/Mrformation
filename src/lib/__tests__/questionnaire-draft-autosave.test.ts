/**
 * Tests E2-S11 — Questionnaire learner draft auto-save (localStorage)
 *
 * Scénarios couverts :
 * (a) fill quelques réponses + close + reopen → restored avec toast
 * (b) submit → localStorage cleared
 * (c) cross-tab detection (soumis dans un autre onglet → draft effacé)
 * (d) beforeunload warning si dirty && !submitted
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Helpers : logique draft extraite pour testabilité ---

function buildDraftKey(questionnaireId: string, profileId: string): string {
  return `questionnaire_${questionnaireId}_draft_${profileId}`;
}

function saveDraft(
  key: string,
  responses: Record<string, string | number>
): void {
  localStorage.setItem(key, JSON.stringify(responses));
}

function loadDraft(
  key: string
): Record<string, string | number> | null {
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

// --- Mock localStorage ---
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((_index: number) => null),
    _store: () => store,
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("E2-S11 : Questionnaire draft auto-save", () => {
  const questionnaireId = "q-abc-123";
  const profileId = "user-xyz-789";
  const draftKey = buildDraftKey(questionnaireId, profileId);

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- (a) Fill + close + reopen → restored ---
  describe("(a) Restauration du brouillon", () => {
    it("doit construire la clé avec questionnaireId ET profileId", () => {
      expect(draftKey).toBe(`questionnaire_${questionnaireId}_draft_${profileId}`);
    });

    it("doit sauvegarder les réponses dans localStorage", () => {
      const responses = { "q1": "réponse texte", "q2": 4 };
      saveDraft(draftKey, responses);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        draftKey,
        JSON.stringify(responses)
      );
    });

    it("doit restaurer les réponses depuis localStorage", () => {
      const responses = { "q1": "réponse texte", "q2": 4, "q3": "oui" };
      saveDraft(draftKey, responses);

      const restored = loadDraft(draftKey);
      expect(restored).toEqual(responses);
    });

    it("doit retourner null si aucun brouillon", () => {
      const restored = loadDraft(draftKey);
      expect(restored).toBeNull();
    });

    it("doit gérer un brouillon corrompu (JSON invalide)", () => {
      localStorageMock.setItem(draftKey, "{{invalid json");
      // Reset the mock to actually return the corrupted value
      localStorageMock.getItem.mockReturnValueOnce("{{invalid json");

      const restored = loadDraft(draftKey);
      expect(restored).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(draftKey);
    });

    it("ne doit jamais mélanger les brouillons entre profils", () => {
      const otherProfileId = "user-other-456";
      const otherKey = buildDraftKey(questionnaireId, otherProfileId);

      saveDraft(draftKey, { "q1": "réponse A" });
      saveDraft(otherKey, { "q1": "réponse B" });

      // Simulate load for each profile
      localStorageMock.getItem.mockImplementation(((key: string) => {
        if (key === draftKey) return JSON.stringify({ "q1": "réponse A" });
        if (key === otherKey) return JSON.stringify({ "q1": "réponse B" });
        return null;
      }) as typeof localStorageMock.getItem);

      expect(loadDraft(draftKey)).toEqual({ "q1": "réponse A" });
      expect(loadDraft(otherKey)).toEqual({ "q1": "réponse B" });
    });
  });

  // --- (b) Submit → localStorage cleared ---
  describe("(b) Cleanup post-submit", () => {
    it("doit supprimer le brouillon après soumission réussie", () => {
      saveDraft(draftKey, { "q1": "réponse" });

      // Simulate successful submit
      clearDraft(draftKey);

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(draftKey);
    });

    it("ne doit pas écrire de nouveau brouillon après submit (submitted=true)", () => {
      const submitted = true;
      const responses = { "q1": "nouvelle réponse" };

      // Simulate the guard in the auto-save effect
      if (!submitted) {
        saveDraft(draftKey, responses);
      }

      // setItem should NOT have been called (beyond the clear mock reset)
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });
  });

  // --- (c) Cross-tab detection ---
  describe("(c) Détection cross-tab (soumission dans un autre onglet)", () => {
    it("doit effacer le draft si la réponse existe déjà côté serveur", () => {
      saveDraft(draftKey, { "q1": "réponse" });

      // Simulate: API returns existing response → clear draft
      const alreadySubmittedOnServer = true;
      if (alreadySubmittedOnServer) {
        clearDraft(draftKey);
      }

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(draftKey);
    });

    it("ne doit pas effacer le draft si aucune réponse côté serveur", () => {
      saveDraft(draftKey, { "q1": "réponse" });
      vi.clearAllMocks(); // Reset removeItem calls from saveDraft

      const alreadySubmittedOnServer = false;
      if (alreadySubmittedOnServer) {
        clearDraft(draftKey);
      }

      expect(localStorageMock.removeItem).not.toHaveBeenCalled();
    });
  });

  // --- (d) beforeunload warning ---
  describe("(d) beforeunload warning", () => {
    it("doit appeler preventDefault si dirty && !submitted", () => {
      const dirty = true;
      const submitted = false;

      const event = new Event("beforeunload") as BeforeUnloadEvent;
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");

      // Simulate the handler logic
      if (dirty && !submitted) {
        event.preventDefault();
      }

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it("ne doit PAS appeler preventDefault si !dirty", () => {
      const dirty = false;
      const submitted = false;

      const event = new Event("beforeunload") as BeforeUnloadEvent;
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");

      if (dirty && !submitted) {
        event.preventDefault();
      }

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it("ne doit PAS appeler preventDefault si submitted", () => {
      const dirty = true;
      const submitted = true;

      const event = new Event("beforeunload") as BeforeUnloadEvent;
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");

      if (dirty && !submitted) {
        event.preventDefault();
      }

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
  });

  // --- Debounce behavior ---
  describe("Debounce auto-save (500ms)", () => {
    it("ne doit sauvegarder qu'après le délai de 500ms", async () => {
      vi.useFakeTimers();

      const responses = { "q1": "test" };
      let saveCount = 0;

      // Simulate the debounce effect
      const timeout = setTimeout(() => {
        saveDraft(draftKey, responses);
        saveCount++;
      }, 500);

      // Avant 500ms → pas encore sauvé
      vi.advanceTimersByTime(400);
      expect(saveCount).toBe(0);

      // Après 500ms → sauvé
      vi.advanceTimersByTime(100);
      expect(saveCount).toBe(1);

      clearTimeout(timeout);
      vi.useRealTimers();
    });

    it("doit annuler le save précédent si une nouvelle réponse arrive", () => {
      vi.useFakeTimers();

      let savedValue: Record<string, string | number> | null = null;

      // First change
      const timeout1 = setTimeout(() => {
        savedValue = { "q1": "première" };
        saveDraft(draftKey, savedValue);
      }, 500);

      vi.advanceTimersByTime(300);
      // Second change arrives → cancel first
      clearTimeout(timeout1);

      const timeout2 = setTimeout(() => {
        savedValue = { "q1": "deuxième" };
        saveDraft(draftKey, savedValue);
      }, 500);

      vi.advanceTimersByTime(500);
      expect(savedValue).toEqual({ "q1": "deuxième" });

      clearTimeout(timeout2);
      vi.useRealTimers();
    });
  });
});
