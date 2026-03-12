// ══════════════════════════════════════════════════════════════
// scripts/backfill_ol_work_id.mjs
// Preenche ol_work_id em dim_books via Open Library ISBN lookup.
//
// Estratégia:
//   Para cada livro com isbn IS NOT NULL e ol_work_id IS NULL:
//   GET https://openlibrary.org/isbn/{isbn}.json → works[0].key
//   Ex: /works/OL27258W → salva "OL27258W"
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=sb_secret_... node scripts/backfill_ol_work_id.mjs
//
// Rate limit: 1 req/s (Open Library exige)
// Tempo estimado: ~8.5k livros × 1s = ~2.5 horas
//   (na prática menos — muitos ISBNs podem falhar rápido com 404)
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

// ── Open Library ISBN lookup ────────────────────────────────────
async function fetchWorkId(isbn) {
  try {
    const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`, {
      headers: { 'User-Agent': 'BookMind/1.0 (backfill script; contact: bookmind@example.com)' },
    })
    if (res.status === 404) return null
    if (!res.ok) return null
    const data = await res.json()
    // data.works = [{ key: "/works/OL27258W" }]
    const workKey = data.works?.[0]?.key  // "/works/OL27258W"
    if (!workKey) return null
    return workKey.replace('/works/', '')  // "OL27258W"
  } catch {
    return null
  }
}

// ── Busca todos os livros elegíveis em páginas de 1000 ──────────
async function fetchAllBooks() {
  const PAGE = 1000
  let offset = 0
  const all = []

  while (true) {
    const { data, error } = await supabase
      .from('dim_books')
      .select('id, isbn, title')
      .not('isbn', 'is', null)
      .is('ol_work_id', null)
      .range(offset, offset + PAGE - 1)
      .order('created_at', { ascending: true })

    if (error) throw error
    if (!data || data.length === 0) break

    all.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }

  return all
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  console.log('\n📚 Backfill ol_work_id em dim_books\n')

  const books = await fetchAllBooks()
  console.log(`  ${books.length} livros com ISBN sem ol_work_id\n`)

  if (books.length === 0) {
    console.log('  Nada a fazer.')
    return
  }

  let found = 0, notFound = 0, errors = 0

  for (let i = 0; i < books.length; i++) {
    const book = books[i]
    const label = `[${i + 1}/${books.length}] "${book.title}" (${book.isbn})`

    const workId = await fetchWorkId(book.isbn)
    await sleep(1100)  // respeita rate limit da Open Library

    if (!workId) {
      notFound++
      if ((i + 1) % 100 === 0 || i === books.length - 1) {
        console.log(`  ${label} → sem work_id`)
      }
      continue
    }

    const { error } = await supabase
      .from('dim_books')
      .update({ ol_work_id: workId })
      .eq('id', book.id)

    if (error) {
      console.error(`  ${label} → ERRO: ${error.message}`)
      errors++
    } else {
      found++
    }

    // Log a cada 100 livros processados
    if ((i + 1) % 100 === 0 || i === books.length - 1) {
      const pct = Math.round((i + 1) / books.length * 100)
      console.log(`  [${pct}%] ${i + 1}/${books.length} — ✅ ${found} mapeados · ⏭ ${notFound} sem work_id · ❌ ${errors} erros`)
    }
  }

  console.log(`
════════════════════════════════════════
  ✅ ol_work_id preenchido : ${found}
  ⏭  Sem work_id (404)    : ${notFound}
  ❌ Erros                 : ${errors}
  📚 Total processados     : ${books.length}
════════════════════════════════════════`)
}

main().catch(err => { console.error(err); process.exit(1) })
