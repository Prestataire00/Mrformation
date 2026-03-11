"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  Users,
  TrendingUp,
  Briefcase,
  ChevronLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { CrmProspect, CrmTask } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommercialCard {
  userId: string;
  name: string;
  email: string;
  prospectsByStatus: Record<string, number>;
  totalProspects: number;
  pipelineValue: number;
  conversionRate: number;
  pendingTasks: number;
}

type Period = "month" | "quarter" | "year";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function getPeriodStart(period: Period): string {
  const now = new Date();
  if (period === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
  if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return new Date(now.getFullYear(), q * 3, 1).toISOString();
  }
  return new Date(now.getFullYear(), 0, 1).toISOString();
}

function formatEUR(amount: number): string {
  return amount.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
}

const STATUS_LABELS: Record<string, string> = {
  new: "Lead",
  contacted: "Contacté",
  qualified: "Qualifié",
  proposal: "Proposition",
  won: "Gagné",
  lost: "Refus",
  dormant: "Dormant",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-cyan-100 text-cyan-700",
  contacted: "bg-orange-100 text-orange-700",
  qualified: "bg-purple-100 text-purple-700",
  proposal: "bg-blue-100 text-blue-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
  dormant: "bg-gray-100 text-gray-600",
};

// ─── Composant ────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const supabase = createClient();
  const router = useRouter();
  const { entityId } = useEntity();

  const [period, setPeriod] = useState<Period>("year");
  const [cards, setCards] = useState<CommercialCard[]>([]);
  const [unassigned, setUnassigned] = useState<CrmProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalProspects, setTotalProspects] = useState(0);
  const [totalPipeline, setTotalPipeline] = useState(0);

  useEffect(() => {
    if (!entityId) return;
    fetchPortfolio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, period]);

  async function fetchPortfolio() {
    setLoading(true);
    try {
      const periodStart = getPeriodStart(period);

      // 1. Fetch all prospects for the period
      const { data: prospects } = await supabase
        .from("crm_prospects")
        .select("*")
        .eq("entity_id", entityId)
        .gte("created_at", periodStart)
        .order("created_at", { ascending: false });

      if (!prospects) { setLoading(false); return; }

      // 2. Fetch quotes to compute pipeline value
      const { data: quotes } = await supabase
        .from("crm_quotes")
        .select("prospect_id, amount, status")
        .eq("entity_id", entityId)
        .gte("created_at", periodStart);

      // Map quote amounts by prospect_id
      const quotesByProspect: Record<string, number> = {};
      for (const q of quotes ?? []) {
        if (q.prospect_id && q.amount) {
          quotesByProspect[q.prospect_id] = (quotesByProspect[q.prospect_id] ?? 0) + q.amount;
        }
      }

      // 3. Fetch tasks for assigned users
      const assignedUserIds = [...new Set(prospects.filter(p => p.assigned_to).map(p => p.assigned_to as string))];
      let tasksByUser: Record<string, number> = {};
      if (assignedUserIds.length > 0) {
        const { data: tasks } = await supabase
          .from("crm_tasks")
          .select("assigned_to, status")
          .eq("entity_id", entityId)
          .in("assigned_to", assignedUserIds)
          .in("status", ["pending", "in_progress"]);
        for (const t of tasks ?? []) {
          if (t.assigned_to) {
            tasksByUser[t.assigned_to] = (tasksByUser[t.assigned_to] ?? 0) + 1;
          }
        }
      }

      // 4. Fetch profile names for assigned users
      let profileMap: Record<string, { name: string; email: string }> = {};
      if (assignedUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", assignedUserIds);
        for (const p of profiles ?? []) {
          profileMap[p.id] = { name: p.full_name ?? p.email ?? p.id, email: p.email ?? "" };
        }
      }

      // 5. Group prospects by assigned_to
      const grouped: Record<string, CrmProspect[]> = {};
      const unassignedList: CrmProspect[] = [];

      for (const p of prospects) {
        if (!p.assigned_to) {
          unassignedList.push(p as CrmProspect);
        } else {
          if (!grouped[p.assigned_to]) grouped[p.assigned_to] = [];
          grouped[p.assigned_to].push(p as CrmProspect);
        }
      }

      // 6. Build cards
      const cardList: CommercialCard[] = Object.entries(grouped).map(([userId, prosList]) => {
        const byStatus: Record<string, number> = {};
        let pipelineValue = 0;
        for (const p of prosList) {
          byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
          pipelineValue += quotesByProspect[p.id] ?? 0;
        }
        const won = byStatus["won"] ?? 0;
        const total = prosList.length;
        const conversionRate = total > 0 ? Math.round((won / total) * 100) : 0;
        const profile = profileMap[userId];
        return {
          userId,
          name: profile?.name ?? userId,
          email: profile?.email ?? "",
          prospectsByStatus: byStatus,
          totalProspects: total,
          pipelineValue,
          conversionRate,
          pendingTasks: tasksByUser[userId] ?? 0,
        };
      });

      // Sort by total prospects descending
      cardList.sort((a, b) => b.totalProspects - a.totalProspects);

      const allPipeline = cardList.reduce((sum, c) => sum + c.pipelineValue, 0);
      setTotalPipeline(allPipeline);
      setTotalProspects(prospects.length);
      setCards(cardList);
      setUnassigned(unassignedList);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin/crm/prospects" className="hover:text-gray-700 flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" />
          Kanban
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">Portefeuille</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Portefeuille commercial</h1>
          <p className="text-sm text-gray-500 mt-1">Répartition des prospects par commercial</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Ce mois</SelectItem>
            <SelectItem value="quarter">Ce trimestre</SelectItem>
            <SelectItem value="year">Cette année</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Users className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Commerciaux actifs</p>
            <p className="text-xl font-bold text-gray-900">{cards.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="p-2 bg-purple-50 rounded-lg">
            <Briefcase className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total prospects</p>
            <p className="text-xl font-bold text-gray-900">{totalProspects}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="p-2 bg-green-50 rounded-lg">
            <TrendingUp className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Valeur pipeline totale</p>
            <p className="text-xl font-bold text-gray-900">{formatEUR(totalPipeline)}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          {/* Commercial cards */}
          {cards.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              Aucun prospect assigné sur cette période
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {cards.map((card) => (
                <CommercialCardComponent
                  key={card.userId}
                  card={card}
                  onClick={() => router.push(`/admin/crm/prospects?commercial=${card.userId}`)}
                />
              ))}
            </div>
          )}

          {/* Unassigned section */}
          {unassigned.length > 0 && (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <h2 className="font-semibold text-gray-700">
                  Non assignés ({unassigned.length})
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {unassigned.map((p) => (
                  <Link
                    key={p.id}
                    href={`/admin/crm/prospects/${p.id}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
                  >
                    <span className="font-medium">{p.company_name}</span>
                    <Badge
                      className={`text-xs px-1.5 py-0 ${STATUS_COLORS[p.status] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {STATUS_LABELS[p.status] ?? p.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Commercial Card ─────────────────────────────────────────────────────────

function CommercialCardComponent({
  card,
  onClick,
}: {
  card: CommercialCard;
  onClick: () => void;
}) {
  const initials = getInitials(card.name);

  const statusOrder: string[] = ["won", "proposal", "qualified", "contacted", "new", "dormant", "lost"];

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-sm shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{card.name}</p>
          <p className="text-xs text-gray-400 truncate">{card.email}</p>
        </div>
        <div className="ml-auto text-right shrink-0">
          <p className="text-lg font-bold text-gray-900">{card.totalProspects}</p>
          <p className="text-xs text-gray-400">prospects</p>
        </div>
      </div>

      {/* Status breakdown */}
      <div className="flex flex-wrap gap-1.5">
        {statusOrder
          .filter((s) => (card.prospectsByStatus[s] ?? 0) > 0)
          .map((s) => (
            <span
              key={s}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s] ?? "bg-gray-100 text-gray-600"}`}
            >
              {STATUS_LABELS[s]}
              <span className="font-bold">{card.prospectsByStatus[s]}</span>
            </span>
          ))}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-50">
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900">{formatEUR(card.pipelineValue)}</p>
          <p className="text-xs text-gray-400">Pipeline</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-green-600">{card.conversionRate}%</p>
          <p className="text-xs text-gray-400">Conversion</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1">
            <Clock className="h-3.5 w-3.5 text-orange-500" />
            <p className="text-sm font-semibold text-gray-900">{card.pendingTasks}</p>
          </div>
          <p className="text-xs text-gray-400">Tâches</p>
        </div>
      </div>
    </button>
  );
}
