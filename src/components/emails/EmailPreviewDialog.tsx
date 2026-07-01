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
import { Loader2, Send, Paperclip, X } from "lucide-react";

interface Attachment {
  filename: string;
  content: string;
  type: string;
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
}: EmailPreviewDialogProps) {
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
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

  // Reset when dialog opens with new defaults
  const [lastSubject, setLastSubject] = useState("");
  if (defaultSubject !== lastSubject && open) {
    setSubject(defaultSubject);
    setBody(defaultBody);
    setLastSubject(defaultSubject);
    setExtraAttachments([]);
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
