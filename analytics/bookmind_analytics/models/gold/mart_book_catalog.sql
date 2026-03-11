-- ══════════════════════════════════════════════════════════════
-- Gold: mart_book_catalog
-- Catálogo ranqueado com score composto:
-- média ponderada de rating global + impacto dos usuários BookMind.
-- ══════════════════════════════════════════════════════════════

{{ config(materialized='table') }}

with catalog as (
    select * from {{ ref('stg_dim_books') }}
),

user_ratings as (
    select
        lower(trim(title))   as title_key,
        lower(trim(author))  as author_key,
        round(avg(impact), 2)  as bookmind_avg_impact,
        count(*)               as bookmind_read_count
    from {{ ref('stg_books') }}
    where status = 'lido'
      and impact is not null
    group by 1, 2
),

ranked as (
    select
        c.id,
        c.isbn,
        c.title,
        c.author,
        c.year,
        c.synopsis,
        c.cover_url,
        c.genres,
        c.language,
        c.page_count,
        c.avg_rating,
        c.ratings_count,
        c.source,

        -- Impacto médio dos leitores BookMind (escala 1-5)
        u.bookmind_avg_impact,
        u.bookmind_read_count,

        -- Score composto: 70% rating global (normalizado 1-5) + 30% impacto BookMind
        round(
            coalesce(c.avg_rating, 0) * 0.7
            + coalesce(u.bookmind_avg_impact, 0) * 0.3
        , 2)                                            as composite_score,

        -- Ranking global
        row_number() over (
            order by
                coalesce(c.avg_rating, 0) * 0.7
                + coalesce(u.bookmind_avg_impact, 0) * 0.3 desc,
                c.ratings_count desc nulls last
        )                                               as global_rank

    from catalog c
    left join user_ratings u
        on lower(trim(c.title))  = u.title_key
        and lower(trim(c.author)) = u.author_key
)

select * from ranked
