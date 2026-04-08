"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Program } from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────────────────────

interface QuoteLine {
  description: string;
  quantity: string;
  unit_price: string;
}

interface QuoteFormState {
  reference: string;
  date_creation: string;
  date_echeance: string;
  training_start: string;
  training_end: string;
  tva: string;
  effectifs: string;
  duration: string;
  notes: string;
  mention: string;
  bpf_funding_type: string;
  program_id: string;
  lines: QuoteLine[];
}

const DEFAULT_MENTION =
  "Conformément à l'article L. 441-6 du Code de Commerce, les pénalités de retard seront calculées à partir de 3 fois le taux d'intérêt légal en vigueur ainsi qu'une indemnité de 40€ seront dues à défaut de règlement le jour suivant la date de paiement figurant sur la facture.";

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function NewQuotePage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { entityId } = useEntity();

  const prospectId = searchParams.get("prospect_id");
  const learnerName = searchParams.get("learner_name");
  const [prospectName, setProspectName] = useState("");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState<QuoteFormState>({
    reference: "",
    date_creation: today(),
    date_echeance: addMonths(today(), 1),
    training_start: "",
    training_end: "",
    tva: "20,00",
    effectifs: "",
    duration: "",
    notes: "",
    mention: DEFAULT_MENTION,
    bpf_funding_type: "",
    program_id: "",
    lines: [{ description: "", quantity: "1", unit_price: "" }],
  });

  // Fetch prospect name, amount & generate reference
  useEffect(() => {
    if (!prospectId) return;
    (async () => {
      const { data } = await supabase
        .from("crm_prospects")
        .select("company_name, notes")
        .eq("id", prospectId)
        .single();
      if (data) {
        setProspectName(data.company_name);
        // Extract amount from prospect notes and pre-populate the first line
        const match = data.notes?.match(/Montant HT[^:]*:\s*([\d\s.,]+)/);
        const htAmount = match ? parseFloat(match[1].replace(/\s/g, "").replace(",", ".")) || 0 : 0;
        if (htAmount > 0) {
          setForm((f) => {
            const firstLineEmpty = f.lines.length <= 1 && (!f.lines[0]?.unit_price);
            return {
              ...f,
              lines: firstLineEmpty
                ? [{ description: "Formation", quantity: "1", unit_price: htAmount.toFixed(2).replace(".", ",") }]
                : f.lines,
            };
          });
        }
      }
    })();
  }, [prospectId, supabase]);

  const generateRef = useCallback(async () => {
    const fiscalYear = new Date().getFullYear();
    let q = supabase.from("crm_quotes").select("quote_number").eq("fiscal_year", fiscalYear);
    if (entityId) q = q.eq("entity_id", entityId);
    q = q.order("quote_number", { ascending: false }).limit(1);
    const { data } = await q.maybeSingle();
    const nextNum = ((data?.quote_number as number) ?? 0) + 1;
    setForm((f) => ({ ...f, reference: `DEV-${fiscalYear}-${String(nextNum).padStart(3, "0")}` }));
  }, [supabase, entityId]);

  useEffect(() => {
    if (entityId === undefined) return;
    generateRef();
  }, [entityId, generateRef]);

  // Fetch programs for the program_id select
  useEffect(() => {
    if (entityId === undefined) return;
    (async () => {
      let query = supabase.from("programs").select("id, title, bpf_funding_type").eq("is_active", true).order("title");
      if (entityId) query = query.eq("entity_id", entityId);
      const { data } = await query;
      setPrograms((data as Program[]) ?? []);
    })();
  }, [entityId, supabase]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function updateField(field: keyof QuoteFormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleProgramChange(programId: string) {
    setForm((f) => ({ ...f, program_id: programId }));
    if (programId) {
      // Auto-derive bpf_funding_type from selected program
      const program = programs.find((p) => p.id === programId);
      if (program?.bpf_funding_type) {
        setForm((f) => ({ ...f, program_id: programId, bpf_funding_type: program.bpf_funding_type! }));
        return;
      }
    }
    // Fallback: if prospect is selected and no program funding type, try client's bpf_category
    if (!programId && prospectId) {
      const { data: prospect } = await supabase
        .from("crm_prospects")
        .select("bpf_category")
        .eq("id", prospectId)
        .single();
      if (prospect?.bpf_category) {
        setForm((f) => ({ ...f, bpf_funding_type: prospect.bpf_category }));
      }
    }
  }

  function addLine() {
    setForm((f) => ({
      ...f,
      lines: [...f.lines, { description: "", quantity: "1", unit_price: "" }],
    }));
  }

  function updateLine(index: number, field: keyof QuoteLine, value: string) {
    setForm((f) => {
      const lines = [...f.lines];
      lines[index] = { ...lines[index], [field]: value };
      return { ...f, lines };
    });
  }

  function removeLine(index: number) {
    setForm((f) => ({
      ...f,
      lines: f.lines.filter((_, i) => i !== index),
    }));
  }

  function calcLineTotal(line: QuoteLine): number {
    const qty = parseFloat(line.quantity.replace(",", ".")) || 0;
    const price = parseFloat(line.unit_price.replace(",", ".")) || 0;
    return qty * price;
  }

  function calcSubtotal(): number {
    return form.lines.reduce((sum, l) => sum + calcLineTotal(l), 0);
  }

  function calcTVA(): number {
    const rate = parseFloat(form.tva.replace(",", ".")) || 0;
    return calcSubtotal() * (rate / 100);
  }

  function calcTotal(): number {
    return calcSubtotal() + calcTVA();
  }

  async function handleSubmit() {
    if (!form.reference.trim()) {
      setError("Le numéro du devis est requis.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      // Build metadata JSON for notes (WITHOUT lines — stored in crm_quote_lines)
      const metadata = {
        tva: form.tva,
        training_start: form.training_start || null,
        training_end: form.training_end || null,
        effectifs: form.effectifs || null,
        duration: form.duration || null,
        mention: form.mention || null,
        notes_text: form.notes || null,
      };

      // Get next quote number
      const fiscalYear = new Date().getFullYear();
      const { data: maxRow } = await supabase
        .from("crm_quotes")
        .select("quote_number")
        .eq("entity_id", entityId)
        .eq("fiscal_year", fiscalYear)
        .order("quote_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextNumber = (maxRow?.quote_number ?? 0) + 1;

      const payload: Record<string, unknown> = {
        reference: form.reference.trim() || `DEV-${fiscalYear}-${String(nextNumber).padStart(3, "0")}`,
        prospect_id: prospectId || null,
        amount: calcTotal(),
        status: "draft",
        valid_until: form.date_echeance || null,
        notes: JSON.stringify(metadata),
        tva: parseFloat(String(form.tva).replace(",", ".")) || 20,
        training_start: form.training_start || null,
        training_end: form.training_end || null,
        effectifs: form.effectifs ? parseInt(form.effectifs) : null,
        duration: form.duration || null,
        bpf_funding_type: form.bpf_funding_type || null,
        program_id: form.program_id || null,
        quote_number: nextNumber,
        fiscal_year: fiscalYear,
      };
      if (entityId) payload.entity_id = entityId;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) payload.created_by = user.id;

      const { data: insertedQuote, error: insertErr } = await supabase
        .from("crm_quotes")
        .insert([payload])
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      // Insert lines into crm_quote_lines
      const parsedLines = form.lines
        .filter((l) => l.description.trim())
        .map((l) => ({
          quote_id: insertedQuote.id,
          description: l.description.trim(),
          quantity: parseFloat(l.quantity.replace(",", ".")) || 1,
          unit_price: parseFloat(l.unit_price.replace(",", ".")) || 0,
        }));

      if (parsedLines.length > 0) {
        const { error: linesErr } = await supabase.from("crm_quote_lines").insert(parsedLines);
        if (linesErr) console.error("Error inserting quote lines:", linesErr);
      }

      // Navigate back to prospect or quotes list
      if (prospectId) {
        router.push(`/admin/crm/prospects/${prospectId}`);
      } else {
        router.push("/admin/crm/quotes");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur lors de la création.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-xs text-gray-400">Nouveau devis</p>
            <p className="text-sm font-bold text-gray-900">{prospectName || "Devis"}</p>
          </div>
        </div>
        <Button onClick={handleSubmit} disabled={saving} size="sm" style={{ background: "#374151" }} className="text-white text-xs">
          {saving ? "Création..." : "Créer le devis"}
        </Button>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-6">
        {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2 mb-4">{error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* LEFT: Informations */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Informations</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">N° devis</label>
                <Input value={form.reference} onChange={(e) => updateField("reference", e.target.value)} className="h-8 text-sm font-mono" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Création</label>
                  <Input type="date" value={form.date_creation} onChange={(e) => updateField("date_creation", e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Échéance</label>
                  <Input type="date" value={form.date_echeance} onChange={(e) => updateField("date_echeance", e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">TVA (%)</label>
                  <Input value={form.tva} onChange={(e) => updateField("tva", e.target.value)} className="h-8 text-sm" placeholder="20,00" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Effectifs</label>
                  <Input type="number" value={form.effectifs} onChange={(e) => updateField("effectifs", e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Formation */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Formation</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Début</label>
                  <Input type="date" value={form.training_start} onChange={(e) => updateField("training_start", e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Fin</label>
                  <Input type="date" value={form.training_end} onChange={(e) => updateField("training_end", e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Durée</label>
                <Input value={form.duration} onChange={(e) => updateField("duration", e.target.value)} className="h-8 text-sm" placeholder="ex: 10 heures, 2 jours" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Programme</label>
                <Select value={form.program_id || "none"} onValueChange={(v) => handleProgramChange(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Aucun" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Source BPF</label>
                <Select value={form.bpf_funding_type || "none"} onValueChange={(v) => updateField("bpf_funding_type", v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Aucune" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune</SelectItem>
                    <SelectGroup>
                      <SelectLabel>Entreprises</SelectLabel>
                      <SelectItem value="entreprise_privee">Entreprise privée</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Fonds de formation</SelectLabel>
                      <SelectItem value="apprentissage">Contrats d&apos;apprentissage</SelectItem>
                      <SelectItem value="professionnalisation">Contrats de professionnalisation</SelectItem>
                      <SelectItem value="reconversion_alternance">Reconversion / alternance</SelectItem>
                      <SelectItem value="conge_transition">Congé / transition pro</SelectItem>
                      <SelectItem value="cpf">CPF</SelectItem>
                      <SelectItem value="dispositif_chomeurs">Dispositifs demandeurs d&apos;emploi</SelectItem>
                      <SelectItem value="non_salaries">Travailleurs non-salariés</SelectItem>
                      <SelectItem value="plan_developpement">Plan de développement</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Pouvoirs publics</SelectLabel>
                      <SelectItem value="pouvoir_public_agents">Pouvoirs publics (agents)</SelectItem>
                      <SelectItem value="instances_europeennes">Instances européennes</SelectItem>
                      <SelectItem value="etat">État</SelectItem>
                      <SelectItem value="conseil_regional">Conseils régionaux</SelectItem>
                      <SelectItem value="pole_emploi">Pôle emploi</SelectItem>
                      <SelectItem value="autres_publics">Autres publics</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Autres</SelectLabel>
                      <SelectItem value="individuel">Particulier</SelectItem>
                      <SelectItem value="organisme_formation">Organisme de formation</SelectItem>
                      <SelectItem value="autre">Autre</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* PRODUCTS */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Produits</h3>
          <div className="border rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_80px_120px_120px_40px] gap-2 px-3 py-2 bg-gray-50 text-[10px] font-semibold text-gray-500 uppercase">
              <span>Description</span><span>Qté</span><span>PU HT (€)</span><span>Total HT</span><span></span>
            </div>
            {/* Lines */}
            {form.lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_80px_120px_120px_40px] gap-2 px-3 py-2 border-t items-center">
                <Input value={line.description} onChange={(e) => updateLine(idx, "description", e.target.value)} placeholder="Description" className="h-8 text-sm border-0 shadow-none px-0 focus-visible:ring-0" />
                <Input value={line.quantity} onChange={(e) => updateLine(idx, "quantity", e.target.value)} className="h-8 text-sm text-center" />
                <Input value={line.unit_price} onChange={(e) => updateLine(idx, "unit_price", e.target.value)} className="h-8 text-sm text-right" />
                <span className="text-sm font-medium text-right">{calcLineTotal(line).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €</span>
                <button onClick={() => removeLine(idx)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            {/* Add line */}
            <div className="px-3 py-2 border-t">
              <button onClick={addLine} className="text-xs text-[#374151] hover:underline flex items-center gap-1"><Plus className="h-3 w-3" /> Ajouter une ligne</button>
            </div>
          </div>
          {/* Totals - right aligned */}
          <div className="flex justify-end mt-3">
            <div className="w-full sm:w-64 space-y-1 text-sm">
              <div className="flex justify-between text-gray-500"><span>Sous-total HT</span><span>{calcSubtotal().toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €</span></div>
              <div className="flex justify-between text-gray-500"><span>TVA ({form.tva}%)</span><span>{calcTVA().toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €</span></div>
              <div className="flex justify-between font-bold text-gray-900 border-t pt-1"><span>Total TTC</span><span>{calcTotal().toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €</span></div>
            </div>
          </div>
        </div>

        {/* NOTES (collapsible) */}
        <details className="mb-8">
          <summary className="text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600">
            Notes & mentions
          </summary>
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Notes</label>
              <Textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)} rows={3} className="text-sm resize-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Mention & Pénalités</label>
              <Textarea value={form.mention} onChange={(e) => updateField("mention", e.target.value)} rows={3} className="text-sm resize-none" />
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
