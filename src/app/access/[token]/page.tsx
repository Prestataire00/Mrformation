import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AlertCircle, Clock } from "lucide-react";
import { checkRateLimit } from "@/lib/rate-limit";

// Hardening sécurité PR 17 :
//  - Rate limit par IP (10 tentatives / 5 min) → contre bruteforce de tokens UUID
//  - Cap usage : refuse si used_count > MAX_TOKEN_USES (50 par défaut)
//  - Early return : on ne touche listUsers() que si token valide & non expiré
//    (déjà le cas — listUsers est dans le bloc !authUserId, donc après checks)
const MAX_TOKEN_USES = 50;

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const APP_URL = (() => {
  const url = process.env.NEXT_PUBLIC_APP_URL || "https://mrformationcrm.netlify.app";
  return url.replace(/\/+$/, "");
})();

interface LearnerRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  entity_id: string;
  profile_id: string | null;
}

export default async function AccessPage({ params }: { params: { token: string } }) {
  // Rate limit IP (10 tentatives / 5 min) : protège contre bruteforce de tokens.
  // Important : on doit limiter par IP, PAS par token, car un attaquant teste
  // plein de tokens différents.
  const hdrs = headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim()
    || hdrs.get("x-real-ip")?.trim()
    || "unknown";
  const { allowed } = checkRateLimit(`access-token:${ip}`, { limit: 10, windowSeconds: 300 });
  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="max-w-md text-center bg-white rounded-xl p-8 shadow-lg">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Trop de tentatives</h1>
          <p className="text-gray-600">Veuillez réessayer dans quelques minutes.</p>
        </div>
      </div>
    );
  }

  const supabase = createServiceClient();

  // 1. Validate token
  const { data: tokenRow } = await supabase
    .from("learner_access_tokens")
    .select("*, learner:learners(id, first_name, last_name, email, entity_id, profile_id)")
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

  // Cap usage : protège contre l'usage abusif d'un token leaké (ex: lien
  // partagé en interne, screenshot). Au-delà de MAX_TOKEN_USES, le token est
  // considéré comme grillé — l'admin doit en regénérer un nouveau.
  if ((tokenRow.used_count || 0) >= MAX_TOKEN_USES) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="max-w-md text-center bg-white rounded-xl p-8 shadow-lg">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Lien invalide</h1>
          <p className="text-gray-600">Ce lien d&apos;accès a atteint sa limite d&apos;utilisation. Contactez votre centre de formation pour en recevoir un nouveau.</p>
        </div>
      </div>
    );
  }

  // 2. Mark as used
  await supabase
    .from("learner_access_tokens")
    .update({ used_count: (tokenRow.used_count || 0) + 1, last_used_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  const learner = tokenRow.learner as LearnerRow | null;
  if (!learner?.email) {
    redirect("/login");
  }

  // 3. Ensure auth user exists (create if needed)
  let authUserId = learner.profile_id;

  if (!authUserId) {
    // Check if an auth user with this email already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === learner.email.toLowerCase()
    );

    if (existingUser) {
      authUserId = existingUser.id;
    } else {
      // Create auth user with a random password (they'll use magic links)
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: learner.email,
        email_confirm: true,
        user_metadata: {
          first_name: learner.first_name,
          last_name: learner.last_name,
          role: "learner",
        },
      });

      if (createError || !newUser.user) {
        console.error("[access] Failed to create auth user:", createError);
        redirect("/login?error=account_creation_failed");
      }

      authUserId = newUser.user.id;
    }

    // 4. Ensure profile exists with role=learner
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", authUserId)
      .maybeSingle();

    if (!existingProfile) {
      await supabase.from("profiles").insert({
        id: authUserId,
        first_name: learner.first_name,
        last_name: learner.last_name,
        role: "learner",
        entity_id: learner.entity_id,
      });
    }

    // 5. Link learner → auth user
    await supabase
      .from("learners")
      .update({ profile_id: authUserId })
      .eq("id", learner.id);
  }

  // 6. Generate magic link to sign in as this learner.
  // redirectTo pointe vers /api/auth/callback qui va exchanger le code
  // Supabase OAuth contre une session cookie côté app (sinon la session
  // Supabase est posée sur supabase.co, pas sur le domaine app → /learner
  // verrait pas de session → middleware redirige vers /login).
  const { data: magicLink } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: learner.email,
    options: { redirectTo: `${APP_URL}/auth/callback?next=/learner` },
  });

  if (magicLink?.properties?.action_link) {
    // Fix redirect_to if Supabase Site URL is misconfigured (pointing to localhost)
    let actionLink = magicLink.properties.action_link;
    if (actionLink.includes("localhost")) {
      actionLink = actionLink.replace(
        /redirect_to=http%3A%2F%2Flocalhost[^&]*/,
        `redirect_to=${encodeURIComponent(`${APP_URL}/auth/callback?next=/learner`)}`
      );
    }
    redirect(actionLink);
  }

  redirect("/login?info=magic_link_sent");
}
