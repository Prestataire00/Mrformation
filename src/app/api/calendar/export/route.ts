import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

function formatICSDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeICS(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function generateUID(id: string): string {
  return `${id}@lms-platform`;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    // Find learner
    const { data: learner } = await supabase
      .from("learners")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (!learner) {
      return NextResponse.json({ error: "Learner not found" }, { status: 404 });
    }

    // Build query for sessions
    let query = supabase
      .from("enrollments")
      .select(`
        sessions(
          id, title, start_date, end_date, location, mode,
          trainings(title),
          trainers(first_name, last_name)
        )
      `)
      .eq("learner_id", learner.id)
      .neq("status", "cancelled");

    if (sessionId) {
      query = query.eq("session_id", sessionId);
    }

    const { data: enrollments, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Build ICS content
    const events: string[] = [];

    for (const enrollment of (enrollments || []) as any[]) {
      const s = enrollment.sessions;
      if (!s) continue;

      const title = s.trainings?.title
        ? `${s.trainings.title} - ${s.title}`
        : s.title;

      const trainerName = s.trainers
        ? `${s.trainers.first_name} ${s.trainers.last_name}`
        : "";

      const modeLabels: Record<string, string> = {
        presentiel: "Présentiel",
        distanciel: "Distanciel",
        hybride: "Hybride",
      };

      const descriptionParts = [
        `Formation : ${title}`,
        trainerName ? `Formateur : ${trainerName}` : "",
        s.mode ? `Mode : ${modeLabels[s.mode] || s.mode}` : "",
      ].filter(Boolean);

      events.push(
        [
          "BEGIN:VEVENT",
          `UID:${generateUID(s.id)}`,
          `DTSTART:${formatICSDate(s.start_date)}`,
          `DTEND:${formatICSDate(s.end_date)}`,
          `SUMMARY:${escapeICS(title)}`,
          s.location ? `LOCATION:${escapeICS(s.location)}` : "",
          `DESCRIPTION:${escapeICS(descriptionParts.join("\\n"))}`,
          `DTSTAMP:${formatICSDate(new Date().toISOString())}`,
          "END:VEVENT",
        ]
          .filter(Boolean)
          .join("\r\n")
      );
    }

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//MR Formation//LMS Platform//FR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Mes Formations",
      ...events,
      "END:VCALENDAR",
    ].join("\r\n");

    const filename = sessionId ? `session-${sessionId}.ics` : "mes-formations.ics";

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
