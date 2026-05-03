"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Euro, Clock, Save, X, Pencil, CalendarDays, MapPin, Users, Sparkles, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Session, SessionMode, FormationType, SessionStatus } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

/**
 * Compose une adresse complète depuis ses parties (organisme ou client).
 * Retourne null si rien d'utile.
 */
function composeAddress(parts: { address?: string | null; postal_code?: string | null; city?: string | null }): string | null {
  const segments = [parts.address, [parts.postal_code, parts.city].filter(Boolean).join(" ")].filter((s) => s && s.trim());
  return segments.length > 0 ? segments.join(", ") : null;
}

export function ResumePriceHours({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Données auxiliaires pour les calculs auto (durée depuis planning, adresses par défaut)
  const [autoComputedHours, setAutoComputedHours] = useState<number | null>(null);
  const [companyCount, setCompanyCount] = useState<number>(0);
  const [defaultLocationByType, setDefaultLocationByType] = useState<{ intra: string | null; inter: string | null }>({ intra: null, inter: null });

  const [form, setForm] = useState({
    total_price: formation.total_price?.toString() || "",
    planned_hours: formation.planned_hours?.toString() || "",
    start_date: formation.start_date ? formation.start_date.split("T")[0] : "",
    end_date: formation.end_date ? formation.end_date.split("T")[0] : "",
    location: formation.location || "",
    mode: formation.mode || "presentiel",
    type: formation.type || "inter",
    max_participants: formation.max_participants?.toString() || "",
    status: formation.status || "upcoming",
  });

  // Charge les données auxiliaires : créneaux planning (pour durée auto),
  // entreprises liées (pour adresse intra + count), entité (pour adresse inter)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Créneaux planning → calcul durée auto
      const { data: slots } = await supabase
        .from("formation_time_slots")
        .select("start_time, end_time")
        .eq("session_id", formation.id);
      if (cancelled) return;
      if (slots && slots.length > 0) {
        const totalMs = slots.reduce((acc, s) => {
          const start = new Date(s.start_time as string).getTime();
          const end = new Date(s.end_time as string).getTime();
          return acc + Math.max(0, end - start);
        }, 0);
        setAutoComputedHours(Math.round((totalMs / 3_600_000) * 100) / 100);
      } else {
        setAutoComputedHours(null);
      }

      // 2. Entreprises liées → adresse intra + count
      const { data: companies } = await supabase
        .from("formation_companies")
        .select("client:clients!formation_companies_client_id_fkey(address, postal_code, city)")
        .eq("session_id", formation.id);
      if (cancelled) return;
      const companiesArr = (companies ?? []) as Array<{ client: { address?: string | null; postal_code?: string | null; city?: string | null } | null }>;
      setCompanyCount(companiesArr.length);
      const firstClientAddress = companiesArr[0]?.client ? composeAddress(companiesArr[0].client) : null;

      // 3. Entité → adresse inter (organisme)
      const { data: entity } = formation.entity_id
        ? await supabase
            .from("entities")
            .select("address, postal_code, city")
            .eq("id", formation.entity_id)
            .single()
        : { data: null };
      if (cancelled) return;
      const entityAddress = entity ? composeAddress(entity) : null;

      setDefaultLocationByType({
        intra: firstClientAddress,
        inter: entityAddress,
      });
    })();
    return () => { cancelled = true; };
  }, [formation.id, formation.entity_id, supabase]);

  const openEdit = () => {
    setForm({
      total_price: formation.total_price?.toString() || "",
      planned_hours: formation.planned_hours?.toString() || "",
      start_date: formation.start_date ? formation.start_date.split("T")[0] : "",
      end_date: formation.end_date ? formation.end_date.split("T")[0] : "",
      location: formation.location || "",
      mode: formation.mode || "presentiel",
      type: formation.type || "inter",
      max_participants: formation.max_participants?.toString() || "",
      status: formation.status || "upcoming",
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("sessions")
        .update({
          total_price: form.total_price ? parseFloat(form.total_price) : null,
          planned_hours: form.planned_hours ? parseFloat(form.planned_hours) : null,
          start_date: form.start_date || formation.start_date,
          end_date: form.end_date || formation.end_date,
          location: form.location || null,
          mode: form.mode,
          type: form.type,
          max_participants: form.max_participants ? parseInt(form.max_participants) : null,
          status: form.status,
        })
        .eq("id", formation.id);
      if (error) throw error;
      toast({ title: "Formation mise à jour" });
      setEditing(false);
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const u = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  if (!editing) {
    // ── Read-only view ──
    const enrollCount = formation.enrollments?.length || 0;
    const pricePerLearner = formation.total_price && enrollCount > 0
      ? formation.total_price / enrollCount
      : null;
    const pricePerCompany = formation.total_price && companyCount > 0
      ? formation.total_price / companyCount
      : null;

    // Adresse par défaut selon type (intra → client, inter → organisme)
    const defaultLocationForType = formation.type === "intra"
      ? defaultLocationByType.intra
      : defaultLocationByType.inter;
    const isLocationAutoSuggested = !formation.location && defaultLocationForType;

    // Hint si la durée saisie ne correspond pas à la durée auto-calculée
    const durationMismatch = autoComputedHours !== null
      && formation.planned_hours
      && Math.abs(Number(formation.planned_hours) - autoComputedHours) > 0.1;

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Dates</p>
            <p className="font-medium">{formatDate(formation.start_date)} → {formatDate(formation.end_date)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Durée</p>
            <p className="font-medium">{formation.planned_hours ? `${formation.planned_hours}h` : "—"}</p>
            {autoComputedHours !== null && (
              <p className={`text-[10px] mt-0.5 flex items-center gap-1 ${durationMismatch ? "text-orange-600" : "text-emerald-600"}`}>
                <Sparkles className="h-2.5 w-2.5" />
                Planning : {autoComputedHours}h
                {durationMismatch && " (différent de la durée saisie)"}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Euro className="h-3 w-3" /> Prix total</p>
            <p className="font-medium">{formatCurrency(formation.total_price)}</p>
          </div>
          <div>
            {/* Prix / entreprise (si plusieurs entreprises ou intra) sinon Prix / apprenant */}
            {companyCount > 1 ? (
              <>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" /> Prix / entreprise</p>
                <p className="font-medium">{pricePerCompany ? `${pricePerCompany.toFixed(2)} €` : "—"}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{companyCount} entreprises</p>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Prix / apprenant</p>
                <p className="font-medium">{pricePerLearner ? `${pricePerLearner.toFixed(2)} €` : "—"}</p>
              </>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Lieu</p>
            <p className={`font-medium ${isLocationAutoSuggested ? "text-gray-500 italic" : ""}`}>
              {formation.location || defaultLocationForType || "—"}
            </p>
            {isLocationAutoSuggested && (
              <p className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5" />
                Adresse {formation.type === "intra" ? "client" : "organisme"} (par défaut)
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Places max</p>
            <p className="font-medium">{formation.max_participants ?? "—"}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={openEdit} className="gap-1">
          <Pencil className="h-3.5 w-3.5" /> Modifier les infos
        </Button>
      </div>
    );
  }

  // ── Edit form ──
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Prix total (€)</Label>
          <Input type="number" step="0.01" value={form.total_price} onChange={u("total_price")} placeholder="0.00" className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Heures planifiées</Label>
          <Input type="number" step="0.5" value={form.planned_hours} onChange={u("planned_hours")} placeholder="0" className="h-8 text-sm" />
          {autoComputedHours !== null && Number(form.planned_hours || "0") !== autoComputedHours && (
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, planned_hours: String(autoComputedHours) }))}
              className="mt-1 text-[10px] text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
            >
              <Sparkles className="h-2.5 w-2.5" />
              Utiliser la durée du planning : {autoComputedHours}h
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Date début</Label>
          <Input type="date" value={form.start_date} onChange={u("start_date")} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Date fin</Label>
          <Input type="date" value={form.end_date} onChange={u("end_date")} className="h-8 text-sm" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Lieu</Label>
        <Input value={form.location} onChange={u("location")} placeholder="Adresse ou salle" className="h-8 text-sm" />
        {(() => {
          const suggestion = form.type === "intra" ? defaultLocationByType.intra : defaultLocationByType.inter;
          if (!suggestion || form.location === suggestion) return null;
          const label = form.type === "intra" ? "adresse client" : "adresse organisme";
          return (
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, location: suggestion }))}
              className="mt-1 text-[10px] text-emerald-600 hover:text-emerald-700 flex items-center gap-1 text-left"
            >
              <Sparkles className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">Utiliser l&apos;{label} : {suggestion}</span>
            </button>
          );
        })()}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Modalité</Label>
          <Select value={form.mode} onValueChange={(v) => setForm((f) => ({ ...f, mode: v as SessionMode }))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="presentiel">Présentiel</SelectItem>
              <SelectItem value="distanciel">Distanciel</SelectItem>
              <SelectItem value="hybride">Hybride</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as FormationType }))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inter">Inter</SelectItem>
              <SelectItem value="intra">Intra</SelectItem>
              <SelectItem value="individual">Individuel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Places max</Label>
          <Input type="number" min="1" value={form.max_participants} onChange={u("max_participants")} placeholder="—" className="h-8 text-sm" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Statut</Label>
        <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as SessionStatus }))}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="upcoming">À venir</SelectItem>
            <SelectItem value="in_progress">En cours</SelectItem>
            <SelectItem value="completed">Terminée</SelectItem>
            <SelectItem value="cancelled">Annulée</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
          <Save className="h-3.5 w-3.5" /> Enregistrer
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="gap-1">
          <X className="h-3.5 w-3.5" /> Annuler
        </Button>
      </div>
    </div>
  );
}
