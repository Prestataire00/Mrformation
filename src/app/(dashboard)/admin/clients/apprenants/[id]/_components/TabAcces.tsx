"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Key, KeyRound, Mail, ShieldCheck, ShieldOff, User } from "lucide-react";
import CredentialsCard, { type CredentialsData } from "@/components/credentials/CredentialsCard";
import CreateAccessButton from "@/components/credentials/CreateAccessButton";
import SyntheticEmailBanner from "@/components/credentials/SyntheticEmailBanner";
import type { LearnerFull } from "../page";

interface TabAccesProps {
  learner: LearnerFull;
  onRefresh: () => Promise<void>;
}

const formatDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("fr-FR") : "\u2014";

export default function TabAcces({ learner, onRefresh }: TabAccesProps) {
  const [createdCredentials, setCreatedCredentials] = useState<CredentialsData | null>(null);
  const hasAccess = !!learner.profile_id;

  // No account, no just-created credentials → show creation CTA
  if (!hasAccess && !createdCredentials) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <KeyRound className="h-10 w-10 mx-auto text-gray-300" />
            <div>
              <p className="text-sm font-medium text-gray-600">
                Aucun accès plateforme créé pour cet apprenant.
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {learner.email
                  ? "Un accès sera créé avec son email existant."
                  : "Un email synthétique sera généré automatiquement (l'apprenant se connectera avec son identifiant)."}
              </p>
            </div>
            <CreateAccessButton
              learnerId={learner.id}
              learnerHasEmail={!!learner.email}
              onSuccess={(creds) => {
                setCreatedCredentials(creds);
                onRefresh();
              }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Synthetic email warning */}
      {(createdCredentials?.synthetic_email_used || learner.synthetic_email_used) && (
        <SyntheticEmailBanner email={createdCredentials?.email ?? learner.email} />
      )}

      {/* Credentials card */}
      <CredentialsCard
        learnerId={learner.id}
        inlineCredentials={createdCredentials}
        onRegenerate={onRefresh}
      />

      {/* Account status info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Statut du compte</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${hasAccess || createdCredentials ? "bg-green-100" : "bg-gray-100"}`}>
              {hasAccess || createdCredentials
                ? <ShieldCheck className="h-5 w-5 text-green-600" />
                : <ShieldOff className="h-5 w-5 text-gray-400" />}
            </div>
            <div>
              <p className="text-sm font-medium">
                {hasAccess || createdCredentials ? "Compte actif" : "Aucun compte plateforme"}
              </p>
              <p className="text-xs text-gray-400">
                {hasAccess || createdCredentials
                  ? "L\u2019apprenant peut se connecter \u00e0 la plateforme"
                  : "Aucun acc\u00e8s n\u2019a \u00e9t\u00e9 cr\u00e9\u00e9"}
              </p>
            </div>
          </div>

          <div className="border-t pt-3 space-y-2">
            {learner.username && (
              <div className="flex items-center justify-between py-1">
                <span className="text-sm text-gray-400 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> Username
                </span>
                <span className="text-sm text-gray-700 font-mono">{learner.username}</span>
              </div>
            )}

            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-400 flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5" /> Identifiant profile
              </span>
              <span className="text-sm text-gray-700 font-mono">
                {learner.profile_id ? learner.profile_id.slice(0, 8) + "\u2026" : "\u2014"}
              </span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-400 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Email de bienvenue
              </span>
              {learner.welcome_email_sent_at ? (
                <Badge className="bg-green-100 text-green-700">
                  Envoy\u00e9 le {formatDate(learner.welcome_email_sent_at)}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-gray-400">Non envoy\u00e9</Badge>
              )}
            </div>

            {learner.first_login_at && (
              <div className="flex items-center justify-between py-1">
                <span className="text-sm text-gray-400">Premi\u00e8re connexion</span>
                <span className="text-sm text-gray-700">{formatDate(learner.first_login_at)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
