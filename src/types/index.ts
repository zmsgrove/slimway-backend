export type Role = 'developer' | 'owner' | 'franchisee' | 'admin' | 'staff' | 'technical'

export interface AuthUser {
  id: string
  role: Role
  branch_id: string | null
  email: string
}

export interface ClientUser {
  id: string
  branch_id: string
  full_name: string
}

export interface ApiKeyContext {
  branch_id: string
  scopes: string[]
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
      client?: ClientUser
      apiKey?: ApiKeyContext
    }
  }
}

export interface ApiError {
  error: string
  code?: string
}

// ─── Migration 023: api_keys ───────────────────────────────────────────────
export interface ApiKey {
  id: string
  branch_id: string
  name: string
  key_prefix: string
  raw_key?: string
  permissions: string[]
  is_active: boolean
  last_used_at: string | null
  created_by: string
  created_at: string
}

// ─── Migration 024: webhook_endpoints / webhook_logs ──────────────────────
export interface WebhookEndpoint {
  id: string
  branch_id: string
  url: string
  events: string[]
  is_active: boolean
  secret?: string
  created_at: string
  updated_at: string
}

export interface WebhookLog {
  id: string
  webhook_endpoint_id: string
  event: string
  payload: Record<string, unknown>
  response_status: number | null
  response_body: string | null
  attempt: number
  created_at: string
}

// ─── Migration 025: tasks.is_auto ─────────────────────────────────────────
export interface Task {
  id: string
  branch_id: string
  title: string
  description?: string | null
  status: 'new' | 'in_progress' | 'done' | 'closed'
  priority: 'low' | 'medium' | 'high'
  assigned_to?: string | null
  created_by?: string | null
  deadline?: string | null
  observer_ids: unknown[]
  is_auto?: boolean
  created_at: string
  updated_at?: string
}

// ─── Migration 026: promo_codes (no new type needed, tracked via routes) ──

// ─── Migration 027: shift_checkins extended fields ────────────────────────
export interface ShiftCheckin {
  id: string
  shift_id: string
  employee_id: string
  branch_id: string
  checked_in_at: string
  checked_out_at?: string | null
  checkin_type?: 'self' | 'replacement'
  replaces_employee_id?: string | null
  replacement_note?: string | null
}

// ─── Migration 028: bookings_v2 extended fields ───────────────────────────
export interface BookingV2 {
  id: string
  branch_id: string
  client_id: string
  date: string
  slot_1_schedule_slot_id?: string | null
  slot_1_device_id?: string | null
  slot_1_time_start?: string | null
  slot_1_weekday?: number | null
  slot_2_schedule_slot_id?: string | null
  slot_2_device_id?: string | null
  slot_2_time_start?: string | null
  slot_2_weekday?: number | null
  status?: 'pending' | 'confirmed' | 'cancelled'
  confirmed_by?: string | null
  confirmed_at?: string | null
  created_at: string
  updated_at?: string
}

// ─── Migration 029: subscriptions extended fields ─────────────────────────
export interface Subscription {
  id: string
  branch_id: string
  client_id: string
  name: string
  status: 'active' | 'frozen' | 'cancelled' | 'expired'
  date_start: string
  date_end?: string | null
  price?: number | null
  // Slot 1
  slot_1_type: string
  slot_1_duration_min: number
  slot_1_sessions_total: number
  slot_1_sessions_left: number
  slot_1_device_id?: string | null
  slot_1_schedule_slot_id?: string | null
  slot_1_time_start?: string | null
  slot_1_weekday?: number | null
  // Slot 2
  slot_2_type?: string | null
  slot_2_duration_min?: number | null
  slot_2_sessions_total?: number | null
  slot_2_sessions_left?: number | null
  slot_2_device_id?: string | null
  slot_2_schedule_slot_id?: string | null
  slot_2_time_start?: string | null
  slot_2_weekday?: number | null
  // Slot 3 (migration 029)
  slot_3_type?: string | null
  slot_3_duration_min?: number | null
  slot_3_sessions_total?: number | null
  slot_3_sessions_left?: number | null
  slot_3_device_id?: string | null
  slot_3_schedule_slot_id?: string | null
  slot_3_time_start?: string | null
  slot_3_weekday?: number | null
  // Slot 4 (migration 029)
  slot_4_type?: string | null
  slot_4_duration_min?: number | null
  slot_4_sessions_total?: number | null
  slot_4_sessions_left?: number | null
  slot_4_device_id?: string | null
  slot_4_schedule_slot_id?: string | null
  slot_4_time_start?: string | null
  slot_4_weekday?: number | null
  // Migration 029 extra fields
  finish_slot?: number | null
  is_trial?: boolean
  deleted_at?: string | null
  deleted_by?: string | null
  cancellation_reason?: string | null
  frozen_at?: string | null
  frozen_until?: string | null
  freeze_days_used?: number | null
  created_at: string
  updated_at?: string
}
