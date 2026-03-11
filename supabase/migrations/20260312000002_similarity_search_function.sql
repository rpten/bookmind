-- Função de busca por similaridade semântica
-- Usada pela Edge Function ou diretamente pelo frontend via RPC
CREATE OR REPLACE FUNCTION match_books(
  query_embedding vector(1536),
  match_count     int DEFAULT 10,
  min_similarity  float DEFAULT 0.5
)
RETURNS TABLE (
  id              uuid,
  title           text,
  author          text,
  year            text,
  synopsis        text,
  cover_url       text,
  isbn            text,
  avg_rating      numeric,
  ratings_count   int,
  similarity      float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id, title, author, year, synopsis, cover_url, isbn, avg_rating, ratings_count,
    1 - (embedding <=> query_embedding) AS similarity
  FROM public.dim_books
  WHERE embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) > min_similarity
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
