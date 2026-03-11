"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, Clock, AlertTriangle, FileText, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CrmNotification } from "@/lib/types";

const NOTIFICATION_ICONS: Record<string, React.ElementType> = {
  task_overdue: AlertTriangle,
  task_due_today: Clock,
  task_due_soon: Clock,
  quote_followup: FileText,
  quote_expiring: AlertTriangle,
  general: Bell,
};

const NOTIFICATION_COLORS: Record<string, string> = {
  task_overdue: "text-red-500",
  task_due_today: "text-amber-500",
  task_due_soon: "text-blue-500",
  quote_followup: "text-orange-500",
  quote_expiring: "text-red-500",
  general: "text-gray-500",
};

const TYPE_LABELS: Record<string, string> = {
  task_overdue: "Tâche en retard",
  task_due_today: "Échéance aujourd'hui",
  task_due_soon: "Échéance proche",
  quote_followup: "Relance devis",
  quote_expiring: "Devis expirant",
  general: "Général",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Hier";
  return `Il y a ${days}j`;
}

const PAGE_SIZE = 50;

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<CrmNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const fetchNotifications = useCallback(async (offset = 0, append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (filter === "unread") params.set("unread", "true");

      const res = await fetch(`/api/crm/notifications?${params}`);
      if (res.ok) {
        const json = await res.json();
        setNotifications((prev) => append ? [...prev, ...(json.data ?? [])] : (json.data ?? []));
        setUnreadCount(json.unread_count ?? 0);
        setTotalCount(json.total_count ?? 0);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchNotifications(0, false);
  }, [fetchNotifications]);

  async function markAsRead(id: string) {
    try {
      await fetch("/api/crm/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // Silently fail
    }
  }

  async function markAllRead() {
    try {
      await fetch("/api/crm/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_all_read: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // Silently fail
    }
  }

  function handleClick(notification: CrmNotification) {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    if (notification.link) {
      router.push(notification.link);
    }
  }

  const hasMore = notifications.length < totalCount;

  return (
    <div className="space-y-6 p-6 bg-gray-50 min-h-screen">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        <span className="font-medium text-gray-700">Administration</span>
        <span className="mx-2">/</span>
        <span>Notifications</span>
      </div>

      <Card className="bg-white border border-gray-200 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold text-gray-700 flex items-center gap-2">
            <Bell className="h-4 w-4" style={{ color: "#3DB5C5" }} />
            Notifications
            {unreadCount > 0 && (
              <Badge className="bg-red-500 text-white text-[10px] ml-1">
                {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-3">
            {/* Filters */}
            <div className="flex gap-1">
              <Button
                variant={filter === "all" ? "default" : "outline"}
                size="sm"
                className="text-xs h-7"
                onClick={() => setFilter("all")}
              >
                Toutes
              </Button>
              <Button
                variant={filter === "unread" ? "default" : "outline"}
                size="sm"
                className="text-xs h-7"
                onClick={() => setFilter("unread")}
              >
                Non lues
              </Button>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-[#3DB5C5] hover:underline font-medium"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading && notifications.length === 0 ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Bell className="h-10 w-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">
                {filter === "unread" ? "Aucune notification non lue" : "Aucune notification"}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {notifications.map((notification) => {
                const Icon = NOTIFICATION_ICONS[notification.type] ?? Bell;
                const colorClass = NOTIFICATION_COLORS[notification.type] ?? "text-gray-500";
                return (
                  <button
                    key={notification.id}
                    onClick={() => handleClick(notification)}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3 text-left rounded-md hover:bg-gray-50 transition-colors",
                      !notification.is_read && "bg-blue-50/50"
                    )}
                  >
                    <div className={cn("mt-0.5 flex-shrink-0", colorClass)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn(
                          "text-sm",
                          !notification.is_read ? "font-semibold text-gray-900" : "text-gray-700"
                        )}>
                          {notification.title}
                        </p>
                        {!notification.is_read && (
                          <span className="h-2 w-2 rounded-full bg-[#3DB5C5] flex-shrink-0" />
                        )}
                        <Badge variant="outline" className="text-[10px] ml-auto flex-shrink-0">
                          {TYPE_LABELS[notification.type] ?? notification.type}
                        </Badge>
                      </div>
                      {notification.message && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1">
                        {timeAgo(notification.created_at)}
                      </p>
                    </div>
                  </button>
                );
              })}

              {/* Load more */}
              {hasMore && (
                <div className="text-center pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchNotifications(notifications.length, true)}
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
