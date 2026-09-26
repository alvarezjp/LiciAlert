import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Ubicación en el proyecto: supabase/functions/ingesta-diaria/index.ts
//
// ETAPA 11 (v3) — Dos corridas diarias con envío de correo diferenciado:
//   - Corrida "tarde" (14:00 Chile): al completarse el lote, el correo se
//     envía de inmediato.
//   - Corrida "noche" (23:30 Chile): al completarse el lote, el correo NO
//     se envía de inmediato — queda pospuesto hasta las 07:00 del día
//     siguiente (hora Chile). El cron "continuar-enriquecimiento-lotes"
//     (cada 3 min) revisa lotes completados sin avisar y respeta ese
//     horario mínimo antes de disparar la notificación.
//
// Enriquecimiento SECUENCIAL con delay fijo entre peticiones (sin cambios
// respecto a v2): se confirmó empíricamente que la API de Mercado Público
// responde 429 incluso con concurrencia 1 sin espera, pero no responde 429
// si se espera 2000ms entre una petición y la siguiente.

const DELAY_ENTRE_PETICIONES_MS = 2_000 // confirmado empíricamente: sin esto, 429 garantizado
const PRESUPUESTO_MS = 135_000 // margen de seguridad bajo el límite de 150s del plan gratuito
const TIMEOUT_DETALLE_MS = 8_000 // evita que una sola petición colgada bloquee todo
const MAX_FALLOS_SEGUIDOS = 3 // cortacircuito si varios códigos seguidos fallan (ya no por tandas)
const PAUSA_CORTA_SEGUNDOS = 60 // pausa tras el 1er corte
const PAUSA_LARGA_HORAS = 24 // pausa tras 2 cortes seguidos sin éxito entre medio
const UMBRAL_CORTES_PARA_ESCALAR = 2
const TOPE_DIARIO_LLAMADAS = 9_000 // límite real de la API: 10.000/día — se deja margen de 1.000
const HORA_ENVIO_CORRIDA_NOCHE = 7 // 07:00 Chile del día siguiente

type CodigoPendiente = { codigo: string; nombre: string }

type Lote = {
  id: string
  codigos_pendientes: CodigoPendiente[]
  hora_envio_permitida: string | null
}

type ResultadoDetalle =
  | { ok: true; datos: any }
  | { ok: false; status?: number; error?: string }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function obtenerServiceRoleKey(): string | undefined {
  const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (secretKeysRaw) {
    try {
      const secretKeys = JSON.parse(secretKeysRaw)
      if (secretKeys?.default) return secretKeys.default
    } catch {
      // Si no se pudo parsear, seguimos al fallback de abajo
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}

function fechaChileISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
}

// --- Utilidades de fecha/hora Chile → UTC (manejan verano/invierno solas) ---

// Dado un año/mes/día (strings, como se calculan en accion=ingestar), devuelve
// el día calendario siguiente, sin depender de zona horaria (trabaja en UTC
// "de mentira" solo para sumar 1 día de forma segura).
function diaSiguiente(anio: string, mes: string, dia: string) {
  const d = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)))
  d.setUTCDate(d.getUTCDate() + 1)
  return {
    anio: String(d.getUTCFullYear()),
    mes: String(d.getUTCMonth() + 1).padStart(2, '0'),
    dia: String(d.getUTCDate()).padStart(2, '0'),
  }
}

// Convierte una fecha/hora "hora Chile" a su equivalente UTC en ISO,
// detectando automáticamente el offset vigente (UTC-3 verano / UTC-4
// invierno) vía Intl, para no tener que hardcodear el offset a mano como
// se hace en los comentarios de los cron jobs.
function fechaChileAUtcISO(anio: string, mes: string, dia: string, hora: number, minuto: number): string {
  const fechaNaiveUTC = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia), hora, minuto, 0))

  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    timeZoneName: 'shortOffset',
  }).formatToParts(fechaNaiveUTC)

  const offsetTexto = partes.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-3'
  const match = offsetTexto.match(/GMT([+-]\d+)/)
  const offsetHoras = match ? parseInt(match[1], 10) : -3

  return new Date(fechaNaiveUTC.getTime() - offsetHoras * 60 * 60 * 1000).toISOString()
}

// --- Pausa corta/larga por rate limit (429/403 o fallas repetidas) ---

async function pausaActiva(supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const { data, error } = await supabase
    .from('estado_pausa_enriquecimiento')
    .select('pausado_hasta')
    .eq('id', true)
    .maybeSingle()

  if (error || !data?.pausado_hasta) return false

  return new Date(data.pausado_hasta as string).getTime() > Date.now()
}

