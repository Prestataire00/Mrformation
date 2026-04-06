"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { useDebounce } from "@/hooks/useDebounce";
import {
  Activity,
  UserPlus,
  FolderPlus,
  Edit3,
  Trash2,
  Search,
  X,
  Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime, getInitials, ROLE_LABELS } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ActivityUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
}

interface ActivityEntry {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  details: Record<string, unknown>;
  created_at: string;
  profiles: ActivityUser | null;
}

interface UserOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const RESOURCE_LABELS: Record<string, string> = {
  training: "Formation",
  session: "Session",
  client: "Client",
  learner: "Apprenant",
  prospect: "Prospect",
  quote: "Devis",
  trainer: "Formateur",
  document: "Document",
  email: "Email",
  task: "Tâche",
  signature: "Signature",
  enrollment: "Inscription",
  elearning_course: "E-Learning",
  user: "Utilisateur",
};

const ACTION_LABELS: Record<string, string> = {
  create: "Création",
  update: "Modification",
  delete: "Suppression",
};

const DATE_PRESETS: { value: string; label: string }[] = [
  { value: "", label: "Toutes les dates" },
  { value: "today", label: "Aujourd'hui" },
  { value: "week", label: "Cette semaine" },
  { value: "month", label: "Ce mois" },
  { value: "custom", label: "Personnalisé" },
];

const ROLE_BADGE_COLORS: Record<string, string> = {
  super_admin: "bg-red-100 text-red-700",
  admin: "bg-blue-100 text-blue-700",
  commercial: "bg-purple-100 text-purple-700",
  trainer: "bg-green-100 text-green-700",
  client: "bg-orange-100 text-orange-700",
  learner: "bg-cyan-100 text-cyan-700",
};

