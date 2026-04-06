"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, Clock, AlertTriangle, FileText, CheckCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export function NotificationPanel() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<CrmNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const lastGenerate = useRef<number>(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/notifications?limit=30");
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data ?? []);
        setUnreadCount(json.unread_count ?? 0);
      }
    } catch {
      // Silently fail - notifications are non-critical
    }
  }, []);

  const generateNotifications = useCallback(async () => {
    const now = Date.now();
    // Max once per hour
    if (now - lastGenerate.current < 3600000) return;
    lastGenerate.current = now;

    try {
      await fetch("/api/crm/notifications/generate", { method: "POST" });
      // Refetch after generating
      await fetchNotifications();
    } catch {
      // Silently fail
    }
  }, [fetchNotifications]);

  // Initial load + polling every 60s
  useEffect(() => {
    fetchNotifications();
    generateNotifications();

    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications, generateNotifications]);

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
      setOpen(false);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 text-white hover:bg-white/20"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm text-gray-900">Notifications</h3>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-[#DC2626] hover:underline font-medium"
            >
              Tout marquer comme lu
            </button>
          )}
        </div>

        {/* Notifications list */}
        <div className="max-h-[400px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Bell className="h-8 w-8 text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">Aucune notification</p>
            </div>
          ) : (
            notifications.map((notification) => {
              const Icon = NOTIFICATION_ICONS[notification.type] ?? Bell;
              const colorClass = NOTIFICATION_COLORS[notification.type] ?? "text-gray-500";
              return (
                <button
                  key={notification.id}
                  onClick={() => handleClick(notification)}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0",
                    !notification.is_read && "bg-blue-50/50"
                  )}
                >
                  <div className={cn("mt-0.5 flex-shrink-0", colorClass)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        "text-sm truncate",
                        !notification.is_read ? "font-semibold text-gray-900" : "text-gray-700"
                      )}>
                        {notification.title}
                      </p>
                      {!notification.is_read && (
                        <span className="h-2 w-2 rounded-full bg-[#DC2626] flex-shrink-0" />
                      )}
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
            })
          )}
        </div>

        {/* Footer link */}
        <div className="border-t px-4 py-2 text-center">
          <button
            onClick={() => { router.push("/admin/notifications"); setOpen(false); }}
            className="text-xs text-[#DC2626] hover:underline font-medium"
          >
            Voir toutes les notifications
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
