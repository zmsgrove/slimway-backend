-- Performance indexes migration 030
-- Execute manually in Supabase SQL Editor

CREATE INDEX IF NOT EXISTS idx_clients_branch_id_status ON clients(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_subscriptions_client_id ON subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_branch_status ON subscriptions(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_v2_branch_date ON bookings_v2(branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_v2_client_id ON bookings_v2(client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_v2_status ON bookings_v2(status);
CREATE INDEX IF NOT EXISTS idx_leads_branch_status ON leads(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_branch_status ON tasks(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_is_auto ON tasks(is_auto);
CREATE INDEX IF NOT EXISTS idx_shifts_employee_date ON shifts(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_timesheet_employee_date ON timesheet(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_notifications_profile_unread ON notifications(profile_id, is_read);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created ON webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_branch_created ON audit_log(branch_id, created_at DESC);
