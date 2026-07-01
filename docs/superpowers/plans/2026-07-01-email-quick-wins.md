# Email Quick Wins — Améliorations emails client

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter 6 quick wins email demandés par le client : pièces jointes dans les emails prospect, templates éditables pour devis (avec et sans e-signature), signature email du commercial, et prévisualisation facture avec pièces jointes.

**Architecture:** Chaque quick win touche principalement l'UI (composants React). Le backend (`/api/emails/send`) supporte déjà les attachments base64. On réutilise le pattern d'upload fichier existant dans le dialog de signature de devis (`handleAddSignAttachment`). Pour les signatures email, on ajoute un champ `email_signature` (HTML) dans la table `profiles` et on l'injecte comme variable dans les templates.

**Tech Stack:** Next.js 14, React, Supabase, Shadcn/ui, TypeScript

---

## Task 1 : Pièces jointes depuis l'ordinateur — Page email prospect CRM

**Files:**
- Modify: `src/app/(dashboard)/admin/crm/prospects/[id]/email/page.tsx`

Le backend `/api/emails/send` accepte déjà `attachments[]` (base64). Il manque uniquement l'UI dans la page prospect email.

- [ ] **Step 1: Ajouter le state et le handler d'upload**

Dans `SendEmailPage`, ajouter après la déclaration des states existants (ligne ~66) :

```tsx
// Pièces jointes
const [attachments, setAttachments] = useState<{ filename: string; content: string; type: string }[]>([]);

const handleAddAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (!files) return;
  Array.from(files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setAttachments((prev) => [...prev, { filename: file.name, content: base64, type: file.type || "application/octet-stream" }]);
    };
    reader.readAsDataURL(file);
  });
  e.target.value = "";
};

const handleRemoveAttachment = (index: number) => {
  setAttachments((prev) => prev.filter((_, i) => i !== index));
};
```

- [ ] **Step 2: Ajouter l'import Paperclip et X**

Ajouter `Paperclip, X` dans les imports lucide-react (ligne ~12) :

```tsx
import {
  ArrowLeft,
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Paperclip,
  X,
} from "lucide-react";
```

- [ ] **Step 3: Ajouter l'UI de pièces jointes dans le formulaire**

Après le bloc `</Textarea>` du message (après ligne ~391, juste avant la fermeture `</>`) :

```tsx
{/* Pièces jointes */}
<div>
  <label className="mb-1.5 block text-sm font-medium text-gray-700">
    Pièces jointes
  </label>
  {attachments.length > 0 && (
    <div className="space-y-1 mb-2">
      {attachments.map((att, i) => (
        <div key={i} className="flex items-center justify-between bg-gray-50 rounded px-3 py-1.5 text-xs">
          <div className="flex items-center gap-2">
            <Paperclip className="h-3 w-3 text-gray-400" />
            <span>{att.filename}</span>
          </div>
          <button
            type="button"
            onClick={() => handleRemoveAttachment(i)}
            className="text-red-500 hover:text-red-700"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )}
  <label className="cursor-pointer">
    <input
      type="file"
      className="hidden"
      multiple
      onChange={handleAddAttachment}
      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx,.xls,.csv"
    />
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#374151] hover:underline cursor-pointer">
      <Paperclip className="h-3.5 w-3.5" />
      Ajouter une pièce jointe
    </span>
  </label>
</div>
```

- [ ] **Step 4: Envoyer les attachments dans le payload API**

Modifier `handleSend()` (ligne ~134) pour inclure les pièces jointes :

```tsx
body: JSON.stringify({
  to: prospect.email,
  subject: resolvedSubject,
  body: resolvedBody,
  entity_id: entityId || undefined,
  attachments: attachments.length > 0 ? attachments : undefined,
}),
```

- [ ] **Step 5: Afficher les PJ dans l'aperçu**

Dans le bloc `showPreview` (ligne ~309), ajouter après le paragraphe "Aperçu avec les balises..." :

