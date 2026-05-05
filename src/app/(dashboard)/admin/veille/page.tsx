"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Rss, Loader2, Plus, Trash2, ExternalLink, Newspaper, StickyNote, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

interface FeedArticle {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  source: string;
}

interface VeilleNote {
  id: string;
  title: string;
  content: string | null;
  source: string | null;
  url: string | null;
  is_ai_generated?: boolean;
  created_at: string;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trimEnd() + "…";
}

export default function VeillePage() {
  const { toast } = useToast();

  const [articles, setArticles] = useState<FeedArticle[]>([]);
  const [feedStatus, setFeedStatus] = useState<Array<{ source: string; ok: boolean; error?: string; count: number }>>([]);
  const [notes, setNotes] = useState<VeilleNote[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(true);

  // Add note dialog
  const [addDialog, setAddDialog] = useState(false);
  const [noteForm, setNoteForm] = useState({ title: "", content: "", source: "", url: "" });
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // AI Analysis : la dernière analyse est dérivée de la 1re note IA dans la
  // liste (ordonnée par created_at desc). Plus de localStorage : la source
  // de vérité est la DB, partagée entre admins, persistante.
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const latestAiNote = notes.find((n) => n.is_ai_generated);
  const aiAnalysis = latestAiNote?.content ?? "";
  const aiAnalysisDate = latestAiNote
    ? new Date(latestAiNote.created_at).toLocaleString("fr-FR")
    : "";

  const fetchFeed = useCallback(async () => {
    setLoadingFeed(true);
    try {
      const res = await fetch("/api/veille/feed");
      const data = await res.json();
      setArticles(data.articles ?? []);
      setFeedStatus(data.sources ?? []);
    } catch {
      setArticles([]);
      setFeedStatus([]);
    } finally {
      setLoadingFeed(false);
    }
  }, []);

  const fetchNotes = useCallback(async () => {
    setLoadingNotes(true);
    try {
      const res = await fetch("/api/veille/notes");
      const data = await res.json();
      setNotes(data.notes ?? []);
    } catch {
      setNotes([]);
    } finally {
      setLoadingNotes(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    fetchNotes();
  }, [fetchFeed, fetchNotes]);

  const handleAddNote = async () => {
    if (!noteForm.title.trim()) {
      toast({ title: "Le titre est requis", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/veille/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(noteForm),
      });
      if (res.ok) {
        toast({ title: "Note ajoutée" });
        setAddDialog(false);
        setNoteForm({ title: "", content: "", source: "", url: "" });
        fetchNotes();
      } else {
        const data = await res.json();
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/veille/notes?id=${deleteId}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "Note supprimée" });
        setDeleteId(null);
        fetchNotes();
      } else {
        toast({ title: "Erreur", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    }
  };

  const handleAIAnalysis = async () => {
    setAnalyzingAI(true);
    try {
      const articleTitles = articles.map(a => `${a.title} (${a.source})`);
      // On exclut les notes IA précédentes du contexte pour éviter de
      // ré-analyser nos propres analyses (boucle de bruit).
      const userNoteTexts = notes
        .filter((n) => !n.is_ai_generated)
        .map((n) => `${n.title}${n.content ? ": " + n.content : ""}`);

      const res = await fetch("/api/ai/analyze-veille", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: userNoteTexts, articles: articleTitles }),
      });
      const data = await res.json();
      if (!res.ok || !data.analysis) {
        toast({ title: "Erreur IA", description: data.error || "Génération impossible", variant: "destructive" });
        return;
      }

      // Persiste l'analyse en DB comme une note flaguée IA — elle apparaitra
      // dans la liste de notes avec un badge "IA" et restera disponible
      // pour les autres admins de l'entité.
      const now = new Date();
      const dateLabel = now.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
      const timeLabel = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      const saveRes = await fetch("/api/veille/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Analyse IA — ${dateLabel} ${timeLabel}`,
          content: data.analysis,
          source: "Claude AI",
          is_ai_generated: true,
        }),
      });
      if (!saveRes.ok) {
        const errData = await saveRes.json().catch(() => ({}));
        toast({
          title: "Analyse générée mais non sauvegardée",
          description: errData.error || "Réessayer plus tard",
          variant: "destructive",
        });
        return;
      }

      // Refresh la liste de notes (la nouvelle analyse apparait en haut)
      await fetchNotes();
      toast({ title: "Analyse IA enregistrée", description: "Visible dans vos notes." });
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setAnalyzingAI(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">La Veille Réglementaire</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Actualités de la formation professionnelle et notes internes
          </p>
        </div>
        <Button
          onClick={handleAIAnalysis}
          disabled={analyzingAI || (articles.length === 0 && notes.length === 0)}
          className="gap-1.5"
        >
          {analyzingAI ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {analyzingAI ? "Analyse en cours..." : "Analyser avec l'IA"}
        </Button>
      </div>

      {/* AI Analysis Card */}
      {aiAnalysis && (
        <Card className="border-purple-200 bg-purple-50/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-600" /> Analyse IA
              </CardTitle>
              <div className="flex items-center gap-2">
                {aiAnalysisDate && <span className="text-xs text-muted-foreground">{aiAnalysisDate}</span>}
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleAIAnalysis} disabled={analyzingAI}>
                  Rafraichir
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">
              {aiAnalysis}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 1 — Actualités récentes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Newspaper className="h-4 w-4" /> Actualités récentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingFeed ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : articles.length === 0 ? (
            <div className="text-center py-8 space-y-4">
              <Rss className="h-10 w-10 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">
                Aucun article récupéré — les flux RSS sont peut-être indisponibles.
              </p>
              {feedStatus.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-1 max-w-md mx-auto">
                  {feedStatus.map((s) => (
                    <div key={s.source} className="flex items-center justify-between px-3 py-1.5 bg-muted/40 rounded">
                      <span className="font-medium">{s.source}</span>
                      <span className={s.ok ? "text-emerald-600" : "text-red-600"}>
                        {s.ok ? `${s.count} articles` : (s.error || "indisponible")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-center gap-3 flex-wrap">
                <a
                  href="https://www.centre-inffo.fr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: "#374151" }}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Centre Inffo
                </a>
                <a
                  href="https://www.francecompetences.fr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: "#374151" }}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> France Compétences
                </a>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {articles.map((article, i) => (
                <div key={i} className="p-4 bg-muted/30 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-teal-100 text-teal-700 hover:bg-teal-100 text-xs">
                      {article.source}
                    </Badge>
                    {article.pubDate && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(article.pubDate).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                  <a
                    href={article.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-gray-900 hover:text-[#374151] transition-colors block"
                  >
                    {article.title}
                    <ExternalLink className="h-3 w-3 inline ml-1 text-muted-foreground" />
                  </a>
                  {article.description && (
                    <p className="text-xs text-muted-foreground">
                      {truncate(article.description, 100)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2 — Notes de veille */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <StickyNote className="h-4 w-4" /> Mes Notes de Veille ({notes.length})
            </CardTitle>
            <Button
              size="sm"
              onClick={() => setAddDialog(true)}
              style={{ background: "#374151" }}
              className="text-white hover:opacity-90"
            >
              <Plus className="h-4 w-4 mr-1" /> Ajouter une note
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingNotes ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : notes.length === 0 ? (
            <p className="text-sm text-muted-foreground italic text-center py-4">
              Aucune note de veille
            </p>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className={cn(
                    "flex items-start justify-between p-4 rounded-lg",
                    note.is_ai_generated
                      ? "bg-purple-50/50 border border-purple-200"
                      : "bg-muted/30"
                  )}
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {note.is_ai_generated && (
                        <Badge variant="outline" className="text-xs gap-1 border-purple-300 bg-purple-50 text-purple-700">
                          <Sparkles className="h-3 w-3" /> IA
                        </Badge>
                      )}
                      <span className="text-sm font-medium">{note.title}</span>
                      {note.source && (
                        <Badge variant="outline" className="text-xs">{note.source}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(note.created_at).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                    {note.content && (
                      <p className="text-sm text-gray-600 mt-1">{note.content}</p>
                    )}
                    {note.url && (
                      <a
                        href={note.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#374151] hover:underline inline-flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" /> Lien
                      </a>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-500 hover:text-red-700 shrink-0"
                    onClick={() => setDeleteId(note.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog — Ajouter une note */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter une note de veille</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Titre *</Label>
              <Input
                value={noteForm.title}
                onChange={(e) => setNoteForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Titre de la note"
              />
            </div>
            <div>
              <Label>Contenu</Label>
              <Textarea
                value={noteForm.content}
                onChange={(e) => setNoteForm((f) => ({ ...f, content: e.target.value }))}
                rows={4}
                placeholder="Détails, commentaires..."
              />
            </div>
            <div>
              <Label>Source</Label>
              <Input
                value={noteForm.source}
                onChange={(e) => setNoteForm((f) => ({ ...f, source: e.target.value }))}
                placeholder="Ex: Centre Inffo, Légifrance..."
              />
            </div>
            <div>
              <Label>URL</Label>
              <Input
                value={noteForm.url}
                onChange={(e) => setNoteForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Annuler</Button>
            <Button onClick={handleAddNote} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog — Confirmer suppression */}
      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer cette note ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Cette action est irréversible.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDeleteNote}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
