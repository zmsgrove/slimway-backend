-- Migration 018: Employee salary fields

ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_rate    numeric NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS payment_type   text    NULL CHECK (payment_type IN ('hourly', 'fixed', 'percent'));
