-- Liga cada entrada da biblioteca do usuário ao catálogo dim_books
ALTER TABLE public.books
ADD COLUMN IF NOT EXISTS dim_book_id uuid REFERENCES public.dim_books(id) ON DELETE SET NULL;

-- Index para joins frequentes
CREATE INDEX IF NOT EXISTS idx_books_dim_book_id ON public.books(dim_book_id);
