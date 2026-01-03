-- Add discount columns to acts table
ALTER TABLE public.acts ADD COLUMN IF NOT EXISTS discount numeric(5,2) DEFAULT 0;
ALTER TABLE public.acts ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) DEFAULT 0;
