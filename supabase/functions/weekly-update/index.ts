// ══════════════════════════════════════════════════════════════
// Edge Function: weekly-update
// Atualiza catálogo semanalmente (chamada via pg_cron)
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Por enquanto, vamos apenas registrar a execução
    // Na produção, aqui você integraria com NYT Books API para pegar bestsellers da semana
    // Exemplo de integração futura:
    // const nytApiKey = Deno.env.get('NYT_API_KEY')
    // const nytUrl = `https://api.nytimes.com/svc/books/v3/lists/current/hardcover-fiction.json?api-key=${nytApiKey}`
    
    const executionLog = {
      executed_at: new Date().toISOString(),
      status: 'success',
      message: 'Weekly update executed successfully (placeholder)',
    }

    console.log('Weekly update executed:', executionLog)

    // Aqui você pode adicionar lógica para:
    // 1. Chamar NYT API
    // 2. Extrair ISBNs novos
    // 3. Buscar cada um na Open Library
    // 4. Inserir em dim_books

    return new Response(
      JSON.stringify(executionLog),
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