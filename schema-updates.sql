-- Cleanup potential duplicates before adding unique constraint
DELETE FROM public.monthly_goals a
USING public.monthly_goals b
WHERE a.id > b.id
  AND a.planning_item_id = b.planning_item_id
  AND a.month = b.month
  AND a.year = b.year;

-- Add unique constraint for upsert
ALTER TABLE public.monthly_goals 
DROP CONSTRAINT IF EXISTS monthly_goals_unique_item_month_year;

ALTER TABLE public.monthly_goals 
ADD CONSTRAINT monthly_goals_unique_item_month_year UNIQUE (planning_item_id, month, year);

-- Create table for global monthly stage offsets (if not exists)
CREATE TABLE IF NOT EXISTS public.monthly_stage_defaults (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  month integer NOT NULL,
  year integer NOT NULL,
  stage_id integer REFERENCES public.kanban_stages(id) ON DELETE CASCADE,
  offset_days integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(month, year, stage_id)
);

-- Enable RLS
ALTER TABLE public.monthly_stage_defaults ENABLE ROW LEVEL SECURITY;

-- Allow public access
DROP POLICY IF EXISTS "Allow all on monthly_stage_defaults" ON public.monthly_stage_defaults;
CREATE POLICY "Allow all on monthly_stage_defaults" ON public.monthly_stage_defaults
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── Add color column to kanban_stages ──────────────────────────
-- Run this in Supabase SQL Editor to enable stage colors
ALTER TABLE public.kanban_stages 
ADD COLUMN IF NOT EXISTS color text DEFAULT '#4f8ef7';
