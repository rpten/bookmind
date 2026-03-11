-- ══════════════════════════════════════════════════════════════
-- Silver: int_books_enriched
-- Join entre leituras do usuário e catálogo global.
-- Adiciona metadados (capa, sinopse, rating) e campos calculados.
-- ══════════════════════════════════════════════════════════════

{{ config(materialized='view') }}

with books as (
    select * from {{ ref('stg_books') }}
),

catalog as (
    select * from {{ ref('stg_dim_books') }}
),

enriched as (
    select
        b.id                                            as book_entry_id,
        b.user_id,
        b.title,
        b.author,
        b.year,
        b.status,
        b.date_read,
        b.impact,
        b.phrase,
        b.moment,
        b.checkboxes,
        b.provocations,
        b.themes,
        b.created_at,

        -- Metadados do catálogo
        c.isbn,
        c.synopsis,
        c.cover_url,
        c.genres,
        c.language,
        c.page_count,
        c.avg_rating,
        c.ratings_count,
        c.source                                        as catalog_source,

        -- Campos calculados
        case
            when b.impact >= 4 then true
            else false
        end                                             as is_high_impact,

        case
            when b.status = 'lido'      then 1
            when b.status = 'lendo'     then 2
            when b.status = 'quero ler' then 3
            else 4
        end                                             as status_order,

        case
            when b.impact = 5 then 'transformador'
            when b.impact = 4 then 'marcante'
            when b.impact = 3 then 'bom'
            when b.impact = 2 then 'mediano'
            when b.impact = 1 then 'fraco'
            else 'não avaliado'
        end                                             as impact_label

    from books b
    left join catalog c
        on lower(trim(b.title)) = lower(trim(c.title))
        and lower(trim(b.author)) = lower(trim(c.author))
)

select * from enriched