```tsx
{attachments.length > 0 && (
  <div>
    <p className="mb-1 text-xs font-medium text-gray-500">Pièces jointes ({attachments.length})</p>
    <div className="space-y-1">
      {attachments.map((att, i) => (
        <div key={i} className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1 text-xs">
          <Paperclip className="h-3 w-3 text-gray-400" />
          <span>{att.filename}</span>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 6: Vérifier manuellement**

Lancer le dev server, aller sur un prospect, ouvrir la page email :
- Vérifier que le bouton "Ajouter une pièce jointe" apparaît
- Uploader un fichier PDF, vérifier qu'il s'affiche
- Supprimer un fichier, vérifier qu'il disparaît
- Basculer en aperçu, vérifier que les PJ sont visibles
- Envoyer l'email, vérifier dans les logs réseau que `attachments` est bien dans le payload

---

## Task 2 : Template éditable pour envoi de devis avec e-signature

**Files:**
- Modify: `src/app/(dashboard)/admin/crm/quotes/page.tsx`

Le dialog de signature (`signPreviewOpen`) charge déjà le sujet et le corps en dur. On ajoute la résolution depuis `email_templates` (clé `quote_sign_request`) si un template existe, sinon le texte hardcodé actuel sert de fallback.

- [ ] **Step 1: Charger le template depuis Supabase**

Trouver la fonction qui ouvre le sign preview dialog (autour de la ligne 650-682 dans `page.tsx`). Le bloc commence par `const handleOpenSignPreview = async (quote: CrmQuote) => {`.

Avant la ligne `setSignSubject(...)`, ajouter la résolution du template :

```tsx
// Tenter de charger le template personnalisé
let templateSubject: string | null = null;
let templateBody: string | null = null;
const { data: tmpl } = await supabase
  .from("email_templates")
  .select("subject, body")
  .eq("entity_id", entityId)
  .eq("key", "quote_sign_request")
  .eq("is_active", true)
  .maybeSingle();

if (tmpl) {
  const vars: Record<string, string> = {
    reference: quote.reference ?? "",
    montant: amount > 0 ? `${amount.toLocaleString("fr-FR")}€ HT` : "",
    destinataire: recipientName,
    date_validite: validUntilFr,
    entite: entityName,
    lien_signature: "{{lien_signature}}",
  };
  templateSubject = (tmpl.subject ?? "").replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
  templateBody = (tmpl.body ?? "").replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
}
```

Puis remplacer les `setSignSubject(...)` et `setSignBody(...)` hardcodés par :

```tsx
setSignSubject(templateSubject ?? `Proposition commerciale ${quote.reference} — ${entityName}`);
setSignBody(templateBody ?? `Bonjour${recipientName ? ` ${recipientName}` : ""},\n\nVeuillez trouver notre proposition commerciale ${quote.reference}${amount > 0 ? ` d'un montant de ${amount.toLocaleString("fr-FR")}€ HT` : ""}.\n\nPour accepter cette proposition, veuillez la signer électroniquement en cliquant sur le lien suivant :\n\n{{lien_signature}}\n\nCe lien est valide jusqu'au ${validUntilFr}.\n\nN'hésitez pas à nous contacter pour toute question.\n\nCordialement,\nL'équipe ${entityName}`);
```

- [ ] **Step 2: Vérifier**

- Ouvrir un devis, cliquer "Envoyer pour signature"
- Le dialog doit s'ouvrir avec le template par défaut (comportement inchangé si pas de template custom)
- Créer un template avec key `quote_sign_request` dans l'admin emails → vérifier qu'il est utilisé

---

## Task 3 : Template éditable + pièces jointes pour envoi de devis sans e-signature

**Files:**
- Modify: `src/app/(dashboard)/admin/crm/quotes/page.tsx`

Le dialog d'envoi de devis sans signature (`emailDialog`) est un formulaire simple sans PJ uploadables ni résolution de template.

- [ ] **Step 1: Ajouter le state pour les pièces jointes supplémentaires**

Après la déclaration de `emailAttachment` (autour de la ligne 116) :

```tsx
const [emailExtraAttachments, setEmailExtraAttachments] = useState<{ filename: string; content: string }[]>([]);
```

- [ ] **Step 2: Ajouter le handler d'upload**

Après `handleAddSignAttachment` (autour de la ligne 706) :

```tsx
const handleAddEmailAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (!files) return;
  Array.from(files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setEmailExtraAttachments((prev) => [...prev, { filename: file.name, content: base64 }]);
    };
    reader.readAsDataURL(file);
  });
  e.target.value = "";
};
```

- [ ] **Step 3: Résoudre le template dans handleSendByEmail**

Dans `handleSendByEmail` (ligne 420), après la construction de `devisData` et avant `setEmailForm(...)` (ligne ~498), ajouter :

```tsx
// Résoudre template personnalisé si disponible
let emailSubjectResolved = `Devis ${quote.reference} - ${entityName}`;
let emailBodyResolved = `Bonjour,\n\nVeuillez trouver ci-joint notre devis ${quote.reference}.\n\nN'hésitez pas à nous contacter pour toute question.\n\nCordialement,\n${entityName}`;

if (entityId) {
  const { data: tmpl } = await supabase
    .from("email_templates")
    .select("subject, body")
    .eq("entity_id", entityId)
    .eq("key", "batch_devis")
    .eq("is_active", true)
    .maybeSingle();

  if (tmpl) {
    const vars: Record<string, string> = {
      reference: quote.reference ?? "",
      destinataire: prospectName,
      entite: entityName,
      montant: devisData.lines.reduce((s, l) => s + l.quantity * l.unit_price, 0).toLocaleString("fr-FR") + "€ HT",
    };
    if (tmpl.subject) emailSubjectResolved = tmpl.subject.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
    if (tmpl.body) emailBodyResolved = tmpl.body.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
  }
}
```

Puis modifier les `setEmailForm` :

```tsx
setEmailForm({
  to: prospectEmail,
  subject: emailSubjectResolved,
  body: emailBodyResolved,
});
```

Reset des PJ supplémentaires :
```tsx
setEmailExtraAttachments([]);
```

- [ ] **Step 4: Ajouter l'UI de PJ dans le dialog d'envoi de devis**

Dans le dialog `emailDialog` (après le bloc `emailAttachment`, ligne ~1067), ajouter :

```tsx
{/* Pièces jointes supplémentaires */}
{emailExtraAttachments.length > 0 && (
  <div className="space-y-1">
    {emailExtraAttachments.map((att, i) => (
      <div key={i} className="flex items-center justify-between bg-gray-50 rounded px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <Paperclip className="h-3 w-3 text-gray-400" />
          <span>{att.filename}</span>
        </div>
        <button onClick={() => setEmailExtraAttachments(prev => prev.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700">
          <X className="h-3 w-3" />
        </button>
      </div>
    ))}
  </div>
)}
<label className="cursor-pointer">
  <input type="file" className="hidden" multiple onChange={handleAddEmailAttachment} accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx,.xls" />
  <span className="inline-flex items-center gap-1.5 text-xs text-[#374151] hover:underline cursor-pointer">
    <Paperclip className="h-3.5 w-3.5" />
    Ajouter une pièce jointe
  </span>
</label>
```

Ajouter `Paperclip, X` dans les imports lucide-react du fichier s'ils ne sont pas déjà présents.

- [ ] **Step 5: Envoyer les PJ supplémentaires dans confirmSendEmail**

Modifier `confirmSendEmail` (ligne ~520) pour inclure les PJ supplémentaires :

```tsx
const allAttachments = [
  ...(emailAttachment ? [{ ...emailAttachment, type: "application/pdf" }] : []),
  ...emailExtraAttachments.map((a) => ({ ...a, type: "application/octet-stream" })),
];

body: JSON.stringify({
  to: emailForm.to.trim(),
  subject: emailForm.subject,
  body: emailForm.body,
  attachments: allAttachments.length > 0 ? allAttachments : undefined,
}),
```

- [ ] **Step 6: Vérifier**

- Ouvrir un devis, choisir "Envoyer par email (sans signature)"
- Vérifier que le template par défaut est chargé
- Ajouter une PJ supplémentaire depuis l'ordinateur
- Vérifier l'envoi avec attachments dans le payload

---

## Task 4 : Migration SQL — Champ email_signature dans profiles

**Files:**
- Create: `supabase/migrations/add_email_signature_to_profiles.sql`

- [ ] **Step 1: Créer le fichier de migration**

```sql
-- Migration: Ajouter le champ email_signature dans profiles
-- Permet aux commerciaux/admins de définir une signature personnalisée
-- qui sera automatiquement injectée dans les emails envoyés.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_signature TEXT DEFAULT NULL;

COMMENT ON COLUMN profiles.email_signature IS 'Signature HTML du profil, injectée dans les emails via la variable {{signature_commercial}}';
```

- [ ] **Step 2: Exécuter dans Supabase Dashboard**

Exécuter le SQL dans l'éditeur SQL de Supabase (ou via CLI `supabase db push`).

---

## Task 5 : UI d'édition de la signature email dans le profil

**Files:**
- Modify: Le composant de profil admin (chercher la page settings/profil existante)

Note : si aucune page de profil n'existe, ajouter un champ dans la page de paramètres admin. La recherche dans le codebase déterminera le bon fichier.

- [ ] **Step 1: Identifier la page de profil/settings**

Chercher les fichiers dans `src/app/(dashboard)/admin/settings/` ou `src/app/(dashboard)/admin/profile/` ou un composant de gestion de profil.

- [ ] **Step 2: Ajouter le champ email_signature**

Dans le formulaire du profil, ajouter :

```tsx
<div className="space-y-1.5">
  <Label>Signature email</Label>
  <p className="text-xs text-muted-foreground">
    Cette signature sera automatiquement ajoutée en bas des emails que vous envoyez.
  </p>
  <Textarea
    value={emailSignature}
    onChange={(e) => setEmailSignature(e.target.value)}
    placeholder="Cordialement,&#10;Prénom Nom&#10;Titre — Entreprise&#10;Tél : 01 23 45 67 89"
    rows={5}
    className="text-sm"
  />
</div>
```

- [ ] **Step 3: Sauvegarder la signature**

Dans le handler de sauvegarde du profil, inclure `email_signature` dans l'update Supabase :

```tsx
await supabase
  .from("profiles")
  .update({ email_signature: emailSignature, updated_at: new Date().toISOString() })
  .eq("id", profileId);
```

---

## Task 6 : Injection automatique de la signature du commercial dans les emails

**Files:**
- Modify: `src/app/api/emails/send/route.ts`
- Modify: `src/app/(dashboard)/admin/crm/prospects/[id]/email/page.tsx`
- Modify: `src/app/(dashboard)/admin/crm/quotes/page.tsx`
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx`

Approche : le commercial qui envoie un email est l'utilisateur connecté. On récupère sa `email_signature` et on l'ajoute en bas du body avant envoi.

- [ ] **Step 1: Côté API — Injecter la signature dans le body**

Dans `/api/emails/send/route.ts`, après l'extraction du payload et la vérification auth (l'utilisateur est déjà identifié via `user.id`), ajouter :

```tsx
// Injection automatique de la signature email du commercial
let finalBody = body;
const { data: senderProfile } = await serviceSupabase
  .from("profiles")
  .select("email_signature")
  .eq("id", user.id)
  .maybeSingle();

if (senderProfile?.email_signature) {
  finalBody = `${body}\n\n--\n${senderProfile.email_signature}`;
}
```

Puis utiliser `finalBody` au lieu de `body` dans le reste du handler (Resend et Gmail).

- [ ] **Step 2: Vérifier**

- Se connecter en tant qu'admin/commercial
- Définir une signature email dans le profil
- Envoyer un email (prospect, devis, facture)
- Vérifier que la signature apparaît en bas du message

---

## Task 7 : Prévisualisation email facture + pièces jointes

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx`

Actuellement `handleSendInvoiceEmail` envoie directement sans aperçu. On le transforme pour ouvrir un `EmailPreviewDialog` (composant existant dans `src/components/emails/EmailPreviewDialog.tsx`) avec possibilité d'ajouter des PJ.

- [ ] **Step 1: Ajouter les imports**

```tsx
import { EmailPreviewDialog } from "@/components/emails/EmailPreviewDialog";
import { Paperclip, X } from "lucide-react";
```

- [ ] **Step 2: Ajouter les states pour le preview dialog**

Après les states existants dans le composant TabFinances :

```tsx
// Email preview state
const [invoiceEmailPreview, setInvoiceEmailPreview] = useState<{
  inv: Invoice;
  recipientEmail: string;
  pdfBase64: string;
  pdfFilename: string;
} | null>(null);
const [invoiceExtraAttachments, setInvoiceExtraAttachments] = useState<{ filename: string; content: string; type: string }[]>([]);
```

- [ ] **Step 3: Transformer handleSendInvoiceEmail en preview**

Remplacer le contenu de `handleSendInvoiceEmail` (lignes 725-784) par :

```tsx
const handleSendInvoiceEmail = async (inv: Invoice) => {
  // Résoudre l'email du destinataire (code existant inchangé)
  let email: string | null = null;
  if (inv.recipient_type === "company") {
    const company = formation.formation_companies?.find((c) => c.client_id === inv.recipient_id);
    email = company?.email || (company?.client as unknown as Record<string, string>)?.email || null;
  } else if (inv.recipient_type === "learner") {
    const enr = formation.enrollments?.find((e) => e.learner?.id === inv.recipient_id);
    email = (enr?.learner as unknown as Record<string, string> | undefined)?.email || null;
  } else if (inv.recipient_type === "financier") {
    const ff = formation.formation_financiers?.find((f) => f.id === inv.recipient_id);
    if (ff?.financeur_id) {
      const { data: fin } = await supabase
        .from("financeurs")
        .select("email")
        .eq("id", ff.financeur_id)
        .maybeSingle();
      email = (fin as { email?: string } | null)?.email || null;
    }
  }
  if (!email) {
    toast({ title: "Pas d'email pour ce destinataire", variant: "destructive" });
    return;
  }

  try {
    toast({ title: "Génération du PDF..." });
    const pdfData = await buildPdfDataWithLines(inv);
    const base64 = await invoicePDFBase64(pdfData);
    setInvoiceEmailPreview({
      inv,
      recipientEmail: email,
      pdfBase64: base64,
      pdfFilename: `${invoiceDisplayRef(inv)}.pdf`,
    });
    setInvoiceExtraAttachments([]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur de génération";
    toast({ title: "Erreur", description: message, variant: "destructive" });
  }
};
```

- [ ] **Step 4: Ajouter le handler d'envoi confirmé**

```tsx
const handleConfirmInvoiceEmail = async ({ subject, body }: { subject: string; body: string }) => {
  if (!invoiceEmailPreview) return;
  const { inv, recipientEmail, pdfBase64, pdfFilename } = invoiceEmailPreview;

  const allAttachments = [
    { filename: pdfFilename, content: pdfBase64, type: "application/pdf" },
    ...invoiceExtraAttachments,
  ];

  const res = await fetch("/api/emails/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: recipientEmail,
      subject,
      body,
      session_id: formation.id,
      attachments: allAttachments,
    }),
  });
  if (!res.ok) throw new Error("Erreur envoi");

  await supabase
    .from("formation_invoices")
    .update({ status: "sent", updated_at: new Date().toISOString() })
    .eq("id", inv.id);

  toast({ title: `Facture ${invoiceDisplayRef(inv)} envoyée par email` });
  setInvoiceEmailPreview(null);
  fetchData();
};
```

- [ ] **Step 5: Ajouter le handler d'upload de PJ supplémentaires**

```tsx
const handleAddInvoiceAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (!files) return;
  Array.from(files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setInvoiceExtraAttachments((prev) => [...prev, { filename: file.name, content: base64, type: file.type || "application/octet-stream" }]);
    };
    reader.readAsDataURL(file);
  });
  e.target.value = "";
};
```

- [ ] **Step 6: Ajouter le dialog de prévisualisation dans le JSX**

À la fin du composant, avant la dernière fermeture `</>` :

```tsx
{/* Invoice Email Preview Dialog */}
{invoiceEmailPreview && (
  <Dialog open={!!invoiceEmailPreview} onOpenChange={(v) => !v && setInvoiceEmailPreview(null)}>
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Prévisualisation de l&apos;email — {invoiceDisplayRef(invoiceEmailPreview.inv)}</DialogTitle>
      </DialogHeader>
      <InvoiceEmailPreviewContent
        preview={invoiceEmailPreview}
        extraAttachments={invoiceExtraAttachments}
        onRemoveAttachment={(i) => setInvoiceExtraAttachments(prev => prev.filter((_, j) => j !== i))}
        onAddAttachment={handleAddInvoiceAttachment}
        onSend={handleConfirmInvoiceEmail}
        onClose={() => setInvoiceEmailPreview(null)}
        formation={formation}
      />
    </DialogContent>
  </Dialog>
)}
```

Alternativement, réutiliser directement `EmailPreviewDialog` existant si sa structure est suffisante, en passant les attachments comme props. Le composant existant affiche déjà les PJ et permet d'éditer sujet/body. Il faut juste ajouter le bouton d'upload de PJ supplémentaires.

Option plus simple — utiliser `EmailPreviewDialog` existant + section PJ en dessous :

```tsx
{invoiceEmailPreview && (
  <>
    <EmailPreviewDialog
      open={!!invoiceEmailPreview}
      onClose={() => setInvoiceEmailPreview(null)}
      onSend={handleConfirmInvoiceEmail}
      defaultSubject={`${invoiceEmailPreview.inv.is_avoir ? "Avoir" : "Facture"} ${invoiceDisplayRef(invoiceEmailPreview.inv)} — ${formation.title}`}
      defaultBody={`Bonjour,\n\nVeuillez trouver ci-joint ${invoiceEmailPreview.inv.is_avoir ? "l'avoir" : "la facture"} ${invoiceDisplayRef(invoiceEmailPreview.inv)} relative à la formation "${formation.title}".\n\nCordialement,\nL'équipe formation`}
      recipientEmail={invoiceEmailPreview.recipientEmail}
      attachments={[
        { filename: invoiceEmailPreview.pdfFilename, content: invoiceEmailPreview.pdfBase64, type: "application/pdf" },
        ...invoiceExtraAttachments,
      ]}
      entityName={entityName}
    />
  </>
)}
```

**Problème :** `EmailPreviewDialog` actuel ne permet pas d'ajouter des PJ supplémentaires. Il faut l'enrichir — voir Task 8.

---

## Task 8 : Enrichir EmailPreviewDialog pour supporter l'ajout de PJ

**Files:**
- Modify: `src/components/emails/EmailPreviewDialog.tsx`

Le composant actuel affiche les PJ en lecture seule. On ajoute un input file optionnel.

- [ ] **Step 1: Ajouter les props optionnelles**

```tsx
interface EmailPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  onSend: (data: { subject: string; body: string; extraAttachments?: Attachment[] }) => Promise<void>;
  defaultSubject: string;
  defaultBody: string;
  recipientEmail: string;
  attachments?: Attachment[];
  entityName?: string;
  allowExtraAttachments?: boolean;
}
```

- [ ] **Step 2: Ajouter le state et handler pour PJ supplémentaires**

Dans le composant, après les states existants :

```tsx
const [extraAttachments, setExtraAttachments] = useState<Attachment[]>([]);

