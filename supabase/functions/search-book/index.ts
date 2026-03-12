// ══════════════════════════════════════════════════════════════
// Edge Function: search-book
// 1. Cache em dim_books (título, author, title_alt)
// 2. Google Books → lista de resultados
// 3. Para cada resultado: ISBN → OL work_id → match em dim_books
//    - Match por ISBN  → retorna registro existente + salva title_alt
//    - Match por work_id → retorna registro existente + salva title_alt
//    - Sem match → insere novo registro em dim_books
// ══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SELECT = 'id, title, author, year, synopsis, cover_url, isbn, avg_rating, ratings_count, title_alt, ol_work_id'

// ── Helpers ────────────────────────────────────────────────────

// Adiciona searchQuery em title_alt do registro existente (se ainda não constar)
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

// Resolve ol_work_id a partir de um ISBN via Open Library
async function fetchOLWorkId(isbn: string): Promise<string | null> {
  try {
    const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`, {
      headers: { 'User-Agent': 'BookMind/1.0' },
    })
    if (!res.ok) return null
    const data = await res.json()
    const workKey = data.works?.[0]?.key  // "/works/OL27258W"
    if (!workKey) return null
    return workKey.replace('/works/', '')  // "OL27258W"
  } catch {
    return null
  }
}

// Tenta linkar o livro a um registro existente em dim_books:
//   1. Por ISBN  → match direto
//   2. Por ol_work_id → match cruzado (ex: edição PT ↔ EN)
//   3. Por título+autor (sem ISBN)
// Se não encontrar, insere novo registro.
// Em todos os casos de match, adiciona searchQuery ao title_alt.
async function resolveBook(
  supabase: ReturnType<typeof createClient>,
  book: Record<string, unknown>,
  searchQuery: string,
): Promise<{ dim_book_id: string | null; existingData: Record<string, unknown> | null }> {
  // 1. Match por ISBN
  if (book.isbn) {
    const { data: byIsbn } = await supabase
      .from('dim_books')
      .select(SELECT)
      .eq('isbn', book.isbn)
      .maybeSingle()

    if (byIsbn) {
      await addTitleAlt(supabase, byIsbn, searchQuery)
      return { dim_book_id: byIsbn.id as string, existingData: byIsbn }
    }
  }

  // 2. Resolve ol_work_id e tenta match cruzado
  let workId: string | null = null
  if (book.isbn) {
    workId = await fetchOLWorkId(book.isbn as string)

    if (workId) {
      const { data: byWorkId } = await supabase
        .from('dim_books')
        .select(SELECT)
        .eq('ol_work_id', workId)
        .maybeSingle()

      if (byWorkId) {
        await addTitleAlt(supabase, byWorkId, searchQuery)
        // Aproveita para salvar o ISBN da nova edição se o registro não tinha
        if (!byWorkId.isbn && book.isbn) {
          await supabase.from('dim_books').update({ isbn: book.isbn }).eq('id', byWorkId.id)
        }
        return { dim_book_id: byWorkId.id as string, existingData: byWorkId }
      }
    }
  }

  // 3. Sem ISBN: verifica título+autor
  if (!book.isbn) {
    const { data: existing } = await supabase
      .from('dim_books')
      .select(SELECT)
      .ilike('title', book.title as string)
      .ilike('author', book.author as string)
      .maybeSingle()

    if (existing) {
      await addTitleAlt(supabase, existing, searchQuery)
      return { dim_book_id: existing.id as string, existingData: existing }
    }
  }

  // 4. Não encontrado → insere novo registro (com ol_work_id se resolvido)
  const { data: inserted } = await supabase
    .from('dim_books')
    .insert({ ...book, ol_work_id: workId })
    .select('id')
    .single()

  return { dim_book_id: (inserted?.id as string) ?? null, existingData: null }
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

    // ── 1. Cache: título, autor e title_alt ──────────────────────
    const { data: cached, error: dbError } = await supabase
      .from('dim_books')
      .select('id, title, author, year, synopsis, cover_url, isbn, avg_rating, ratings_count')
      .or(`title.ilike.%${query}%,author.ilike.%${query}%,title_alt.cs.{"${query}"}`)
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

    // ── 2. Google Books → lista de resultados ────────────────────
    const gbRes = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`
    )
    const gbData = await gbRes.json()

    if (!gbData.items?.length) {
      return new Response(
        JSON.stringify({ books: [], source: 'google_books' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 3. Resolve cada resultado em paralelo ────────────────────
    //   ISBN → OL work_id → dim_books match → insert se necessário
    const books = await Promise.all(
      gbData.items.slice(0, 5).map(async (item: Record<string, unknown>) => {
        const v = item.volumeInfo as Record<string, unknown>
        const identifiers = v.industryIdentifiers as { type: string; identifier: string }[] | undefined

        const book = {
          isbn: identifiers?.find(id => id.type === 'ISBN_13')?.identifier || null,
          title: (v.title as string) || 'Sem título',
          author: (v.authors as string[])?.[0] || 'Autor desconhecido',
          year: v.publishedDate ? parseInt((v.publishedDate as string).substring(0, 4)) : null,
          synopsis: (v.description as string) || null,
          cover_url: (v.imageLinks as Record<string, string>)?.thumbnail?.replace('http:', 'https:') || null,
          genres: (v.categories as string[]) || [],
          language: (v.language as string) || 'en',
          page_count: (v.pageCount as number) || null,
          avg_rating: (v.averageRating as number) || null,
          ratings_count: (v.ratingsCount as number) || null,
          source: 'google_books',
          raw_data: item,
        }

        const { dim_book_id, existingData } = await resolveBook(supabase, book, query)
        const resolved = existingData ?? book

        return {
          id: dim_book_id || book.isbn || `gb-${(item.id as string)}`,
          dim_book_id,
          title: resolved.title,
          author: resolved.author,
          year: resolved.year,
          synopsis: resolved.synopsis,
          cover_url: resolved.cover_url,
          isbn: (resolved.isbn as string | null) ?? book.isbn,
          avg_rating: resolved.avg_rating,
          ratings_count: resolved.ratings_count,
        }
      })
    )

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
