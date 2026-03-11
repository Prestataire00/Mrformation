"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  Users,
  BookOpen,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Building2,
  FileText,
  Mail,
  TrendingUp,
  BarChart3,
  UserCheck,
  Settings,
  ClipboardList,
  PenLine,
  Euro,
  AlertTriangle,
  Clock,
  Activity,
  UserPlus,
  FolderPlus,
  FileCheck,
  SlidersHorizontal,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  ClipboardCheck,
  MessageSquare,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";

// ─── Types locaux ────────────────────────────────────────────────────────────

interface UpcomingSession {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  mode: string;
  status: string;
  location: string | null;
  training_title: string | null;
  trainer_first_name: string | null;
  trainer_last_name: string | null;
}

interface MissingReportAlert {
  session_id: string;
  session_title: string;
  training_title: string | null;
  start_date: string;
}

interface OverdueTask {
  id: string;
  title: string;
  due_date: string;
  priority: string;
}

interface RecentActivity {
  id: string;
  action: string;
  resource_type: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

interface MonthlyChartData {
  month: string;
  apprenants: number;
  terminees: number;
}

interface CalendarSession {
  id: string;
  title: string;
  training_title: string | null;
  start_date: string;
  end_date: string;
  start_hour: string; // "09", "14", etc.
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const MONTHS_FR = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc",
];

const MONTHS_FR_FULL = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const DAYS_FR = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

const BRAND_LIGHT = "rgba(61, 181, 197, 0.15)";

const QUICK_ACCESS = [
  { title: "Clients",       href: "/admin/clients",          icon: Building2,    color: "#3DB5C5" },
  { title: "Formations",    href: "/admin/trainings",         icon: BookOpen,     color: "#3DB5C5" },
  { title: "Sessions",      href: "/admin/sessions",          icon: Calendar,     color: "#3DB5C5" },
  { title: "Formateurs",    href: "/admin/trainers",          icon: UserCheck,    color: "#3DB5C5" },
  { title: "CRM",           href: "/admin/crm/prospects",     icon: TrendingUp,   color: "#3DB5C5" },
  { title: "Documents",     href: "/admin/documents",         icon: FileText,     color: "#3DB5C5" },
  { title: "Rapports",      href: "/admin/reports",           icon: BarChart3,    color: "#3DB5C5" },
  { title: "Emails",        href: "/admin/emails",            icon: Mail,         color: "#3DB5C5" },
  { title: "Signatures",    href: "/admin/signatures",        icon: PenLine,      color: "#3DB5C5" },
  { title: "Programmes",    href: "/admin/programs",          icon: ClipboardList,color: "#3DB5C5" },
  { title: "Questionnaires",href: "/admin/questionnaires",    icon: Settings,     color: "#3DB5C5" },
  { title: "Tâches CRM",   href: "/admin/crm/tasks",         icon: CheckCircle,  color: "#3DB5C5" },
];

const MODE_LABELS: Record<string, string> = {
  presentiel: "Présentiel",
  distanciel:  "Distanciel",
  hybride:     "Hybride",
};

// ─── Widget & KPI config ──────────────────────────────────────────────────────

interface WidgetConfigItem {
  id: string;
  label: string;
  visible: boolean;
  order: number;
}

interface KpiConfigItem {
  id: string;
  label: string;
  visible: boolean;
  order: number;
}

const DEFAULT_WIDGET_CONFIG: WidgetConfigItem[] = [
  { id: "alerts",      label: "Alertes et notifications",   visible: true,  order: 0 },
  { id: "kpis",        label: "Indicateurs clés (KPIs)",    visible: true,  order: 1 },
  { id: "chart",       label: "Statistiques annuelles",     visible: true,  order: 2 },
  { id: "activity",    label: "Activités récentes",         visible: true,  order: 3 },
  { id: "calendar",    label: "Calendrier des sessions",    visible: true,  order: 4 },
  { id: "upcoming",    label: "Sessions à venir",           visible: true,  order: 5 },
  { id: "quickaccess", label: "Accès rapide",               visible: true,  order: 6 },
];

const DEFAULT_KPI_CONFIG: KpiConfigItem[] = [
  { id: "clients_actifs",         label: "Clients Actifs",             visible: true,  order: 0 },
  { id: "nouveaux_apprenants",    label: "Apprenants Inscrits",        visible: true,  order: 1 },
  { id: "sessions_en_cours",      label: "Formations En Cours",        visible: true,  order: 2 },
  { id: "sessions_terminees",     label: "Formations Terminées",       visible: true,  order: 3 },
  { id: "ca_realise",             label: "CA Réalisé",                 visible: true,  order: 4 },
  { id: "ca_previsionnel",        label: "CA Prévisionnel",            visible: true,  order: 5 },
  { id: "taux_completion",        label: "Taux de Complétion",         visible: false, order: 6 },
  { id: "nb_questionnaires",      label: "Réponses Questionnaires",    visible: false, order: 7 },
];

// ─── Composant principal ─────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const supabase = createClient();
  const { entityId } = useEntity();

