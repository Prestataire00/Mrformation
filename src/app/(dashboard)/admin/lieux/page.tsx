"use client";

import { useEffect, useState } from "react";
import { Plus, Search, MapPin, Pencil, Trash2, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Venue {
  id: string;
  name: string;
  address: string;
}

const STORAGE_KEY = "lms_venues_v2";

// Default seed data from old CRM
const SEED_VENUES: Omit<Venue, "id">[] = [
  { name: "Marseille", address: "24/26 Boulevard Gay Lussac 13014 Marseille" },
  { name: "UNICIL - 13006", address: "UNICIL, 11 RUE ARMENY 13006 MARSEILLE" },
  { name: "RESIDENCE PIN ET SOLEIL", address: "AV DU CALVAIRE 83710 PIGNANS" },
  { name: "S.E.M. SOCIETE DES EAUX DE MARSEILLE", address: "78 BD LAZER 13010 Marseille" },
  { name: "INTER POWER INTERIM", address: "5 RUE CHARLES DUCHESNE, 13290 Aix-en-provence" },
  { name: "RESIDENCE SAINT-CLAIR", address: "580 Chem. de Saint-Clair 83640 SAINT-ZACHARIE" },
  { name: "LA CHRYSALIDE DE MARTIGUES", address: "1 Impasse ds cultes 13800 Istres" },
  { name: "PAYS D'AIX HABITAT METROPOLE", address: "L'OURMIN, 9 RUE DU CHATEAU DE L'HORLOGE 13100 AIX-EN-PROVENCE" },
  { name: "KORIAN LA LOUBIERE - 13013", address: "KORIAN LA LOUBIERE, TRA DE LA BAUME LOUBIERE 13013 MARSEILLE" },
  { name: "CPAM DU VAR", address: "2 RUE EMILE OLLIVIER 83000 TOULON" },
  { name: "MAISON DE RETRAITE PUBLIQUE BOUEN SEREN", address: "2, Chemin Aloïsi 83830 BARGEMON" },
  { name: "CENTRE HOSPITALIER LOUIS BRUNET D'ALLAUCH", address: "CHEMIN DES MILLE ECUS 13190 ALLAUCH" },
  { name: "EHPAD XAVIER MARIN", address: "Rue Gabriel Philis 83570 COTIGNAC" },
  { name: "CENTRE COMMUNAL D'ACTION SOCIALE (CCAS) - SERVIAN", address: "70 GRAND-RUE 34290 SERVIAN" },
  { name: "UNION GEST ETS CAIS ASS MAL PACA CORSE (UGECAM)", address: "BP84 42 BOULEVARD DE LA GAYE 13009 MARSEILLE" },
  { name: "CENTRE COMMUNAL D'ACTION SOCIALE (CCAS) VEYNES", address: "AVENUE OLYMPE DE GOUGES 05400 VEYNES" },
  { name: "MAISON DE RETRAITE PUBLIQUE EHPAD", address: "40 ET 42 AVENUE DES CARDALINES 13800 ISTRES" },
  { name: "RESIDENCE LE PARDIGAOU", address: "71 RUE PAUL GUIOL 83220 Le pradet" },
  { name: "WTC Marseille Provence", address: "2 Rue Henri Barbusse, 13001 Marseille" },
  { name: "MAISON DE RETRAITE PASTEUR DE CARCES", address: "AVENUE GIRAUD FLORENTIN, 83570 CARCES" },
  { name: "CHRYSALIDE 2", address: "Complexe des Heures claires 10 chemin du Mas des 4 vents 13800 ISTRES" },
  { name: "ENTREPRISE LANTEAUME", address: "601 RUE SAINT PIERRE 13012 MARSEILLE" },
  { name: "EHPAD SAINT FRANCOIS", address: "28 rue Saint Honorat 83510 LORGUES" },
  { name: "Centre Médical Rhône Azur", address: "2 Avenue Adrien Daurelle 05105 BRIANÇON" },
  { name: "HABITAT DU GARD", address: "92 B AVENUE JEAN-JAURES 30900 NIMES" },
  { name: "TREFLE INTERIM", address: "2 AVENUE ANDRE ROUSSIN 13016 MARSEILLE" },
  { name: "13 HABITAT", address: "80 RUE ALBE 13004 Marseille" },
  { name: "Côte d'azur habitat", address: "53 Bd René Cassin, 06200 Nice" },
  { name: "CHRYSALIDE ENTRESSEN", address: "28 chemin du mas d'Amphoux 13118 ENTRESSEN" },
  { name: "13 Habitat Aix", address: "180 rue René Descartes, le Millenium, Bât. C, 13080 Aix en Provence" },
  { name: "GRAND DELTA HABITAT", address: "3 RUE MARTIN LUTHER KING 84000 AVIGNON" },
  { name: "HABITAT DU GARD - EP", address: "HABITAT DU GARD – 14 rue Duprato 30900 NIMES" },
  { name: "Philae Associés", address: "57 BOULEVARD GILLET, 13012 MARSEILLE" },
  { name: "EGLANTINE", address: "2 Rue breteuil, 13006 Marseille" },
  { name: "LA MAISON PERCHEE", address: "59 AVENUE DE LA REPUBLIQUE, 75011 PARIS" },
  { name: "EHPAD LES CLÉMATITES", address: "209 Bd de Coua de Can, 83550 Vidauban" },
  { name: "RÉSIDENCE EHPAD LES TAMARIS", address: "406 Av. la Coupiane, 83160 La Valette-du-Var" },
  { name: "MGEN ACTION SANITAIRE ET SOCIALE", address: "EHPAD MGEN Caire-Val Site Jules Bouquet chemin Départemental 66 13840 ROGNES" },
  { name: "EHPAD Clerc de Molières", address: "" },
  { name: "Etablissement Cantoloup Lavallée", address: "38 Av. du Général de Gaulle, 32380 Saint-Clar" },
  { name: "Chrysalide Martigues Foyer de l'Adret", address: "Foyer de l'Adret boulevard des capucins 13500 MARTIGUES" },
  { name: "Chrysalide port de bouc", address: "Esat des Etangs 64 bd de l'engrenier 13110 PORT DE BOUC" },
  { name: "LES CHARMETTES", address: "60 AVENUE ROBERT FORRER 83140 SIX-FOURS-LES-PLAGES" },
  { name: "Clinique SMR \"Saint Christophe\"", address: "21, allée Aimé Giral – Perpignan" },
  { name: "SOVEBAT", address: "19 cours Alexandre Borodine 26000 VALENCE" },
  { name: "CHALENCON Alexandre - SOVEBAT", address: "19 cours Alexandre Borodine 26000 VALENCE" },
  { name: "EHPAD LES RESIDENCES DE LA MOSANE", address: "2 Rue DU CDT BOURGES, DONCHERY" },
  { name: "EHPAD SAINTE ELISABETH", address: "2 chemin des stades 63210 Rochefort-Montagne" },
  { name: "EHPAD Sainte-Elisabeth", address: "Le Marchédial, 63210 Rochefort-Montagne" },
  { name: "C3V FORMATION", address: "24/26 Bd Gay Lussac 13014 Marseille" },
  { name: "EHPAD DE GAYETTE", address: "50, Route de Gayette – 03150 MONTOLDRE" },
  { name: "MAISON DE RETRAITE DE GAYETTE", address: "Hospice de Gayette, Montoldre" },
  { name: "EHPAD Jeanne Danjou", address: "1 Avenue Salvador Dali 66140 Canet en Roussillon" },
  { name: "EHPAD AU BOIS JOLI", address: "1 Rue DU REGARD 91350 GRIGNY" },
  { name: "EPSMS « Au Bocage Hayland »", address: "9 Avenue Ernest Corbin 50320 LA HAYE-PESNEL" },
  { name: "NOVIA", address: "24/26 Boulevard gay Lussac 13014 Marseille" },
];

function loadVenues(): Venue[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    // First load: seed with default data
    const seeded = SEED_VENUES.map((v, i) => ({ ...v, id: `seed-${i}` }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  } catch {
    return [];
  }
}

function saveVenues(venues: Venue[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(venues));
}

export default function LieuxPage() {
  const { toast } = useToast();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [search, setSearch] = useState("");
  const [editItem, setEditItem] = useState<Venue | null>(null);

  // New lieu form (inline, matching screenshot)
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  useEffect(() => {
    setVenues(loadVenues());
  }, []);

  const filtered = venues.filter((v) =>
    `${v.name} ${v.address}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = () => {
    if (!newName.trim()) {
      toast({ title: "Nom requis", description: "Veuillez saisir le nom du lieu.", variant: "destructive" });
      return;
    }
    if (!newAddress.trim()) {
      toast({ title: "Adresse requise", description: "Veuillez saisir l'adresse.", variant: "destructive" });
      return;
    }
    const newVenue: Venue = { id: Date.now().toString(), name: newName.trim(), address: newAddress.trim() };
    const updated = [...venues, newVenue];
    setVenues(updated);
    saveVenues(updated);
    setNewName("");
    setNewAddress("");
    setShowNewForm(false);
    toast({ title: "Lieu ajouté", description: `"${newVenue.name}" a été ajouté.` });
  };

  const handleSaveEdit = () => {
    if (!editItem) return;
    if (!editItem.name.trim()) {
      toast({ title: "Erreur", description: "Le nom est requis.", variant: "destructive" });
      return;
    }
    const updated = venues.map((v) => (v.id === editItem.id ? editItem : v));
    setVenues(updated);
    saveVenues(updated);
    setEditItem(null);
    toast({ title: "Modifié", description: "Le lieu a été mis à jour." });
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Supprimer "${name}" ?`)) return;
    const updated = venues.filter((v) => v.id !== id);
    setVenues(updated);
    saveVenues(updated);
    toast({ title: "Supprimé", description: "Le lieu a été supprimé." });
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lieux de Formations</h1>
          <p className="text-sm text-gray-500 mt-1">
            {venues.length} lieu{venues.length !== 1 ? "x" : ""} enregistré{venues.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="text-white px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 hover:opacity-90 transition-all"
          style={{ background: "#3DB5C5" }}
        >
          <Plus className="h-4 w-4" />
          Ajouter un lieu ou une salle
        </button>
      </div>

      {/* New Lieu Form (inline, matching screenshot) */}
      {showNewForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-800 uppercase text-sm tracking-wide">Nouveau Lieu</h2>
            <button onClick={() => setShowNewForm(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm text-gray-600 font-medium">
                Nom du lieu<span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="écrivez le nom du lieu"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm text-gray-600 font-medium">
                Adresse<span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="écrivez l'adresse (y compris la ville)"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent"
              />
            </div>

            <button
              onClick={handleAdd}
              className="text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-all"
              style={{ background: "#3DB5C5" }}
            >
              Ajouter
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Rechercher un lieu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {venues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <MapPin className="h-12 w-12 text-gray-200 mb-4" />
            <p className="text-gray-500 font-medium">Aucun lieu enregistré</p>
            <p className="text-gray-400 text-sm mt-1 mb-5">Ajoutez vos salles et centres de formation.</p>
            <button
              onClick={() => setShowNewForm(true)}
              className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
              style={{ background: "#3DB5C5" }}
            >
              <Plus className="h-4 w-4" />
              Ajouter un lieu
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Nom du lieu</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Adresse</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-gray-400">
                    Aucun lieu correspondant à votre recherche
                  </td>
                </tr>
              ) : (
                filtered.map((venue) => (
                  <tr key={venue.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{venue.name}</td>
                    <td className="px-4 py-3 text-gray-600">{venue.address || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setEditItem({ ...venue })}
                          className="text-[#3DB5C5] hover:underline text-xs font-medium flex items-center gap-1"
                        >
                          <Pencil className="h-3 w-3" /> Modifier
                        </button>
                        <button
                          onClick={() => handleDelete(venue.id, venue.name)}
                          className="text-red-500 hover:underline text-xs flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" /> Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier le lieu</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-4 py-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Nom du lieu<span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editItem.name}
                  onChange={(e) => setEditItem((p) => p ? { ...p, name: e.target.value } : p)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Adresse</label>
                <input
                  type="text"
                  value={editItem.address}
                  onChange={(e) => setEditItem((p) => p ? { ...p, address: e.target.value } : p)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
                  placeholder="Adresse complète (y compris la ville)"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setEditItem(null)} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm">
              Annuler
            </button>
            <button onClick={handleSaveEdit} className="text-white px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "#3DB5C5" }}>
              Enregistrer
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
