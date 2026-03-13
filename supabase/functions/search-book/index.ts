// ══════════════════════════════════════════════════════════════
// Edge Function: search-book
// 1. Cache: title ILIKE %query% OR title_alt @> ARRAY[query]
//    + filtro de junk aplicado em JS após a query
// 2. Cache miss → Google Books intitle:${query}
//    Filtra: junk titles, livros antigos obscuros
// 3. Para cada resultado com ISBN (em paralelo):
//    a. Fetch ol_work_id via Open Library /api/books
//    b. Busca dim_books por ol_work_id → retorna existente + salva title_alt
//    c. Fallback: busca dim_books por ISBN → retorna existente + salva title_alt
//    d. Sem match: insere novo registro com ol_work_id
// 4. Deduplicação final por ol_work_id (ou ISBN se null)
// ══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SELECT = 'id, title, author, year, synopsis, cover_url, isbn, avg_rating, ratings_count, title_alt, ol_work_id'

// Termos que indicam resumos/guias/coletâneas — não são livros originais
const JUNK_WORDS = [
  'resumo', 'summary', 'guia', 'guide', 'análise', 'analysis',
  'sparknotes', 'kit ', 'completo', 'complet', 'collection',
  'box set', 'omnibus', 'anthology',
]

function isJunk(title: string): boolean {
  const t = title.toLowerCase()
  return JUNK_WORDS.some(w => t.includes(w))
}

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

// Usa /api/books?jscmd=data — more robust than /isbn/*.json for work_id extraction
async function fetchOLWorkId(isbn: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
      { headers: { 'User-Agent': 'BookMind/1.0' } },
    )
    if (!res.ok) return null
    const data = await res.json()

    // Usa Object.values para não depender do formato exato da chave (ISBN:xxx)
    const entry = Object.values(data)[0] as Record<string, unknown> | undefined
    if (!entry) return null

    const workKey = (entry.works as Array<{ key: string }>)?.[0]?.key
    if (!workKey) return null

    // Extrai "OL17930368W" de "/works/OL17930368W"
    const workId = workKey.split('/')?.[2] ?? null
    console.log(`[OL] ISBN ${isbn} → work_id: ${workId}`)
    return workId
  } catch (e) {
    console.error(`[OL] fetch failed for ISBN ${isbn}:`, e)
    return null
  }
}

