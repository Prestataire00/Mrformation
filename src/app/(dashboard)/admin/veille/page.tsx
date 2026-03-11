"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, ExternalLink, Search } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Article {
  id: string;
  title: string;
  description: string;
  source: string;
  date: string;
  category: string;
  url?: string;
  custom?: boolean;
}

const CATEGORIES = ["Tout", "Qualiopi", "Financement", "Réglementation", "Numérique", "Emploi", "Actualité"];

const SEED_ARTICLES: Article[] = [
  {
    id: "1",
    title: "Qualiopi 2025 : les nouvelles exigences du référentiel national qualité",
    description: "Le Comité français d'accréditation (COFRAC) a publié la mise à jour du référentiel national qualité (RNQ) applicable aux organismes de formation. Les audits de surveillance incluront désormais un focus sur l'indicateur 32 d'amélioration continue.",
    source: "Centre Inffo",
    date: "14 fév. 2026",
    category: "Qualiopi",
    url: "https://www.centre-inffo.fr",
  },
  {
    id: "2",
    title: "CPF : la réforme du reste à charge confirmée pour 2026",
    description: "Le gouvernement confirme le maintien d'un reste à charge de 100€ pour les formations financées via le Compte Personnel de Formation. Les formations certifiantes de courte durée restent néanmoins exonérées sous conditions.",
    source: "Ministère du Travail",
    date: "10 fév. 2026",
    category: "Financement",
    url: "https://www.travail.gouv.fr",
  },
  {
    id: "3",
    title: "OPCO 2024 : bilan des financements accordés aux PME",
    description: "Les opérateurs de compétences ont publié leur bilan annuel 2024. Plus de 2,4 milliards d'euros ont été mobilisés pour financer des actions de formation continue, dont 38% orientées vers les entreprises de moins de 50 salariés.",
    source: "France Compétences",
    date: "05 fév. 2026",
    category: "Financement",
    url: "https://www.francecompetences.fr",
  },
  {
    id: "4",
    title: "Intelligence artificielle en formation : cadre réglementaire européen",
    description: "L'AI Act européen entre en vigueur progressivement en 2026. Les organismes de formation utilisant des outils d'IA pour évaluer les apprenants doivent se conformer aux obligations de transparence et d'explication des algorithmes.",
    source: "Éditions Tissot",
    date: "01 fév. 2026",
    category: "Numérique",
    url: "https://www.editions-tissot.fr",
  },
  {
    id: "5",
    title: "Titre professionnel : les nouvelles certifications accessibles par la VAE",
    description: "France Compétences publie la liste des titres professionnels révisés pour 2026. Parmi les nouveautés : technicien en cybersécurité, coordinateur de transition écologique, et formateur professionnel d'adultes (FPA) mis à jour.",
    source: "Ministère du Travail",
    date: "28 jan. 2026",
    category: "Réglementation",
    url: "https://www.travail.gouv.fr",
  },
  {
    id: "6",
    title: "E-learning synchrone : une montée en puissance confirmée par l'ANFH",
    description: "L'Association Nationale pour la Formation permanente du personnel Hospitalier confirme que 42% des heures de formation dispensées en 2025 l'ont été à distance, contre 29% en 2023. Le format hybride devient la norme.",
    source: "ANFH",
    date: "22 jan. 2026",
    category: "Numérique",
    url: "https://www.anfh.fr",
  },
  {
    id: "7",
    title: "Alternance : record historique avec 950 000 contrats signés en 2025",
    description: "La France franchit le cap des 950 000 contrats d'apprentissage signés en 2025, soit une hausse de 8% par rapport à 2024. Les secteurs du BTP, de l'industrie verte et du numérique tirent cette croissance.",
    source: "DARES",
    date: "18 jan. 2026",
    category: "Emploi",
    url: "https://www.dares.travail.gouv.fr",
  },
  {
    id: "8",
    title: "Bilan pédagogique et financier (BPF) 2025 : rappel des obligations déclaratives",
    description: "Rappel : le dépôt du Bilan Pédagogique et Financier est obligatoire avant le 30 avril 2026 pour les organismes de formation ayant dispensé des actions en 2025. Le formulaire Cerfa est disponible sur la plateforme Difor.",
    source: "Difor / DREETS",
    date: "15 jan. 2026",
    category: "Réglementation",
    url: "https://www.difor.travail.gouv.fr",
  },
];

