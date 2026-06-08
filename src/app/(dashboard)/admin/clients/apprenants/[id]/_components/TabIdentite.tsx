"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save, Eye, EyeOff } from "lucide-react";

interface LearnerFull {
  id: string; entity_id: string; first_name: string; last_name: string;
  email: string | null; phone: string | null; client_id: string | null;
  profile_id: string | null; job_title: string | null; birth_date: string | null;
  birth_city: string | null; gender: "M" | "F" | "autre" | null;
  nationality: string | null; address: string | null; city: string | null;
  postal_code: string | null; social_security_number: string | null;
  education_level: string | null; learner_type: string | null;
  loris_metadata: Record<string, string | number | null> | null;
  loris_external_id: string | null; created_at: string; updated_at: string;
  avatar_url: string | null; clients: { company_name: string } | null;
  welcome_email_sent_at: string | null;
}

interface TabIdentiteProps {
  learner: LearnerFull;
  editing: boolean;
  onSave: (form: Record<string, string>) => Promise<void>;
  saving: boolean;
  clientOptions: { id: string; company_name: string }[];
}

function DataRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className="text-sm text-gray-700">{value || "\u2014"}</span>
    </div>
  );
}

const genderLabel: Record<string, string> = { M: "Homme", F: "Femme", autre: "Autre" };
const educationLabels: Record<string, string> = {
  bac_moins: "Inferieur au Bac", bac: "Bac", bac_plus_2: "Bac+2",
  bac_plus_3: "Bac+3 (Licence)", bac_plus_5: "Bac+5 (Master)", bac_plus_8: "Bac+8 (Doctorat)",
};

const formatDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("fr-FR") : "\u2014";

function metaVal(meta: Record<string, string | number | null> | null, key: string): string | null {
  if (!meta) return null;
  const v = meta[key];
  if (v === null || v === undefined) return null;
  return String(v);
}

