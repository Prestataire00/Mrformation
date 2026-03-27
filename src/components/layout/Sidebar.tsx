"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Entity } from "@/lib/types";
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  UserCheck,
  BookOpen,
  Library,
  ClipboardList,
  BarChart3,
  MapPin,
  LifeBuoy,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Building2,
  Banknote,
  Calendar,
  Monitor,
  FileText,
  Star,
  AlertTriangle,
  TrendingDown,
  Activity,
  Repeat,
  RefreshCw,
  ShoppingBag,
  Database,
  FolderSearch,
  Route,
  Sparkles,
  Play,
  PenLine,
  Upload,
  CalendarDays,
  Receipt,
  Rss,
  HelpCircle,
} from "lucide-react";

interface NavItem {
  label: string;
  href?: string;
  icon: React.ElementType;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  {
    label: "Tableau de Bord",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    label: "CRM",
    icon: TrendingUp,
    children: [
      { label: "Dashboard CRM", href: "/admin/crm", icon: BarChart3 },
      { label: "Tunnel de Vente", href: "/admin/crm/prospects", icon: TrendingUp },
      { label: "Tous les Prospects", href: "/admin/crm/prospects/liste", icon: Users },
      { label: "Tâches", href: "/admin/crm/tasks", icon: ClipboardList },
      { label: "Suivi Commercial", href: "/admin/crm/suivi", icon: Activity },
      { label: "Devis", href: "/admin/crm/quotes", icon: FileText },
      { label: "Campagnes", href: "/admin/crm/campaigns", icon: Repeat },
    ],
  },
  {
    label: "Clients & Financeurs",
    icon: Users,
    children: [
      { label: "Profils des Apprenants", href: "/admin/clients/apprenants", icon: GraduationCap },
      { label: "Tous les Apprenants", href: "/admin/clients/apprenants/liste", icon: Users },
      { label: "Toutes les Entreprises", href: "/admin/clients", icon: Building2 },
      { label: "Tous les Financeurs", href: "/admin/clients/financeurs", icon: Banknote },
    ],
  },
  {
    label: "Formateurs",
    icon: UserCheck,
    children: [
      { label: "Profils des Formateurs", href: "/admin/trainers", icon: UserCheck },
      { label: "Tous les Formateurs", href: "/admin/trainers/liste", icon: Users },
      { label: "CVthèque", href: "/admin/trainers/cvtheque", icon: FolderSearch },
    ],
  },
  {
    label: "Planning",
    href: "/admin/planning",
    icon: Calendar,
  },
  {
    label: "Formations",
    icon: BookOpen,
    children: [
      { label: "Toutes les Formations", href: "/admin/trainings", icon: BookOpen },
      { label: "Parcours", href: "/admin/trainings/parcours", icon: Route },
      { label: "Automatisation", href: "/admin/trainings/automation", icon: RefreshCw },
    ],
  },
  {
    label: "Programmes",
    icon: Library,
    children: [
      { label: "Tous les Programmes", href: "/admin/programs", icon: Library },
      { label: "Migration PDF", href: "/admin/library-migration", icon: Upload },
    ],
  },
  {
    label: "Évaluations",
    icon: ClipboardList,
    children: [
      { label: "Questionnaires", href: "/admin/questionnaires", icon: ClipboardList },
      { label: "Satisfaction & Qualité", href: "/admin/questionnaires/dashboard", icon: Star },
    ],
  },
  {
    label: "E-Learning",
    icon: Monitor,
    children: [
      { label: "Mes Cours", href: "/admin/elearning", icon: Monitor },
      { label: "Doc → Cours IA", href: "/admin/elearning/create", icon: Sparkles },
    ],
  },
  {
    label: "Documents",
    href: "/admin/documents",
    icon: FileText,
  },
  {
    label: "Emails",
    href: "/admin/emails",
    icon: Repeat,
  },
  {
    label: "Signatures",
    href: "/admin/signatures",
    icon: FileText,
  },
  {
    label: "Utilisateurs",
    href: "/admin/users",
    icon: Users,
  },
  {
    label: "Suivis & Bilans",
    icon: Activity,
    children: [
      { label: "Suivi des Absences", href: "/admin/reports/absences", icon: AlertTriangle },
      { label: "Suivi Qualité", href: "/admin/reports/qualite", icon: Star },
      { label: "Amélioration Continue", href: "/admin/reports/amelioration", icon: TrendingUp },
      { label: "Suivi Commercial", href: "/admin/reports/commercial", icon: TrendingDown },
      { label: "Incidents Qualité", href: "/admin/reports/incidents", icon: AlertTriangle },
      { label: "Bilan Pédagogique et Financier", href: "/admin/reports/bpf", icon: BarChart3 },
      { label: "BPF + E-Learning", href: "/admin/reports/bpf-elearning", icon: BarChart3 },
      { label: "Suivi des Factures", href: "/admin/reports/factures", icon: Receipt },
      { label: "Affacturage", href: "/admin/affacturage", icon: Banknote },
    ],
  },
  {
    label: "Lieux de Formations",
    href: "/admin/lieux",
    icon: MapPin,
  },
  {
    label: "Migration",
    href: "/admin/migration",
    icon: Database,
  },
  {
    label: "La Veille",
    href: "/admin/veille",
    icon: Rss,
  },
  {
    label: "Contact & Conseils",
    href: "/admin/contact-conseils",
    icon: HelpCircle,
  },
  {
    label: "Support",
    href: "/admin/support",
    icon: LifeBuoy,
  },
];

