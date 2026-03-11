import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generatePptxBuffer } from "@/lib/services/pptx-generator";

export async function GET(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    // Get slide spec
    const { data: slideSpec, error } = await supabase
      .from("elearning_slide_specs")
      .select("slide_spec")
      .eq("course_id", params.courseId)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (error || !slideSpec) {
      return NextResponse.json({ error: "Slide spec non trouvé" }, { status: 404 });
    }

    // Get course title for filename
    const { data: course } = await supabase
      .from("elearning_courses")
      .select("title")
      .eq("id", params.courseId)
      .single();

    const buffer = await generatePptxBuffer(slideSpec.slide_spec);
    const safeName = (course?.title || "cours").replace(/[^a-zA-Z0-9\u00C0-\u024F ]/g, "_").substring(0, 50);

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${safeName}.pptx"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur" }, { status: 500 });
  }
}
