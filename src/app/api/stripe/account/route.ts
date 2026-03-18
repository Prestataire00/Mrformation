import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";

// GET — fetch linked Stripe account status
export async function GET() {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const { data, error } = await auth.supabase
      .from("stripe_accounts")
      .select("*")
      .eq("entity_id", auth.profile.entity_id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: sanitizeDbError(error, "stripe account GET") },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "stripe account GET") },
      { status: 500 }
    );
  }
}

// POST — create Stripe Connect onboarding link
export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: "Stripe n'est pas configuré. Ajoutez STRIPE_SECRET_KEY dans les variables d'environnement." },
        { status: 503 }
      );
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2026-02-25.clover" });

    // Check if an account already exists
    const { data: existing } = await auth.supabase
      .from("stripe_accounts")
      .select("stripe_account_id")
      .eq("entity_id", auth.profile.entity_id)
      .maybeSingle();

    let stripeAccountId: string;

    if (existing?.stripe_account_id) {
      stripeAccountId = existing.stripe_account_id;
    } else {
      // Create a new Stripe Connect Express account
      const account = await stripe.accounts.create({
        type: "express",
        country: "FR",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      stripeAccountId = account.id;

      // Save to DB
      const { error: insertError } = await auth.supabase
        .from("stripe_accounts")
        .insert({
          entity_id: auth.profile.entity_id,
          stripe_account_id: stripeAccountId,
          is_active: false,
        });

      if (insertError) {
        return NextResponse.json(
          { error: sanitizeDbError(insertError, "stripe account insert") },
          { status: 500 }
        );
      }

      logAudit({
        supabase: auth.supabase,
        entityId: auth.profile.entity_id,
        userId: auth.user.id,
        action: "create",
        resourceType: "stripe_account",
        resourceId: stripeAccountId,
      });
    }

    // Create onboarding link
    const body = await request.json().catch(() => ({}));
    const returnUrl = body.return_url || `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/admin/programs/payments`;

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: returnUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "stripe onboarding") },
      { status: 500 }
    );
  }
}

// DELETE — disconnect Stripe account
export async function DELETE() {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const { error } = await auth.supabase
      .from("stripe_accounts")
      .delete()
      .eq("entity_id", auth.profile.entity_id);

    if (error) {
      return NextResponse.json(
        { error: sanitizeDbError(error, "stripe account DELETE") },
        { status: 500 }
      );
    }

    logAudit({
      supabase: auth.supabase,
      entityId: auth.profile.entity_id,
      userId: auth.user.id,
      action: "delete",
      resourceType: "stripe_account",
      resourceId: auth.profile.entity_id,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "stripe account DELETE") },
      { status: 500 }
    );
  }
}
