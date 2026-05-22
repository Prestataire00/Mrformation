import { requireElearningCourse } from "@/lib/auth/elearning-access";
import { NextRequest, NextResponse } from "next/server";
import { generatePptxBuffer } from "@/lib/services/pptx-generator";
import { sanitizeError } from "@/lib/api-error";

export async function GET(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const access = await requireElearningCourse(params.courseId, ["admin", "super_admin"]);
    if (!access.ok) return access.error;
    const { supabase, course } = access;

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

    const buffer = await generatePptxBuffer(slideSpec.slide_spec);
    const safeName = ((course.title as string) || "cours").replace(/[^a-zA-Z0-9À-ɏ ]/g, "_").substring(0, 50);

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${safeName}.pptx"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "exporting PPTX") }, { status: 500 });
  }
}
