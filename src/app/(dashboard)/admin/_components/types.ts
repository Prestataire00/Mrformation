import type { CSSProperties } from "react";

// ─── Shared types for admin dashboard components ──────────────────────────────

export interface UpcomingSession {
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

export interface MissingReportAlert {
  session_id: string;
  session_title: string;
  training_title: string | null;
  start_date: string;
}

export interface OverdueTask {
  id: string;
  title: string;
  due_date: string;
  priority: string;
}

export interface RecentActivity {
  id: string;
  action: string;
  resource_type: string | null;
  details: Record<string, unknown>;
  created_at: string;
  profiles?: {
    first_name: string | null;
    last_name: string | null;
    role: string | null;
  } | null;
}

export interface CalendarSession {
  id: string;
  title: string;
  training_title: string | null;
  start_date: string;
  end_date: string;
  start_hour: string; // "09", "14", etc.
}

export interface WidgetConfigItem {
  id: string;
  label: string;
  visible: boolean;
  order: number;
}

export interface KpiConfigItem {
  id: string;
  label: string;
  visible: boolean;
  order: number;
}
