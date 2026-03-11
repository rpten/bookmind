-- Remove duplicatas em dim_books mantendo o registro mais antigo
-- por (lower(title), lower(author))
DELETE FROM public.dim_books
WHERE id NOT IN (
  SELECT DISTINCT ON (lower(title), lower(author)) id
  FROM public.dim_books
  ORDER BY lower(title), lower(author), created_at ASC NULLS LAST
);

-- Garante que futuras inserções por título+autor sejam idempotentes
-- (livros sem ISBN são evitados via checagem no edge function)