function toResult(
  row: Record<string, unknown>,
  workIdOverride?: string | null,
  isbnOverride?: string | null,
) {
  return {
    id:            row.id as string,
    dim_book_id:   row.id as string,
    ol_work_id:    workIdOverride ?? (row.ol_work_id as string | null),
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

// Busca no Open Library quando GB retorna < 2 resultados
// Retorna itens no mesmo formato de volumeInfo que o step 3 espera
async function fetchOLBooks(query: string): Promise<Record<string, unknown>[]> {
  const enc = (s: string) => encodeURIComponent(s)
  const fields = 'title,author_name,first_publish_year,isbn,key,cover_i,subject'
  try {
    const [titleRes, authorRes] = await Promise.all([
      fetch(`https://openlibrary.org/search.json?title=${enc(query)}&limit=5&fields=${fields}`, { headers: { 'User-Agent': 'BookMind/1.0' } }),
      fetch(`https://openlibrary.org/search.json?author=${enc(query)}&limit=5&fields=${fields}`, { headers: { 'User-Agent': 'BookMind/1.0' } }),
    ])
    const [td, ad] = await Promise.all([
      titleRes.ok  ? titleRes.json()  : { docs: [] },
      authorRes.ok ? authorRes.json() : { docs: [] },
    ])
    const allDocs = [...(td.docs || []), ...(ad.docs || [])]

    // Dedup por key de work
    const seen = new Set<string>()
    const unique = allDocs.filter(doc => {
      const key = (doc.key as string) || ''
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })

    return unique
      .filter(doc => !isJunk((doc.title as string) || ''))
      .slice(0, 5)
      .map(doc => {
        const workId   = (doc.key as string)?.split('/')?.[2] ?? null
        const isbnList = (doc.isbn as string[]) || []
        const isbn13   = isbnList.find((i: string) => i.length === 13) || isbnList[0] || null
        const coverId  = doc.cover_i as number | null

        return {
          _ol_work_id: workId,
          volumeInfo: {
            title:               (doc.title as string) || 'Sem título',
            authors:             (doc.author_name as string[]) || [],
            publishedDate:       String((doc.first_publish_year as number) || ''),
            description:         null,
            imageLinks:          coverId ? { thumbnail: `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` } : undefined,
            categories:          ((doc.subject as string[]) || []).slice(0, 3),
            industryIdentifiers: isbn13 ? [{ type: 'ISBN_13', identifier: isbn13 }] : [],
            averageRating:       null,
            ratingsCount:        null,
            pageCount:           null,
            language:            'pt',
          },
        }
      })
  } catch (e) {
    console.error('[OL] fetchOLBooks failed:', e)
    return []
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
    // Nota: NÃO encadeia .or() adicional — dois .or() no Supabase JS são
    // combinados com OR, não AND, o que retornaria livros sem relação.
    // O filtro de qualidade é aplicado em JS após a query.
    const { data: rawCached, error: dbError } = await supabase
      .from('dim_books')
      .select('id, title, author, year, synopsis, cover_url, isbn, avg_rating, ratings_count')
      .or(`title.ilike.%${query}%,title_alt.cs.{"${query}"}`)
      .limit(20)

    if (dbError) throw dbError

    // Filtra junk do cache em JS (mesmo critério do Google Books)
    const cached = (rawCached || []).filter(b => !isJunk(b.title || ''))

    if (cached.length > 0) {
      return new Response(
        JSON.stringify({
          books: cached.slice(0, 10).map(b => ({ ...b, dim_book_id: b.id })),
          source: 'cache',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 2. Google Books API ───────────────────────────────────────
    // intitle:X|inauthor:X busca por título OU autor sem misturar temas
    const gbRes = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(`intitle:${query}|inauthor:${query}`)}&maxResults=10`
    )
    const gbData = await gbRes.json()

    // Filtro de qualidade: remove junk e livros antigos obscuros
    const filtered = (gbData.items || []).filter((item: Record<string, unknown>) => {
      const v = item.volumeInfo as Record<string, unknown>
      const title   = (v.title as string) || ''
      const year    = v.publishedDate ? parseInt((v.publishedDate as string).substring(0, 4)) : null
      const ratings = (v.ratingsCount as number) || 0

      if (isJunk(title)) return false
      if (year && year < 1950 && ratings < 50) return false
      return true
    })

    // ── 2b. Fallback Open Library quando GB retorna < 2 resultados ─
    let itemsToProcess: Record<string, unknown>[] = filtered.slice(0, 5)
    if (filtered.length < 2) {
      console.log(`[OL] GB returned ${filtered.length} results — trying OL fallback`)
      const olItems = await fetchOLBooks(query)
      if (olItems.length > 0) {
        const gbTitles = new Set(filtered.map((i: Record<string, unknown>) => {
          const v = i.volumeInfo as Record<string, unknown>
          return ((v.title as string) || '').toLowerCase()
        }))
        const newOl = olItems.filter(i => {
          const v = i.volumeInfo as Record<string, unknown>
          return !gbTitles.has(((v.title as string) || '').toLowerCase())
        })
        itemsToProcess = [...filtered, ...newOl].slice(0, 5)
      }
    }

    if (!itemsToProcess.length) {
      return new Response(
        JSON.stringify({ books: [], source: 'google_books' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 3. Resolve cada resultado em paralelo ─────────────────────
    const raw = (await Promise.all(
      itemsToProcess.map(async (item: Record<string, unknown>) => {
        try {
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

          if (isbn) {
            // a. Fetch ol_work_id — usa pre-resolvido para itens OL, senão busca via ISBN
            const workId = (item._ol_work_id as string | null) ?? await fetchOLWorkId(isbn)

            if (workId) {
              // b. Busca por ol_work_id ──────────────────────────────
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
                return toResult(byWorkId, workId, (byWorkId.isbn as string | null) ?? isbn)
              }
            }

            // c. Fallback: busca por ISBN ──────────────────────────
            const { data: byIsbn } = await supabase
              .from('dim_books')
              .select(SELECT)
              .eq('isbn', isbn)
              .maybeSingle()

            if (byIsbn) {
              await addTitleAlt(supabase, byIsbn, query)
              if (workId && !byIsbn.ol_work_id) {
                await supabase.from('dim_books').update({ ol_work_id: workId }).eq('id', byIsbn.id)
              }
              return toResult(byIsbn, workId ?? (byIsbn.ol_work_id as string | null), isbn)
            }

            // d. Insere novo com ol_work_id ────────────────────────
            const { data: inserted } = await supabase
              .from('dim_books')
              .insert({ ...bookData, ol_work_id: workId })
              .select('id')
              .single()

            return {
              id:            (inserted?.id as string) || isbn,
              dim_book_id:   (inserted?.id as string) || null,
              ol_work_id:    workId,
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

          // Sem ISBN: insere direto (ol_work_id pode vir de item OL) ─
          const noIsbnWorkId = (item._ol_work_id as string | null) || null
          const { data: inserted } = await supabase
            .from('dim_books')
            .insert({ ...bookData, ol_work_id: noIsbnWorkId })
            .select('id')
            .single()

          return {
            id:            (inserted?.id as string) || `gb-${item.id as string}`,
            dim_book_id:   (inserted?.id as string) || null,
            ol_work_id:    noIsbnWorkId,
            title:         bookData.title,
            author:        bookData.author,
            year:          bookData.year,
            synopsis:      bookData.synopsis,
            cover_url:     bookData.cover_url,
            isbn:          bookData.isbn,
            avg_rating:    bookData.avg_rating,
            ratings_count: bookData.ratings_count,
          }
        } catch (e) {
          console.error('Error resolving item:', e)
          return null
        }
      })
    )).filter(Boolean)

    // ── 4. Deduplicação por ol_work_id (ou ISBN se null) ──────────
    const seen = new Set<string>()
    const books = raw.filter(b => {
      const key = (b as Record<string, unknown>).ol_work_id as string
        || (b as Record<string, unknown>).isbn as string
        || (b as Record<string, unknown>).dim_book_id as string
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
