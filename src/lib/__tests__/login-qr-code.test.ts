import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock de la lib externe `qrcode` : on capture l'URL passée à toDataURL
// pour asserter le contenu encodé sans dépendre de la génération réelle.
vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(async () => "data:image/png;base64,FAKE"),
  },
}));

import QRCode from "qrcode";
import { generateLoginQrDataUrl } from "@/lib/services/login-qr-code";

const mockToDataURL = vi.mocked(QRCode.toDataURL);

// Base déterministe pour l'assertion sur l'URL.
const BASE = "https://example.test";

describe("generateLoginQrDataUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = BASE;
  });

  it("encode /login?entity=<slug> quand un slug est fourni", async () => {
    await generateLoginQrDataUrl("mr-formation");
    expect(mockToDataURL).toHaveBeenCalledTimes(1);
    const urlArg = mockToDataURL.mock.calls[0][0];
    expect(urlArg).toBe(`${BASE}/login?entity=mr-formation`);
  });

  it("encode /login (sans paramètre) quand aucun slug n'est fourni", async () => {
    await generateLoginQrDataUrl();
    const urlArg = mockToDataURL.mock.calls[0][0];
    expect(urlArg).toBe(`${BASE}/login`);
  });

  it("replie sur /login quand le slug est une chaîne vide", async () => {
    await generateLoginQrDataUrl("");
    const urlArg = mockToDataURL.mock.calls[0][0];
    expect(urlArg).toBe(`${BASE}/login`);
  });

  it("encode le slug avec encodeURIComponent (caractères spéciaux)", async () => {
    await generateLoginQrDataUrl("c3v formation/é");
    const urlArg = mockToDataURL.mock.calls[0][0];
    expect(urlArg).toBe(`${BASE}/login?entity=c3v%20formation%2F%C3%A9`);
  });

  it("retourne le data URL produit par la lib qrcode", async () => {
    const result = await generateLoginQrDataUrl("mr-formation");
    expect(result).toBe("data:image/png;base64,FAKE");
  });

  it("retourne null si la génération QR échoue", async () => {
    mockToDataURL.mockRejectedValueOnce(new Error("boom"));
    const result = await generateLoginQrDataUrl("mr-formation");
    expect(result).toBeNull();
  });
});
