import type { Config } from "@netlify/functions";

export default async () => {
  const baseUrl = process.env.URL || "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron] CRON_SECRET not configured");
    return new Response("CRON_SECRET not configured", { status: 500 });
  }

  try {
    // Body vide → run-cron s'exécute en mode global (toutes entités, règles date-based + OPCO).
    const res = await fetch(`${baseUrl}/api/formations/automation-rules/run-cron`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });

    const data = await res.json();
    console.log("[cron] run-automations result:", data);

    return new Response(JSON.stringify(data), { status: res.status });
  } catch (err) {
    console.error("[cron] Failed to call run-cron:", err);
    return new Response("Failed", { status: 500 });
  }
};

// 1×/jour à 7h UTC (≈ 9h Paris) : déclenche les automatisations à date
// (convocation J-X, certificat J+X, satisfaction, rappels OPCO).
export const config: Config = {
  schedule: "0 7 * * *",
};
