import {
  Users,
  BookOpen,
  CheckCircle,
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
} from "lucide-react";
import type { WidgetConfigItem, KpiConfigItem } from "./types";

export const MONTHS_FR = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc",
];

export const MONTHS_FR_FULL = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export const DAYS_FR = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

export const BRAND_LIGHT = "rgba(61, 181, 197, 0.15)";

export const QUICK_ACCESS = [
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

export const MODE_LABELS: Record<string, string> = {
  presentiel: "Présentiel",
  distanciel:  "Distanciel",
  hybride:     "Hybride",
};

export const DEFAULT_WIDGET_CONFIG: WidgetConfigItem[] = [
  { id: "alerts",      label: "Alertes et notifications",   visible: true,  order: 0 },
  { id: "kpis",        label: "Indicateurs clés (KPIs)",    visible: true,  order: 1 },
  { id: "chart",       label: "Statistiques annuelles",     visible: true,  order: 2 },
  { id: "activity",    label: "Activités récentes",         visible: true,  order: 3 },
  { id: "calendar",    label: "Calendrier des sessions",    visible: true,  order: 4 },
  { id: "upcoming",    label: "Sessions à venir",           visible: true,  order: 5 },
  { id: "quickaccess", label: "Accès rapide",               visible: true,  order: 6 },
];

export const DEFAULT_KPI_CONFIG: KpiConfigItem[] = [
  { id: "clients_actifs",         label: "Clients Actifs",             visible: true,  order: 0 },
  { id: "nouveaux_apprenants",    label: "Apprenants Inscrits",        visible: true,  order: 1 },
  { id: "sessions_en_cours",      label: "Formations En Cours",        visible: true,  order: 2 },
  { id: "sessions_terminees",     label: "Formations Terminées",       visible: true,  order: 3 },
  { id: "ca_realise",             label: "CA Réalisé",                 visible: true,  order: 4 },
  { id: "ca_previsionnel",        label: "CA Prévisionnel",            visible: true,  order: 5 },
  { id: "taux_completion",        label: "Taux de Complétion",         visible: false, order: 6 },
  { id: "nb_questionnaires",      label: "Réponses Questionnaires",    visible: false, order: 7 },
];

// Official chart statistics data by year
export const OFFICIAL_STATS: Record<number, [number, number][]> = {
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