export default function VeillePage() {
  const { toast } = useToast();
  const [articles, setArticles] = useState<Article[]>(SEED_ARTICLES);
  const [activeCategory, setActiveCategory] = useState("Tout");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", source: "", date: "", category: "Actualité", url: "" });

  const filtered = articles.filter((a) => {
    const matchCat = activeCategory === "Tout" || a.category === activeCategory;
    const matchSearch = search === "" || `${a.title} ${a.description} ${a.source}`.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleSearch = () => setSearch(searchInput);

  const handleAdd = () => {
    if (!form.title.trim()) {
      toast({ title: "Erreur", description: "Le titre est requis.", variant: "destructive" });
      return;
    }
    const newArticle: Article = {
      id: Date.now().toString(),
      ...form,
      date: form.date || new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }),
      custom: true,
    };
    setArticles((prev) => [newArticle, ...prev]);
    setForm({ title: "", description: "", source: "", date: "", category: "Actualité", url: "" });
    setAddOpen(false);
    toast({ title: "Article ajouté", description: `"${newArticle.title}" a été ajouté.` });
  };

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-4">
        <Link href="/admin" className="text-[#3DB5C5] hover:underline">Accueil</Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500">Veille</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-gray-700 text-xl font-bold">La Veille / Tous Les Articles</h1>
        <button
          onClick={() => setAddOpen(true)}
          className="text-white px-4 py-2 rounded-lg text-sm font-medium uppercase flex items-center gap-1"
          style={{ background: "#3DB5C5" }}
        >
          <Plus className="h-4 w-4" />
          Ajouter un article
        </button>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              activeCategory === cat
                ? "text-white border-transparent"
                : "border-gray-300 text-gray-600 hover:border-[#3DB5C5] hover:text-[#3DB5C5]"
            }`}
            style={activeCategory === cat ? { background: "#3DB5C5" } : {}}
          >
            {cat}
          </button>
        ))}
        <div className="flex gap-2 ml-auto">
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:border-[#3DB5C5]"
          />
          <button
            onClick={handleSearch}
            className="text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1"
            style={{ background: "#3DB5C5" }}
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Article grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">Aucun article trouvé</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((article) => (
            <div key={article.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow flex flex-col">
              {/* Teal accent bar */}
              <div className="h-1 w-full" style={{ background: "#3DB5C5" }} />
              <div className="p-5 flex flex-col flex-1">
                {/* Category + Date */}
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                    style={{ background: "#3DB5C5" }}
                  >
                    {article.category}
                  </span>
                  <span className="text-xs text-gray-400">{article.date}</span>
                </div>
                {/* Title */}
                <h3 className="font-bold text-gray-800 text-sm mb-2 leading-snug line-clamp-2">
                  {article.title}
                </h3>
                {/* Description */}
                <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 flex-1">
                  {article.description}
                </p>
                {/* Footer */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400 font-medium">{article.source}</span>
                  {article.url && (
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#3DB5C5] hover:underline flex items-center gap-1"
                    >
                      Lire <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter un article de veille</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Titre <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
                placeholder="Titre de l'article"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5] resize-none"
                rows={3}
                placeholder="Résumé de l'article..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Source</label>
                <input
                  type="text"
                  value={form.source}
                  onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
                  placeholder="Ex: Centre Inffo"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Catégorie</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
                >
                  {CATEGORIES.filter((c) => c !== "Tout").map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">URL (optionnel)</label>
              <input
                type="url"
                value={form.url}
                onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
                placeholder="https://..."
              />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setAddOpen(false)} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm">
              Annuler
            </button>
            <button onClick={handleAdd} className="text-white px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "#3DB5C5" }}>
              Ajouter
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
