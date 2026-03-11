import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      referral_code,
      referred_user_id,
      referred_name,
      referred_email,
      company_name,
    } = body;

    if (!referral_code || !referred_user_id) {
      return NextResponse.json(
        { error: "Code de parrainage et ID utilisateur requis" },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Insert the referral record
    const { error } = await supabase.from("referrals").insert({
      referral_code,
      referred_user_id,
      referred_name: referred_name || null,
      referred_email: referred_email || null,
      company_name: company_name || null,
      is_subscribed: false,
    });

    if (error) {
      console.error("Referral insert error:", error);
      // Don't fail the registration if referral tracking fails
      return NextResponse.json(
        { success: false, message: "Parrainage non enregistré (table manquante ?)", detail: error.message },
        { status: 200 }
      );
    }

    return NextResponse.json({ success: true, message: "Parrainage enregistré" });
  } catch (err) {
    console.error("Register referral error:", err);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
