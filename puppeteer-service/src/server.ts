// Service PDF sidecar pour MR/C3V Formation.
// Express minimaliste : auth Bearer pour /render, /health public.
//
// L'endpoint /render lazy-init un browser Puppeteer partagé (cf render.ts)
// pour éviter le coût de spawn Chromium à chaque requête.

import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  renderPdf,
  getChromiumVersion,
  shutdownBrowser,
} from "./render.js";

const PORT = Number(process.env.PORT ?? 8080);
const SECRET = process.env.PDF_SERVICE_SECRET;

if (!SECRET) {
  // En prod (Railway) cette variable est obligatoire. En dev local on log
  // mais on continue (utile pour tester /health sans secret).
  console.warn(
    "[startup] PDF_SERVICE_SECRET non défini — l'endpoint /render acceptera n'importe quel Bearer en mode dev local."
  );
}

const app = express();
app.use(express.json({ limit: "5mb" })); // les templates HTML peuvent être lourds

// ── Middleware d'auth Bearer (uniquement /render, pas /health) ────────────────
function requireBearerAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!SECRET) {
    // Mode dev local sans secret : on laisse passer.
    next();
    return;
  }
  const header = req.header("authorization") ?? "";
  const expected = `Bearer ${SECRET}`;
  if (header !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ── Health check public ───────────────────────────────────────────────────────
app.get("/health", async (_req: Request, res: Response) => {
  try {
    const version = await getChromiumVersion();
    res.json({ status: "ok", chromium_version: version });
  } catch (err) {
    res.status(503).json({
      status: "degraded",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// ── Render PDF (auth requise) ─────────────────────────────────────────────────
app.post("/render", requireBearerAuth, async (req: Request, res: Response) => {
  const body = req.body as { html?: unknown; options?: unknown } | undefined;
  if (!body || typeof body.html !== "string" || body.html.length === 0) {
    res.status(400).json({ error: "Field `html` (non-empty string) is required" });
    return;
  }
  const options = (body.options ?? {}) as Record<string, unknown>;

  try {
    const pdf = await renderPdf(body.html, options);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(pdf.length));
    res.send(pdf);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[render] failed:", message);
    res.status(500).json({ error: message });
  }
});

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[startup] PDF service listening on port ${PORT}`);
});

// Graceful shutdown — ferme le browser Puppeteer proprement avant l'exit.
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`[shutdown] received ${signal}, closing server...`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await shutdownBrowser();
  process.exit(0);
}
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
