import type { Config } from "@netlify/functions";

export default async () => {
  const baseUrl = process.env.URL || "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron] CRON_SECRET not configured");
    return new Response("CRON_SECRET not configured", { status: 500 });
  }

  try {
    const res = await fetch(`${baseUrl}/api/invoices/process-reminders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });

    const data = await res.json();
    console.log("[cron] invoice-reminders result:", JSON.stringify(data));

    return new Response(JSON.stringify(data), { status: res.status });
  } catch (err) {
    console.error("[cron] Failed to call invoice-reminders:", err);
    return new Response("Failed", { status: 500 });
  }
};

export const config: Config = {
  schedule: "0 8 * * *", // Every day at 8 AM (1h after automation rules)
};
