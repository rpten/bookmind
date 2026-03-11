-- ══════════════════════════════════════════════════════════════
-- Bronze: stg_books
-- Raw view sobre public.books (registros de leitura do usuário)
-- ══════════════════════════════════════════════════════════════

{{ config(materialized='view') }}

select
    id,
    user_id,
    title,
    author,
    year,
    status,
    date_read,
    impact,
    phrase,
    moment,
    checkboxes,
    provocations,
    themes,
    created_at

from public.books
