// ══════════════════════════════════════════════════════════════
// Edge Function: search-book
// 1. Cache: title ILIKE %query% OR title_alt @> ARRAY[query]
// 2. Cache miss → Google Books API
// 3. Para cada resultado:
//    a. ISBN → match em dim_books → retorna existente + salva title_alt
//    b. ISBN → OL work_id → match em dim_books → retorna existente + salva title_alt
//    c. Sem match → insere novo registro
// 4. Deduplicação final por ISBN antes de retornar
// ══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SELECT = 'id, title, author, year, synopsis, cover_url, isbn, avg_rating, ratings_count, title_alt, ol_work_id'

// ── Helpers ────────────────────────────────────────────────────

async function addTitleAlt(
  supabase: ReturnType<typeof createClient>,
  existing: Record<string, unknown>,
  searchQuery: string,
) {
  const titleAlts = (existing.title_alt as string[]) || []
  const normalized = searchQuery.trim()
  const alreadyKnown =
    normalized.toLowerCase() === (existing.title as string).toLowerCase() ||
    titleAlts.some(t => t.toLowerCase() === normalized.toLowerCase())

  if (!alreadyKnown && normalized) {
    await supabase
      .from('dim_books')
      .update({ title_alt: [...titleAlts, normalized] })
      .eq('id', existing.id)
  }
}

async function fetchOLWorkId(isbn: string): Promise<string | null> {
  try {
    const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`, {
      headers: { 'User-Agent': 'BookMind/1.0' },
    })
    if (!res.ok) return null
    const data = await res.json()
    const workKey = data.works?.[0]?.key
    if (!workKey) return null
    return workKey.replace('/works/', '')
  } catch {
    return null
  }
}

function toResult(row: Record<string, unknown>, isbnOverride?: string | null) {
  return {
    id:            row.id as string,
    dim_book_id:   row.id as string,
    title:         row.title,
    author:        row.author,
    year:          row.year,
    synopsis:      row.synopsis,
    cover_url:     row.cover_url,
    isbn:          isbnOverride ?? (row.isbn as string | null),
    avg_rating:    row.avg_rating,
    ratings_count: row.ratings_count,
  }
}

// ── Handler ─────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query } = await req.json()

    if (!query || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: 'Query must be at least 2 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── 1. Cache: title ILIKE %query% OR title_alt @> ARRAY[query] ──
    const { data: cached, error: dbError } = await supabase
      .from('dim_books')
      .select('id, title, author, year, synopsis, cover_url, isbn, avg_rating, ratings_count')
      .or(`title.ilike.%${query}%,title_alt.cs.{"${query}"}`)
      .limit(10)

    if (dbError) throw dbError

    if (cached && cached.length > 0) {
      return new Response(
        JSON.stringify({
          books: cached.map(b => ({ ...b, dim_book_id: b.id })),
          source: 'cache',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 2. Google Books API ───────────────────────────────────────
    const gbQuery = `intitle:${query}+OR+inauthor:${query}`
    const gbRes = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(gbQuery)}&maxResults=5`
    )
    const gbData = await gbRes.json()

    if (!gbData.items?.length) {
      return new Response(
        JSON.stringify({ books: [], source: 'google_books' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 3. Resolve cada resultado em paralelo ─────────────────────
    const raw = await Promise.all(
      gbData.items.slice(0, 5).map(async (item: Record<string, unknown>) => {
        const v = item.volumeInfo as Record<string, unknown>
        const identifiers = v.industryIdentifiers as { type: string; identifier: string }[] | undefined
        const isbn = identifiers?.find(id => id.type === 'ISBN_13')?.identifier || null

        const bookData = {
          isbn,
          title:         (v.title as string) || 'Sem título',
          author:        (v.authors as string[])?.[0] || 'Autor desconhecido',
          year:          v.publishedDate ? parseInt((v.publishedDate as string).substring(0, 4)) : null,
          synopsis:      (v.description as string) || null,
          cover_url:     (v.imageLinks as Record<string, string>)?.thumbnail?.replace('http:', 'https:') || null,
          genres:        (v.categories as string[]) || [],
          language:      (v.language as string) || 'en',
          page_count:    (v.pageCount as number) || null,
          avg_rating:    (v.averageRating as number) || null,
          ratings_count: (v.ratingsCount as number) || null,
          source:        'google_books',
          raw_data:      item,
        }

        // a. Match por ISBN ────────────────────────────────────────
        if (isbn) {
          const { data: byIsbn } = await supabase
            .from('dim_books')
            .select(SELECT)
            .eq('isbn', isbn)
            .maybeSingle()

          if (byIsbn) {
            await addTitleAlt(supabase, byIsbn, query)
            return toResult(byIsbn)
          }

          // b. OL work_id → match cruzado ──────────────────────────
          const workId = await fetchOLWorkId(isbn)

          if (workId) {
            const { data: byWorkId } = await supabase
              .from('dim_books')
              .select(SELECT)
              .eq('ol_work_id', workId)
              .maybeSingle()

            if (byWorkId) {
              await addTitleAlt(supabase, byWorkId, query)
              if (!byWorkId.isbn) {
                await supabase.from('dim_books').update({ isbn }).eq('id', byWorkId.id)
              }
              return toResult(byWorkId, (byWorkId.isbn as string | null) ?? isbn)
            }

            // c. Insere novo com ol_work_id ──────────────────────────
            const { data: inserted } = await supabase
              .from('dim_books')
              .insert({ ...bookData, ol_work_id: workId })
              .select('id')
              .single()

            return {
              id:            (inserted?.id as string) || isbn,
              dim_book_id:   (inserted?.id as string) || null,
              title:         bookData.title,
              author:        bookData.author,
              year:          bookData.year,
              synopsis:      bookData.synopsis,
              cover_url:     bookData.cover_url,
              isbn:          bookData.isbn,
              avg_rating:    bookData.avg_rating,
              ratings_count: bookData.ratings_count,
            }
          }
        }

        // c. Insere novo sem ISBN / sem ol_work_id ────────────────
        const { data: inserted } = await supabase
          .from('dim_books')
          .insert(bookData)
          .select('id')
          .single()

        return {
          id:            (inserted?.id as string) || `gb-${item.id as string}`,
          dim_book_id:   (inserted?.id as string) || null,
          title:         bookData.title,
          author:        bookData.author,
          year:          bookData.year,
          synopsis:      bookData.synopsis,
          cover_url:     bookData.cover_url,
          isbn:          bookData.isbn,
          avg_rating:    bookData.avg_rating,
          ratings_count: bookData.ratings_count,
        }
      })
    )

    // ── 4. Deduplicação por ISBN ───────────────────────────────────
    const seen = new Set<string>()
    const books = raw.filter(b => {
      const key = (b.isbn || b.dim_book_id) as string | null
      if (!key) return true
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return new Response(
      JSON.stringify({ books, source: 'google_books' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in search-book:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
