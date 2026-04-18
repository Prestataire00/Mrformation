import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { AlertCircle, Clock } from "lucide-react";

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function AccessPage({ params }: { params: { token: string } }) {
  const supabase = createServiceClient();

  const { data: tokenRow } = await supabase
    .from("learner_access_tokens")
    .select("*, learner:learners(id, first_name, last_name, email, entity_id)")
    .eq("token", params.token)
    .maybeSingle();

  if (!tokenRow) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="max-w-md text-center bg-white rounded-xl p-8 shadow-lg">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Lien invalide</h1>
          <p className="text-gray-600">Ce lien d&apos;accès n&apos;existe pas ou a été révoqué.</p>
        </div>
      </div>
    );
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="max-w-md text-center bg-white rounded-xl p-8 shadow-lg">
          <Clock className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Lien expiré</h1>
          <p className="text-gray-600">Contactez votre centre de formation pour en recevoir un nouveau.</p>
        </div>
      </div>
    );
  }

  // Mark as used
  await supabase
    .from("learner_access_tokens")
    .update({ used_count: (tokenRow.used_count || 0) + 1, last_used_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  const learner = tokenRow.learner as { id: string; email: string; entity_id: string } | null;
  if (!learner?.email) {
    redirect("/login");
  }

  // Generate Supabase Auth magic link and redirect
  const { data: magicLink } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: learner.email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || ""}/learner` },
  });

  if (magicLink?.properties?.action_link) {
    redirect(magicLink.properties.action_link);
  }

  redirect("/login?info=magic_link_sent");
}
