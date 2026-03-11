// ══════════════════════════════════════════════════════════════
// scripts/backfill_ratings.mjs
// Popula avg_rating e ratings_count em dim_books via:
//   1. Open Library ratings API (preferencial)
//   2. Google Books API (fallback)
// Rate limit: 1 req/s (Open Library exige isso)
// Usage: node scripts/backfill_ratings.mjs
// ══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = 'https://fqwugqengnenliyouojj.supabase.co'
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_SERVICE) {
  console.error('SUPABASE_SERVICE_ROLE_KEY env var required')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ── Open Library: busca work_key pelo título+autor ─────────────
async function fetchOLWorkKey(title, author) {
  const q = encodeURIComponent(`${title} ${author}`.trim())
  const url = `https://openlibrary.org/search.json?q=${q}&limit=1&fields=key,title,author_name,ratings_average,ratings_count`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const doc = data.docs?.[0]
  if (!doc) return null

  // Se a busca já retornou os ratings inline (campo novo da API)
  if (doc.ratings_average) {
    return {
      avg_rating: Math.round(doc.ratings_average * 100) / 100,
      ratings_count: doc.ratings_count ?? null,
      source: 'ol_search_inline',
    }
  }

  return doc.key ? { workKey: doc.key } : null
}

// ── Open Library: busca ratings pelo work_key ──────────────────
async function fetchOLRatings(workKey) {
  const url = `https://openlibrary.org${workKey}/ratings.json`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  if (!data.summary?.average) return null
  return {
    avg_rating: Math.round(data.summary.average * 100) / 100,
    ratings_count: data.summary.count ?? null,
    source: 'ol_ratings_api',
  }
}

// ── Google Books: fallback ─────────────────────────────────────
async function fetchGBRatings(title, author) {
  const q = encodeURIComponent(`intitle:${title} inauthor:${author}`)
  const url = `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const item = data.items?.[0]
  if (!item?.volumeInfo?.averageRating) return null
  return {
    avg_rating: item.volumeInfo.averageRating,
    ratings_count: item.volumeInfo.ratingsCount ?? null,
    source: 'google_books',
  }
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  // Busca todos os livros sem rating
  const { data: books, error } = await supabase
    .from('dim_books')
    .select('id, title, author, isbn')
    .is('avg_rating', null)
    .order('created_at', { ascending: true })

  if (error) { console.error('Supabase error:', error); process.exit(1) }
  console.log(`\n📚 ${books.length} livros sem rating. Iniciando backfill...\n`)

  let updated = 0, skipped = 0, errors = 0

  for (let i = 0; i < books.length; i++) {
    const book = books[i]
    const label = `[${i+1}/${books.length}] "${book.title}" — ${book.author}`

    process.stdout.write(`${label} ... `)

    let rating = null

    // Tentativa 1: Open Library
    const olResult = await fetchOLWorkKey(book.title, book.author)
    await sleep(1100) // rate limit

    if (olResult?.avg_rating) {
      rating = olResult
    } else if (olResult?.workKey) {
      rating = await fetchOLRatings(olResult.workKey)
      await sleep(1100)
    }

    // Tentativa 2: Google Books (fallback)
    if (!rating) {
      rating = await fetchGBRatings(book.title, book.author)
      await sleep(1100)
    }

    if (!rating) {
      console.log('sem rating encontrado')
      skipped++
      continue
    }

    // Atualiza no Supabase
    const { error: updateError } = await supabase
      .from('dim_books')
      .update({
        avg_rating: rating.avg_rating,
        ratings_count: rating.ratings_count,
      })
      .eq('id', book.id)

    if (updateError) {
      console.log(`ERRO: ${updateError.message}`)
      errors++
    } else {
      console.log(`✓ ${rating.avg_rating} (${rating.ratings_count ?? '?'} ratings) [${rating.source}]`)
      updated++
    }
  }

  console.log(`
════════════════════════════════════
  ✅ Atualizados : ${updated}
  ⏭  Sem rating  : ${skipped}
  ❌ Erros       : ${errors}
  📚 Total       : ${books.length}
════════════════════════════════════`)
}

main().catch(console.error)