export default function TabIdentite({ learner, editing, onSave, saving, clientOptions }: TabIdentiteProps) {
  const [showSSN, setShowSSN] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    setForm({
      first_name: learner.first_name,
      last_name: learner.last_name,
      email: learner.email ?? "",
      phone: learner.phone ?? "",
      client_id: learner.client_id ?? "",
      job_title: learner.job_title ?? "",
      birth_date: learner.birth_date ?? "",
      birth_city: learner.birth_city ?? "",
      gender: learner.gender ?? "",
      nationality: learner.nationality ?? "",
      address: learner.address ?? "",
      city: learner.city ?? "",
      postal_code: learner.postal_code ?? "",
      social_security_number: learner.social_security_number ?? "",
      education_level: learner.education_level ?? "",
    });
  }, [learner]);

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));
  const meta = learner.loris_metadata;
  const rthValue = metaVal(meta, "Reconnaissance Travailleur Handicapé");
  const maskedSSN = learner.social_security_number
    ? learner.social_security_number.replace(/.(?=.{4})/g, "*")
    : null;

  if (editing) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Etat civil</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Prenom</Label><Input value={form.first_name ?? ""} onChange={(e) => set("first_name", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Nom</Label><Input value={form.last_name ?? ""} onChange={(e) => set("last_name", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Genre</Label>
                <Select value={form.gender ?? ""} onValueChange={(v) => set("gender", v)}>
                  <SelectTrigger><SelectValue placeholder="Non renseigne" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Homme</SelectItem>
                    <SelectItem value="F">Femme</SelectItem>
                    <SelectItem value="autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Date de naissance</Label><Input type="date" value={form.birth_date ?? ""} onChange={(e) => set("birth_date", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Ville de naissance</Label><Input value={form.birth_city ?? ""} onChange={(e) => set("birth_city", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Nationalite</Label><Input value={form.nationality ?? ""} onChange={(e) => set("nationality", e.target.value)} /></div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">N Securite sociale</Label>
              <Input value={form.social_security_number ?? ""} onChange={(e) => set("social_security_number", e.target.value)} placeholder="1 23 45 67 890 123 45" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Coordonnees</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Email</Label><Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Telephone</Label><Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Adresse</Label><Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Ville</Label><Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Code postal</Label><Input value={form.postal_code ?? ""} onChange={(e) => set("postal_code", e.target.value)} /></div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Entreprise</Label>
              <Select value={form.client_id ?? ""} onValueChange={(v) => set("client_id", v)}>
                <SelectTrigger><SelectValue placeholder="Aucune entreprise" /></SelectTrigger>
                <SelectContent>
                  {clientOptions.map((c) => (<SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Profil professionnel</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Poste / Fonction</Label><Input value={form.job_title ?? ""} onChange={(e) => set("job_title", e.target.value)} /></div>
              <div className="space-y-1">
                <Label className="text-xs">Niveau de formation</Label>
                <Select value={form.education_level ?? ""} onValueChange={(v) => set("education_level", v)}>
                  <SelectTrigger><SelectValue placeholder="Non renseigne" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bac_moins">Inferieur au Bac</SelectItem>
                    <SelectItem value="bac">Bac</SelectItem>
                    <SelectItem value="bac_plus_2">Bac+2</SelectItem>
                    <SelectItem value="bac_plus_3">Bac+3 (Licence)</SelectItem>
                    <SelectItem value="bac_plus_5">Bac+5 (Master)</SelectItem>
                    <SelectItem value="bac_plus_8">Bac+8 (Doctorat)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button onClick={() => onSave(form)} disabled={saving} className="gap-1.5" style={{ background: "#374151" }}>
          <Save className="h-3.5 w-3.5" /> {saving ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Etat civil</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          <DataRow label="Prenom" value={learner.first_name} />
          <DataRow label="Nom" value={learner.last_name} />
          <DataRow label="Genre" value={learner.gender ? genderLabel[learner.gender] : null} />
          <DataRow label="Date de naissance" value={formatDate(learner.birth_date)} />
          <DataRow label="Ville de naissance" value={learner.birth_city} />
          <DataRow label="Nationalite" value={learner.nationality} />
          <div className="flex justify-between py-1">
            <span className="text-gray-400 text-sm">N Securite sociale</span>
            <span className="text-sm text-gray-700 flex items-center gap-1">
              {showSSN ? (learner.social_security_number || "\u2014") : (maskedSSN || "\u2014")}
              {learner.social_security_number && (
                <button onClick={() => setShowSSN(!showSSN)} className="text-gray-400 hover:text-gray-600 ml-1">
                  {showSSN ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              )}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Coordonnees</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          <DataRow label="Email" value={learner.email} />
          <DataRow label="Telephone" value={learner.phone} />
          <DataRow label="Adresse" value={learner.address} />
          <DataRow label="Ville" value={learner.city} />
          <DataRow label="Code postal" value={learner.postal_code} />
          <DataRow label="Entreprise" value={learner.clients?.company_name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Profil professionnel (BPF/Cerfa)</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          <DataRow label="Poste / Fonction" value={learner.job_title} />
          <DataRow label="Niveau de formation" value={learner.education_level ? educationLabels[learner.education_level] ?? learner.education_level : null} />
          <DataRow label="Categorie socio-professionnelle" value={metaVal(meta, "Categorie socio-professionnelle")} />
          <DataRow label="Nature du contrat de travail" value={metaVal(meta, "Nature du contrat de travail")} />
          <DataRow label="Salaire Horaire Brut" value={metaVal(meta, "Salaire Horaire Brut")} />
          <DataRow label="Profession" value={metaVal(meta, "Profession")} />
          <DataRow label="Profession 2" value={metaVal(meta, "Profession 2")} />
          <DataRow label="Raison Sociale" value={metaVal(meta, "Raison Sociale")} />
          <DataRow label="Statut" value={metaVal(meta, "Statut")} />
          <DataRow label="Fonction" value={metaVal(meta, "Fonction")} />
          <div className="flex justify-between py-1">
            <span className="text-gray-400 text-sm">Reconnaissance Travailleur Handicapé</span>
            {rthValue ? (
              <Badge className={rthValue.toLowerCase() === "oui" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                {rthValue}
              </Badge>
            ) : (
              <span className="text-sm text-gray-700">{"\u2014"}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
