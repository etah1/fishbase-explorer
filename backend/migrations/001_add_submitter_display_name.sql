ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS submitter_display_name text;
