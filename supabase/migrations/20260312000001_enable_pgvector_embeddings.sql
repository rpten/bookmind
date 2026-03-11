-- Habilitar extensão pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Coluna de embedding em dim_books (text-embedding-3-small = 1536 dims)
ALTER TABLE public.dim_books
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Index HNSW para busca por similaridade (cosine)
CREATE INDEX IF NOT EXISTS idx_dim_books_embedding_hnsw
ON public.dim_books
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

COMMENT ON COLUMN public.dim_books.embedding IS 'OpenAI text-embedding-3-small (1536d) sobre title + author + synopsis + genres';
