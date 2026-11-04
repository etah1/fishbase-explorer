ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS batch_id uuid;

CREATE INDEX IF NOT EXISTS submissions_batch_id_idx ON public.submissions (batch_id);
