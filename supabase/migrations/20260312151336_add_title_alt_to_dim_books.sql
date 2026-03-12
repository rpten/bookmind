ALTER TABLE public.dim_books
ADD COLUMN IF NOT EXISTS title_alt text[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_dim_books_title_alt
ON public.dim_books USING GIN(title_alt);
