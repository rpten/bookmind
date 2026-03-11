// ══════════════════════════════════════════════════════════════
// Edge Function: search-book
// Busca livros em dim_books. Se não encontrar, consulta Open Library
// (com ratings) e Google Books como fallback.
// ══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
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

    // Supabase client with service role (para escrever em dim_books)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Busca em dim_books primeiro
    const { data: cachedBooks, error: dbError } = await supabase
      .from('dim_books')
      .select('id, title, author, year, synopsis, cover_url, isbn, avg_rating, ratings_count')
      .or(`title.ilike.%${query}%,author.ilike.%${query}%`)
      .limit(10)

    if (dbError) throw dbError

    // Se encontrou resultados, retorna (id já é o UUID do dim_books)
    if (cachedBooks && cachedBooks.length > 0) {
      return new Response(
        JSON.stringify({
          books: cachedBooks.map(b => ({ ...b, dim_book_id: b.id })),
          source: 'cache',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Se não encontrou, busca na Open Library
    const openLibraryUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10`
    const olResponse = await fetch(openLibraryUrl)
    const olData = await olResponse.json()

    if (olData.docs && olData.docs.length > 0) {
      // 3. Processa e salva resultados da Open Library
      const books = []
      for (const doc of olData.docs.slice(0, 10)) {
        // Buscar ratings do Open Library
        let avg_rating = null
        let ratings_count = null

        if (doc.key) {
          try {
            const ratingsResponse = await fetch(`https://openlibrary.org${doc.key}/ratings.json`)
            const ratingsData = await ratingsResponse.json()
            if (ratingsData.summary) {
              avg_rating = ratingsData.summary.average ?? null
              ratings_count = ratingsData.summary.count ?? null
            }
          } catch (_e) {
            // continua sem ratings
          }
        }

        const book = {
          isbn: doc.isbn?.[0] || null,
          title: doc.title || 'Sem título',
          author: doc.author_name?.[0] || 'Autor desconhecido',
          year: doc.first_publish_year || null,
          synopsis: doc.first_sentence?.[0] || null,
          cover_url: doc.cover_i
            ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
            : null,
          genres: doc.subject?.slice(0, 5) || [],
          language: doc.language?.[0] || 'en',
          page_count: doc.number_of_pages_median || null,
          avg_rating,
          ratings_count,
          source: 'open_library',
          raw_data: doc,
        }

        // Salva no dim_books (evita duplicatas por ISBN ou título+autor)
        let dim_book_id: string | null = null
        if (book.isbn) {
          await supabase
            .from('dim_books')
            .upsert(book, { onConflict: 'isbn', ignoreDuplicates: true })
          const { data: found } = await supabase
            .from('dim_books')
            .select('id')
            .eq('isbn', book.isbn)
            .maybeSingle()
          dim_book_id = found?.id ?? null
        } else {
          // Sem ISBN: verifica se já existe pelo título+autor antes de inserir
          const { data: existing } = await supabase
            .from('dim_books')
            .select('id')
            .ilike('title', book.title)
            .ilike('author', book.author)
            .maybeSingle()
          if (existing) {
            dim_book_id = existing.id
          } else {
            const { data: inserted } = await supabase
              .from('dim_books')
              .insert(book)
              .select('id')
              .single()
            dim_book_id = inserted?.id ?? null
          }
        }

        books.push({
          id: dim_book_id || book.isbn || `ol-${doc.key}`,
          dim_book_id,
          title: book.title,
          author: book.author,
          year: book.year,
          synopsis: book.synopsis,
          cover_url: book.cover_url,
          isbn: book.isbn,
          avg_rating: book.avg_rating,
          ratings_count: book.ratings_count,
        })
      }

      return new Response(
        JSON.stringify({ books, source: 'open_library' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Fallback: Google Books
    const gbResponse = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10`
    )
    const gbData = await gbResponse.json()

    if (!gbData.items || gbData.items.length === 0) {
      return new Response(
        JSON.stringify({ books: [], source: 'google_books' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const books = []
    for (const item of gbData.items) {
      const v = item.volumeInfo

      const book = {
        isbn: v.industryIdentifiers?.find((id: { type: string }) => id.type === 'ISBN_13')?.identifier || null,
        title: v.title || 'Sem título',
        author: v.authors?.[0] || 'Autor desconhecido',
        year: v.publishedDate ? parseInt(v.publishedDate.substring(0, 4)) : null,
        synopsis: v.description || null,
        cover_url: v.imageLinks?.thumbnail?.replace('http:', 'https:') || null,
        genres: v.categories || [],
        language: v.language || 'en',
        page_count: v.pageCount || null,
        avg_rating: v.averageRating || null,
        ratings_count: v.ratingsCount || null,
        source: 'google_books',
        raw_data: item,
      }

      let dim_book_id: string | null = null
      if (book.isbn) {
        await supabase
          .from('dim_books')
          .upsert(book, { onConflict: 'isbn', ignoreDuplicates: true })
        const { data: found } = await supabase
          .from('dim_books')
          .select('id')
          .eq('isbn', book.isbn)
          .maybeSingle()
        dim_book_id = found?.id ?? null
      } else {
        // Sem ISBN: verifica se já existe pelo título+autor antes de inserir
        const { data: existing } = await supabase
          .from('dim_books')
          .select('id')
          .ilike('title', book.title)
          .ilike('author', book.author)
          .maybeSingle()
        if (existing) {
          dim_book_id = existing.id
        } else {
          const { data: inserted } = await supabase
            .from('dim_books')
            .insert(book)
            .select('id')
            .single()
          dim_book_id = inserted?.id ?? null
        }
      }

      books.push({
        id: dim_book_id || book.isbn || `gb-${item.id}`,
        dim_book_id,
        title: book.title,
        author: book.author,
        year: book.year,
        synopsis: book.synopsis,
        cover_url: book.cover_url,
        isbn: book.isbn,
        avg_rating: book.avg_rating,
        ratings_count: book.ratings_count,
      })
    }

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
