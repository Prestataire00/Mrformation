"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
    let q = supabase.from("crm_quotes").select("id", { count: "exact", head: true });
    if (entityId) q = q.eq("entity_id", entityId);
    const { count } = await q;
    const num = String((count ?? 0) + 1).padStart(3, "0");
    setForm((f) => ({ ...f, reference: `M-FAC-${num}` }));
  }, [supabase, entityId]);

  useEffect(() => {
    if (entityId === undefined) return;
    generateRef();
  }, [entityId, generateRef]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function updateField(field: keyof QuoteFormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
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
      // Build metadata JSON for notes
      const metadata = {
        tva: form.tva,
        training_start: form.training_start || null,
        training_end: form.training_end || null,
        effectifs: form.effectifs || null,
        duration: form.duration || null,
        mention: form.mention || null,
        notes_text: form.notes || null,
        lines: form.lines.map((l) => ({
          description: l.description,
          quantity: parseFloat(l.quantity.replace(",", ".")) || 1,
          unit_price: parseFloat(l.unit_price.replace(",", ".")) || 0,
        })),
      };

      const payload: Record<string, unknown> = {
        reference: form.reference.trim(),
        prospect_id: prospectId || null,
        amount: calcTotal(),
        status: "draft",
        valid_until: form.date_echeance || null,
        notes: JSON.stringify(metadata),
      };
      if (entityId) payload.entity_id = entityId;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) payload.created_by = user.id;

      const { error: insertErr } = await supabase.from("crm_quotes").insert([payload]);
      if (insertErr) throw insertErr;

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <button
          onClick={() => router.back()}
          className="mb-3 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour
        </button>
        <h1 className="text-lg font-medium text-gray-600">
          Lead / <span className="font-bold text-gray-900">Créer Un Devis</span>
        </h1>
      </div>

      {/* Form */}
      <div className="mx-auto max-w-3xl px-6 py-8">
        {(prospectName || learnerName) && (
          <h2 className="mb-8 text-2xl font-bold text-gray-900">
            Devis Pour {prospectName || learnerName}
          </h2>
        )}

        <div className="space-y-6">
          {/* Numéro du devis */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Numéro du devis<span className="text-red-500">*</span>
            </label>
            <Input
              value={form.reference}
              onChange={(e) => updateField("reference", e.target.value)}
              className="font-mono"
            />
          </div>

          {/* Date de création */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Date de création<span className="text-red-500">*</span>
            </label>
            <Input
              type="date"
              value={form.date_creation}
              onChange={(e) => updateField("date_creation", e.target.value)}
            />
          </div>

          {/* Date d'échéance */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Date d&apos;échéance<span className="text-red-500">*</span>
            </label>
            <Input
              type="date"
              value={form.date_echeance}
              onChange={(e) => updateField("date_echeance", e.target.value)}
            />
          </div>

          {/* Date début formation */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Date de début de la formation
            </label>
            <Input
              type="date"
              value={form.training_start}
              onChange={(e) => updateField("training_start", e.target.value)}
            />
          </div>

          {/* Date fin formation */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Date de fin de la formation
            </label>
            <Input
              type="date"
              value={form.training_end}
              onChange={(e) => updateField("training_end", e.target.value)}
            />
          </div>

          {/* TVA */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              TVA<span className="text-red-500">*</span>
            </label>
            <Input
              value={form.tva}
              onChange={(e) => updateField("tva", e.target.value)}
              placeholder="20,00"
            />
          </div>

          {/* Effectifs Formés */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Effectifs Formés
            </label>
            <Input
              type="number"
              min="0"
              value={form.effectifs}
              onChange={(e) => updateField("effectifs", e.target.value)}
            />
          </div>

          {/* Durée de la formation */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Durée de la formation{" "}
              <span className="text-xs text-gray-400 font-normal">
                (ex: 10 heures, 10 jours, 1 mois...)
              </span>
            </label>
            <Input
              value={form.duration}
              onChange={(e) => updateField("duration", e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Notes{" "}
              <span className="text-xs text-gray-400 font-normal">
                (pour la boîte des notes si vous en avez besoin)
              </span>
            </label>
            <Textarea
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Mention Libre & Pénalités */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Mention Libre &amp; Pénalités
            </label>
            <Textarea
              value={form.mention}
              onChange={(e) => updateField("mention", e.target.value)}
              rows={4}
              className="resize-none text-sm"
            />
          </div>

          {/* ─── Produits ──────────────────────────────────────────────── */}
          {form.lines.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Produits</h3>
              {form.lines.map((line, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3"
                >
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Description du produit"
                      value={line.description}
                      onChange={(e) => updateLine(idx, "description", e.target.value)}
                    />
                    <div className="flex gap-3">
                      <div className="w-28">
                        <label className="mb-0.5 block text-[10px] text-gray-400">
                          Quantité
                        </label>
                        <Input
                          value={line.quantity}
                          onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                        />
                      </div>
                      <div className="w-36">
                        <label className="mb-0.5 block text-[10px] text-gray-400">
                          Prix unitaire HT (€)
                        </label>
                        <Input
                          value={line.unit_price}
                          onChange={(e) => updateLine(idx, "unit_price", e.target.value)}
                        />
                      </div>
                      <div className="flex items-end pb-1">
                        <span className="text-sm font-medium text-gray-700">
                          ={" "}
                          {calcLineTotal(line).toLocaleString("fr-FR", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          €
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => removeLine(idx)}
                    className="mt-1 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              {/* Totaux */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Sous-total HT</span>
                  <span>
                    {calcSubtotal().toLocaleString("fr-FR", {
                      minimumFractionDigits: 2,
                    })}{" "}
                    €
                  </span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>TVA ({form.tva}%)</span>
                  <span>
                    {calcTVA().toLocaleString("fr-FR", {
                      minimumFractionDigits: 2,
                    })}{" "}
                    €
                  </span>
                </div>
                <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-bold text-gray-900">
                  <span>Total TTC</span>
                  <span>
                    {calcTotal().toLocaleString("fr-FR", {
                      minimumFractionDigits: 2,
                    })}{" "}
                    €
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Boutons action */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={addLine}
              className="rounded-lg border-2 border-[#3DB5C5] px-5 py-2.5 text-sm font-bold text-[#3DB5C5] transition hover:bg-[#e0f5f7]"
            >
              <Plus className="mr-1.5 inline h-4 w-4" />
              Ajouter un Produit
            </button>

            <button
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-lg px-6 py-2.5 text-sm font-bold text-white transition disabled:opacity-50"
              style={{ backgroundColor: "#3DB5C5" }}
            >
              {saving ? "Création en cours…" : "Créer Le Devis"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
