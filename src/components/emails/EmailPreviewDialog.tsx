"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Loader2, Send, Paperclip, X, FileText } from "lucide-react";
import { applyEmailTemplate } from "@/lib/email/template-vars";
import type { AvailableAttachment } from "@/lib/formations/formation-attachments";

interface Attachment {
  filename: string;
  content: string;
  type: string;
}

/** PJ interne : marquée `_sourceId` si issue d'un document de la formation. */
type ExtraAttachment = Attachment & { _sourceId?: string };

export interface EmailTemplateOption {
  id: string;
  name: string;
  subject: string;
  body: string;
}

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
  /** Modèles d'email sélectionnables (pré-remplissent objet/corps). */
  templates?: EmailTemplateOption[];
  /** Variables pour la substitution `{{var}}` du modèle choisi. */
  templateVars?: Record<string, string>;
  /** Documents existants de la formation joignables (résolus à la demande). */
  availableAttachments?: AvailableAttachment[];
}

export function EmailPreviewDialog({
  open,
  onClose,
  onSend,
  defaultSubject,
  defaultBody,
  recipientEmail,
  attachments = [],
  entityName,
  allowExtraAttachments,
  templates = [],
  templateVars = {},
  availableAttachments = [],
}: EmailPreviewDialogProps) {
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [extraAttachments, setExtraAttachments] = useState<ExtraAttachment[]>([]);
  const [templateId, setTemplateId] = useState("__default__");
  const [resolvingAttId, setResolvingAttId] = useState<string | null>(null);
  const [attError, setAttError] = useState<string | null>(null);

  const addedSourceIds = new Set(
    extraAttachments.map((a) => a._sourceId).filter((v): v is string => !!v),
  );

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

  const handleSelectTemplate = (id: string) => {
    setTemplateId(id);
    if (id === "__default__") {
      setSubject(defaultSubject);
      setBody(defaultBody);
      return;
    }
    const tpl = templates.find((t) => t.id === id);
    if (tpl) {
      const applied = applyEmailTemplate(tpl, templateVars);
      setSubject(applied.subject);
      setBody(applied.body);
    }
  };

  const handleAddFormationDoc = async (att: AvailableAttachment) => {
    if (addedSourceIds.has(att.id) || resolvingAttId) return;
    setAttError(null);
    setResolvingAttId(att.id);
    try {
      const resolved = await att.resolve();
      setExtraAttachments((prev) => [...prev, { ...resolved, _sourceId: att.id }]);
    } catch (err) {
      setAttError(err instanceof Error ? err.message : "Impossible de joindre ce document");
    } finally {
      setResolvingAttId(null);
    }
  };

  // Reset when dialog opens with new defaults
  const [lastSubject, setLastSubject] = useState("");
  if (defaultSubject !== lastSubject && open) {
    setSubject(defaultSubject);
    setBody(defaultBody);
    setLastSubject(defaultSubject);
    setExtraAttachments([]);
    setTemplateId("__default__");
    setAttError(null);
  }

  const handleSend = async () => {
    setSending(true);
    try {
      await onSend({ subject, body, extraAttachments: extraAttachments.length > 0 ? extraAttachments : undefined });
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prévisualisation de l&apos;email</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* From / To */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500">De</Label>
              <p className="text-sm font-medium">{entityName || "Organisme de formation"}</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500">À</Label>
              <p className="text-sm font-medium">{recipientEmail}</p>
            </div>
          </div>

          {/* Modèle d'email */}
          {templates.length > 0 && (
            <div>
              <Label className="text-xs">Modèle d&apos;email</Label>
              <Select value={templateId} onValueChange={handleSelectTemplate}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Modèle par défaut</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Subject */}
          <div>
            <Label className="text-xs">Sujet</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          {/* Body */}
          <div>
            <Label className="text-xs">Corps du message</Label>
            <textarea
              className="w-full border rounded-md p-3 text-sm resize-none min-h-[150px]"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          {/* Rendered preview */}
          <div>
            <Label className="text-xs text-gray-500">Aperçu</Label>
            <div className="border rounded-lg p-4 bg-white mt-1 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {body}
            </div>
          </div>

          {/* Attachments */}
          {(attachments.length > 0 || extraAttachments.length > 0 || allowExtraAttachments || availableAttachments.length > 0) && (
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
                      Ajouter une pièce jointe depuis l&apos;ordinateur
                    </span>
                  </label>
                )}
              </div>

              {/* Documents existants de la formation */}
              {availableAttachments.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">Joindre un document de la formation</p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableAttachments.map((att) => {
                      const added = addedSourceIds.has(att.id);
                      const busy = resolvingAttId === att.id;
                      return (
                        <button
                          key={att.id}
                          type="button"
                          disabled={added || !!resolvingAttId}
                          onClick={() => handleAddFormationDoc(att)}
                          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs disabled:opacity-60 hover:bg-gray-50"
                          title={att.label}
                        >
                          {busy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <FileText className="h-3 w-3 text-gray-400" />
                          )}
                          <span className="max-w-[220px] truncate">{att.label}</span>
                          {added && <span className="text-green-600">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                  {attError && <p className="text-xs text-red-600 mt-1">{attError}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Annuler
          </Button>
          <Button onClick={handleSend} disabled={sending} className="gap-1.5">
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Envoyer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
