import type { Config } from "@netlify/functions";

export default async () => {
  const baseUrl = process.env.URL || "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron] CRON_SECRET not configured");
    return new Response("CRON_SECRET not configured", { status: 500 });
  }

  try {
    const res = await fetch(`${baseUrl}/api/emails/process-scheduled`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    });

    const data = await res.json();
    console.log("[cron] process-scheduled-emails result:", data);

    return new Response(JSON.stringify(data), { status: res.status });
  } catch (err) {
    console.error("[cron] Failed to call process-scheduled:", err);
    return new Response("Failed", { status: 500 });
  }
};

export const config: Config = {
  schedule: "0 * * * *",
};