async function registrarCorteYPausar(
  supabase: ReturnType<typeof createClient>
): Promise<{ tipo: 'corta' | 'larga'; cortesSeguidos: number }> {
  const { data } = await supabase
    .from('estado_pausa_enriquecimiento')
    .select('cortes_seguidos')
    .eq('id', true)
    .maybeSingle()

  const cortesNuevos = (data?.cortes_seguidos ?? 0) + 1

  if (cortesNuevos >= UMBRAL_CORTES_PARA_ESCALAR) {
    const hasta = new Date(Date.now() + PAUSA_LARGA_HORAS * 60 * 60 * 1000).toISOString()
    await supabase
      .from('estado_pausa_enriquecimiento')
      .update({ pausado_hasta: hasta, cortes_seguidos: 0 })
      .eq('id', true)
    return { tipo: 'larga', cortesSeguidos: cortesNuevos }
  }

  const hasta = new Date(Date.now() + PAUSA_CORTA_SEGUNDOS * 1000).toISOString()
  await supabase
    .from('estado_pausa_enriquecimiento')
    .update({ pausado_hasta: hasta, cortes_seguidos: cortesNuevos })
    .eq('id', true)
  return { tipo: 'corta', cortesSeguidos: cortesNuevos }
}

async function resetearCortesSeguidos(supabase: ReturnType<typeof createClient>) {
  await supabase.from('estado_pausa_enriquecimiento').update({ cortes_seguidos: 0 }).eq('id', true)
}

// --- Tope diario duro de peticiones (independiente del status HTTP) ---

async function obtenerConteoHoy(supabase: ReturnType<typeof createClient>): Promise<number> {
  const { data } = await supabase
    .from('contador_llamadas_api')
    .select('cantidad')
    .eq('fecha', fechaChileISO())
    .maybeSingle()

  return data?.cantidad ?? 0
}

async function incrementarConteo(supabase: ReturnType<typeof createClient>, cantidad: number): Promise<number> {
  const { data, error } = await supabase.rpc('incrementar_contador_llamadas', {
    p_fecha: fechaChileISO(),
    p_cantidad: cantidad,
  })
  if (error) {
    console.error('No se pudo incrementar el contador diario de llamadas:', error)
    return Infinity // por seguridad, si falla el conteo, actuamos como si el tope ya se hubiera alcanzado
  }
  return data as number
}

// --- Llamada al endpoint de detalle ---

async function obtenerDetalleLicitacion(codigo: string, ticket: string): Promise<ResultadoDetalle> {
  const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?codigo=${encodeURIComponent(
    codigo
  )}&ticket=${ticket}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_DETALLE_MS)

  try {
    const resp = await fetch(url, { signal: controller.signal })
    if (!resp.ok) {
      return { ok: false, status: resp.status }
    }

    const data = await resp.json()
    const detalle = data?.Listado?.[0]
    if (!detalle) return { ok: false, error: 'sin_listado_en_respuesta' }

    const items: any[] = detalle.Items?.Listado ?? []
    const productosTexto = items
      .map((item) => [item.NombreProducto, item.Descripcion].filter(Boolean).join(' — '))
      .filter(Boolean)
      .join(' | ') || null

    const datosBase: Record<string, any> = {
      codigo,
      organismo: detalle.Comprador?.NombreOrganismo ?? null,
      monto_estimado: typeof detalle.MontoEstimado === 'number' ? detalle.MontoEstimado : null,
      estado: detalle.Estado ?? null,
      descripcion: detalle.Descripcion ?? null,
      productos_texto: productosTexto,
      raw_json_detalle: detalle,
      actualizado_en: new Date().toISOString(),
    }

    if (detalle.Fechas?.FechaInicio) {
      datosBase.fecha_publicacion = detalle.Fechas.FechaInicio
    }

    return { ok: true, datos: datosBase }
  } catch (err) {
    const esTimeout = err instanceof DOMException && err.name === 'AbortError'
    return { ok: false, error: esTimeout ? 'timeout' : String((err as any)?.message ?? err) }
  } finally {
    clearTimeout(timeoutId)
  }
}

