// ══════════════════════════════════════════════════════════════
// Edge Function: bootstrap-catalog
// Popula dim_books com bestsellers do NYT dos últimos 5 anos
// ══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Lista de bestsellers do NYT dos últimos anos (hardcoded para bootstrap inicial)
// Fonte: https://www.nytimes.com/books/best-sellers/
const NYT_BESTSELLERS_ISBNS = [
  "9780735219090", // Atomic Habits
  "9780525656160", // The Midnight Library
  "9780593230572", // The Four Winds
  "9780593355213", // The Last Thing He Told Me
  "9780593158036", // The Stranger in the Lifeboat
  "9780735211292", // Educated
  "9780385545952", // The Tattooist of Auschwitz
  "9780525559474", // Where the Crawdads Sing
  "9780525559290", // The Guest List
  "9780525542864", // Big Little Lies
  // Adicione mais ISBNs aqui conforme necessário
  // Para produção: integrar com NYT Books API (requer API key gratuita)
]

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const results = {
      total: NYT_BESTSELLERS_ISBNS.length,
      success: 0,
      failed: 0,
      errors: [] as string[],
    }

    // Processa cada ISBN
    for (const isbn of NYT_BESTSELLERS_ISBNS) {
      try {
        // Verifica se já existe
        const { data: existing } = await supabase
          .from('dim_books')
          .select('isbn')
          .eq('isbn', isbn)
          .single()

        if (existing) {
          console.log(`ISBN ${isbn} já existe, pulando...`)
          results.success++
          continue
        }

        // Busca na Open Library por ISBN
        const olUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
        const olResponse = await fetch(olUrl)
        const olData = await olResponse.json()

        const bookKey = `ISBN:${isbn}`
        if (!olData[bookKey]) {
          console.error(`Livro não encontrado na Open Library: ${isbn}`)
          results.failed++
          results.errors.push(`ISBN ${isbn} não encontrado`)
          continue
        }

        const book = olData[bookKey]
        
        // Monta objeto para inserir
        const bookRecord = {
          isbn,
          title: book.title || 'Sem título',
          author: book.authors?.[0]?.name || 'Autor desconhecido',
          year: book.publish_date ? parseInt(book.publish_date.match(/\d{4}/)?.[0] || '0') : null,
          synopsis: book.excerpts?.[0]?.text || null,
          cover_url: book.cover?.large || book.cover?.medium || book.cover?.small || null,
          genres: book.subjects?.map((s: any) => s.name).slice(0, 5) || [],
          language: 'en', // NYT é majoritariamente inglês
          page_count: book.number_of_pages || null,
          source: 'nyt',
          raw_data: book,
        }

        // Insere no banco
        const { error: insertError } = await supabase
          .from('dim_books')
          .insert(bookRecord)

        if (insertError) {
          console.error(`Erro ao inserir ${isbn}:`, insertError)
          results.failed++
          results.errors.push(`ISBN ${isbn}: ${insertError.message}`)
        } else {
          console.log(`✓ Livro inserido: ${bookRecord.title}`)
          results.success++
        }

        // Rate limiting: espera 100ms entre requests (Open Library pede gentileza)
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (error) {
        console.error(`Erro processando ISBN ${isbn}:`, error)
        results.failed++
        results.errors.push(`ISBN ${isbn}: ${error.message}`)
      }
    }

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in bootstrap-catalog:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})