const handleAddExtra = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (!files) return;
  Array.from(files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setExtraAttachments((prev) => [...prev, { filename: file.name, content: base64, type: file.type || "application/octet-stream" }]);
    };
    reader.readAsDataURL(file);
  });
  e.target.value = "";
};
```

- [ ] **Step 3: Modifier l'UI des attachments**

Remplacer le bloc attachments existant par :

```tsx
{/* Attachments */}
{(attachments.length > 0 || extraAttachments.length > 0 || allowExtraAttachments) && (
  <div>
    <Label className="text-xs text-gray-500">Pièces jointes</Label>
    <div className="mt-1 space-y-1">
      {attachments.map((att, i) => (
        <div key={`base-${i}`} className="flex items-center gap-2 bg-gray-50 rounded px-3 py-1.5 text-xs">
          <Paperclip className="h-3 w-3 text-gray-400" />
          <span>{att.filename}</span>
        </div>
      ))}
      {extraAttachments.map((att, i) => (
        <div key={`extra-${i}`} className="flex items-center justify-between bg-gray-50 rounded px-3 py-1.5 text-xs">
          <div className="flex items-center gap-2">
            <Paperclip className="h-3 w-3 text-gray-400" />
            <span>{att.filename}</span>
          </div>
          <button
            type="button"
            onClick={() => setExtraAttachments((prev) => prev.filter((_, j) => j !== i))}
            className="text-red-500 hover:text-red-700"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      {allowExtraAttachments && (
        <label className="cursor-pointer">
          <input type="file" className="hidden" multiple onChange={handleAddExtra} accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx,.xls" />
          <span className="inline-flex items-center gap-1.5 text-xs text-[#374151] hover:underline cursor-pointer mt-1">
            <Paperclip className="h-3.5 w-3.5" />
            Ajouter une pièce jointe
          </span>
        </label>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 4: Ajouter l'import X**

```tsx
import { Loader2, Send, Paperclip, X } from "lucide-react";
```

- [ ] **Step 5: Passer les extra attachments dans onSend**

Modifier `handleSend` :

```tsx
const handleSend = async () => {
  setSending(true);
  try {
    await onSend({ subject, body, extraAttachments: extraAttachments.length > 0 ? extraAttachments : undefined });
    onClose();
  } finally {
    setSending(false);
  }
};
```

- [ ] **Step 6: Reset les extras quand le dialog s'ouvre**

Dans le reset block existant (lignes 48-53) :

```tsx
if (defaultSubject !== lastSubject && open) {
  setSubject(defaultSubject);
  setBody(defaultBody);
  setLastSubject(defaultSubject);
  setExtraAttachments([]);
}
```

- [ ] **Step 7: Mettre à jour TabFinances pour utiliser le dialog enrichi**

Dans TabFinances, utiliser `EmailPreviewDialog` avec `allowExtraAttachments={true}` :

```tsx
{invoiceEmailPreview && (
  <EmailPreviewDialog
    open={!!invoiceEmailPreview}
    onClose={() => setInvoiceEmailPreview(null)}
    onSend={async ({ subject, body, extraAttachments }) => {
      const { inv, recipientEmail, pdfBase64, pdfFilename } = invoiceEmailPreview;
      const allAttachments = [
        { filename: pdfFilename, content: pdfBase64, type: "application/pdf" },
        ...(extraAttachments ?? []),
      ];
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipientEmail,
          subject,
          body,
          session_id: formation.id,
          attachments: allAttachments,
        }),
      });
      if (!res.ok) throw new Error("Erreur envoi");
      await supabase
        .from("formation_invoices")
        .update({ status: "sent", updated_at: new Date().toISOString() })
        .eq("id", inv.id);
      toast({ title: `Facture ${invoiceDisplayRef(inv)} envoyée par email` });
      setInvoiceEmailPreview(null);
      fetchData();
    }}
    defaultSubject={`${invoiceEmailPreview.inv.is_avoir ? "Avoir" : "Facture"} ${invoiceDisplayRef(invoiceEmailPreview.inv)} — ${formation.title}`}
    defaultBody={`Bonjour,\n\nVeuillez trouver ci-joint ${invoiceEmailPreview.inv.is_avoir ? "l'avoir" : "la facture"} ${invoiceDisplayRef(invoiceEmailPreview.inv)} relative à la formation "${formation.title}".\n\nCordialement,\nL'équipe formation`}
    recipientEmail={invoiceEmailPreview.recipientEmail}
    attachments={[{ filename: invoiceEmailPreview.pdfFilename, content: invoiceEmailPreview.pdfBase64, type: "application/pdf" }]}
    entityName={entityName}
    allowExtraAttachments
  />
)}
```

---

## Résumé des fichiers impactés

| Fichier | Tasks |
|---------|-------|
| `src/app/(dashboard)/admin/crm/prospects/[id]/email/page.tsx` | T1 |
| `src/app/(dashboard)/admin/crm/quotes/page.tsx` | T2, T3 |
| `supabase/migrations/add_email_signature_to_profiles.sql` | T4 |
| Page profil admin (à identifier) | T5 |
| `src/app/api/emails/send/route.ts` | T6 |
| `src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx` | T7, T8 |
| `src/components/emails/EmailPreviewDialog.tsx` | T8 |
