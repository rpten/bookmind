-- ══════════════════════════════════════════════════════════════
-- Gold: mart_emotional_recommendations
-- Recomendações por usuário combinando:
--   • 50% composite_score do catálogo (rating global)
--   • 20% author_affinity (mesmo autor de livro high-impact)
--   • 20% theme_match (sobreposição de themes com livros high-impact)
--   • 10% emotional_match (checkboxes: hope/melancholy/etc — ativa
--          automaticamente quando usuários preencherem o campo)
-- Output: top 20 livros não lidos por usuário
-- ══════════════════════════════════════════════════════════════

{{ config(materialized='table') }}

with books as (
    select * from {{ ref('stg_books') }}
),

catalog as (
    select * from {{ ref('mart_book_catalog') }}
),

-- Livros já na biblioteca do usuário (excluir das recomendações)
already_in_library as (
    select
        user_id,
        lower(trim(title)) as title_key
    from books
),

-- Autores favoritos do usuário (livros com impact >= 4)
user_favorite_authors as (
    select
        user_id,
        lower(trim(author)) as author_key,
        count(*)            as times_read,
        avg(impact)         as avg_impact
    from books
    where impact >= 4
    group by 1, 2
),

-- Themes preferidos do usuário (de livros high-impact com themes preenchidos)
user_preferred_themes as (
    select distinct
        user_id,
        lower(trim(jsonb_array_elements_text(themes))) as theme
    from books
    where impact >= 4
      and jsonb_array_length(themes) > 0
),

-- Perfil emocional do usuário via checkboxes (ativo quando preenchidos)
-- Conta quantas vezes cada emoção apareceu em livros high-impact
user_emotion_profile as (
    select
        user_id,
        sum(case when (checkboxes->>'hope')::boolean        then 1 else 0 end) as pref_hope,
        sum(case when (checkboxes->>'melancholy')::boolean  then 1 else 0 end) as pref_melancholy,
        sum(case when (checkboxes->>'tension')::boolean     then 1 else 0 end) as pref_tension,
        sum(case when (checkboxes->>'reflection')::boolean  then 1 else 0 end) as pref_reflection,
        sum(case when (checkboxes->>'comfort')::boolean     then 1 else 0 end) as pref_comfort,
        sum(case when (checkboxes->>'lightness')::boolean   then 1 else 0 end) as pref_lightness,
        sum(case when (checkboxes->>'anguish')::boolean     then 1 else 0 end) as pref_anguish,
        sum(case when (checkboxes->>'admiration')::boolean  then 1 else 0 end) as pref_admiration
    from books
    where impact >= 4
    group by user_id
),

-- Emoções agregadas por livro do catálogo (via leituras de todos os usuários)
book_emotion_profile as (
    select
        lower(trim(title))  as title_key,
        sum(case when (checkboxes->>'hope')::boolean        then 1 else 0 end) as has_hope,
        sum(case when (checkboxes->>'melancholy')::boolean  then 1 else 0 end) as has_melancholy,
        sum(case when (checkboxes->>'tension')::boolean     then 1 else 0 end) as has_tension,
        sum(case when (checkboxes->>'reflection')::boolean  then 1 else 0 end) as has_reflection,
        sum(case when (checkboxes->>'comfort')::boolean     then 1 else 0 end) as has_comfort,
        sum(case when (checkboxes->>'lightness')::boolean   then 1 else 0 end) as has_lightness,
        sum(case when (checkboxes->>'anguish')::boolean     then 1 else 0 end) as has_anguish,
        sum(case when (checkboxes->>'admiration')::boolean  then 1 else 0 end) as has_admiration
    from books
    group by 1
),

-- Todos os usuários com ao menos 1 livro
all_users as (
    select distinct user_id from books
),

-- Livros candidatos (catálogo × usuários, excluindo já lidos)
candidates as (
    select
        u.user_id,
        c.id             as catalog_book_id,
        c.title,
        c.author,
        c.isbn,
        c.cover_url,
        c.synopsis,
        c.genres,
        c.avg_rating,
        c.composite_score,
        c.global_rank    as catalog_global_rank,

        -- Sinal 1: author affinity
        coalesce((
            select 1
            from user_favorite_authors fa
            where fa.user_id = u.user_id
              and fa.author_key = lower(trim(c.author))
            limit 1
        ), 0)::numeric                                  as author_affinity,

        -- Sinal 2: sobreposição de themes
        coalesce((
            select count(distinct pt.theme)
            from user_preferred_themes pt
            where pt.user_id = u.user_id
              and pt.theme = any(c.genres)
        ), 0)::numeric                                  as theme_match_count,

        -- Sinal 3: emotional match (0 agora, ativa com checkboxes preenchidos)
        coalesce((
            select
                (case when ep.pref_hope > 0       and bep.has_hope > 0       then 1 else 0 end
                + case when ep.pref_melancholy > 0 and bep.has_melancholy > 0 then 1 else 0 end
                + case when ep.pref_tension > 0    and bep.has_tension > 0    then 1 else 0 end
                + case when ep.pref_reflection > 0 and bep.has_reflection > 0 then 1 else 0 end
                + case when ep.pref_comfort > 0    and bep.has_comfort > 0    then 1 else 0 end
                + case when ep.pref_lightness > 0  and bep.has_lightness > 0  then 1 else 0 end
                + case when ep.pref_anguish > 0    and bep.has_anguish > 0    then 1 else 0 end
                + case when ep.pref_admiration > 0 and bep.has_admiration > 0 then 1 else 0 end
                )::numeric
            from user_emotion_profile ep
            cross join book_emotion_profile bep
            where ep.user_id = u.user_id
              and bep.title_key = lower(trim(c.title))
            limit 1
        ), 0)                                           as emotional_match_score

    from all_users u
    cross join catalog c
    where not exists (
        select 1 from already_in_library al
        where al.user_id = u.user_id
          and al.title_key = lower(trim(c.title))
    )
),

-- Score final e ranking
scored as (
    select
        *,
        round(
              coalesce(composite_score, 0)              * 0.50
            + author_affinity                           * 0.20
            + least(theme_match_count, 5.0) / 5.0      * 0.20
            + least(emotional_match_score, 8.0) / 8.0  * 0.10
        , 4)                                            as recommendation_score,

        row_number() over (
            partition by user_id
            order by
                coalesce(composite_score, 0)              * 0.50
                + author_affinity                         * 0.20
                + least(theme_match_count, 5.0) / 5.0    * 0.20
                + least(emotional_match_score, 8.0) / 8.0 * 0.10 desc,
                avg_rating desc nulls last,
                catalog_global_rank asc
        )                                               as recommendation_rank
    from candidates
)

select
    user_id,
    recommendation_rank,
    recommendation_score,
    emotional_match_score,
    theme_match_count,
    author_affinity,
    composite_score,
    catalog_book_id,
    title,
    author,
    isbn,
    cover_url,
    synopsis,
    genres,
    avg_rating,
    catalog_global_rank
from scored
where recommendation_rank <= 20
order by user_id, recommendation_rank
