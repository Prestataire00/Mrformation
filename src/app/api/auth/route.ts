import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      return NextResponse.json(
        { data: null, error: signOutError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: { message: "Déconnexion réussie" }, error: null },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
