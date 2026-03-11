import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { LandingPage } from "@/components/LandingPage";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Authenticated user: redirect to appropriate dashboard
  if (user) {
    const cookieStore = cookies();
    const entityId = cookieStore.get("entity_id")?.value;

    if (!entityId) {
      redirect("/select-entity");
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile) {
      redirect("/login");
    }

    switch (profile.role) {
      case "admin":
        redirect("/admin");
      case "trainer":
        redirect("/trainer");
      case "client":
        redirect("/client");
      case "learner":
        redirect("/learner");
      default:
        redirect("/admin");
    }
  }

  // Not authenticated: show landing page with entity selection
  return <LandingPage />;
}
