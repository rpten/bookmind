# BookMind — Architecture & Development Guide

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router, single-file `app/page.js`) |
| Database | Supabase (Postgres + pgvector) |
| Backend | Supabase Edge Functions (Deno/TypeScript) |
| AI | OpenAI `text-embedding-3-small` (embeddings) + `gpt-4o` (chat) |
| Analytics | dbt (models in `analytics/`) |
| Hosting | Vercel (frontend) + Supabase (functions + DB) |

## Important Paths

```
app/page.js                          # Entire frontend — one file
supabase/functions/search-book/      # Book search + catalog ingestion
supabase/functions/ai-chat/          # Literary AI chat with recommendations
supabase/functions/bootstrap-catalog/# One-time catalog seeding
supabase/functions/weekly-update/    # Scheduled catalog enrichment
analytics/                           # dbt models for reading analytics
lib/supabaseClient.js               # Shared Supabase client
```

## Database Schema

### `dim_books` (catalog — shared across all users)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `title` | text | Canonical title |
| `title_alt` | text[] | Search aliases (GIN index) — multilingual titles |
| `author` | text | |
| `year` | int | |
| `isbn` | text | ISBN-13 |
| `ol_work_id` | text | Open Library work ID — primary dedup key |
| `synopsis` | text | |
| `cover_url` | text | |
| `genres` | text[] | |
| `avg_rating` | float | |
| `ratings_count` | int | |
| `embedding` | vector(1536) | `text-embedding-3-small` embedding for semantic search |

### `books` (user library)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `dim_book_id` | uuid FK → `dim_books.id` | Links to catalog entry |
| `title` | text | Denormalized for quick reads |
| `author` | text | Denormalized |
| `status` | text | `lido` \| `lendo` \| `quero ler` |
| `impact` | int | 1–5 personal impact rating |
| `phrase` | text | Memorable quote |
| `moment` | text | Life context when read |
| `checkboxes` | jsonb | `{ emoção: string[] }` |
| `date_read` | date | |

## Architecture Conventions

### Modals — BookModal is the only book modal
- **Always use `<BookModal>`** for any book detail view, whether from library or search results
- **Never create a new modal component** for books
- `BookModal` detects `inLib` via `userLibrary.find(b => b.dim_book_id === book.dim_book_id)`
- When `inLib`: shows "Editar review" button and user's reading data
- When not `inLib`: shows "Registrar leitura" and "Adicionar à fila" buttons

### Search — always through `search-book` edge function
- **All book searches go through `search-book`** — never query `dim_books` directly for search
- **Never call `match_books()` from the UI** — that RPC is for `ai-chat` semantic recommendations only
- Search flow: cache (title ILIKE + title_alt GIN) → Google Books → Open Library fallback

### Deduplication — ol_work_id first
- Dedup order: **`ol_work_id` first → ISBN fallback → insert new**
- **Never dedup by title** — same book has different titles in different languages/editions
- `title_alt` array stores search aliases so PT searches hit EN catalog entries and vice versa

### Junk filtering — always applied to search results
- Filter words: `resumo, summary, guia, guide, análise, analysis, sparknotes, kit, completo, complet, collection, box set, omnibus, anthology`
- Applied in JS after both cache query and Google Books results
- Pre-1950 books with `ratings_count < 50` are filtered (obscure historical editions)

## Secrets & Environment Variables

**Never hardcode keys.** All secrets are configured in Supabase dashboard and Vercel:

| Variable | Where used |
|---|---|
| `SUPABASE_URL` | Edge functions (auto-injected) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge functions (auto-injected) |
| `OPENAI_API_KEY` | `ai-chat`, `bootstrap-catalog` |
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend |

## Deploy

### Edge Functions
```bash
supabase functions deploy search-book
supabase functions deploy ai-chat
supabase functions deploy weekly-update
```

### Frontend
```bash
git add .
git commit -m "feat: ..."
git push origin main   # Vercel auto-deploys on push
```

## Language Conventions

- **Code and comments**: English
- **User-facing text and communication with user**: Portuguese (Brazilian)
- **Commit messages**: English (imperative mood: "fix:", "feat:", "chore:")

## Quality Checklist (before deploy)

- [ ] Junk filter applied to all search result paths
- [ ] No hardcoded API keys
- [ ] New book modals use `<BookModal>`, not custom sheets
- [ ] Search goes through `search-book` edge function
- [ ] Dedup uses `ol_work_id`, not title
- [ ] Structured logs added to any new edge function steps
- [ ] e2e tests pass: `npm run test:e2e`
