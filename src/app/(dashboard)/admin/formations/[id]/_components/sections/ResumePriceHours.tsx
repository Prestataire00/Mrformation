"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Euro, Clock, Save, X, Pencil, CalendarDays, MapPin, Users, Sparkles, Building2, RotateCcw, GitFork } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { updateSession } from "@/lib/services/sessions";
import { cascadeSessionPriceToPendingInvoices } from "@/lib/services/invoices";
import { resolveDisplayedHours } from "@/lib/utils/hours-source";
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

/**
 * Détermine la provenance du prix d'une session :
 * - "catalogue" : prix identique au catalogue de la formation (tolérance 0.01)
 * - "modified"  : prix présent ET différent du catalogue
 * - "custom"    : prix saisi alors qu'aucun prix catalogue de référence
 * - null        : aucun prix
 */
function getPriceSource(formation: Session): "catalogue" | "modified" | "custom" | null {
  if (formation.total_price === null || formation.total_price === undefined) return null;
  const catalogPrice = formation.training?.price_per_person ?? null;
  if (catalogPrice === null) return "custom";
  if (Math.abs(formation.total_price - catalogPrice) < 0.01) return "catalogue";
  return "modified";
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

  // Story 2.3 — l'input "heures planifiées" pré-remplit avec la valeur affichée
  // (override si présent, sinon computed, sinon legacy planned_hours).
  const initialDisplayedHours = resolveDisplayedHours(formation).value;

  const [form, setForm] = useState({
    total_price: formation.total_price?.toString() || "",
    planned_hours: initialDisplayedHours !== null ? initialDisplayedHours.toString() : "",
    start_date: formation.start_date ? formation.start_date.split("T")[0] : "",
    end_date: formation.end_date ? formation.end_date.split("T")[0] : "",
    location: formation.location || "",
    mode: formation.mode || "presentiel",
    type: formation.type || "inter",
    max_participants: formation.max_participants?.toString() || "",
    status: formation.status || "upcoming",
    is_subcontracted_to_other_of: formation.is_subcontracted_to_other_of ?? false,
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
  }, [formation.id, formation.entity_id, formation.formation_companies, supabase]);

  const openEdit = () => {
    // Story 2.3 — pré-remplir avec la valeur affichée (override ?? computed ?? legacy)
    const displayedHours = resolveDisplayedHours(formation).value;
    setForm({
      total_price: formation.total_price?.toString() || "",
      planned_hours: displayedHours !== null ? displayedHours.toString() : "",
      start_date: formation.start_date ? formation.start_date.split("T")[0] : "",
      end_date: formation.end_date ? formation.end_date.split("T")[0] : "",
      location: formation.location || "",
      mode: formation.mode || "presentiel",
      type: formation.type || "inter",
      max_participants: formation.max_participants?.toString() || "",
      status: formation.status || "upcoming",
      is_subcontracted_to_other_of: formation.is_subcontracted_to_other_of ?? false,
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Story 2.2 — capturer le changement de prix avant update (tolérance 0.01, cohérent avec badge Story 2.1)
      const oldPrice = formation.total_price ?? null;
      const newPriceParsed = form.total_price ? parseFloat(form.total_price) : null;
      const priceChanged =
        (oldPrice === null && newPriceParsed !== null) ||
        (oldPrice !== null && newPriceParsed === null) ||
        (oldPrice !== null && newPriceParsed !== null && Math.abs(oldPrice - newPriceParsed) >= 0.01);

      const result = await updateSession(supabase, formation.id, {
        total_price: newPriceParsed,
        // Story 2.3 — pas d'update direct de planned_hours (legacy, géré par trigger).
        // override_hours = saisi manuel ssi différent de computed_hours (tolérance 0.01).
        override_hours: (() => {
          const parsedHours = form.planned_hours ? parseFloat(form.planned_hours) : null;
          if (parsedHours === null || Number.isNaN(parsedHours)) return null;
          const computed = formation.computed_hours ?? null;
          if (computed !== null && Math.abs(parsedHours - computed) < 0.01) return null;
          return parsedHours;
        })(),
        start_date: form.start_date || formation.start_date,
        end_date: form.end_date || formation.end_date,
        location: form.location || null,
        mode: form.mode,
        type: form.type,
        max_participants: form.max_participants ? parseInt(form.max_participants) : null,
        status: form.status,
        is_subcontracted_to_other_of: form.is_subcontracted_to_other_of,
      });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      toast({ title: "Formation mise à jour" });

      // Story 2.2 — cascade prix vers factures pending (company recipients only)
      if (priceChanged) {
        const cascade = await cascadeSessionPriceToPendingInvoices(supabase, formation.id, formation);
        if (cascade.ok) {
          if (cascade.impacted > 0) {
            toast({
              title: `${cascade.impacted} facture${cascade.impacted > 1 ? "s" : ""} brouillon${cascade.impacted > 1 ? "s" : ""} recalculée${cascade.impacted > 1 ? "s" : ""}`,
            });
          }
          if (cascade.blocked > 0) {
            toast({
              title: `${cascade.blocked} facture${cascade.blocked > 1 ? "s" : ""} non modifiée${cascade.blocked > 1 ? "s" : ""} (déjà envoyée${cascade.blocked > 1 ? "s" : ""} ou engagée${cascade.blocked > 1 ? "s" : ""} dans Abby)`,
              description: "Utiliser un avoir si correction commerciale nécessaire.",
            });
          }
          if (cascade.errors.length > 0) {
            toast({
              title: `${cascade.errors.length} facture${cascade.errors.length > 1 ? "s" : ""} non mise${cascade.errors.length > 1 ? "s" : ""} à jour`,
              description: "Vérifier dans TabFinances.",
              variant: "destructive",
            });
            console.error("[ResumePriceHours] cascade errors:", cascade.errors);
          }
        } else {
          // Cascade fetch failed (e.g. RLS). Don't fail the save — just warn.
          toast({
            title: "Mise à jour OK, mais le recalcul des factures a échoué",
            description: cascade.error.message,
            variant: "destructive",
          });
          console.error("[ResumePriceHours] cascade fetch failed:", cascade.error);
        }
      }

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

    // Provenance du prix (catalogue / modifié / personnalisé) — Story 2.1
    const priceSource = getPriceSource(formation);
    const catalogPrice = formation.training?.price_per_person ?? null;

    // Story 2.3 — résolution de la source des heures (override / computed / legacy)
    const hoursInfo = resolveDisplayedHours(formation);

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Dates</p>
            <p className="font-medium">{formatDate(formation.start_date)} → {formatDate(formation.end_date)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Durée</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-medium">{hoursInfo.value !== null ? `${hoursInfo.value}h` : "—"}</p>
              {(hoursInfo.source === "computed" || hoursInfo.source === "legacy") && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Calculé depuis créneaux</Badge>
              )}
              {hoursInfo.source === "override" && (
                <Badge
                  variant="default"
                  className="text-[10px] px-1.5 py-0"
                  title={hoursInfo.computedValue !== null ? `Heures calculées depuis créneaux : ${hoursInfo.computedValue}h` : undefined}
                >
                  Saisi manuellement
                </Badge>
              )}
            </div>
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
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-medium">{formatCurrency(formation.total_price)}</p>
              {priceSource === "catalogue" && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Catalogue</Badge>
              )}
              {priceSource === "modified" && (
                <Badge
                  variant="default"
                  className="text-[10px] px-1.5 py-0"
                  title={catalogPrice !== null ? `Prix catalogue : ${formatCurrency(catalogPrice)}` : undefined}
                >
                  Modifié
                </Badge>
              )}
              {priceSource === "custom" && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">Personnalisé</Badge>
              )}
            </div>
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
        {formation.is_subcontracted_to_other_of && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            <GitFork className="h-3.5 w-3.5 shrink-0" />
            <span>Formation dispensée par un autre organisme (sous-traitance externe)</span>
          </div>
        )}
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
          {(() => {
            const catalogPrice = formation.training?.price_per_person;
            if (typeof catalogPrice !== "number") return null;
            const currentValue = parseFloat(form.total_price);
            const isSameAsCatalog = !Number.isNaN(currentValue) && Math.abs(currentValue - catalogPrice) < 0.01;
            if (isSameAsCatalog) return null;
            return (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, total_price: catalogPrice.toString() }))}
                className="mt-1 text-[10px] text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                Revenir au prix catalogue ({formatCurrency(catalogPrice)})
              </button>
            );
          })()}
        </div>
        <div>
          <Label className="text-xs flex items-center gap-1">
            Heures planifiées
            <span className="text-[9px] font-normal text-emerald-600 bg-emerald-50 px-1 rounded">auto</span>
          </Label>
          <Input type="number" step="0.5" value={form.planned_hours} onChange={u("planned_hours")} placeholder="0" className="h-8 text-sm" />
          <p className="text-[10px] text-gray-400 mt-1">
            Recalculé auto depuis les créneaux. Saisie manuelle = override (conservée jusqu&apos;à révocation).
          </p>
          {(() => {
            // Story 2.3 — bouton revert : visible si computed_hours existe et form != computed (tolérance 0.01)
            const computed = formation.computed_hours;
            if (computed === null || computed === undefined) return null;
            const currentValue = parseFloat(form.planned_hours);
            const isSameAsComputed = !Number.isNaN(currentValue) && Math.abs(currentValue - computed) < 0.01;
            if (isSameAsComputed) return null;
            return (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, planned_hours: computed.toString() }))}
                className="mt-1 text-[10px] text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                Revenir au calculé ({computed}h)
              </button>
            );
          })()}
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
        <Label className="text-xs flex items-center gap-1">
          Lieu
          <span className="text-[9px] font-normal text-emerald-600 bg-emerald-50 px-1 rounded">auto</span>
        </Label>
        <Input value={form.location} onChange={u("location")} placeholder="Adresse ou salle" className="h-8 text-sm" />
        <p className="text-[10px] text-gray-400 mt-1">
          Si vide : adresse {form.type === "intra" ? "de la 1ère entreprise liée" : "de l'organisme"}. Modifiable librement, votre saisie est conservée.
        </p>
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
              <span className="truncate">Forcer l&apos;{label} : {suggestion}</span>
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
      <div className="flex items-start gap-3 p-3 border rounded-md bg-muted/30">
        <Checkbox
          id="is_subcontracted_to_other_of"
          checked={form.is_subcontracted_to_other_of}
          onCheckedChange={(checked) => setForm((f) => ({ ...f, is_subcontracted_to_other_of: checked === true }))}
          className="mt-0.5"
        />
        <div className="space-y-0.5">
          <Label htmlFor="is_subcontracted_to_other_of" className="text-xs font-medium cursor-pointer">
            Sous-traitance externe (BPF)
          </Label>
          <p className="text-[10px] text-muted-foreground">
            Cochez si la formation est dispensée par un AUTRE organisme pour votre compte. Ne pas confondre avec les formateurs sous-traitants.
          </p>
        </div>
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
