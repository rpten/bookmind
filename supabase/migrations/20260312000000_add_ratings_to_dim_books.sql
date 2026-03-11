-- Adicionar colunas de rating na tabela dim_books
ALTER TABLE dim_books
ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,2),
ADD COLUMN IF NOT EXISTS ratings_count INTEGER;

-- Index para otimizar queries por rating
CREATE INDEX IF NOT EXISTS idx_dim_books_avg_rating ON dim_books(avg_rating DESC)
WHERE avg_rating IS NOT NULL;

COMMENT ON COLUMN dim_books.avg_rating IS 'Average rating from Open Library or Google Books (0-5)';
COMMENT ON COLUMN dim_books.ratings_count IS 'Total number of ratings';
