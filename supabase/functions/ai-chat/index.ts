// ══════════════════════════════════════════════════════════════
// Edge Function: ai-chat
// Chat literário inteligente com OpenAI GPT-4o + match_books()
// ══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OPENAI_KEY       = Deno.env.get('OPENAI_API_KEY')!
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const REC_KEYWORDS = [
  'recomend', 'sugir', 'sugest', 'próximo livro', 'proximo livro',
  'similar', 'parecido', 'como esse', 'como este', 'estilo de',
  'livro bom', 'ler depois', 'ler agora', 'o que ler',
]

function isRecommendationRequest(msg: string): boolean {
  const lower = msg.toLowerCase()
  return REC_KEYWORDS.some(k => lower.includes(k))
}

async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  })
  const data = await res.json()
  return data.data[0].embedding
}

async function matchBooks(embedding: number[], count = 5) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)
  const { data, error } = await supabase.rpc('match_books', {
    query_embedding: embedding,
    match_count: count,
    min_similarity: 0.25,
  })
  if (error) {
    console.error('match_books error:', error)
    return []
  }
  return data || []
}

async function callGPT(systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: 600,
      temperature: 0.7,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'OpenAI error')
  return data.choices[0].message.content
}

function buildLibraryContext(library: any[]): string {
  if (!library || library.length === 0) return 'O usuário ainda não registrou livros.'
  const lidos    = library.filter(b => b.status === 'lido')
  const lendo    = library.filter(b => b.status === 'lendo')
  const fila     = library.filter(b => b.status === 'quero ler')
  const topImpact = lidos
    .filter(b => b.impact)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 3)
    .map(b => `"${b.title}" (impacto ${b.impact}/5)`)
    .join(', ')

  return [
    `Biblioteca: ${lidos.length} lidos, ${lendo.length} lendo, ${fila.length} na fila.`,
    topImpact ? `Livros de maior impacto: ${topImpact}.` : '',
    fila.length > 0 ? `Próximos na fila: ${fila.slice(0,3).map(b => `"${b.title}"`).join(', ')}.` : '',
  ].filter(Boolean).join('\n')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { message, user_library = [], conversation_history = [] } = await req.json()

    if (!message?.trim()) {
      return new Response(
        JSON.stringify({ error: 'message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const libraryContext = buildLibraryContext(user_library)
    let recommendations: any[] = []
    let recContext = ''

    // Modo recomendação: gera embedding + busca semântica
    if (isRecommendationRequest(message)) {
      const embedding = await getEmbedding(message)
      recommendations = await matchBooks(embedding, 5)

      if (recommendations.length > 0) {
        recContext = '\n\nLivros semanticamente similares à pergunta do usuário (do catálogo BookMind):\n' +
          recommendations.map((b, i) =>
            `${i+1}. "${b.title}" de ${b.author}` +
            (b.avg_rating ? ` — ${b.avg_rating}★` : '') +
            (b.synopsis ? ` — ${b.synopsis.substring(0, 120)}...` : '')
          ).join('\n')
      }
    }

    const systemPrompt = `Você é o assistente literário do BookMind, um diário de leitura pessoal.
Seu estilo: reflexivo, culto, direto. Respostas em português, máximo 3 parágrafos.
Não use marcadores ou listas — escreva em prosa fluida.

Contexto da biblioteca do usuário:
${libraryContext}${recContext}`

    // Monta histórico de conversa (últimas 6 mensagens para não estourar contexto)
    const history = conversation_history.slice(-6).map((m: any) => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.text,
    }))

    const response = await callGPT(systemPrompt, [
      ...history,
      { role: 'user', content: message },
    ])

    return new Response(
      JSON.stringify({ response, recommendations }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in ai-chat:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
