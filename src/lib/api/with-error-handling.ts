import { NextRequest, NextResponse } from "next/server";

type RouteHandler = (req: NextRequest, context?: Record<string, unknown>) => Promise<NextResponse>;

export function withErrorHandling(handler: RouteHandler): RouteHandler {
  return async (req: NextRequest, context?: Record<string, unknown>) => {
    try {
      return await handler(req, context);
    } catch (error) {
      const err = error as Error & { code?: string; details?: string };

      console.error("[API ERROR]", {
        route: req.nextUrl.pathname,
        method: req.method,
        message: err.message,
        code: err.code,
        ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
      });

      let status = 500;
      let userMessage = "Une erreur est survenue. Veuillez réessayer.";

      if (err.code === "PGRST301" || err.message?.includes("row level security")) {
        status = 403;
        userMessage = "Accès refusé à cette ressource.";
      } else if (err.code === "23505") {
        status = 409;
        userMessage = "Cette ressource existe déjà.";
      } else if (err.code === "23503") {
        status = 400;
        userMessage = "Référence invalide : une ressource liée est manquante.";
      } else if (err.message?.includes("not found") || err.message?.includes("introuvable")) {
        status = 404;
        userMessage = "Ressource introuvable.";
      }

      return NextResponse.json(
        {
          error: userMessage,
          ...(process.env.NODE_ENV === "development" && { details: err.message, code: err.code }),
        },
        { status }
      );
    }
  };
}
