"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Sparkles, Loader2, CheckCircle2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  defaultRecipientType?: string;
  onSuccess?: () => void;
}

export function ImportInvoiceDialog({ open, onOpenChange, sessionId, defaultRecipientType = "company", onSuccess }: Props) {
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [aiParsing, setAiParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [aiDone, setAiDone] = useState(false);

  const [recipientType, setRecipientType] = useState(defaultRecipientType);
  const [recipientName, setRecipientName] = useState("");
  const [recipientSiret, setRecipientSiret] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amountHt, setAmountHt] = useState("");
  const [amountTtc, setAmountTtc] = useState("");
  const [vatRate, setVatRate] = useState("20");
  const [externalRef, setExternalRef] = useState("");
  const [description, setDescription] = useState("");

  const reset = () => {
    setFile(null); setAiDone(false); setRecipientName(""); setRecipientSiret("");
    setRecipientAddress(""); setIssueDate(""); setDueDate("");
    setAmountHt(""); setAmountTtc(""); setVatRate("20"); setExternalRef(""); setDescription("");
  };

  const handleAIParse = async () => {
    if (!file) return;
    setAiParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ai/parse-invoice", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { toast({ title: "Analyse impossible", description: data.error, variant: "destructive" }); return; }
      if (data.recipient_name) setRecipientName(data.recipient_name);
      if (data.recipient_siret) setRecipientSiret(data.recipient_siret);
      if (data.recipient_address) setRecipientAddress(data.recipient_address);
      if (data.issue_date) setIssueDate(data.issue_date);
      if (data.due_date) setDueDate(data.due_date);
      if (data.amount_ht != null) setAmountHt(String(data.amount_ht));
      if (data.amount_ttc != null) setAmountTtc(String(data.amount_ttc));
      if (data.vat_rate != null) setVatRate(String(data.vat_rate));
      if (data.external_ref) setExternalRef(data.external_ref);
      if (data.description) setDescription(data.description);
      setAiDone(true);
      toast({ title: "Analyse terminée — vérifiez les champs" });
    } catch { toast({ title: "Erreur réseau", variant: "destructive" }); }
    finally { setAiParsing(false); }
  };

  const handleImport = async () => {
    if (!file || !amountTtc || !issueDate || !recipientName) {
      toast({ title: "Champs manquants", description: "Fichier, destinataire, date et montant TTC obligatoires", variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("payload", JSON.stringify({
        ai_parsed: aiDone, recipient_type: recipientType, recipient_name: recipientName,
        recipient_siret: recipientSiret, recipient_address: recipientAddress,
        issue_date: issueDate, due_date: dueDate || null,
        amount_ht: parseFloat(amountHt) || 0, amount_ttc: parseFloat(amountTtc) || 0,
        vat_rate: parseFloat(vatRate) || 20, external_ref: externalRef, description,
      }));
      const res = await fetch(`/api/formations/${sessionId}/invoices/import`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { toast({ title: "Import échoué", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Facture importée" });
      reset(); onOpenChange(false); onSuccess?.();
    } catch { toast({ title: "Erreur réseau", variant: "destructive" }); }
    finally { setImporting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importer une facture existante</DialogTitle>
          <DialogDescription>Téléversez un PDF de facture pour la lier à cette formation</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Fichier PDF ou image *</Label>
            <Input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => { setFile(e.target.files?.[0] || null); setAiDone(false); }} />
            {file && <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>}
          </div>

          {file && !aiDone && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">Analyse automatique par IA</p>
                <p className="text-xs text-blue-700 mt-1">Claude extrait automatiquement les informations du document.</p>
                <Button size="sm" variant="outline" className="mt-2" onClick={handleAIParse} disabled={aiParsing}>
                  {aiParsing ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Analyse...</> : <><Sparkles className="h-3 w-3 mr-1.5" /> Analyser</>}
                </Button>
              </div>
            </div>
          )}

          {aiDone && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <p className="text-sm text-green-900">Données extraites — vérifiez avant import</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Select value={recipientType} onValueChange={setRecipientType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="learner">Apprenant</SelectItem>
                  <SelectItem value="company">Entreprise</SelectItem>
                  <SelectItem value="financier">Financeur OPCO</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Référence facture</Label>
              <Input placeholder="Ex: FACT-2026-123" value={externalRef} onChange={(e) => setExternalRef(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Destinataire *</Label>
            <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>SIRET</Label><Input value={recipientSiret} onChange={(e) => setRecipientSiret(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Adresse</Label><Input value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Date d&apos;émission *</Label><Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Échéance</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Montant HT</Label><Input type="number" step="0.01" value={amountHt} onChange={(e) => setAmountHt(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>TVA</Label>
              <Select value={vatRate} onValueChange={setVatRate}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0%</SelectItem>
                  <SelectItem value="5.5">5.5%</SelectItem>
                  <SelectItem value="10">10%</SelectItem>
                  <SelectItem value="20">20%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Montant TTC *</Label><Input type="number" step="0.01" value={amountTtc} onChange={(e) => setAmountTtc(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Prestation de formation" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>Annuler</Button>
          <Button onClick={handleImport} disabled={!file || importing}>
            {importing ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Import...</> : <><Upload className="h-4 w-4 mr-1.5" /> Importer</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
