ALTER TABLE employees ADD COLUMN IF NOT EXISTS base_salary   numeric(10,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS kpi_amount    numeric(10,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS sales_percent numeric(5,2)  DEFAULT 0;
