-- ══════════════════════════════════════════════════════════════
-- Gold: mart_user_reading_profile
-- Perfil analítico de leitura por usuário.
-- Agregações para dashboard pessoal do BookMind.
-- ══════════════════════════════════════════════════════════════

{{ config(materialized='table') }}

with enriched as (
    select * from {{ ref('int_books_enriched') }}
),

profile as (
    select
        user_id,

        -- Volume de leitura
        count(*)                                            as total_books,
        count(*) filter (where status = 'lido')             as books_read,
        count(*) filter (where status = 'lendo')            as books_reading,
        count(*) filter (where status = 'quero ler')        as books_queue,

        -- Impacto
        round(avg(impact) filter (where impact is not null), 2)
                                                            as avg_impact,
        count(*) filter (where is_high_impact)              as high_impact_count,

        -- Livro mais recente lido
        max(date_read) filter (where status = 'lido')       as last_read_date,

        -- Autor mais lido
        (
            select author
            from enriched e2
            where e2.user_id = enriched.user_id
              and e2.status = 'lido'
            group by author
            order by count(*) desc
            limit 1
        )                                                   as top_author,

        -- Frases registradas
        count(*) filter (where phrase is not null and phrase != '')
                                                            as phrases_count,

        -- Momentos registrados
        count(*) filter (where moment is not null and moment != '')
                                                            as moments_count,

        current_timestamp                                   as refreshed_at

    from enriched
    group by user_id
)

select * from profile
