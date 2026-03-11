// ══════════════════════════════════════════════════════════════
// Edge Function: weekly-update
// Seed semanal via NYT Bestsellers + enriquecimento Open Library
// ══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const nytApiKey = Deno.env.get('NYT_API_KEY')

    if (!nytApiKey) {
      throw new Error('NYT_API_KEY not configured')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let totalAdded = 0
    let totalErrors = 0

    const lists = ['hardcover-fiction', 'hardcover-nonfiction']

    for (const listName of lists) {
      const nytUrl = `https://api.nytimes.com/svc/books/v3/lists/current/${listName}.json?api-key=${nytApiKey}`
      const nytResponse = await fetch(nytUrl)
      const nytData = await nytResponse.json()

      if (!nytData.results?.books) {
        console.log(`No books found for list: ${listName}`)
        continue
      }

      for (const book of nytData.results.books) {
        const isbn = book.primary_isbn13 || book.primary_isbn10

        if (!isbn) {
          totalErrors++
          continue
        }

        // Enriquecer com Open Library
        let olData = null
        try {
          const olResponse = await fetch(`https://openlibrary.org/isbn/${isbn}.json`)
          olData = await olResponse.json()
        } catch (_e) {
          // continua sem dados da OL
        }

        const bookData = {
          isbn,
          title: book.title,
          author: book.author,
          year: book.year_published || null,
          synopsis: book.description || (typeof olData?.description === 'string' ? olData.description : null),
          cover_url: olData?.covers?.[0]
            ? `https://covers.openlibrary.org/b/id/${olData.covers[0]}-L.jpg`
            : null,
          genres: olData?.subjects?.slice(0, 5) || [],
          language: 'en',
          source: 'nyt_bestseller',
          raw_data: { nyt: book, openlibrary: olData },
        }

        const { error } = await supabase
          .from('dim_books')
          .upsert(bookData, { onConflict: 'isbn', ignoreDuplicates: false })

        if (error) {
          console.error(`Error upserting book ${isbn}:`, error)
          totalErrors++
        } else {
          totalAdded++
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        added: totalAdded,
        errors: totalErrors,
        lists_processed: lists.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in weekly-update:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
