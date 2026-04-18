"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal, Clock, PenLine, ClipboardList, FileText, Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Button } from "@/components/ui/button";
import {
  AdminAlerts,
  AdminOverdueTasks,
  AdminKPICards,
  AdminRecentActivity,
  AdminSessionCalendar,
  AdminUpcomingSessions,
  AdminQuickAccess,
  AdminHero,
  AdminAttentionPanel,
  AdminDashboardSettings,
} from "./_components";
import {
  DEFAULT_WIDGET_CONFIG,
  DEFAULT_KPI_CONFIG,
} from "./_components/constants";
import type {
  UpcomingSession,
  MissingReportAlert,
  OverdueTask,
  RecentActivity,
  CalendarSession,
  WidgetConfigItem,
  KpiConfigItem,
} from "./_components/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// ─── Composant principal ─────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const supabase = createClient();
  const { entityId } = useEntity();
  const isSuperAdmin = getCookie("user_role") === "super_admin";

  const year = new Date().getFullYear();
  const [loading,        setLoading]        = useState(true);
  const [adminFirstName, setAdminFirstName] = useState("");

  // KPIs
  const [activeClients,  setActiveClients]  = useState(0);
  const [newLearners,    setNewLearners]    = useState(0);
  const [ongoingSessions,setOngoingSessions]= useState(0);
  const [doneSessions,   setDoneSessions]   = useState(0);
  const [caRealise,      setCaRealise]      = useState(0);
  const [caPrevisionnel, setCaPrevisionnel] = useState(0);

  // Alertes bilans manquants + tâches en retard
  const [alerts,         setAlerts]         = useState<MissingReportAlert[]>([]);
  const [overdueTasks,   setOverdueTasks]   = useState<OverdueTask[]>([]);

  // Activités récentes
  const [activities,     setActivities]     = useState<RecentActivity[]>([]);

  // Prochaines sessions
  const [upcoming,       setUpcoming]       = useState<UpcomingSession[]>([]);

  // Calendar
  const [calMonth,       setCalMonth]       = useState(new Date().getMonth());     // 0-11
  const [calYear,        setCalYear]        = useState(new Date().getFullYear());
  const [calSessions,    setCalSessions]    = useState<CalendarSession[]>([]);
  const [calendarView,   setCalendarView]   = useState<"month" | "week" | "day">("month");
  const [calSelectedDay, setCalSelectedDay] = useState<string>(new Date().toISOString().slice(0, 10));

  // Dashboard settings
  const [dashSettingsOpen, setDashSettingsOpen] = useState(false);
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfigItem[]>(DEFAULT_WIDGET_CONFIG);
  const [kpiConfig, setKpiConfig] = useState<KpiConfigItem[]>(DEFAULT_KPI_CONFIG);

  // Extra KPIs
  const [tauxCompletion,          setTauxCompletion]          = useState(0);
  const [nbQuestionnaireResponses, setNbQuestionnaireResponses] = useState(0);

  // ── Charger les configs depuis localStorage ────────────────────────────────
  useEffect(() => {
    if (!entityId) return;
    try {
      const wKey = `dashboard_widget_config_${entityId}`;
      const kKey = `dashboard_kpi_config_${entityId}`;
      const wStored = localStorage.getItem(wKey);
      const kStored = localStorage.getItem(kKey);
      if (wStored) {
        const parsed = JSON.parse(wStored) as WidgetConfigItem[];
        // Merge with defaults to handle new widgets added later
        const merged = DEFAULT_WIDGET_CONFIG.map((def) => {
          const found = parsed.find((p) => p.id === def.id);
          return found ?? def;
        });
        merged.sort((a, b) => a.order - b.order);
        setWidgetConfig(merged);
      }
      if (kStored) {
        const parsed = JSON.parse(kStored) as KpiConfigItem[];
        const merged = DEFAULT_KPI_CONFIG.map((def) => {
          const found = parsed.find((p) => p.id === def.id);
          return found ?? def;
        });
        merged.sort((a, b) => a.order - b.order);
        setKpiConfig(merged);
      }
    } catch { /* ignore */ }
  }, [entityId]);

  const saveWidgetConfig = (config: WidgetConfigItem[]) => {
    setWidgetConfig(config);
    if (entityId) localStorage.setItem(`dashboard_widget_config_${entityId}`, JSON.stringify(config));
  };

  const saveKpiConfig = (config: KpiConfigItem[]) => {
    setKpiConfig(config);
    if (entityId) localStorage.setItem(`dashboard_kpi_config_${entityId}`, JSON.stringify(config));
  };

  const toggleWidget = (id: string) => {
    saveWidgetConfig(widgetConfig.map((w) => w.id === id ? { ...w, visible: !w.visible } : w));
  };

  const toggleKpi = (id: string) => {
    saveKpiConfig(kpiConfig.map((k) => k.id === id ? { ...k, visible: !k.visible } : k));
  };

  const moveWidget = (id: string, dir: "up" | "down") => {
    const arr = [...widgetConfig].sort((a, b) => a.order - b.order);
    const idx = arr.findIndex((w) => w.id === id);
    if (dir === "up" && idx > 0) [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    if (dir === "down" && idx < arr.length - 1) [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    saveWidgetConfig(arr.map((w, i) => ({ ...w, order: i })));
  };

  const moveKpi = (id: string, dir: "up" | "down") => {
    const arr = [...kpiConfig].sort((a, b) => a.order - b.order);
    const idx = arr.findIndex((k) => k.id === id);
    if (dir === "up" && idx > 0) [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    if (dir === "down" && idx < arr.length - 1) [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    saveKpiConfig(arr.map((k, i) => ({ ...k, order: i })));
  };

  const isWidgetVisible = (id: string) => widgetConfig.find((w) => w.id === id)?.visible ?? true;

  // ── fetch quand entity ou year change ─────────────────────────────────────
  useEffect(() => {
    if (entityId === undefined) return;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  // ── orchestrateur ─────────────────────────────────────────────────────────
  async function fetchAll() {
    setLoading(true);
    // Fetch admin name
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("first_name").eq("id", user.id).single();
      if (profile?.first_name) setAdminFirstName(profile.first_name);
    }
    await Promise.all([
      fetchKPIs(),
      fetchAlerts(),
      fetchOverdueTasks(),
      fetchActivities(),
      fetchUpcoming(),
      fetchExtraKPIs(),
    ]);
    setLoading(false);
  }

  // ── KPIs supplémentaires ───────────────────────────────────────────────────
  async function fetchExtraKPIs() {
    const yearStart = `${year}-01-01`;
    const yearEnd   = `${year}-12-31`;

    // Taux de complétion = (completed enrollments / total enrollments) * 100 this year
    let enrollQ = supabase
      .from("enrollments")
      .select("status")
      .gte("enrolled_at", yearStart)
      .lte("enrolled_at", yearEnd + "T23:59:59");
    if (entityId) {
      // enrollments don't have entity_id directly, we join via sessions
      // Simplified: count from sessions this year
      const { data: sessions } = await supabase
        .from("sessions")
        .select("id")
        .eq("entity_id", entityId)
        .gte("start_date", yearStart)
        .lte("start_date", yearEnd + "T23:59:59");
      if (sessions && sessions.length > 0) {
        const sessionIds = sessions.map((s) => s.id);
        const { data: enrolls } = await supabase
          .from("enrollments")
          .select("status")
          .in("session_id", sessionIds);
        if (enrolls && enrolls.length > 0) {
          const completed = enrolls.filter((e) => e.status === "completed").length;
          setTauxCompletion(Math.round((completed / enrolls.length) * 100));
        }
      }
    } else {
      enrollQ = enrollQ;
      const { data: enrolls } = await enrollQ;
      if (enrolls && enrolls.length > 0) {
        const completed = enrolls.filter((e) => e.status === "completed").length;
        setTauxCompletion(Math.round((completed / enrolls.length) * 100));
      }
    }

    // Réponses questionnaires ce mois
    const monthStart = new Date(year, new Date().getMonth(), 1).toISOString();
    const monthEnd   = new Date(year, new Date().getMonth() + 1, 0, 23, 59, 59).toISOString();
    const qrQ = supabase
      .from("questionnaire_responses")
      .select("id", { count: "exact", head: true })
      .gte("submitted_at", monthStart)
      .lte("submitted_at", monthEnd);
    const { count: qrCount } = await qrQ;
    setNbQuestionnaireResponses(qrCount ?? 0);
  }

  // ── Helper : extraire le montant HT depuis le champ notes d'un prospect ──
  function extractAmount(notes: string | null): number {
    if (!notes) return 0;
    const match = notes.match(/Montant HT[^:]*:\s*([\d\s.,]+)/);
    if (!match) return 0;
    return parseFloat(match[1].replace(/\s/g, "").replace(",", ".")) || 0;
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  async function fetchKPIs() {
    const yearStart = `${year}-01-01`;
    const yearEnd   = `${year}-12-31`;

    // Clients Actifs
    let clientsQ = supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");
    if (entityId) clientsQ = clientsQ.eq("entity_id", entityId);

    // Nouveaux Apprenants = apprenants créés dans l'année
    let learnersQ = supabase
      .from("learners")
      .select("id", { count: "exact", head: true })
      .gte("created_at", yearStart)
      .lte("created_at", yearEnd + "T23:59:59");
    if (entityId) learnersQ = learnersQ.eq("entity_id", entityId);

    // Formations En Cours
    let ongoingQ = supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("status", "in_progress");
    if (entityId) ongoingQ = ongoingQ.eq("entity_id", entityId);

    // Formations Terminées dans l'année
    let doneQ = supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("end_date", yearStart)
      .lte("end_date", yearEnd + "T23:59:59");
    if (entityId) doneQ = doneQ.eq("entity_id", entityId);

    // Prospects gagnés dans l'année (CA Réalisé = montant HT depuis notes)
    let wonProspectsQ = supabase
      .from("crm_prospects")
      .select("id, notes, created_at")
      .eq("status", "won")
      .gte("created_at", yearStart)
      .lte("created_at", yearEnd + "T23:59:59");
    if (entityId) wonProspectsQ = wonProspectsQ.eq("entity_id", entityId);

    // Prospects en pipeline dans l'année (pour CA prévisionnel)
    let pipelineQ = supabase
      .from("crm_prospects")
      .select("id, notes, status, created_at")
      .in("status", ["contacted", "qualified", "proposal"])
      .gte("created_at", yearStart)
      .lte("created_at", yearEnd + "T23:59:59");
    if (entityId) pipelineQ = pipelineQ.eq("entity_id", entityId);

    // Prospects gagnés année N-1 (tendances)
    const prevYear = year - 1;
    let wonN1Q = supabase
      .from("crm_prospects")
      .select("id, notes")
      .eq("status", "won")
      .gte("created_at", `${prevYear}-01-01`)
      .lte("created_at", `${prevYear}-12-31T23:59:59`);
    if (entityId) wonN1Q = wonN1Q.eq("entity_id", entityId);

    // Prospects gagnés année N-2 (tendances)
    const prevYear2 = year - 2;
    let wonN2Q = supabase
      .from("crm_prospects")
      .select("id, notes")
      .eq("status", "won")
      .gte("created_at", `${prevYear2}-01-01`)
      .lte("created_at", `${prevYear2}-12-31T23:59:59`);
    if (entityId) wonN2Q = wonN2Q.eq("entity_id", entityId);

    const [
      { count: cCount },
      { count: lCount },
      { count: oCount },
      { count: dCount },
      { data: wonData },
      { data: pipelineData },
      { data: wonN1Data },
      { data: wonN2Data },
    ] = await Promise.all([clientsQ, learnersQ, ongoingQ, doneQ, wonProspectsQ, pipelineQ, wonN1Q, wonN2Q]);

    setActiveClients(cCount ?? 0);
    setNewLearners(lCount ?? 0);
    setOngoingSessions(oCount ?? 0);
    setDoneSessions(dCount ?? 0);

    // CA Réalisé = somme des Montant HT des prospects gagnés de l'année
    const totalRealise = (wonData ?? []).reduce(
      (sum, p) => sum + extractAmount(p.notes), 0
    );
    setCaRealise(Math.round(totalRealise));

    // CA historique pour tendances
    const caHistN1 = (wonN1Data ?? []).reduce((sum, p) => sum + extractAmount(p.notes), 0);
    const caHistN2 = (wonN2Data ?? []).reduce((sum, p) => sum + extractAmount(p.notes), 0);

    // Pipeline pondéré par probabilité de conversion
    const pipelineValue = (pipelineData ?? []).reduce((sum, p) => {
      const amount = extractAmount(p.notes);
      const weight = p.status === "proposal" ? 0.6 : p.status === "qualified" ? 0.3 : 0.1;
      return sum + amount * weight;
    }, 0);

    // CA Prévisionnel basé sur les tendances inter-annuelles
    let previsionnel: number;
    if (caHistN1 > 0 && caHistN2 > 0) {
      // 2 ans d'historique : projection par taux de croissance
      const growthRate = (caHistN1 - caHistN2) / caHistN2;
      const trendProjection = Math.round(caHistN1 * (1 + growthRate));
      previsionnel = Math.max(trendProjection, totalRealise + pipelineValue);
    } else if (caHistN1 > 0) {
      // 1 an d'historique : extrapolation au prorata de l'avancement annuel
      const currentMonth = new Date().getMonth() + 1;
      const yearProgress = currentMonth / 12;
      const annualized = yearProgress > 0 ? Math.round(totalRealise / yearProgress) : 0;
      const trendProjection = Math.max(caHistN1, annualized);
      previsionnel = Math.max(trendProjection, totalRealise + pipelineValue);
    } else {
      // Pas d'historique : CA réalisé + pipeline pondéré
      previsionnel = totalRealise + pipelineValue;
    }
    setCaPrevisionnel(Math.round(previsionnel));
  }

  // ── Alertes bilans manquants ───────────────────────────────────────────────
  async function fetchAlerts() {
    // Sessions terminées sans notes de bilan (notes IS NULL)
    let q = supabase
      .from("sessions")
      .select(`
        id,
        title,
        start_date,
        notes,
        trainings ( title )
      `)
      .eq("status", "completed")
      .is("notes", null)
      .order("start_date", { ascending: false })
      .limit(10);
    if (entityId) q = q.eq("entity_id", entityId);

    const { data } = await q;
    if (!data) return;

    const result: MissingReportAlert[] = (data as Record<string, unknown>[]).map((s) => {
      const training = s.trainings as { title?: string } | null;
      return {
        session_id:    s.id as string,
        session_title: s.title as string,
        training_title: training?.title ?? null,
        start_date:    s.start_date as string,
      };
    });
    setAlerts(result);
  }

  // ── Tâches en retard ────────────────────────────────────────────────────
  async function fetchOverdueTasks() {
    const today = new Date().toISOString().slice(0, 10);

    let q = supabase
      .from("crm_tasks")
      .select("id, title, due_date, priority")
      .in("status", ["pending", "in_progress"])
      .lt("due_date", today)
      .order("due_date", { ascending: true })
      .limit(10);
    if (entityId) q = q.eq("entity_id", entityId);

    const { data } = await q;
    setOverdueTasks((data as OverdueTask[]) ?? []);
  }

  // ── Activités récentes ──────────────────────────────────────────────────
  async function fetchActivities() {
    let q = supabase
      .from("activity_log")
      .select("id, action, resource_type, details, created_at, profiles(first_name, last_name, role)")
      .order("created_at", { ascending: false })
      .limit(10);
    if (entityId) q = q.eq("entity_id", entityId);

    const { data } = await q;
    setActivities((data as unknown as RecentActivity[]) ?? []);
  }

  // ── Prochaines sessions ───────────────────────────────────────────────────
  async function fetchUpcoming() {
    const now = new Date().toISOString();

    let q = supabase
      .from("sessions")
      .select(`
        id,
        title,
        start_date,
        end_date,
        mode,
        status,
        location,
        trainings ( title ),
        trainers ( first_name, last_name )
      `)
      .gte("start_date", now)
      .in("status", ["upcoming", "in_progress"])
      .order("start_date", { ascending: true })
      .limit(5);
    if (entityId) q = q.eq("entity_id", entityId);

    const { data } = await q;
    if (!data) return;

    const result: UpcomingSession[] = (data as Record<string, unknown>[]).map((s) => {
      const training = s.trainings as { title?: string } | null;
      const trainer  = s.trainers  as { first_name?: string; last_name?: string } | null;
      return {
        id:                 s.id as string,
        title:              s.title as string,
        start_date:         s.start_date as string,
        end_date:           s.end_date as string,
        mode:               s.mode as string,
        status:             s.status as string,
        location:           s.location as string | null,
        training_title:     training?.title ?? null,
        trainer_first_name: trainer?.first_name ?? null,
        trainer_last_name:  trainer?.last_name ?? null,
      };
    });
    setUpcoming(result);
  }

  // ── Calendar sessions ────────────────────────────────────────────────────
  function getWeekDays(baseDate: string): string[] {
    const d = new Date(baseDate);
    const dow = d.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      return day.toISOString().slice(0, 10);
    });
  }

  async function fetchCalendarSessions(m: number, y: number) {
    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0);
    const start = firstDay.toISOString().slice(0, 10);
    const end = lastDay.toISOString().slice(0, 10);

    let q = supabase
      .from("sessions")
      .select("id, title, start_date, end_date, trainings ( title )")
      .gte("start_date", start)
      .lte("start_date", end + "T23:59:59")
      .order("start_date", { ascending: true });
    if (entityId) q = q.eq("entity_id", entityId);

    const { data } = await q;
    if (!data) { setCalSessions([]); return; }

    const result: CalendarSession[] = (data as Record<string, unknown>[]).map((s) => {
      const training = s.trainings as { title?: string } | null;
      const sd = s.start_date as string;
      const hour = sd.includes("T") ? sd.slice(11, 13) : "09";
      return {
        id: s.id as string,
        title: s.title as string,
        training_title: training?.title ?? null,
        start_date: sd,
        end_date: s.end_date as string,
        start_hour: hour === "00" ? "09" : hour,
      };
    });
    setCalSessions(result);
  }

  async function fetchCalendarSessionsByRange(start: string, end: string) {
    let q = supabase
      .from("sessions")
      .select("id, title, start_date, end_date, trainings ( title )")
      .gte("start_date", start)
      .lte("start_date", end + "T23:59:59")
      .order("start_date", { ascending: true });
    if (entityId) q = q.eq("entity_id", entityId);
    const { data } = await q;
    if (!data) { setCalSessions([]); return; }
    const result: CalendarSession[] = (data as Record<string, unknown>[]).map((s) => {
      const training = s.trainings as { title?: string } | null;
      const sd = s.start_date as string;
      const hour = sd.includes("T") ? sd.slice(11, 13) : "09";
      return {
        id: s.id as string, title: s.title as string,
        training_title: training?.title ?? null,
        start_date: sd, end_date: s.end_date as string,
        start_hour: hour === "00" ? "09" : hour,
      };
    });
    setCalSessions(result);
  }

  useEffect(() => {
    if (entityId === undefined) return;
    if (calendarView === "month") {
      fetchCalendarSessions(calMonth, calYear);
    } else if (calendarView === "week") {
      const weekDays = getWeekDays(calSelectedDay);
      const start = weekDays[0];
      const end = weekDays[6];
      fetchCalendarSessionsByRange(start, end);
    } else {
      fetchCalendarSessionsByRange(calSelectedDay, calSelectedDay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, calMonth, calYear, calendarView, calSelectedDay]);

  const handleResetSettings = () => {
    saveWidgetConfig(DEFAULT_WIDGET_CONFIG);
    saveKpiConfig(DEFAULT_KPI_CONFIG);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6 bg-gray-50 min-h-screen">

      {/* Fil d'Ariane + Paramètres */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          <span className="font-medium text-gray-700">Administration</span>
          <span className="mx-2">/</span>
          <span>Tableau de bord</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDashSettingsOpen(true)}
          className="gap-2 text-xs"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Personnaliser
        </Button>
      </div>

      {/* ═══ HERO BANNER ═══ */}
      <AdminHero
        firstName={adminFirstName || "Admin"}
        ongoingSessions={ongoingSessions}
        attentionCount={overdueTasks.length + alerts.length}
      />

      {/* ═══ KPI Cards ═══ */}
      {isWidgetVisible("kpis") && (
        <AdminKPICards
          loading={loading}
          year={year}
          activeClients={activeClients}
          newLearners={newLearners}
          ongoingSessions={ongoingSessions}
          doneSessions={doneSessions}
          caRealise={caRealise}
          caPrevisionnel={caPrevisionnel}
          tauxCompletion={tauxCompletion}
          nbQuestionnaireResponses={nbQuestionnaireResponses}
          kpiConfig={kpiConfig}
        />
      )}

      {/* ═══ GRILLE 2/3 + 1/3 ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Colonne gauche (2/3) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Actions requises */}
          <AdminAttentionPanel
            items={[
              { id: "overdue-tasks", icon: Clock, label: "Tâches en retard", count: overdueTasks.length, href: "/admin/crm/tasks", severity: "urgent" },
              { id: "missing-reports", icon: FileText, label: "Bilans manquants", count: alerts.length, href: "/admin/reports/qualite", severity: "warning" },
              { id: "overdue-invoices", icon: Receipt, label: "Factures en retard", count: 0, href: "/admin/reports/factures?status=late", severity: "urgent" },
            ]}
          />

          {/* Alertes détaillées */}
          {isWidgetVisible("alerts") && overdueTasks.length > 0 && (
            <AdminOverdueTasks overdueTasks={overdueTasks} />
          )}

          {/* Activités récentes */}
          {isWidgetVisible("activity") && (
            <AdminRecentActivity activities={activities} isSuperAdmin={isSuperAdmin} />
          )}
        </div>

        {/* Colonne droite (1/3) */}
        <div className="space-y-4">
          {/* Sessions à venir (compact) */}
          {isWidgetVisible("upcoming") && (
            <AdminUpcomingSessions upcoming={upcoming} />
          )}

          {/* Calendrier collapsible */}
          {isWidgetVisible("calendar") && (
            <details className="rounded-xl border bg-white">
              <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-gray-700 hover:bg-gray-50">
                Calendrier mensuel
              </summary>
              <div className="p-4 border-t">
                <AdminSessionCalendar
                  calMonth={calMonth}
                  calYear={calYear}
                  calSessions={calSessions}
                  calendarView={calendarView}
                  calSelectedDay={calSelectedDay}
                  setCalMonth={setCalMonth}
                  setCalYear={setCalYear}
                  setCalendarView={setCalendarView}
                  setCalSelectedDay={setCalSelectedDay}
                />
              </div>
            </details>
          )}
        </div>
      </div>

      {/* Dialog Personnaliser le tableau de bord */}
      <AdminDashboardSettings
        open={dashSettingsOpen}
        onOpenChange={setDashSettingsOpen}
        widgetConfig={widgetConfig}
        kpiConfig={kpiConfig}
        onToggleWidget={toggleWidget}
        onToggleKpi={toggleKpi}
        onMoveWidget={moveWidget}
        onMoveKpi={moveKpi}
        onResetAll={handleResetSettings}
      />

    </div>
  );
}