// Procesa el lote SECUENCIALMENTE (un código a la vez, con delay fijo entre
// peticiones) hasta agotar el presupuesto de tiempo, hasta terminarlo,
// hasta que el cortacircuito se active, o hasta alcanzar el tope diario.
async function procesarLote(
  supabase: ReturnType<typeof createClient>,
  lote: { id: string; codigos_pendientes: CodigoPendiente[] },
  ticket: string,
  inicioMs: number
): Promise<{
  pendientesRestantes: CodigoPendiente[]
  enriquecidas: number
  procesados: number
  cortadoPorCircuito: boolean
  tipoPausa?: 'corta' | 'larga'
  detenidoPorTopeDiario: boolean
}> {
  let pendientes = [...lote.codigos_pendientes]
  let enriquecidas = 0
  let procesados = 0
  let fallosSeguidos = 0
  let cortadoPorCircuito = false
  let tipoPausa: 'corta' | 'larga' | undefined
  let detenidoPorTopeDiario = false

  let conteoActual = await obtenerConteoHoy(supabase)

  while (pendientes.length > 0 && Date.now() - inicioMs < PRESUPUESTO_MS) {
    const item = pendientes[0]

    if (conteoActual + 1 > TOPE_DIARIO_LLAMADAS) {
      console.error(
        `TOPE DIARIO: se alcanzaría el límite de ${TOPE_DIARIO_LLAMADAS} peticiones/día ` +
        `(actual: ${conteoActual}). Deteniendo antes de la petición #${procesados + 1}.`
      )
      detenidoPorTopeDiario = true
      break
    }

    const inicioItem = Date.now()
    const resultado = await obtenerDetalleLicitacion(item.codigo, ticket)
    conteoActual = await incrementarConteo(supabase, 1)
    procesados++
    const duracionItemMs = Date.now() - inicioItem

    if (resultado.ok) {
      const { error } = await supabase
        .from('licitaciones')
        .upsert({ ...resultado.datos, nombre: item.nombre }, { onConflict: 'codigo' })
      if (error) throw error

      enriquecidas++
      fallosSeguidos = 0
      pendientes = pendientes.slice(1)

      console.log(
        `[${procesados}] OK ${item.codigo} en ${duracionItemMs}ms ` +
        `(conteo diario: ${conteoActual}/${TOPE_DIARIO_LLAMADAS}, restantes en lote: ${pendientes.length})`
      )
    } else {
      fallosSeguidos++
      console.error(
        `[${procesados}] FALLO ${item.codigo}: ${resultado.status ?? resultado.error} ` +
        `(fallo seguido #${fallosSeguidos})`
      )

      const esRateLimit = resultado.status === 429 || resultado.status === 403

      if (esRateLimit || fallosSeguidos >= MAX_FALLOS_SEGUIDOS) {
        const resultadoPausa = await registrarCorteYPausar(supabase)
        tipoPausa = resultadoPausa.tipo
        cortadoPorCircuito = true
        console.error(
          `CORTACIRCUITO: ${esRateLimit ? 'rate limit (429/403)' : `${fallosSeguidos} fallos seguidos`}. ` +
          `Corte seguido #${resultadoPausa.cortesSeguidos}. ` +
          `Pausa activada: ${resultadoPausa.tipo === 'larga' ? `${PAUSA_LARGA_HORAS}h (escalada)` : `${PAUSA_CORTA_SEGUNDOS}s`}.`
        )
        break
      }

      pendientes = [...pendientes.slice(1), item]
    }

    const { error: errorLote } = await supabase
      .from('lotes_enriquecimiento')
      .update({ codigos_pendientes: pendientes })
      .eq('id', lote.id)
    if (errorLote) throw errorLote

    if (pendientes.length > 0 && Date.now() - inicioMs < PRESUPUESTO_MS) {
      await sleep(DELAY_ENTRE_PETICIONES_MS)
    }
  }

  if (!cortadoPorCircuito) {
    await resetearCortesSeguidos(supabase)
  }

  return {
    pendientesRestantes: pendientes,
    enriquecidas,
    procesados,
    cortadoPorCircuito,
    tipoPausa,
    detenidoPorTopeDiario,
  }
}

async function dispararNotificaciones(supabaseUrl: string, loteId: string, supabase: any) {
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/enviar-notificaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    await supabase
      .from('lotes_enriquecimiento')
      .update({ notificacion_enviada: resp.ok })
      .eq('id', loteId)
    if (!resp.ok) {
      console.error('enviar-notificaciones respondió con error:', resp.status)
    }
  } catch (err) {
    console.error('No se pudo llamar a enviar-notificaciones:', err)
  }
}

