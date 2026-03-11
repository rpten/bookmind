// ══════════════════════════════════════════════════════════════
// Edge Function: search-book
// Busca livros em dim_books. Se não encontrar, consulta Open Library.
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
      .select('id, title, author, year, synopsis, cover_url, isbn')
      .or(`title.ilike.%${query}%,author.ilike.%${query}%`)
      .limit(10)

    if (dbError) throw dbError

    // Se encontrou resultados, retorna
    if (cachedBooks && cachedBooks.length > 0) {
      return new Response(
        JSON.stringify({ books: cachedBooks, source: 'cache' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Se não encontrou, busca na Open Library
    const openLibraryUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10`
    const olResponse = await fetch(openLibraryUrl)
    const olData = await olResponse.json()

    if (!olData.docs || olData.docs.length === 0) {
      return new Response(
        JSON.stringify({ books: [], source: 'open_library' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Processa e salva resultados da Open Library
    const books = []
    for (const doc of olData.docs.slice(0, 10)) {
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
        source: 'open_library',
        raw_data: doc,
      }

      // Salva no dim_books (evita duplicatas por ISBN)
      if (book.isbn) {
        await supabase
          .from('dim_books')
          .upsert(book, { onConflict: 'isbn', ignoreDuplicates: true })
      } else {
        // Se não tem ISBN, insere direto (pode gerar duplicatas, mas é raro)
        await supabase.from('dim_books').insert(book)
      }

      books.push({
        id: book.isbn || `ol-${doc.key}`,
        title: book.title,
        author: book.author,
        year: book.year,
        synopsis: book.synopsis,
        cover_url: book.cover_url,
        isbn: book.isbn,
      })
    }

    return new Response(
      JSON.stringify({ books, source: 'open_library' }),
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