"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Key, Mail, ShieldCheck, ShieldOff, User } from "lucide-react";

interface LearnerFull {
  id: string;
  entity_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  client_id: string | null;
  profile_id: string | null;
  job_title: string | null;
  birth_date: string | null;
  birth_city: string | null;
  gender: "M" | "F" | "autre" | null;
  nationality: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  social_security_number: string | null;
  education_level: string | null;
  learner_type: string | null;
  loris_metadata: Record<string, string | number | null> | null;
  loris_external_id: string | null;
  created_at: string;
  avatar_url: string | null;
  clients: { company_name: string } | null;
  welcome_email_sent_at: string | null;
}

interface TabAccesProps {
  learner: LearnerFull;
}

const formatDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("fr-FR") : "\u2014";

export default function TabAcces({ learner }: TabAccesProps) {
  const hasAccess = !!learner.profile_id;
  const emailSent = !!learner.welcome_email_sent_at;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Statut du compte</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${hasAccess ? "bg-green-100" : "bg-gray-100"}`}>
              {hasAccess ? <ShieldCheck className="h-5 w-5 text-green-600" /> : <ShieldOff className="h-5 w-5 text-gray-400" />}
            </div>
            <div>
              <p className="text-sm font-medium">
                {hasAccess ? "Compte actif" : "Aucun compte plateforme"}
              </p>
              <p className="text-xs text-gray-400">
                {hasAccess ? "L'apprenant peut se connecter a la plateforme" : "Aucun acces n'a ete cree pour cet apprenant"}
              </p>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-400 flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5" /> Identifiant profile
              </span>
              <span className="text-sm text-gray-700 font-mono">
                {learner.profile_id ? learner.profile_id.slice(0, 8) + "..." : "\u2014"}
              </span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-400 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Email de connexion
              </span>
              <span className="text-sm text-gray-700">{learner.email || "\u2014"}</span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-400 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Email de bienvenue
              </span>
              {emailSent ? (
                <Badge className="bg-green-100 text-green-700">
                  Envoye le {formatDate(learner.welcome_email_sent_at)}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-gray-400">Non envoye</Badge>
              )}
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-400">Compte cree le</span>
              <span className="text-sm text-gray-700">{formatDate(learner.created_at)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
