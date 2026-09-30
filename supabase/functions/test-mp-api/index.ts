import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Ubicación: supabase/functions/test-mp-api/index.ts
//
// Función de diagnóstico, AISLADA de la lógica de ingesta-diaria.
// Hace UNA sola llamada a la API de Mercado Público desde la IP de
// Supabase y devuelve el detalle crudo de la respuesta (status, headers,
// primeros caracteres del cuerpo) — para confirmar si el bloqueo es por
// IP compartida, y si la API manda alguna pista extra (ej. Retry-After)
// que no estemos aprovechando.
//
// Uso: GET o POST a esta función, con query param opcional ?codigo=XXXX
// (si no se pasa, prueba con ?estado=activas en su lugar).

Deno.serve(async (req) => {
  const ticket = Deno.env.get('MERCADOPUBLICO_TICKET')
  if (!ticket) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta MERCADOPUBLICO_TICKET' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(req.url)
  const codigo = url.searchParams.get('codigo')

  const urlApi = codigo
    ? `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?codigo=${encodeURIComponent(codigo)}&ticket=${ticket}`
    : `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?estado=activas&ticket=${ticket}`

  const inicio = Date.now()

  try {
    const resp = await fetch(urlApi)
    const duracionMs = Date.now() - inicio

    // Copiamos todos los headers de la respuesta — algunos servicios
    // mandan pistas como Retry-After, X-RateLimit-Remaining, etc.
    const headers: Record<string, string> = {}
    resp.headers.forEach((value, key) => {
      headers[key] = value
    })

    const cuerpoTexto = await resp.text()

    return new Response(
      JSON.stringify({
        ok: true,
        urlConsultada: urlApi.replace(ticket, 'TICKET_OCULTO'),
        status: resp.status,
        statusText: resp.statusText,
        duracionMs,
        headersRespuesta: headers,
        primerosCaracteresDelCuerpo: cuerpoTexto.slice(0, 300),
      }, null, 2),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        duracionMs: Date.now() - inicio,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})