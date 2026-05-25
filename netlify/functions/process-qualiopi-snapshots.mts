import type { Config } from "@netlify/functions";

export default async () => {
  const baseUrl = process.env.URL || "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron] CRON_SECRET not configured");
    return new Response("CRON_SECRET not configured", { status: 500 });
  }

  try {
    const res = await fetch(`${baseUrl}/api/qualiopi/snapshots`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const data = await res.json();
    console.log("[cron] qualiopi-snapshots result:", JSON.stringify(data));
    return new Response(JSON.stringify(data), { status: res.status });
  } catch (err) {
    console.error("[cron] qualiopi-snapshots failed:", err);
    return new Response("Failed", { status: 500 });
  }
};

// 3h UTC quotidien — hors heures de pointe, après que la queue d'emails du jour
// précédent ait fini de tourner (les workers email tournent toutes les 5 min).
export const config: Config = {
  schedule: "0 3 * * *",
};