  const [year,           setYear]           = useState<number>(new Date().getFullYear());
  const [loading,        setLoading]        = useState(true);

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
  const [showAllAlerts,  setShowAllAlerts]  = useState(false);

  // Activités récentes
  const [activities,     setActivities]     = useState<RecentActivity[]>([]);

  // Chart annuel
  const [chartData,      setChartData]      = useState<MonthlyChartData[]>([]);

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
  }, [entityId, year]);

  // ── orchestrateur ─────────────────────────────────────────────────────────
  async function fetchAll() {
    setLoading(true);
    await Promise.all([
      fetchKPIs(),
      fetchAlerts(),
      fetchOverdueTasks(),
      fetchActivities(),
      fetchChartData(),
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
    let qrQ = supabase
      .from("questionnaire_responses")
      .select("id", { count: "exact", head: true })
      .gte("submitted_at", monthStart)
      .lte("submitted_at", monthEnd);
    const { count: qrCount } = await qrQ;
    setNbQuestionnaireResponses(qrCount ?? 0);
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

    // CA Réalisé = devis acceptés dans l'année
    let caRealiseQ = supabase
      .from("crm_quotes")
      .select("amount")
      .eq("status", "accepted")
      .gte("created_at", yearStart)
      .lte("created_at", yearEnd + "T23:59:59");
    if (entityId) caRealiseQ = caRealiseQ.eq("entity_id", entityId);

    // CA Prévisionnel = devis envoyés (en attente) dans l'année
    let caPrevQ = supabase
      .from("crm_quotes")
      .select("amount")
      .in("status", ["sent", "draft"])
      .gte("created_at", yearStart)
      .lte("created_at", yearEnd + "T23:59:59");
    if (entityId) caPrevQ = caPrevQ.eq("entity_id", entityId);

    const [
      { count: cCount },
      { count: lCount },
      { count: oCount },
      { count: dCount },
      { data: caRealiseData },
      { data: caPrevData },
    ] = await Promise.all([clientsQ, learnersQ, ongoingQ, doneQ, caRealiseQ, caPrevQ]);

    setActiveClients(cCount ?? 0);
    setNewLearners(lCount ?? 0);
    setOngoingSessions(oCount ?? 0);
    setDoneSessions(dCount ?? 0);

    const totalRealise = (caRealiseData ?? []).reduce((sum, q) => sum + (Number(q.amount) || 0), 0);
    const totalPrev = (caPrevData ?? []).reduce((sum, q) => sum + (Number(q.amount) || 0), 0);
    setCaRealise(totalRealise);
    setCaPrevisionnel(totalPrev + totalRealise);
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
      .select("id, action, resource_type, details, created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    if (entityId) q = q.eq("entity_id", entityId);

    const { data } = await q;
    setActivities((data as RecentActivity[]) ?? []);
  }

  // ── Chart annuel (données officielles) ────────────────────────────────────
  // Clé = année, valeur = tableau de 12 mois [apprenants, terminees]
  const OFFICIAL_STATS: Record<number, [number, number][]> = {
    2025: [
      [0, 0],       // Jan
      [0, 0],       // Fév
      [0, 0],       // Mar
      [0, 0],       // Avr
      [1686, 9],    // Mai
      [61, 13],     // Juin
      [33, 3],      // Juil
      [9, 0],       // Aoû
      [76, 14],     // Sep
      [35, 8],      // Oct
      [33, 7],      // Nov
      [9, 5],       // Déc
    ],
    2026: [
      [19, 1],      // Jan
      [26, 2],      // Fév
      [35, 1],      // Mar
      [0, 0],       // Avr
      [0, 0],       // Mai
      [0, 0],       // Juin
      [0, 0],       // Juil
      [0, 0],       // Aoû
      [0, 0],       // Sep
      [0, 0],       // Oct
      [0, 0],       // Nov
      [0, 0],       // Déc
    ],
  };

  function fetchChartData() {
    const stats = OFFICIAL_STATS[year];
    if (stats) {
      setChartData(
        stats.map(([apprenants, terminees], i) => ({
          month: MONTHS_FR[i],
          apprenants,
          terminees,
        }))
      );
    } else {
      // Année sans données officielles → tout à 0
      setChartData(
        MONTHS_FR.map((month) => ({ month, apprenants: 0, terminees: 0 }))
      );
    }
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

  // ── Helpers vue semaine / jour ────────────────────────────────────────────
  function getWeekDays(baseDate: string): string[] {
    const d = new Date(baseDate);
    const dow = d.getDay(); // 0=Sun..6=Sat
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      return day.toISOString().slice(0, 10);
    });
  }

  function getDayLabel(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  }

  const HOUR_SLOTS = Array.from({ length: 12 }, (_, i) => i + 8); // 8h-19h

  function getSessionsForHour(dateStr: string, hour: number): CalendarSession[] {
    return calSessions.filter((s) => {
      if (s.start_date.slice(0, 10) !== dateStr) return false;
      const h = parseInt(s.start_hour, 10);
      return h === hour;
    });
  }

  function calNavWeek(dir: "prev" | "next") {
    const d = new Date(calSelectedDay);
    d.setDate(d.getDate() + (dir === "prev" ? -7 : 7));
    const newDay = d.toISOString().slice(0, 10);
    setCalSelectedDay(newDay);
    setCalMonth(d.getMonth());
    setCalYear(d.getFullYear());
  }

  function calNavDay(dir: "prev" | "next") {
    const d = new Date(calSelectedDay);
    d.setDate(d.getDate() + (dir === "prev" ? -1 : 1));
    const newDay = d.toISOString().slice(0, 10);
    setCalSelectedDay(newDay);
    setCalMonth(d.getMonth());
    setCalYear(d.getFullYear());
  }

  // ── Calendar sessions ────────────────────────────────────────────────────
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

  function calPrev() {
    if (calendarView === "day") { calNavDay("prev"); return; }
    if (calendarView === "week") { calNavWeek("prev"); return; }
    if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1); }
    else setCalMonth((m) => m - 1);
  }
  function calNext() {
    if (calendarView === "day") { calNavDay("next"); return; }
    if (calendarView === "week") { calNavWeek("next"); return; }
    if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1); }
    else setCalMonth((m) => m + 1);
  }
  function calToday() {
    const today = new Date();
    setCalSelectedDay(today.toISOString().slice(0, 10));
    setCalMonth(today.getMonth());
    setCalYear(today.getFullYear());
  }

  // Build calendar grid (6 weeks max, Monday-based)
  function buildCalendarGrid() {
    const firstOfMonth = new Date(calYear, calMonth, 1);
    const lastOfMonth = new Date(calYear, calMonth + 1, 0);
    // Day of week: 0=Sun..6=Sat → convert to Mon-based: Mon=0..Sun=6
    let startDow = firstOfMonth.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const days: { date: number; inMonth: boolean; dateStr: string }[] = [];

    // Previous month padding
    const prevLast = new Date(calYear, calMonth, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevLast - i;
      const pm = calMonth === 0 ? 11 : calMonth - 1;
      const py = calMonth === 0 ? calYear - 1 : calYear;
      days.push({ date: d, inMonth: false, dateStr: `${py}-${String(pm + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
    }

    // Current month
    for (let d = 1; d <= lastOfMonth.getDate(); d++) {
      days.push({ date: d, inMonth: true, dateStr: `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
    }

    // Next month padding to fill 6 rows
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const nm = calMonth === 11 ? 0 : calMonth + 1;
      const ny = calMonth === 11 ? calYear + 1 : calYear;
      days.push({ date: d, inMonth: false, dateStr: `${ny}-${String(nm + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
    }

    return days;
  }

  function getSessionsForDate(dateStr: string) {
    return calSessions.filter((s) => s.start_date.slice(0, 10) === dateStr);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6 bg-gray-50 min-h-screen">

      {/* ── Fil d'Ariane + Paramètres ────────────────────────────────── */}
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

      {/* ── Alertes et Notifications ─────────────────────────────────── */}
      {isWidgetVisible("alerts") && (alerts.length > 0 || overdueTasks.length > 0) && (() => {
        const allAlertItems = [
          ...alerts.map((alert) => (
            <div
              key={`alert-${alert.session_id}`}
              className="flex items-center gap-3 rounded-md bg-red-600 px-4 py-3 text-white text-sm"
            >
              <FileCheck className="h-4 w-4 flex-shrink-0" />
              <span>
                <strong>Bilan manquant</strong> — Créneau du{" "}
                <strong>{formatDate(alert.start_date)}</strong>
                {alert.training_title ? ` › ${alert.training_title}` : ""}
              </span>
            </div>
          )),
          ...overdueTasks.map((task) => (
            <div
              key={`task-${task.id}`}
              className="flex items-center gap-3 rounded-md bg-amber-500 px-4 py-3 text-white text-sm"
            >
              <Clock className="h-4 w-4 flex-shrink-0" />
              <span>
                <strong>Tâche en retard</strong> — {task.title}{" "}
                (échéance : {formatDate(task.due_date)})
              </span>
              {task.priority === "high" && (
                <Badge className="bg-white/20 text-white text-[10px] ml-auto">Priorité haute</Badge>
              )}
            </div>
          )),
        ];
        const visible = showAllAlerts ? allAlertItems : allAlertItems.slice(0, 3);
        const hiddenCount = allAlertItems.length - 3;

        return (
          <div className="space-y-2">
            {visible}
            {allAlertItems.length > 3 && (
              <button
                onClick={() => setShowAllAlerts((v) => !v)}
                className="text-sm text-gray-600 hover:text-gray-900 underline"
              >
                {showAllAlerts ? "Réduire" : `Voir les ${hiddenCount} autres alertes`}
              </button>
            )}
          </div>
        );
      })()}

      {/* ── Bloc résumé alertes ──────────────────────────────────────── */}
      {isWidgetVisible("alerts") && (
        <div
          className="rounded-md px-5 py-4 text-white text-sm font-medium"
          style={{ backgroundColor: alerts.length === 0 && overdueTasks.length === 0 ? "#22c55e" : "#3DB5C5" }}
        >
          {alerts.length === 0 && overdueTasks.length === 0
            ? "Aucune alerte — Aucune tâche en retard"
            : `${alerts.length} bilan${alerts.length > 1 ? "s" : ""} manquant${alerts.length > 1 ? "s" : ""} · ${overdueTasks.length} tâche${overdueTasks.length > 1 ? "s" : ""} en retard`
          }
        </div>
      )}

      {/* ── KPI Cards ─────────────────────────────────────────────────── */}
      {isWidgetVisible("kpis") && (() => {
        const ALL_KPIS = [
          { id: "clients_actifs",      icon: <Building2 className="h-6 w-6 text-purple-600" />, bg: "bg-purple-100", value: activeClients, label: "Clients Actifs", format: "number" },
          { id: "nouveaux_apprenants", icon: <Users className="h-6 w-6 text-blue-600" />,       bg: "bg-blue-100",   value: newLearners,   label: "Apprenants Inscrits", format: "number" },
          { id: "sessions_en_cours",   icon: <BookOpen className="h-6 w-6 text-orange-500" />,  bg: "bg-orange-100", value: ongoingSessions, label: "Formations En Cours", format: "number" },
          { id: "sessions_terminees",  icon: <CheckCircle className="h-6 w-6 text-green-600" />,bg: "bg-green-100",  value: doneSessions,  label: "Formations Terminées", format: "number" },
          { id: "ca_realise",          icon: <Euro className="h-6 w-6" style={{ color: "#3DB5C5" }} />, bg: "", bgStyle: { backgroundColor: "#e0f5f8" } as CSSProperties, value: caRealise, label: "CA Réalisé", format: "currency" },
          { id: "ca_previsionnel",     icon: <TrendingUp className="h-6 w-6 text-indigo-600" />,bg: "bg-indigo-100", value: caPrevisionnel, label: "CA Prévisionnel", format: "currency" },
          { id: "taux_completion",     icon: <ClipboardCheck className="h-6 w-6 text-teal-600" />, bg: "bg-teal-100", value: tauxCompletion, label: "Taux de Complétion", format: "percent" },
          { id: "nb_questionnaires",   icon: <MessageSquare className="h-6 w-6 text-pink-600" />,  bg: "bg-pink-100",  value: nbQuestionnaireResponses, label: "Réponses ce mois", format: "number" },
        ];
        const visibleKpis = kpiConfig
          .filter((k) => k.visible)
          .sort((a, b) => a.order - b.order)
          .map((k) => ALL_KPIS.find((kpi) => kpi.id === k.id))
          .filter(Boolean) as typeof ALL_KPIS;

        if (loading) {
          return (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-28 rounded-lg bg-gray-200 animate-pulse" />
              ))}
            </div>
          );
        }

        return (
          <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2",
            visibleKpis.length <= 4 ? "lg:grid-cols-4" : visibleKpis.length <= 6 ? "lg:grid-cols-6" : "lg:grid-cols-4 xl:grid-cols-8"
          )}>
            {visibleKpis.map((kpi) => (
              <Card key={kpi.id} className="bg-white border border-gray-200 shadow-sm">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className={cn("rounded-full p-3", kpi.bg)} style={(kpi as {bgStyle?: CSSProperties}).bgStyle}>
                    {kpi.icon}
                  </div>
                  <div>
                    <p className={cn("font-bold text-gray-800", kpi.format === "currency" ? "text-2xl" : "text-3xl")}>
                      {kpi.format === "currency"
                        ? `${kpi.value.toLocaleString("fr-FR")} €`
                        : kpi.format === "percent"
                        ? `${kpi.value}%`
                        : kpi.value}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">{kpi.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );
      })()}

      {/* ── Graphique annuel ─────────────────────────────────────────── */}
      {isWidgetVisible("chart") && <Card className="bg-white border border-gray-200 shadow-sm">
        <CardHeader className="pb-2">
          {/* Navigation année */}
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-gray-700">
              Statistiques annuelles
            </CardTitle>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setYear((y) => y - 1)}
                className="flex h-7 w-7 items-center justify-center rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[48px] text-center text-sm font-semibold text-gray-800">
                {year}
              </span>
              <button
                onClick={() => setYear((y) => y + 1)}
                className="flex h-7 w-7 items-center justify-center rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "6px",
                  border: "1px solid #e5e7eb",
                  fontSize: "12px",
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => value}
              />
              <Line
                type="monotone"
                dataKey="apprenants"
                name="Nouveaux Apprenants"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ r: 3, fill: "#22c55e" }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="terminees"
                name="Formations Terminées"
                stroke="#f97316"
                strokeWidth={2}
                dot={{ r: 3, fill: "#f97316" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>}

      {/* ── Activités récentes ──────────────────────────────────────── */}
      {isWidgetVisible("activity") && <Card className="bg-white border border-gray-200 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold text-gray-700 flex items-center gap-2">
            <Activity className="h-4 w-4" style={{ color: "#3DB5C5" }} />
            Activités récentes
          </CardTitle>
          <Link href="/admin/activity" className="text-xs text-[#3DB5C5] hover:underline font-medium">
            Voir tout
          </Link>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center italic">
              Aucune activité récente enregistrée.
            </p>
          ) : (
            <div className="space-y-3">
              {activities.map((act) => {
                const icon = act.action.includes("creat") || act.action.includes("ajout")
                  ? <FolderPlus className="h-4 w-4 text-green-500" />
                  : act.action.includes("inscri") || act.action.includes("enroll")
                  ? <UserPlus className="h-4 w-4 text-blue-500" />
                  : <Activity className="h-4 w-4 text-gray-400" />;

                const resourceLabel = act.resource_type
                  ? { training: "Formation", session: "Session", client: "Client", learner: "Apprenant", prospect: "Prospect", quote: "Devis" }[act.resource_type] ?? act.resource_type
                  : "";

                return (
                  <div key={act.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className="mt-0.5">{icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">
                        {act.action}
                        {resourceLabel && (
                          <Badge variant="outline" className="ml-2 text-[10px]">{resourceLabel}</Badge>
                        )}
                      </p>
                      {act.details && typeof (act.details as Record<string, unknown>).name === "string" && (
                        <p className="text-xs text-gray-400 truncate">
                          {(act.details as Record<string, string>).name}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] text-gray-400 whitespace-nowrap">
                      {formatDate(act.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>}

      {/* ── Calendrier des sessions (vues Mois / Semaine / Jour) ──────── */}
      {isWidgetVisible("calendar") && <Card className="bg-white border border-gray-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-xl font-bold text-gray-900">
            {calendarView === "month" && `${MONTHS_FR_FULL[calMonth]} ${calYear}`}
            {calendarView === "week" && (() => {
              const days = getWeekDays(calSelectedDay);
              const first = new Date(days[0]);
              const last = new Date(days[6]);
              return `Semaine du ${first.getDate()} ${MONTHS_FR_FULL[first.getMonth()]}`;
            })()}
            {calendarView === "day" && (() => {
              const d = new Date(calSelectedDay);
              return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
            })()}
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-md border border-gray-200 overflow-hidden">
              {(["day", "week", "month"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setCalendarView(v)}
                  className={cn(
                    "px-3 py-1 text-xs font-medium transition",
                    calendarView === v ? "bg-[#3DB5C5] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {v === "day" ? "Jour" : v === "week" ? "Semaine" : "Mois"}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={calToday} className="text-xs h-8">
              Aujourd&apos;hui
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={calPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={calNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">

          {/* ── Vue SEMAINE ─────────────────────────────── */}
          {calendarView === "week" && (() => {
            const weekDays = getWeekDays(calSelectedDay);
            const todayStr = new Date().toISOString().slice(0, 10);
            return (
              <div className="overflow-x-auto">
                <div className="grid grid-cols-7 border-b border-gray-200 min-w-[700px]">
                  {weekDays.map((d) => {
                    const isToday = d === todayStr;
                    const isSelected = d === calSelectedDay;
                    const daySessions = calSessions.filter((s) => s.start_date.slice(0, 10) === d);
                    const dd = new Date(d);
                    return (
                      <div
                        key={d}
                        onClick={() => { setCalSelectedDay(d); setCalendarView("day"); }}
                        className={cn(
                          "p-2 min-h-[120px] border-r border-gray-100 last:border-r-0 cursor-pointer hover:bg-blue-50/30 transition",
                          isToday && "bg-blue-50/40"
                        )}
                      >
                        <div className={cn(
                          "text-xs font-semibold mb-1 text-center",
                          isToday ? "text-[#3DB5C5]" : "text-gray-500"
                        )}>
                          <div>{["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."][dd.getDay() === 0 ? 6 : dd.getDay() - 1]}</div>
                          <span className={cn(
                            "inline-flex items-center justify-center h-6 w-6 rounded-full text-sm font-bold",
                            isToday && "bg-[#3DB5C5] text-white"
                          )}>{dd.getDate()}</span>
                        </div>
                        <div className="space-y-0.5">
                          {daySessions.slice(0, 3).map((s) => (
                            <div
                              key={s.id}
                              className="text-[10px] rounded px-1 py-0.5 truncate font-medium"
                              style={{ backgroundColor: BRAND_LIGHT, color: "#0e7c8a" }}
                              title={`${s.start_hour}h — ${s.training_title || s.title}`}
                            >
                              <span className="font-bold">{s.start_hour}h</span> {s.training_title || s.title}
                            </div>
                          ))}
                          {daySessions.length > 3 && (
                            <span className="text-[9px] text-gray-400 px-1">+{daySessions.length - 3} autres</span>
                          )}
                          {daySessions.length === 0 && (
                            <span className="text-[10px] text-gray-300 italic">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── Vue JOUR ────────────────────────────────── */}
          {calendarView === "day" && (() => {
            const todayStr = new Date().toISOString().slice(0, 10);
            return (
              <div className="divide-y divide-gray-100">
                {HOUR_SLOTS.map((hour) => {
                  const sessions = getSessionsForHour(calSelectedDay, hour);
                  const isCurrentHour = calSelectedDay === todayStr && new Date().getHours() === hour;
                  return (
                    <div key={hour} className={cn(
                      "flex gap-4 px-4 py-2 min-h-[52px]",
                      isCurrentHour && "bg-blue-50/40"
                    )}>
                      <div className={cn(
                        "w-12 text-xs font-mono flex-shrink-0 pt-1",
                        isCurrentHour ? "text-[#3DB5C5] font-bold" : "text-gray-400"
                      )}>
                        {String(hour).padStart(2, "0")}:00
                      </div>
                      <div className="flex-1 flex flex-wrap gap-2 items-start">
                        {sessions.map((s) => (
                          <Link
                            key={s.id}
                            href="/admin/sessions"
                            className="inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium"
                            style={{ backgroundColor: BRAND_LIGHT, color: "#0e7c8a" }}
                          >
                            <Calendar className="h-3 w-3" />
                            {s.training_title || s.title}
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* ── Vue MOIS (originale) ─────────────────── */}
          {calendarView === "month" && <>
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-200">
            {DAYS_FR.map((d, i) => (
              <div
                key={d}
                className={cn(
                  "py-2 text-center text-xs font-semibold text-gray-500 uppercase",
                  i >= 5 && "bg-amber-50/50"
                )}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {(() => {
            const grid = buildCalendarGrid();
            const todayStr = new Date().toISOString().slice(0, 10);
            const weeks: typeof grid[] = [];
            for (let i = 0; i < grid.length; i += 7) {
              weeks.push(grid.slice(i, i + 7));
            }

            return weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
                {week.map((day, di) => {
                  const sessions = getSessionsForDate(day.dateStr);
                  const isToday = day.dateStr === todayStr;
                  const isWeekend = di >= 5;

                  return (
                    <div
                      key={day.dateStr}
                      className={cn(
                        "min-h-[90px] border-r border-gray-100 last:border-r-0 p-1",
                        !day.inMonth && "bg-gray-50/60",
                        isWeekend && day.inMonth && "bg-amber-50/30",
                        isToday && "bg-blue-50/40"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block text-xs font-medium mb-0.5 px-1 rounded",
                          !day.inMonth && "text-gray-300",
                          day.inMonth && "text-gray-700",
                          isToday && "bg-[#3DB5C5] text-white"
                        )}
                      >
                        {day.date}
                      </span>
                      <div className="space-y-0.5">
                        {sessions.slice(0, 3).map((s) => (
                          <Link
                            key={s.id}
                            href={`/admin/sessions`}
                            className="block truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight cursor-pointer hover:opacity-80 transition-opacity"
                            style={{ backgroundColor: BRAND_LIGHT, color: "#0e7c8a" }}
                            title={`${s.start_hour}h — ${s.training_title || s.title}`}
                          >
                            <span className="font-bold">{s.start_hour}</span>{" "}
                            {s.training_title || s.title}
                          </Link>
                        ))}
                        {sessions.length > 3 && (
                          <span className="text-[9px] text-gray-400 px-1">
                            +{sessions.length - 3} autres
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ));
          })()}
          </>}
        </CardContent>
      </Card>}

      {/* ── Prochaines sessions ───────────────────────────────────────── */}
      {isWidgetVisible("upcoming") && <Card className="bg-white border border-gray-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold text-gray-700">
            Sessions à venir
          </CardTitle>
          <Link
            href="/admin/sessions"
            className="text-sm font-medium"
            style={{ color: "#3DB5C5" }}
          >
            Voir tout →
          </Link>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              Aucune session planifiée à venir.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase text-gray-400">
                    <th className="pb-2 pr-4">Session</th>
                    <th className="pb-2 pr-4">Formation</th>
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Mode</th>
                    <th className="pb-2 pr-4">Formateur</th>
                    <th className="pb-2">Lieu</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((s) => (
                    <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                      <td className="py-2.5 pr-4 font-medium text-gray-800">{s.title}</td>
                      <td className="py-2.5 pr-4 text-gray-500">
                        {s.training_title ?? "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">
                        {formatDate(s.start_date)}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="rounded-full bg-[#e0f5f7] px-2.5 py-0.5 text-xs font-medium text-[#3DB5C5]">
                          {MODE_LABELS[s.mode] ?? s.mode}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500">
                        {s.trainer_first_name
                          ? `${s.trainer_first_name} ${s.trainer_last_name ?? ""}`.trim()
                          : "—"
                        }
                      </td>
                      <td className="py-2.5 text-gray-500">{s.location ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>}

      {/* ── Accès rapide ─────────────────────────────────────────────── */}
      {isWidgetVisible("quickaccess") && <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Accès Rapide
        </h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12">
          {QUICK_ACCESS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center gap-2 rounded-lg bg-white border border-gray-200 p-3 text-center shadow-sm hover:shadow-md hover:border-[#3DB5C5] transition-all duration-200 group"
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "#e0f5f7" }}
                >
                  <Icon className="h-4 w-4" style={{ color: "#3DB5C5" }} />
                </div>
                <span className="text-[10px] font-medium leading-tight text-gray-600 group-hover:text-[#3DB5C5]">
                  {item.title}
                </span>
              </Link>
            );
          })}
        </div>
      </div>}

      {/* ── Dialog Personnaliser le tableau de bord ──────────────────── */}
      <Dialog open={dashSettingsOpen} onOpenChange={setDashSettingsOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-[#3DB5C5]" />
              Personnaliser le tableau de bord
            </DialogTitle>
          </DialogHeader>

          {/* Widgets */}
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Widgets affichés</p>
              <div className="space-y-2">
                {[...widgetConfig].sort((a, b) => a.order - b.order).map((w, idx) => (
                  <div key={w.id} className="flex items-center gap-3 p-2 rounded-lg border bg-white">
                    <Switch
                      checked={w.visible}
                      onCheckedChange={() => toggleWidget(w.id)}
                      className="scale-75"
                    />
                    <span className={cn("flex-1 text-sm", !w.visible && "text-gray-400 line-through")}>
                      {w.label}
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveWidget(w.id, "up")} disabled={idx === 0} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-400">
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => moveWidget(w.id, "down")} disabled={idx === widgetConfig.length - 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-400">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* KPIs */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Indicateurs clés (KPIs)</p>
              <div className="space-y-2">
                {[...kpiConfig].sort((a, b) => a.order - b.order).map((k, idx) => (
                  <div key={k.id} className="flex items-center gap-3 p-2 rounded-lg border bg-white">
                    <Switch
                      checked={k.visible}
                      onCheckedChange={() => toggleKpi(k.id)}
                      className="scale-75"
                    />
                    <span className={cn("flex-1 text-sm", !k.visible && "text-gray-400 line-through")}>
                      {k.label}
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveKpi(k.id, "up")} disabled={idx === 0} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-400">
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => moveKpi(k.id, "down")} disabled={idx === kpiConfig.length - 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-400">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between pt-2 border-t">
              <button
                onClick={() => {
                  saveWidgetConfig(DEFAULT_WIDGET_CONFIG);
                  saveKpiConfig(DEFAULT_KPI_CONFIG);
                }}
                className="text-xs text-gray-400 hover:text-gray-600 underline"
              >
                Réinitialiser les paramètres
              </button>
              <Button size="sm" onClick={() => setDashSettingsOpen(false)}>
                Fermer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