Deno.serve(async (req) => {
  const inicioMs = Date.now()
  let supabase: ReturnType<typeof createClient> | null = null
  let fecha: string | null = null

  const url = new URL(req.url)
  const accion = url.searchParams.get('accion') ?? 'ingestar'

  try {
    const ticket = Deno.env.get('MERCADOPUBLICO_TICKET')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = obtenerServiceRoleKey()

    if (!ticket) throw new Error('Falta el secret MERCADOPUBLICO_TICKET')
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        'Faltan las variables SUPABASE_URL / llave de servicio (SUPABASE_SECRET_KEYS o SUPABASE_SERVICE_ROLE_KEY)'
      )
    }

    supabase = createClient(supabaseUrl, serviceRoleKey)

    let cantidadInsertadas = 0
    let lote: Lote | null = null

    if (accion === 'continuar') {
      const { data: bloqueoObtenido } = await supabase.rpc('intentar_bloquear_enriquecimiento', {
        p_segundos_stale: 160,
      })

      if (!bloqueoObtenido) {
        return new Response(
          JSON.stringify({ ok: true, mensaje: 'Ya hay otra corrida de enriquecimiento en curso, se omite esta invocación.' }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Solo se avisa si ya se cumplió hora_envio_permitida (inmediato para
      // la corrida "tarde", 07:00 del día siguiente para la corrida "noche").
      const { data: lotesSinAvisar } = await supabase
        .from('lotes_enriquecimiento')
        .select('id')
        .eq('completado', true)
        .eq('notificacion_enviada', false)
        .lte('hora_envio_permitida', new Date().toISOString())

      for (const l of lotesSinAvisar ?? []) {
        await dispararNotificaciones(supabaseUrl, l.id as string, supabase)
      }

      const { data: loteAbierto, error: errorLote } = await supabase
        .from('lotes_enriquecimiento')
        .select('id, codigos_pendientes, hora_envio_permitida')
        .eq('completado', false)
        .order('creado_en', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (errorLote) throw errorLote

      if (!loteAbierto) {
        return new Response(
          JSON.stringify({ ok: true, mensaje: 'No hay lotes de enriquecimiento pendientes.' }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      }

      lote = loteAbierto as Lote
    } else {
      const partesFecha = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hour12: false,
      }).formatToParts(new Date())

      const dia = partesFecha.find((p) => p.type === 'day')!.value
      const mes = partesFecha.find((p) => p.type === 'month')!.value
      const anio = partesFecha.find((p) => p.type === 'year')!.value
      const horaChile = parseInt(partesFecha.find((p) => p.type === 'hour')!.value, 10)
      fecha = `${dia}${mes}${anio}`

      // Dos corridas: "tarde" (14:00, correo inmediato) y "noche" (23:30,
      // correo pospuesto a las 07:00 del día siguiente). Umbral a las 20h
      // separa ambas con margen de sobra entre 14:00 y 23:30.
      const corrida = horaChile < 20 ? 'tarde' : 'noche'

      const horaEnvioPermitida =
        corrida === 'tarde'
          ? new Date().toISOString()
          : (() => {
              const manana = diaSiguiente(anio, mes, dia)
              return fechaChileAUtcISO(manana.anio, manana.mes, manana.dia, HORA_ENVIO_CORRIDA_NOCHE, 0)
            })()

      const urlListado = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?fecha=${fecha}&estado=publicada&ticket=${ticket}`
      const respListado = await fetch(urlListado)

      if (!respListado.ok) {
        throw new Error(`La API de Mercado Público respondió con status ${respListado.status}`)
      }

      const dataListado = await respListado.json()
      const listado: any[] = dataListado?.Listado ?? []

      const filasBase = Array.from(
        new Map(
          listado
            .map((item) => ({
              codigo: item.CodigoExterno,
              nombre: item.Nombre,
              fecha_publicacion: `${anio}-${mes}-${dia}`,
              fecha_cierre: item.FechaCierre ?? null,
              raw_json: item,
              actualizado_en: new Date().toISOString(),
            }))
            .filter((fila) => fila.codigo && fila.nombre)
            .map((fila) => [fila.codigo, fila])
        ).values()
      )

      if (filasBase.length > 0) {
        const { error } = await supabase.from('licitaciones').upsert(filasBase, { onConflict: 'codigo' })
        if (error) throw error
        cantidadInsertadas = filasBase.length
      }

      const codigosDeHoy = filasBase.map((f) => f.codigo)
      let pendientesIniciales: CodigoPendiente[] = []

      if (codigosDeHoy.length > 0) {
        const { data: pendientesData, error: errorPendientes } = await supabase
          .rpc('codigos_sin_organismo', { p_codigos: codigosDeHoy })

        if (errorPendientes) throw errorPendientes

        const { data: lotesAbiertos } = await supabase
          .from('lotes_enriquecimiento')
          .select('codigos_pendientes')
          .eq('completado', false)

        const codigosYaEnLotesAbiertos = new Set<string>()
        for (const l of lotesAbiertos ?? []) {
          for (const item of (l.codigos_pendientes as CodigoPendiente[]) ?? []) {
            codigosYaEnLotesAbiertos.add(item.codigo)
          }
        }

        pendientesIniciales = (pendientesData ?? []).filter(
          (row: any) => !codigosYaEnLotesAbiertos.has(row.codigo)
        ) as CodigoPendiente[]
      }

      if (pendientesIniciales.length > 0) {
        const { data: nuevoLote, error: errorNuevoLote } = await supabase
          .from('lotes_enriquecimiento')
          .insert({
            fecha: `${anio}-${mes}-${dia}`,
            corrida,
            codigos_pendientes: pendientesIniciales,
            total_codigos: pendientesIniciales.length,
            hora_envio_permitida: horaEnvioPermitida,
          })
          .select('id, codigos_pendientes, hora_envio_permitida')
          .single()

        if (errorNuevoLote) throw errorNuevoLote
        lote = nuevoLote as Lote
      } else {
        console.log(
          'Sin códigos nuevos para enriquecer en esta corrida (todos ya estaban cubiertos por un lote abierto existente).'
        )
      }
    }

    let cantidadEnriquecidas = 0
    let loteCompletado = false
    let cortadoPorCircuito = false
    let tipoPausa: 'corta' | 'larga' | undefined
    let detenidoPorTopeDiario = false

    if (lote) {
      const enPausa = await pausaActiva(supabase)

      if (enPausa) {
        console.log('Pausa activa por corte(s) reciente(s) — se omite el enriquecimiento esta vez.')
        cortadoPorCircuito = true
      } else {
        const resultado = await procesarLote(supabase, lote, ticket, inicioMs)
        cantidadEnriquecidas = resultado.enriquecidas
        loteCompletado = resultado.pendientesRestantes.length === 0
        cortadoPorCircuito = resultado.cortadoPorCircuito
        tipoPausa = resultado.tipoPausa
        detenidoPorTopeDiario = resultado.detenidoPorTopeDiario

        if (loteCompletado) {
          await supabase
            .from('lotes_enriquecimiento')
            .update({ completado: true, completado_en: new Date().toISOString() })
            .eq('id', lote.id)

          const yaSePuedeAvisar =
            !lote.hora_envio_permitida || new Date(lote.hora_envio_permitida) <= new Date()

          if (yaSePuedeAvisar) {
            await dispararNotificaciones(supabaseUrl, lote.id, supabase)
          } else {
            console.log(
              `Lote ${lote.id} completado, pero el correo queda pospuesto hasta ${lote.hora_envio_permitida} ` +
              `(lo recogerá el cron "continuar-enriquecimiento-lotes").`
            )
          }
        }
      }
    }

    const mensajeError = detenidoPorTopeDiario
      ? `TOPE DIARIO alcanzado (${TOPE_DIARIO_LLAMADAS} peticiones/día)`
      : cortadoPorCircuito
      ? `CORTACIRCUITO${tipoPausa ? ` (${tipoPausa})` : ''}: revisar logs de la función`
      : null

    const { error: logError } = await supabase.from('logs_ingesta').insert({
      ok: true,
      fecha_consultada: fecha,
      cantidad_insertadas: cantidadInsertadas,
      cantidad_enriquecidas: cantidadEnriquecidas,
      mensaje_error: mensajeError,
    })
    if (logError) console.error('Error al insertar en logs_ingesta:', logError)

    return new Response(
      JSON.stringify({
        ok: true,
        accion,
        fecha,
        insertadas: cantidadInsertadas,
        enriquecidas: cantidadEnriquecidas,
        loteId: lote?.id ?? null,
        loteCompletado,
        cortadoPorCircuito,
        tipoPausa: tipoPausa ?? null,
        detenidoPorTopeDiario,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const mensajeError =
      err instanceof Error ? err.message : (err as any)?.message ?? JSON.stringify(err)

    console.error('Error en ingesta-diaria:', err)

    if (supabase) {
      const { error: logError } = await supabase.from('logs_ingesta').insert({
        ok: false,
        fecha_consultada: fecha,
        cantidad_insertadas: 0,
        cantidad_enriquecidas: 0,
        mensaje_error: mensajeError,
      })
      if (logError) console.error('Error al insertar en logs_ingesta:', logError)
    }

    return new Response(JSON.stringify({ ok: false, error: mensajeError }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  } finally {
    if (supabase && accion === 'continuar') {
      await supabase.rpc('liberar_bloqueo_enriquecimiento')
    }
  }
})