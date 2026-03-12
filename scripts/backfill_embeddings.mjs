// ══════════════════════════════════════════════════════════════
// scripts/backfill_embeddings.mjs
// Gera embeddings para dim_books via OpenAI text-embedding-3-small
// e salva na coluna embedding vector(1536).
//
// Usage:
//   OPENAI_API_KEY=sk-... SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/backfill_embeddings.mjs
//
// Custo estimado: 107 livros × ~200 tokens = ~21k tokens ≈ $0.001
// ══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = 'https://fqwugqengnenliyouojj.supabase.co'
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_KEY       = process.env.OPENAI_API_KEY

if (!SUPABASE_SERVICE || !OPENAI_KEY) {
  console.error('Required: SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Monta o texto que será embedado por livro
function buildEmbedText(book) {
  const parts = [
    `Title: ${book.title}`,
    `Author: ${book.author}`,
    book.year    ? `Year: ${book.year}`                            : null,
    book.synopsis ? `Synopsis: ${book.synopsis.substring(0, 500)}` : null,
    book.genres?.length ? `Genres: ${book.genres.join(', ')}`      : null,
  ]
  return parts.filter(Boolean).join('\n')
}

// Chama OpenAI Embeddings API
async function getEmbedding(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data.data[0].embedding  // float[]
}

async function fetchAllWithoutEmbedding() {
  const PAGE = 1000
  let all = [], page = 0
  while (true) {
    const { data, error } = await supabase
      .from('dim_books')
      .select('id, title, author, year, synopsis, genres')
      .is('embedding', null)
      .order('created_at', { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (error) { console.error('Supabase error:', error); process.exit(1) }
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE) break
    page++
  }
  return all
}

async function main() {
  const books = await fetchAllWithoutEmbedding()
  console.log(`\n🔢 ${books.length} livros sem embedding. Iniciando...\n`)

  let updated = 0, errors = 0

  for (let i = 0; i < books.length; i++) {
    const book = books[i]
    process.stdout.write(`[${i+1}/${books.length}] "${book.title}" ... `)

    try {
      const text = buildEmbedText(book)
      const embedding = await getEmbedding(text)

      const { error: updateErr } = await supabase
        .from('dim_books')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', book.id)

      if (updateErr) throw updateErr

      console.log(`✓ (${embedding.length}d)`)
      updated++
    } catch (err) {
      console.log(`ERRO: ${err.message}`)
      errors++
    }

    // Rate limit: ~3000 req/min no tier free → 1 a cada 50ms é seguro
    await sleep(100)
  }

  console.log(`
════════════════════════════════════
  ✅ Embeddings gerados : ${updated}
  ❌ Erros              : ${errors}
  📚 Total              : ${books.length}
════════════════════════════════════`)
}

main().catch(console.error)
