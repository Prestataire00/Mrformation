import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  classifyPushHttpResponse,
  runInvoicePushLoop,
  summarizeBatchExecution,
  type PushLoopOutcome,
} from "../push-loop";
import type { AbbyPushState } from "@/lib/types/abby";

// ─── classifyPushHttpResponse (pur) ─────────────────────────────────────────

describe("classifyPushHttpResponse — classification d'une réponse HTTP push", () => {
  it("étape done → terminal finalized + numéro", () => {
    const r = classifyPushHttpResponse(true, {
      step: { state: "finalized", done: true, abbyInvoiceNumber: "F-2026-0001" },
    });
    expect(r).toEqual({ terminal: { kind: "finalized", number: "F-2026-0001" } });
  });

  it("étape done sans numéro → finalized number null", () => {
    const r = classifyPushHttpResponse(true, { step: { state: "finalized", done: true } });
    expect(r).toEqual({ terminal: { kind: "finalized", number: null } });
  });

  it("étape non finale → { step } (continuer)", () => {
    const r = classifyPushHttpResponse(true, { step: { state: "draft_created", done: false } });
    expect(r).toEqual({ step: { state: "draft_created", done: false } });
  });

  it("erreur abby_draft_missing → terminal draft_missing (message serveur)", () => {
    const r = classifyPushHttpResponse(false, {
      error: { message: "Le brouillon n'existe plus côté Abby.", code: "abby_draft_missing" },
    });
    expect(r).toEqual({
      terminal: { kind: "draft_missing", message: "Le brouillon n'existe plus côté Abby." },
    });
  });

  it("autre erreur → terminal error (message serveur)", () => {
    const r = classifyPushHttpResponse(false, {
      error: { message: "Fiche client incomplète", code: "abby_validation" },
    });
    expect(r).toEqual({ terminal: { kind: "error", message: "Fiche client incomplète" } });
  });

  it("erreur sans message → fallback « Le push a échoué. »", () => {
    const r = classifyPushHttpResponse(false, { error: { message: "" } });
    expect(r).toEqual({ terminal: { kind: "error", message: "Le push a échoué." } });
  });
});

// ─── runInvoicePushLoop (fetch mocké) ───────────────────────────────────────

describe("runInvoicePushLoop — boucle avance-saga d'une facture", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const stepRes = (state: AbbyPushState, done: boolean, number?: string) => ({
    ok: true,
    json: async () => ({ step: { state, done, abbyInvoiceNumber: number } }),
  });

  it("(a)(f) enchaîne les étapes jusqu'à done → finalized + numéro ; onStep aux bons paliers (jamais l'étape initiale)", async () => {
    fetchMock
      .mockResolvedValueOnce(stepRes("pushing", false))
      .mockResolvedValueOnce(stepRes("draft_created", false))
      .mockResolvedValueOnce(stepRes("lines_set", false))
      .mockResolvedValueOnce(stepRes("details_set", false))
      .mockResolvedValueOnce(stepRes("finalized", true, "F-2026-0007"));
    const steps: number[] = [];
    const outcome = await runInvoicePushLoop("inv-1", { onStep: (s) => steps.push(s) });
    expect(outcome).toEqual({ kind: "finalized", number: "F-2026-0007" });
    // onStep = étape SUIVANTE après chaque POST non-final ; jamais 1 (initiale).
    expect(steps).toEqual([2, 3, 4, 5]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("(b) abby_draft_missing → outcome draft_missing", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: "Brouillon disparu", code: "abby_draft_missing" } }),
    });
    const outcome = await runInvoicePushLoop("inv-2");
    expect(outcome).toEqual({ kind: "draft_missing", message: "Brouillon disparu" });
  });

  it("(c) 422 error → outcome error (message verbatim)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: "Fiche client incomplète", code: "abby_validation" } }),
    });
    const outcome = await runInvoicePushLoop("inv-3");
    expect(outcome).toEqual({ kind: "error", message: "Fiche client incomplète" });
  });

  it("(d) échec réseau (throw) → outcome error, message réseau verbatim", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const outcome = await runInvoicePushLoop("inv-4");
    expect(outcome).toEqual({
      kind: "error",
      message: "Le push a été interrompu (réseau). Vous pourrez le reprendre.",
    });
  });

  it("(e) restartFromZero → body { restartFromZero:true } au 1er POST SEULEMENT", async () => {
    fetchMock
      .mockResolvedValueOnce(stepRes("draft_created", false))
      .mockResolvedValueOnce(stepRes("finalized", true, "F-2026-0008"));
    await runInvoicePushLoop("inv-5", { restartFromZero: true });
    // 1er POST : body de restart ; 2ᵉ POST : aucun body.
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ restartFromZero: true });
    expect(fetchMock.mock.calls[1][1].body).toBeUndefined();
  });

  it("sans restartFromZero → aucun body au 1er POST", async () => {
    fetchMock.mockResolvedValueOnce(stepRes("finalized", true, "F-2026-0009"));
    await runInvoicePushLoop("inv-6");
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it("(g) état inattendu (getResumeStep → 1) → terminal error, boucle STOPPÉE (pas d'infini)", async () => {
    // done:false avec un state hors machine → getResumeStep renvoie 1.
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ step: { state: "etat_bizarre" as AbbyPushState, done: false } }),
    });
    const outcome = await runInvoicePushLoop("inv-7");
    expect(outcome).toEqual({ kind: "error", message: "État de push inattendu — rechargez la page." });
    // Un seul POST : la boucle sort au lieu de tourner à l'infini.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ─── summarizeBatchExecution (pur) ──────────────────────────────────────────

describe("summarizeBatchExecution — récap final du lot exécuté", () => {
  it("lot mixte (2 finalisées + 1 erreur + 1 draft_missing) → 2 finalisées, 2 à reprendre", () => {
    const outcomes: PushLoopOutcome[] = [
      { kind: "finalized", number: "F-1" },
      { kind: "error", message: "x" },
      { kind: "finalized", number: "F-2" },
      { kind: "draft_missing", message: "y" },
    ];
    expect(summarizeBatchExecution(outcomes)).toEqual({ finalizedCount: 2, failedCount: 2, total: 4 });
  });

  it("tout finalisé", () => {
    expect(
      summarizeBatchExecution([
        { kind: "finalized", number: "F-1" },
        { kind: "finalized", number: null },
      ]),
    ).toEqual({ finalizedCount: 2, failedCount: 0, total: 2 });
  });

  it("tout en échec", () => {
    expect(
      summarizeBatchExecution([
        { kind: "error", message: "a" },
        { kind: "draft_missing", message: "b" },
      ]),
    ).toEqual({ finalizedCount: 0, failedCount: 2, total: 2 });
  });

  it("lot vide → tout à zéro", () => {
    expect(summarizeBatchExecution([])).toEqual({ finalizedCount: 0, failedCount: 0, total: 0 });
  });
});
