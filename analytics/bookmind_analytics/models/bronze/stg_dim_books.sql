-- ══════════════════════════════════════════════════════════════
-- Bronze: stg_dim_books
-- Raw view sobre public.dim_books (catálogo global de livros)
-- ══════════════════════════════════════════════════════════════

{{ config(materialized='view') }}

select
    id,
    isbn,
    title,
    author,
    year,
    synopsis,
    cover_url,
    genres,
    language,
    page_count,
    avg_rating,
    ratings_count,
    source,
    created_at

from public.dim_books