const ENTITY_STYLES: Record<string, { initials: string; gradient: string; logo?: string }> = {
  "mr-formation": {
    initials: "MR",
    gradient: "linear-gradient(135deg, #DC2626, #B91C1C)",
    logo: "/logo-mr-formation.png",
  },
  "c3v-formation": {
    initials: "C3V",
    gradient: "linear-gradient(135deg, #2563EB, #1D4ED8)",
  },
};

function NavItemComponent({ item, collapsed, siblingHrefs = [] }: { item: NavItem; collapsed: boolean; siblingHrefs?: string[] }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(
    item.children?.some((c) => c.href && pathname.startsWith(c.href)) ?? false
  );

  const dashboardPaths = ["/admin", "/learner", "/trainer", "/client"];
  const isActive = item.href
    ? dashboardPaths.includes(item.href)
      ? pathname === item.href
      : (() => {
          const matchesThis = pathname === item.href || pathname.startsWith(item.href + "/");
          if (!matchesThis) return false;
          // Ne pas highlighter si un sibling a un href plus spécifique qui match aussi
          const hasBetterMatch = siblingHrefs.some(
            (h) => h !== item.href && h.length > item.href!.length && (pathname === h || pathname.startsWith(h + "/"))
          );
          return !hasBetterMatch;
        })()
    : false;

  const isChildActive = item.children?.some(
    (c) => c.href && pathname.startsWith(c.href)
  ) ?? false;

  if (item.children) {
    const childHrefs = item.children.map((c) => c.href).filter(Boolean) as string[];
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
            isChildActive
              ? "bg-sidebar-accent text-sidebar-foreground font-medium"
              : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            collapsed && "justify-center px-2"
          )}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left text-[13px]">{item.label}</span>
              <ChevronDown
                className={cn("h-3 w-3 transition-transform opacity-60", expanded && "rotate-180")}
              />
            </>
          )}
        </button>
        {!collapsed && expanded && (
          <div className="mt-0.5 ml-3 border-l border-sidebar-border pl-3 space-y-0.5">
            {item.children.map((child) => (
              <NavItemComponent key={child.href || child.label} item={child} collapsed={false} siblingHrefs={childHrefs} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href!}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-foreground font-semibold"
          : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        collapsed && "justify-center px-2"
      )}
      title={collapsed ? item.label : undefined}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

const learnerNavItems: NavItem[] = [
  {
    label: "Tableau de Bord",
    href: "/learner",
    icon: LayoutDashboard,
  },
  {
    label: "Mes Formations",
    href: "/learner/my-trainings",
    icon: GraduationCap,
  },
  {
    label: "E-Learning",
    href: "/learner/courses",
    icon: Monitor,
  },
  {
    label: "Calendrier",
    href: "/learner/calendar",
    icon: CalendarDays,
  },
  {
    label: "Contacts",
    href: "/learner/contacts",
    icon: Users,
  },
  {
    label: "Questionnaires",
    href: "/learner/questionnaires",
    icon: ClipboardList,
  },
  {
    label: "Mes Documents",
    href: "/learner/documents",
    icon: FileText,
  },
  {
    label: "Mon Profil",
    href: "/learner/profile",
    icon: UserCheck,
  },
];

const trainerNavItems: NavItem[] = [
  {
    label: "Tableau de Bord",
    href: "/trainer",
    icon: LayoutDashboard,
  },
  {
    label: "Mes Cours",
    href: "/trainer/courses",
    icon: BookOpen,
  },
  {
    label: "Mes Sessions",
    href: "/trainer/sessions",
    icon: Calendar,
  },
  {
    label: "Mon Planning",
    href: "/trainer/planning",
    icon: ClipboardList,
  },
  {
    label: "Mes Contrats",
    href: "/trainer/contracts",
    icon: FileText,
  },
  {
    label: "Évaluations",
    href: "/trainer/evaluations",
    icon: Star,
  },
  {
    label: "Mon Profil",
    href: "/trainer/profile",
    icon: UserCheck,
  },
];

const clientNavItems: NavItem[] = [
  {
    label: "Tableau de Bord",
    href: "/client",
    icon: LayoutDashboard,
  },
  {
    label: "Mes Apprenants",
    href: "/client/learners",
    icon: GraduationCap,
  },
  {
    label: "Formations",
    href: "/client/formations",
    icon: BookOpen,
  },
  {
    label: "Mon Profil",
    href: "/client/profile",
    icon: UserCheck,
  },
];

// Commercial : accès CRM + consultation clients/formations/planning
const commercialNavItems: NavItem[] = [
  {
    label: "Tableau de Bord",
    href: "/admin/crm",
    icon: LayoutDashboard,
  },
  {
    label: "CRM",
    icon: TrendingUp,
    children: [
      { label: "Tunnel de Vente", href: "/admin/crm/prospects", icon: TrendingUp },
      { label: "Tous les Prospects", href: "/admin/crm/prospects/liste", icon: Users },
      { label: "Tâches", href: "/admin/crm/tasks", icon: ClipboardList },
      { label: "Suivi Commercial", href: "/admin/crm/suivi", icon: Activity },
      { label: "Devis", href: "/admin/crm/quotes", icon: FileText },
      { label: "Campagnes", href: "/admin/crm/campaigns", icon: Repeat },
    ],
  },
  {
    label: "Clients & Financeurs",
    icon: Users,
    children: [
      { label: "Toutes les Entreprises", href: "/admin/clients", icon: Building2 },
      { label: "Tous les Financeurs", href: "/admin/clients/financeurs", icon: Banknote },
    ],
  },
  {
    label: "Formations",
    icon: BookOpen,
    children: [
      { label: "Toutes les Formations", href: "/admin/trainings", icon: BookOpen },
    ],
  },
  {
    label: "Planning",
    href: "/admin/planning",
    icon: Calendar,
  },
];

const ROLE_NAV_ITEMS: Record<string, NavItem[]> = {
  super_admin: navItems,
  admin: navItems,
  commercial: commercialNavItems,
  learner: learnerNavItems,
  trainer: trainerNavItems,
  client: clientNavItems,
};

const trainerCrmNavItems: NavItem[] = [
  {
    label: "CRM",
    icon: TrendingUp,
    children: [
      { label: "Dashboard CRM", href: "/admin/crm", icon: BarChart3 },
      { label: "Mes Prospects", href: "/admin/crm/prospects", icon: TrendingUp },
      { label: "Tous les Prospects", href: "/admin/crm/prospects/liste", icon: Users },
      { label: "Mes Tâches", href: "/trainer/tasks", icon: ClipboardList },
      { label: "Mes Devis", href: "/admin/crm/quotes", icon: FileText },
    ],
  },
];

interface SidebarProps {
  entity: Entity | null;
  role?: string;
  hasCrmAccess?: boolean;
}

export function Sidebar({ entity, role = "admin", hasCrmAccess = false }: SidebarProps) {
  const collapsed = false;

  const slug = entity?.slug ?? "mr-formation";
  const entityName = entity?.name ?? "MR FORMATION";
  const style = ENTITY_STYLES[slug] ?? {
    initials: entityName.charAt(0),
    gradient: `linear-gradient(135deg, ${entity?.theme_color ?? "#3DB5C5"}, ${entity?.theme_color ?? "#3DB5C5"})`,
  };

  // Parcours de formation uniquement pour C3V Formation
  const roleItems = ROLE_NAV_ITEMS[role] ?? navItems;
  const filteredNavItems = slug !== "c3v-formation"
    ? roleItems.map(item =>
        item.label === "Formations"
          ? { ...item, children: item.children?.filter(child => child.label !== "Parcours") }
          : item
      )
    : roleItems;

  return (
    <aside className="flex flex-col bg-sidebar border-r border-sidebar-border shrink-0 w-60">
      {/* Logo */}
      <div className="flex items-center justify-center px-3 py-4 border-b border-sidebar-border shrink-0 bg-white">
        {style.logo ? (
          <Image
            src={style.logo}
            alt={entityName}
            width={140}
            height={56}
            className="h-14 w-auto object-contain"
          />
        ) : (
          <>
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 text-white font-bold text-xs"
              style={{ background: style.gradient }}
            >
              {style.initials}
            </div>
            <div className="ml-2.5 overflow-hidden flex-1">
              <p className="text-white font-bold text-sm leading-tight truncate">{entityName}</p>
              <p className="text-sidebar-foreground/40 text-[11px]">Formation Pro</p>
            </div>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav role="navigation" aria-label="Menu principal" className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {filteredNavItems.map((item) => (
          <NavItemComponent key={item.label} item={item} collapsed={collapsed} />
        ))}
        {role === "trainer" && hasCrmAccess && trainerCrmNavItems.map((item) => (
          <NavItemComponent key={item.label} item={item} collapsed={collapsed} />
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-sidebar-border shrink-0">
          <p className="text-sidebar-foreground/30 text-[10px] text-center">
            © {new Date().getFullYear()} {entityName}
          </p>
        </div>
      )}
    </aside>
  );
}
