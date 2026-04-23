"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Building2, MapPin, Phone, User, Image as ImageIcon, Upload, Loader2, Save } from "lucide-react";

interface OrgForm {
  name: string;
  legal_form: string;
  siret: string;
  nda: string;
  ape_code: string;
  capital: string;
  rcs: string;
  address: string;
  postal_code: string;
  city: string;
  region: string;
  email: string;
  phone: string;
  website: string;
  president_name: string;
  president_title: string;
  signature_text: string;
  logo_url: string;
  stamp_url: string;
  signature_url: string;
}

const emptyForm: OrgForm = {
  name: "", legal_form: "", siret: "", nda: "", ape_code: "", capital: "", rcs: "",
  address: "", postal_code: "", city: "", region: "",
  email: "", phone: "", website: "",
  president_name: "", president_title: "Gérant",
  signature_text: "", logo_url: "", stamp_url: "", signature_url: "",
};

export default function OrganizationSettingsPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { entityId } = useEntity();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<OrgForm>(emptyForm);

  useEffect(() => {
    if (!entityId) return;
    (async () => {
      const { data } = await supabase.from("entities").select("*").eq("id", entityId).single();
      if (data) {
        const d = data as Record<string, string | null>;
        setForm({
          name: d.name || "", legal_form: d.legal_form || "", siret: d.siret || "",
          nda: d.nda || "", ape_code: d.ape_code || "", capital: d.capital || "", rcs: d.rcs || "",
          address: d.address || "", postal_code: d.postal_code || "", city: d.city || "", region: d.region || "",
          email: d.email || "", phone: d.phone || "", website: d.website || "",
          president_name: d.president_name || "", president_title: d.president_title || "Gérant",
          signature_text: d.signature_text || "",
          logo_url: d.logo_url || "", stamp_url: d.stamp_url || "", signature_url: d.signature_url || "",
        });
      }
      setLoading(false);
    })();
  }, [entityId, supabase]);

  const handleSave = async () => {
    if (!entityId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("entities").update({
        name: form.name, legal_form: form.legal_form || null, siret: form.siret || null,
        nda: form.nda || null, ape_code: form.ape_code || null, capital: form.capital || null, rcs: form.rcs || null,
        address: form.address || null, postal_code: form.postal_code || null, city: form.city || null, region: form.region || null,
        email: form.email || null, phone: form.phone || null, website: form.website || null,
        president_name: form.president_name || null, president_title: form.president_title || null,
        signature_text: form.signature_text || null,
        logo_url: form.logo_url || null, stamp_url: form.stamp_url || null, signature_url: form.signature_url || null,
      }).eq("id", entityId);
      if (error) throw error;
      toast({ title: "Paramètres enregistrés" });
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" });
    }
    setSaving(false);
  };

  const handleUpload = async (file: File, field: "logo_url" | "stamp_url" | "signature_url") => {
    if (!entityId) return;
    const ext = file.name.split(".").pop();
    const path = `${entityId}/${field}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("organization-assets").upload(path, file, { upsert: true });
    if (error) {
      // Bucket may not exist yet — try without upsert
      toast({ title: "Erreur upload", description: error.message, variant: "destructive" });
      return;
    }
    const { data: urlData } = supabase.storage.from("organization-assets").getPublicUrl(path);
    setForm(f => ({ ...f, [field]: urlData.publicUrl }));
    toast({ title: "Image uploadée", description: "N'oubliez pas d'enregistrer." });
  };

  const u = (key: keyof OrgForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [key]: e.target.value }));

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-4xl mx-auto py-8 px-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Paramètres de l&apos;organisme</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ces informations apparaissent dans vos documents via les variables {`{{siret_organisme}}`}, {`{{tampon_organisme}}`}, etc.
        </p>
      </div>

      {/* Identité */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Identité</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Nom</Label><Input value={form.name} onChange={u("name")} /></div>
            <div><Label>Forme juridique</Label><Input value={form.legal_form} onChange={u("legal_form")} placeholder="SARL, SAS..." /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>SIRET</Label><Input value={form.siret} onChange={u("siret")} placeholder="14 chiffres" /></div>
            <div><Label>N° Déclaration d&apos;Activité (NDA)</Label><Input value={form.nda} onChange={u("nda")} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><Label>Code APE</Label><Input value={form.ape_code} onChange={u("ape_code")} placeholder="8559A" /></div>
            <div><Label>Capital</Label><Input value={form.capital} onChange={u("capital")} placeholder="10 000 €" /></div>
            <div><Label>RCS</Label><Input value={form.rcs} onChange={u("rcs")} /></div>
          </div>
        </CardContent>
      </Card>

      {/* Adresse */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />Adresse</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Adresse</Label><Input value={form.address} onChange={u("address")} /></div>
          <div className="grid grid-cols-3 gap-4">
            <div><Label>Code postal</Label><Input value={form.postal_code} onChange={u("postal_code")} /></div>
            <div><Label>Ville</Label><Input value={form.city} onChange={u("city")} /></div>
            <div><Label>Région</Label><Input value={form.region} onChange={u("region")} placeholder="PACA" /></div>
          </div>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5" />Contact</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={u("email")} /></div>
            <div><Label>Téléphone</Label><Input value={form.phone} onChange={u("phone")} /></div>
            <div><Label>Site web</Label><Input value={form.website} onChange={u("website")} placeholder="https://" /></div>
          </div>
        </CardContent>
      </Card>

      {/* Représentation */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Représentation</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Nom du président / gérant</Label><Input value={form.president_name} onChange={u("president_name")} /></div>
            <div><Label>Titre / fonction</Label><Input value={form.president_title} onChange={u("president_title")} /></div>
          </div>
          <div>
            <Label>Bloc signature (texte)</Label>
            <Textarea value={form.signature_text} onChange={u("signature_text")} rows={3} placeholder={"Marc VICHOT\nGérant de MR Formation"} />
            <p className="text-xs text-gray-500 mt-1">Variable {`{{signature_organisme}}`}</p>
          </div>
        </CardContent>
      </Card>

      {/* Identité visuelle */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5" />Identité visuelle</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          {([
            { label: "Logo", desc: "En-tête des documents", field: "logo_url" as const },
            { label: "Tampon / Cachet", desc: "Variable {{tampon_organisme}}", field: "stamp_url" as const },
            { label: "Signature manuscrite", desc: "Variable {{signature_organisme}}", field: "signature_url" as const },
          ]).map(({ label, desc, field }) => (
            <div key={field} className="border rounded-lg p-4 bg-gray-50">
              <div className="flex items-start gap-4">
                <div className="w-28 h-28 bg-white border rounded-md flex items-center justify-center overflow-hidden shrink-0">
                  {form[field] ? <img src={form[field]} alt={label} className="max-w-full max-h-full object-contain" /> : <ImageIcon className="h-10 w-10 text-gray-300" />}
                </div>
                <div>
                  <p className="font-medium">{label}</p>
                  <p className="text-xs text-gray-500 mt-1">{desc}</p>
                  <label className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-sm border rounded-md hover:bg-gray-100 cursor-pointer">
                    <Upload className="h-4 w-4" />{form[field] ? "Remplacer" : "Uploader"}
                    <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, field); e.target.value = ""; }} />
                  </label>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end sticky bottom-4">
        <Button onClick={handleSave} disabled={saving} size="lg" className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer les paramètres
        </Button>
      </div>
    </div>
  );
}
