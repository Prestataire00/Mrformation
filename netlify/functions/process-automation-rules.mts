import type { Config } from "@netlify/functions";

export default async () => {
  const baseUrl = process.env.URL || "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron] CRON_SECRET not configured");
    return new Response("CRON_SECRET not configured", { status: 500 });
  }

  try {
    // 1. Automation rules
    const res = await fetch(`${baseUrl}/api/formations/automation-rules/run-cron`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const data = await res.json();
    console.log("[cron] automation-rules result:", JSON.stringify(data));

    // 2. Document signature reminders
    try {
      const signRes = await fetch(`${baseUrl}/api/documents/process-sign-reminders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      const signData = await signRes.json();
      console.log("[cron] sign-reminders result:", JSON.stringify(signData));
    } catch (signErr) {
      console.error("[cron] sign-reminders failed:", signErr);
    }

    return new Response(JSON.stringify(data), { status: res.status });
  } catch (err) {
    console.error("[cron] Failed to call automation-rules:", err);
    return new Response("Failed", { status: 500 });
  }
};

export const config: Config = {
  schedule: "0 7 * * *",
};
