ALTER TABLE public.dim_books
ADD COLUMN IF NOT EXISTS ol_work_id text;

CREATE INDEX IF NOT EXISTS idx_dim_books_ol_work_id
ON public.dim_books(ol_work_id);
