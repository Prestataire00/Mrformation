import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type RequireRoleSuccess = {
  error: null;
  user: { id: string; email?: string };
  profile: { id: string; role: string; entity_id: string };
  supabase: ReturnType<typeof createClient>;
};

type RequireRoleError = {
  error: NextResponse;
  user: null;
  profile: null;
  supabase?: undefined;
};

export async function requireRole(
  allowedRoles: string[]
): Promise<RequireRoleSuccess | RequireRoleError> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 }
      ),
      user: null,
      profile: null,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, entity_id")
    .eq("id", user.id)
    .single();

  if (!profile || !allowedRoles.includes(profile.role)) {
    return {
      error: NextResponse.json(
        { error: "Accès non autorisé" },
        { status: 403 }
      ),
      user: null,
      profile: null,
    };
  }

  return { error: null, user, profile, supabase };
}