const PAGE_SIZE = 50;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function getDateRange(preset: string): { from: string; to: string } | null {
  if (!preset || preset === "custom") return null;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (preset === "today") {
    return { from: today, to: today };
  }
  if (preset === "week") {
    const dow = now.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    return { from: monday.toISOString().slice(0, 10), to: today };
  }
  if (preset === "month") {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: firstDay.toISOString().slice(0, 10), to: today };
  }
  return null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const supabase = createClient();
  const { entityId } = useEntity();

  // Current user role
  const currentUserRole = getCookie("user_role") || "admin";
  const isSuperAdmin = currentUserRole === "super_admin";

  // Activity data
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [roleFilter, setRoleFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [userFilterLabel, setUserFilterLabel] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [datePreset, setDatePreset] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const debouncedUserSearch = useDebounce(userSearch, 300);
  const userSearchRef = useRef<HTMLDivElement>(null);

  // Close user dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userSearchRef.current && !userSearchRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search users when search text changes
  useEffect(() => {
    if (!debouncedUserSearch || debouncedUserSearch.length < 2 || !isSuperAdmin) {
      setUserOptions([]);
      return;
    }

    async function searchUsers() {
      let q = supabase
        .from("profiles")
        .select("id, first_name, last_name, role")
        .or(`first_name.ilike.%${debouncedUserSearch}%,last_name.ilike.%${debouncedUserSearch}%`)
        .limit(10);
      if (entityId) q = q.eq("entity_id", entityId);

      const { data } = await q;
      setUserOptions((data as UserOption[]) ?? []);
      setShowUserDropdown(true);
    }
    searchUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedUserSearch, entityId, isSuperAdmin]);

  // Compute effective date range
  const effectiveDateRange = datePreset === "custom"
    ? { from: dateFrom, to: dateTo }
    : getDateRange(datePreset);

  // Fetch activities
  const fetchActivities = useCallback(
    async (offset = 0, append = false) => {
      setLoading(true);
      try {
        let query = supabase
          .from("activity_log")
          .select(
            "id, user_id, action, resource_type, details, created_at, profiles(id, first_name, last_name, role)",
            { count: "exact" }
          )
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (entityId) query = query.eq("entity_id", entityId);

        // Role filter (via joined profiles)
        if (roleFilter && isSuperAdmin) {
          query = query.eq("profiles.role", roleFilter);
        }

        // User filter
        if (userFilter && isSuperAdmin) {
          query = query.eq("user_id", userFilter);
        }

        // Date filters
        if (effectiveDateRange?.from) {
          query = query.gte("created_at", effectiveDateRange.from + "T00:00:00");
        }
        if (effectiveDateRange?.to) {
          query = query.lte("created_at", effectiveDateRange.to + "T23:59:59");
        }

        const { data, count } = await query;
        if (data) {
          const entries = data as unknown as ActivityEntry[];
          setActivities((prev) =>
            append ? [...prev, ...entries] : entries
          );
        }
        setTotalCount(count ?? 0);
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase, entityId, roleFilter, userFilter, effectiveDateRange?.from, effectiveDateRange?.to]
  );

  // Re-fetch when filters change
  useEffect(() => {
    if (entityId === undefined) return;
    fetchActivities(0, false);
  }, [entityId, fetchActivities]);

  // Reset filters
  function resetFilters() {
    setRoleFilter("");
    setUserFilter("");
    setUserFilterLabel("");
    setUserSearch("");
    setDatePreset("");
    setDateFrom("");
    setDateTo("");
  }

  const hasActiveFilters = roleFilter || userFilter || datePreset;

  function getIcon(action: string) {
    if (action === "create" || action.includes("creat") || action.includes("ajout"))
      return <FolderPlus className="h-4 w-4 text-green-500" />;
    if (action === "update" || action.includes("modif"))
      return <Edit3 className="h-4 w-4 text-amber-500" />;
    if (action === "delete" || action.includes("suppr"))
      return <Trash2 className="h-4 w-4 text-red-500" />;
    if (action.includes("inscri") || action.includes("enroll"))
      return <UserPlus className="h-4 w-4 text-blue-500" />;
    return <Activity className="h-4 w-4 text-gray-400" />;
  }

  const hasMore = activities.length < totalCount;

  return (
    <div className="space-y-6 p-6 bg-gray-50 min-h-screen">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        <span className="font-medium text-gray-700">Administration</span>
        <span className="mx-2">/</span>
        <span>Activités</span>
      </div>

      <Card className="bg-white border border-gray-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-gray-700 flex items-center gap-2">
              <Activity className="h-4 w-4" style={{ color: "#DC2626" }} />
              Historique des activités
              {totalCount > 0 && (
                <Badge variant="outline" className="text-[10px] ml-1">
                  {totalCount} entrée{totalCount > 1 ? "s" : ""}
                </Badge>
              )}
            </CardTitle>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs text-gray-500 gap-1">
                <X className="h-3 w-3" />
                Réinitialiser les filtres
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {/* ─── Filter Bar ──────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3 items-end mb-5 pb-4 border-b border-gray-100">
            {/* Role filter — super_admin only */}
            {isSuperAdmin && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500 font-medium flex items-center gap-1">
                  <Filter className="h-3 w-3" />
                  Rôle
                </label>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#DC2626]/30 focus:border-[#DC2626]"
                >
                  <option value="">Tous les rôles</option>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* User search — super_admin only */}
            {isSuperAdmin && (
              <div className="flex flex-col gap-1 relative" ref={userSearchRef}>
                <label className="text-xs text-gray-500 font-medium flex items-center gap-1">
                  <Search className="h-3 w-3" />
                  Utilisateur
                </label>
                {userFilter ? (
                  <div className="h-9 flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 text-sm">
                    <span className="text-gray-700">{userFilterLabel}</span>
                    <button
                      onClick={() => {
                        setUserFilter("");
                        setUserFilterLabel("");
                        setUserSearch("");
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <Input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    onFocus={() => userOptions.length > 0 && setShowUserDropdown(true)}
                    placeholder="Rechercher..."
                    className="h-9 w-48 text-sm"
                  />
                )}
                {/* Dropdown */}
                {showUserDropdown && userOptions.length > 0 && !userFilter && (
                  <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                    {userOptions.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => {
                          const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "—";
                          setUserFilter(u.id);
                          setUserFilterLabel(name);
                          setUserSearch("");
                          setShowUserDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-sm"
                      >
                        <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-medium text-gray-600">
                          {getInitials(u.first_name, u.last_name)}
                        </div>
                        <span className="text-gray-700">
                          {u.first_name ?? ""} {u.last_name ?? ""}
                        </span>
                        {u.role && (
                          <Badge variant="outline" className="text-[9px] ml-auto">
                            {ROLE_LABELS[u.role] ?? u.role}
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Date preset */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">Période</label>
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value)}
                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#DC2626]/30 focus:border-[#DC2626]"
              >
                {DATE_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom date range */}
            {datePreset === "custom" && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500 font-medium">Du</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#DC2626]/30 focus:border-[#DC2626]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500 font-medium">Au</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#DC2626]/30 focus:border-[#DC2626]"
                  />
                </div>
              </>
            )}
          </div>

          {/* ─── Activity List ───────────────────────────────────── */}
          {loading && activities.length === 0 ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Activity className="h-10 w-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">
                {hasActiveFilters
                  ? "Aucune activité trouvée avec ces filtres."
                  : "Aucune activité enregistrée."}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {activities.map((act) => {
                const resourceLabel = act.resource_type
                  ? RESOURCE_LABELS[act.resource_type] ?? act.resource_type
                  : "";
                const actionLabel = ACTION_LABELS[act.action] ?? act.action;
                const profile = act.profiles;
                const userName = profile
                  ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim()
                  : null;

                return (
                  <div
                    key={act.id}
                    className="flex items-start gap-3 py-3 px-3 rounded-md hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                  >
                    <div className="mt-0.5">{getIcon(act.action)}</div>

                    {/* User avatar — super_admin only */}
                    {isSuperAdmin && profile && (
                      <div
                        className={`mt-0.5 h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${
                          ROLE_BADGE_COLORS[profile.role ?? ""] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {getInitials(profile.first_name, profile.last_name)}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">
                        {/* User name + role — super_admin only */}
                        {isSuperAdmin && userName && (
                          <>
                            <span className="font-medium text-gray-800">{userName}</span>
                            {profile?.role && (
                              <Badge
                                className={`ml-1.5 text-[9px] border-0 ${
                                  ROLE_BADGE_COLORS[profile.role] ?? "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {ROLE_LABELS[profile.role] ?? profile.role}
                              </Badge>
                            )}
                            <span className="text-gray-400 mx-1.5">—</span>
                          </>
                        )}
                        {actionLabel}
                        {resourceLabel && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            {resourceLabel}
                          </Badge>
                        )}
                      </p>
                      {act.details &&
                        typeof (act.details as Record<string, unknown>).name === "string" && (
                          <p className="text-xs text-gray-400 truncate">
                            {(act.details as Record<string, string>).name}
                          </p>
                        )}
                    </div>

                    <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
                      {formatDateTime(act.created_at)}
                    </span>
                  </div>
                );
              })}

              {/* Load more */}
              {hasMore && (
                <div className="text-center pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchActivities(activities.length, true)}
                    disabled={loading}
                  >
                    {loading ? "Chargement..." : "Charger plus"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
