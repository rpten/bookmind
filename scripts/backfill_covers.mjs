// ══════════════════════════════════════════════════════════════
// scripts/backfill_covers.mjs
// Preenche cover_url em dim_books onde está NULL.
//
// Estratégia:
//   1. Open Library search (title + author) → cover_i → URL -L.jpg
//   2. Fallback: Google Books → volumeInfo.imageLinks.thumbnail
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/backfill_covers.mjs
//
// Rate limit: 1 req/s (Open Library exige)
// ══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = 'https://fqwugqengnenliyouojj.supabase.co'
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_SERVICE) {
  console.error('Required: SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ── Open Library ──────────────────────────────────────────────
async function fetchOLCover(title, author) {
  const q = encodeURIComponent(`${title} ${author}`.trim())
  const url = `https://openlibrary.org/search.json?q=${q}&limit=1&fields=cover_i,title`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'BookMind/1.0 (backfill script)' } })
    if (!res.ok) return null
    const data = await res.json()
    const doc = data.docs?.[0]
    if (!doc?.cover_i) return null
    return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
  } catch {
    return null
  }
}

// ── Google Books ───────────────────────────────────────────────
async function fetchGBCover(title, author) {
  const q = encodeURIComponent(`intitle:${title} inauthor:${author}`)
  const url = `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const thumbnail = data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail
    if (!thumbnail) return null
    return thumbnail.replace('http:', 'https:').replace('zoom=1', 'zoom=2')
  } catch {
    return null
  }
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  const { data: books, error } = await supabase
    .from('dim_books')
    .select('id, title, author')
    .is('cover_url', null)
    .order('created_at', { ascending: true })

  if (error) { console.error('Supabase error:', error); process.exit(1) }
  console.log(`\n🖼  ${books.length} livros sem capa. Iniciando backfill...\n`)

  let updated = 0, skipped = 0, errors = 0

  for (let i = 0; i < books.length; i++) {
    const book = books[i]
    const label = `[${i+1}/${books.length}] "${book.title}" — ${book.author}`
    process.stdout.write(`${label} ... `)

    // Tentativa 1: Open Library
    let cover = await fetchOLCover(book.title, book.author)
    await sleep(1100)

    // Tentativa 2: Google Books
    if (!cover) {
      cover = await fetchGBCover(book.title, book.author)
      await sleep(1100)
    }

    if (!cover) {
      console.log('sem capa encontrada')
      skipped++
      continue
    }

    const { error: updateErr } = await supabase
      .from('dim_books')
      .update({ cover_url: cover })
      .eq('id', book.id)

    if (updateErr) {
      console.log(`ERRO: ${updateErr.message}`)
      errors++
    } else {
      console.log(`✓ (OL)`)
      updated++
    }
  }

  console.log(`
════════════════════════════════════
  ✅ Capas adicionadas : ${updated}
  ⏭  Sem capa         : ${skipped}
  ❌ Erros             : ${errors}
  📚 Total             : ${books.length}
════════════════════════════════════`)
}

main().catch(console.error)
