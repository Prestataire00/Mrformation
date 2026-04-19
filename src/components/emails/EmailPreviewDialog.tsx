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
import { Loader2, Send, Paperclip } from "lucide-react";

interface Attachment {
  filename: string;
  content: string;
  type: string;
}

interface EmailPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  onSend: (data: { subject: string; body: string }) => Promise<void>;
  defaultSubject: string;
  defaultBody: string;
  recipientEmail: string;
  attachments?: Attachment[];
  entityName?: string;
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
}: EmailPreviewDialogProps) {
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);

  // Reset when dialog opens with new defaults
  const [lastSubject, setLastSubject] = useState("");
  if (defaultSubject !== lastSubject && open) {
    setSubject(defaultSubject);
    setBody(defaultBody);
    setLastSubject(defaultSubject);
  }

  const handleSend = async () => {
    setSending(true);
    try {
      await onSend({ subject, body });
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
          {attachments.length > 0 && (
            <div>
              <Label className="text-xs text-gray-500">Pièces jointes</Label>
              <div className="mt-1 space-y-1">
                {attachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-50 rounded px-3 py-1.5 text-xs">
                    <Paperclip className="h-3 w-3 text-gray-400" />
                    <span>{att.filename}</span>
                  </div>
                ))}
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
