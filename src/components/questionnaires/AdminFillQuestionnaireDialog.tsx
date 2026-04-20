"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2, Star, Send, AlertTriangle, ShieldAlert,
} from "lucide-react";

interface QuestionData {
  id: string;
  text: string;
  type: "rating" | "text" | "multiple_choice" | "yes_no";
  options: string[] | null;
  is_required: boolean;
  order_index: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  questionnaireId: string;
  learnerId: string;
  learnerName: string;
  sessionId: string;
  onSuccess?: () => void;
}

export function AdminFillQuestionnaireDialog({
  open, onClose, questionnaireId, learnerId, learnerName, sessionId, onSuccess,
}: Props) {
  const { toast } = useToast();
  const supabase = createClient();

  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [responses, setResponses] = useState<Record<string, string | number>>({});
  const [fillMode, setFillMode] = useState<"admin_for_learner" | "admin_paper">("admin_for_learner");
  const [adminNotes, setAdminNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [questionnaireName, setQuestionnaireName] = useState("");

  const loadData = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setBlocked(false);

    // Fetch questionnaire + questions
    const { data: q } = await supabase
      .from("questionnaires")
      .select("id, title")
      .eq("id", questionnaireId)
      .single();

    setQuestionnaireName(q?.title || "Questionnaire");

    const { data: qs } = await supabase
      .from("questions")
      .select("id, text, type, options, is_required, order_index")
      .eq("questionnaire_id", questionnaireId)
      .order("order_index");

    setQuestions((qs || []) as QuestionData[]);

    // Fetch existing response
    const res = await fetch(
      `/api/admin/questionnaires/fill-for-learner?questionnaire_id=${questionnaireId}&learner_id=${learnerId}&session_id=${sessionId}`
    );
    const { data: existing } = await res.json();

    if (existing) {
      if (existing.fill_mode === "learner") {
        setBlocked(true);
        setResponses(existing.answers || {});
      } else {
        setResponses(existing.answers || {});
        setFillMode(existing.fill_mode || "admin_for_learner");
        setAdminNotes(existing.admin_notes || "");
        setExistingId(existing.id);
      }
    } else {
      setResponses({});
      setFillMode("admin_for_learner");
      setAdminNotes("");
      setExistingId(null);
    }

    setLoading(false);
  }, [open, questionnaireId, learnerId, sessionId, supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  const updateResponse = (questionId: string, value: string | number) => {
    setResponses(prev => ({ ...prev, [questionId]: value }));
  };

  const answeredCount = questions.filter(q => responses[q.id] !== undefined && responses[q.id] !== "").length;
  const progressPercent = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  const handleSubmit = async () => {
    // Validate required
    const missing = questions.filter(q => q.is_required && (responses[q.id] === undefined || responses[q.id] === ""));
    if (missing.length > 0) {
      toast({ title: "Questions obligatoires manquantes", description: `${missing.length} réponse(s) requise(s)`, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/questionnaires/fill-for-learner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionnaire_id: questionnaireId,
          learner_id: learnerId,
          session_id: sessionId,
          answers: responses,
          fill_mode: fillMode,
          admin_notes: adminNotes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({ title: data.action === "updated" ? "Réponses mises à jour" : "Réponses enregistrées" });
      onClose();
      onSuccess?.();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            Saisie admin — {learnerName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
        ) : blocked ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-800">Répondu par l&apos;apprenant</p>
                <p className="text-xs text-green-700 mt-1">
                  {learnerName} a déjà répondu à ce questionnaire. Les réponses de l&apos;apprenant ne peuvent pas être écrasées par l&apos;admin.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Fermer</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Warning banner */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Vous répondez au nom de {learnerName}.</p>
                <p className="mt-0.5">Cette saisie sera tracée (votre nom + horodatage).</p>
              </div>
            </div>

            {/* Mode selector */}
            <div>
              <Label className="text-xs">Mode de saisie</Label>
              <Select value={fillMode} onValueChange={(v) => setFillMode(v as typeof fillMode)}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin_for_learner">Je complète pour cet apprenant</SelectItem>
                  <SelectItem value="admin_paper">J&apos;ai reçu les réponses par papier</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Progress */}
            <div>
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>{questionnaireName}</span>
                <span>{answeredCount} / {questions.length}</span>
              </div>
              <Progress value={progressPercent} className="h-1.5" />
            </div>

            {/* Questions */}
            <div className="space-y-3">
              {questions.map((question, idx) => (
                <div key={question.id} className="border rounded-lg p-3">
                  <div className="flex items-start gap-2 mb-2">
                    <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-medium text-gray-600 shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <p className="text-sm font-medium text-gray-900">
                      {question.text}
                      {question.is_required && <span className="text-red-500 ml-1">*</span>}
                    </p>
                  </div>

                  {/* Rating */}
                  {question.type === "rating" && (
                    <div className="flex items-center gap-1 ml-7">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button key={star} type="button" onClick={() => updateResponse(question.id, star)} className="p-0.5">
                          <Star className={cn("w-6 h-6 transition-colors", star <= ((responses[question.id] as number) || 0) ? "text-yellow-400 fill-yellow-400" : "text-gray-200 fill-gray-200")} />
                        </button>
                      ))}
                      {(responses[question.id] as number) > 0 && <span className="text-xs text-gray-400 ml-1">{responses[question.id]}/5</span>}
                    </div>
                  )}

                  {/* Text */}
                  {question.type === "text" && (
                    <div className="ml-7">
                      <Textarea
                        value={(responses[question.id] as string) || ""}
                        onChange={(e) => updateResponse(question.id, e.target.value)}
                        placeholder="Réponse..."
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                  )}

                  {/* Multiple choice */}
                  {question.type === "multiple_choice" && question.options && (
                    <div className="space-y-1 ml-7">
                      {question.options.map(opt => (
                        <button key={opt} type="button" onClick={() => updateResponse(question.id, opt)}
                          className={cn("w-full text-left px-3 py-2 rounded border text-sm transition-colors",
                            responses[question.id] === opt ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-gray-200 hover:border-gray-300"
                          )}>
                          <div className="flex items-center gap-2">
                            <div className={cn("w-3 h-3 rounded-full border-2 shrink-0", responses[question.id] === opt ? "border-blue-500 bg-blue-500" : "border-gray-300")} />
                            {opt}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Yes/No */}
                  {question.type === "yes_no" && (
                    <div className="flex gap-2 ml-7">
                      {[{ label: "Oui", value: "oui", color: "green" }, { label: "Non", value: "non", color: "red" }].map(({ label, value, color }) => (
                        <button key={value} type="button" onClick={() => updateResponse(question.id, value)}
                          className={cn("flex-1 px-3 py-2 rounded border text-sm font-medium transition-colors",
                            responses[question.id] === value
                              ? color === "green" ? "border-green-500 bg-green-50 text-green-700" : "border-red-500 bg-red-50 text-red-700"
                              : "border-gray-200 hover:border-gray-300"
                          )}>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Admin notes */}
            <div>
              <Label className="text-xs">Notes admin (optionnel)</Label>
              <Textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Contexte de la saisie..."
                rows={2}
                className="mt-1 text-sm"
              />
            </div>

            {/* Existing badge */}
            {existingId && (
              <Badge variant="outline" className="border-orange-300 bg-orange-50 text-orange-700 text-xs">
                Modification d&apos;une saisie admin précédente
              </Badge>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Annuler</Button>
              <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {existingId ? "Mettre à jour" : "Enregistrer les réponses"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
