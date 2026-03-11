// ══════════════════════════════════════════════════════════════
// scripts/import_goodbooks.mjs
// Importa goodbooks-10k-extended para dim_books via upsert em lotes.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=sb_secret_... node scripts/import_goodbooks.mjs
//
// Custo: ~0 (sem OpenAI — embeddings gerados num passo separado)
// Tempo estimado: ~5 min para 11k livros em lotes de 100
// ══════════════════════════════════════════════════════════════

import { createClient }  from '@supabase/supabase-js'
import { createReadStream } from 'fs'
import { parse }          from 'csv-parse'
import path               from 'path'
import { fileURLToPath }  from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL     = 'https://fqwugqengnenliyouojj.supabase.co'
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const CSV_PATH         = path.join(__dirname, 'data', 'books_enriched.csv')
const BATCH_SIZE       = 100

if (!SUPABASE_SERVICE) {
  console.error('Required: SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)

// ── Parsers ───────────────────────────────────────────────────

// ['Author One', 'Author Two'] → "Author One"
function parseAuthor(raw) {
  if (!raw) return 'Autor desconhecido'
  const m = raw.match(/['"]([^'"]+)['"]/)
  return m ? m[1].trim() : raw.replace(/[\[\]'"\s]/g, '').trim() || 'Autor desconhecido'
}

// "['genre1', 'genre2']" → ['genre1', 'genre2']
function parseGenres(raw) {
  if (!raw) return []
  const matches = raw.match(/['"]([^'"]+)['"]/g)
  if (!matches) return []
  return matches.map(s => s.replace(/['"]/g, '').trim()).filter(Boolean)
}

// "9780439023480.0" → "9780439023480"
function parseIsbn13(raw) {
  if (!raw) return null
  const s = raw.replace(/\.0$/, '').trim()
  return /^\d{13}$/.test(s) ? s : null
}

// "2008.0" → "2008"
function parseYear(raw) {
  if (!raw) return null
  const n = parseInt(raw)
  return isNaN(n) ? null : String(n)
}

// Mapeia linha CSV → row do dim_books
function mapRow(row) {
  const isbn = parseIsbn13(row.isbn13)
  return {
    isbn,
    title:          (row.title || '').trim() || null,
    author:         parseAuthor(row.authors),
    year:           parseYear(row.original_publication_year),
    synopsis:       (row.description || '').trim() || null,
    cover_url:      (row.image_url || '').trim() || null,
    genres:         parseGenres(row.genres),
    avg_rating:     parseFloat(row.average_rating) || null,
    ratings_count:  parseInt(row.ratings_count)    || null,
    source:         'goodbooks-10k',
  }
}

// ── Upsert em lote ────────────────────────────────────────────

async function upsertBatch(rows) {
  // Deduplica por isbn dentro do batch (CSV tem duplicatas internas)
  const seen = new Set()
  const deduped = rows.filter(r => {
    if (!r.isbn) return true          // sem isbn: passa (insert separado)
    if (seen.has(r.isbn)) return false // isbn já visto: descarta
    seen.add(r.isbn)
    return true
  })

  const withIsbn    = deduped.filter(r => r.isbn)
  const withoutIsbn = deduped.filter(r => !r.isbn)

  let inserted = 0, updated = 0, errors = 0

  // Livros COM ISBN → upsert seguro por isbn
  if (withIsbn.length) {
    const { error } = await supabase
      .from('dim_books')
      .upsert(withIsbn, { onConflict: 'isbn', ignoreDuplicates: false })
    if (error) {
      console.error('  upsert (isbn) error:', error.message)
      errors += withIsbn.length
    } else {
      inserted += withIsbn.length
    }
  }

  // Livros SEM ISBN → insert ignorando duplicatas (título pode repetir entre runs)
  if (withoutIsbn.length) {
    const { error } = await supabase
      .from('dim_books')
      .insert(withoutIsbn, { count: 'exact' })
    if (error) {
      // Ignora violações de unicidade silenciosamente
      if (!error.message.includes('unique') && !error.message.includes('duplicate')) {
        console.error('  insert (no-isbn) error:', error.message)
        errors += withoutIsbn.length
      } else {
        errors += withoutIsbn.length  // já existiam
      }
    } else {
      inserted += withoutIsbn.length
    }
  }

  return { inserted, updated, errors }
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  console.log(`\n📚 Importando goodbooks-10k-extended → dim_books\n`)

  const rows = []

  // Lê CSV completo em memória (12 MB — ok)
  await new Promise((resolve, reject) => {
    createReadStream(CSV_PATH)
      .pipe(parse({ columns: true, skip_empty_lines: true, relax_quotes: true, trim: true }))
      .on('data', record => {
        const mapped = mapRow(record)
        if (mapped.title) rows.push(mapped)        // ignora linhas sem título
      })
      .on('end', resolve)
      .on('error', reject)
  })

  console.log(`  ${rows.length} linhas válidas lidas do CSV\n`)

  let totalInserted = 0, totalErrors = 0
  const batches = Math.ceil(rows.length / BATCH_SIZE)

  for (let i = 0; i < batches; i++) {
    const batch  = rows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
    const result = await upsertBatch(batch)

    totalInserted += result.inserted
    totalErrors   += result.errors

    // Log a cada 500 livros
    const processed = Math.min((i + 1) * BATCH_SIZE, rows.length)
    if (processed % 500 === 0 || i === batches - 1) {
      const pct = Math.round(processed / rows.length * 100)
      console.log(`  [${pct}%] ${processed}/${rows.length} processados — ✅ ${totalInserted} inseridos · ❌ ${totalErrors} erros`)
    }
  }

  console.log(`
════════════════════════════════════════════
  ✅ Inseridos/atualizados : ${totalInserted}
  ❌ Erros                 : ${totalErrors}
  📚 Total linhas          : ${rows.length}
════════════════════════════════════════════`)
}

main().catch(err => { console.error(err); process.exit(1) })
