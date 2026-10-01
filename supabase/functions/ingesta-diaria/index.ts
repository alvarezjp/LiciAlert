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
//
// v4 — Clasificación de fallos + licitaciones saltadas (sin pausa de 24h):
//   - Fallo "rate_limit" (429/403/"peticiones simultáneas"): pausa corta de 60s.
//   - Fallo "infra" (timeout, red, 502/503/504, JSON inválido): cuenta para el
//     cortacircuito (3 seguidos → pausa corta de 60s). El código no se penaliza.
//   - Fallo "codigo" (500 u otro error propio de ESE código, ej. licitación de
//     prueba con Codigo 10000 "String or binary data would be truncated"):
//     suma 1 a `intentos` de ese código. NO activa el cortacircuito. Al llegar
//     a MAX_INTENTOS_POR_CODIGO (en total, sin importar cuándo ocurran) se
//     registra en `licitaciones_saltadas` y sale del lote. No se reintenta
//     solo: para reintentar a mano, borrar su fila de licitaciones_saltadas.

const DELAY_ENTRE_PETICIONES_MS = 2_000 // confirmado empíricamente: sin esto, 429 garantizado
const PRESUPUESTO_MS = 135_000 // margen de seguridad bajo el límite de 150s del plan gratuito
const TIMEOUT_DETALLE_MS = 8_000 // evita que una sola petición colgada bloquee todo
const MAX_FALLOS_SEGUIDOS = 3 // cortacircuito si varios fallos de INFRA seguidos
const PAUSA_CORTA_SEGUNDOS = 60 // única pausa: ya no existe la pausa larga de 24h
const MAX_INTENTOS_POR_CODIGO = 3 // intentos en total antes de saltar un código
const TOPE_DIARIO_LLAMADAS = 9_000 // límite real de la API: 10.000/día — se deja margen de 1.000
const HORA_ENVIO_CORRIDA_NOCHE = 7 // 07:00 Chile del día siguiente

// `intentos` es opcional: los lotes antiguos no lo traen (se asume 0).
type CodigoPendiente = { codigo: string; nombre: string; intentos?: number }

type Lote = {
  id: string
  codigos_pendientes: CodigoPendiente[]
  hora_envio_permitida: string | null
}

type TipoFallo = 'rate_limit' | 'infra' | 'codigo'

type ResultadoDetalle =
  | { ok: true; datos: any }
  | { ok: false; tipo: TipoFallo; status?: number; error?: string; cuerpo?: string }

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

// --- Pausa corta por rate limit (429/403 o fallas de infraestructura repetidas) ---

async function pausaActiva(supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const { data, error } = await supabase
    .from('estado_pausa_enriquecimiento')
    .select('pausado_hasta')
    .eq('id', true)
    .maybeSingle()

  if (error || !data?.pausado_hasta) return false

  return new Date(data.pausado_hasta as string).getTime() > Date.now()
}

// Solo existe la pausa corta. `cortes_seguidos` queda como dato informativo
// (ya no escala a nada): si el rate limit persiste, simplemente se sigue
// pausando 60s y reintentando en el siguiente tick del cron.
async function registrarCorteYPausar(
  supabase: ReturnType<typeof createClient>
): Promise<number> {
  const { data } = await supabase
    .from('estado_pausa_enriquecimiento')
    .select('cortes_seguidos')
    .eq('id', true)
    .maybeSingle()

  const cortesNuevos = (data?.cortes_seguidos ?? 0) + 1

  const hasta = new Date(Date.now() + PAUSA_CORTA_SEGUNDOS * 1000).toISOString()
  await supabase
    .from('estado_pausa_enriquecimiento')
    .update({ pausado_hasta: hasta, cortes_seguidos: cortesNuevos })
    .eq('id', true)
  return cortesNuevos
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

// Protección extra: si la API avisa de rate limit en el body (aunque el status
// no sea 429), se trata como rate limit y NO como culpa del código.
const REGEX_PETICIONES_SIMULTANEAS = /simult[aá]neas/i

async function obtenerDetalleLicitacion(codigo: string, ticket: string): Promise<ResultadoDetalle> {
  const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?codigo=${encodeURIComponent(
    codigo
  )}&ticket=${ticket}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_DETALLE_MS)

  try {
    const resp = await fetch(url, { signal: controller.signal })

    if (!resp.ok) {
      const cuerpo = (await resp.text().catch(() => '')).slice(0, 200)
      const esRateLimit =
        resp.status === 429 || resp.status === 403 || REGEX_PETICIONES_SIMULTANEAS.test(cuerpo)
      // 502/503/504 = problema transitorio del lado de la API, no del código.
      // 500 NO entra aquí: se confirmó que es error propio de ese código
      // (ej. licitación de prueba, Codigo 10000 "String or binary data would be truncated").
      const esInfra = resp.status >= 502 && resp.status <= 504
      return {
        ok: false,
        tipo: esRateLimit ? 'rate_limit' : esInfra ? 'infra' : 'codigo',
        status: resp.status,
        cuerpo,
      }
    }

    const data = await resp.json()
    const detalle = data?.Listado?.[0]
    if (!detalle) {
      const cuerpo = JSON.stringify(data ?? null).slice(0, 200)
      return {
        ok: false,
        tipo: REGEX_PETICIONES_SIMULTANEAS.test(cuerpo) ? 'rate_limit' : 'codigo',
        status: resp.status,
        error: 'sin_listado_en_respuesta',
        cuerpo,
      }
    }

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
    // Timeout, red caída o JSON inválido: falla de infraestructura, no del código.
    const esTimeout = err instanceof DOMException && err.name === 'AbortError'
    return {
      ok: false,
      tipo: 'infra',
      error: esTimeout ? 'timeout' : String((err as any)?.message ?? err),
    }
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
  saltadas: number
  procesados: number
  cortadoPorCircuito: boolean
  detenidoPorTopeDiario: boolean
}> {
  let pendientes = [...lote.codigos_pendientes]
  let enriquecidas = 0
  let saltadas = 0
  let procesados = 0
  let fallosInfraSeguidos = 0
  let cortadoPorCircuito = false
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
      fallosInfraSeguidos = 0
      pendientes = pendientes.slice(1)

      console.log(
        `[${procesados}] OK ${item.codigo} en ${duracionItemMs}ms ` +
        `(conteo diario: ${conteoActual}/${TOPE_DIARIO_LLAMADAS}, restantes en lote: ${pendientes.length})`
      )
    } else {
      const detalleFallo = resultado.cuerpo ?? resultado.error ?? ''
      console.error(
        `[${procesados}] FALLO (${resultado.tipo}) ${item.codigo}: ` +
        `status=${resultado.status ?? 'n/a'} ${resultado.error ?? ''} body="${detalleFallo}"`
      )

      if (resultado.tipo === 'rate_limit') {
        // 429/403: corte inmediato con pausa corta. El código NO se penaliza.
        const cortes = await registrarCorteYPausar(supabase)
        cortadoPorCircuito = true
        console.error(
          `CORTACIRCUITO: rate limit. Corte #${cortes}. Pausa de ${PAUSA_CORTA_SEGUNDOS}s.`
        )
        break
      }

      if (resultado.tipo === 'infra') {
        // Timeout/red/502-504: cuenta para el cortacircuito, el código no se penaliza.
        fallosInfraSeguidos++
        if (fallosInfraSeguidos >= MAX_FALLOS_SEGUIDOS) {
          const cortes = await registrarCorteYPausar(supabase)
          cortadoPorCircuito = true
          console.error(
            `CORTACIRCUITO: ${fallosInfraSeguidos} fallos de infraestructura seguidos. ` +
            `Corte #${cortes}. Pausa de ${PAUSA_CORTA_SEGUNDOS}s.`
          )
          break
        }
        pendientes = [...pendientes.slice(1), item]
      } else {
        // Fallo propio del código (500, sin Listado, etc.): la API sí respondió,
        // así que no es un problema de infraestructura. Suma 1 intento.
        fallosInfraSeguidos = 0
        const intentos = (item.intentos ?? 0) + 1

        if (intentos >= MAX_INTENTOS_POR_CODIGO) {
          const { error: errorSaltada } = await supabase.from('licitaciones_saltadas').upsert(
            {
              codigo: item.codigo,
              nombre: item.nombre,
              lote_id: lote.id,
              intentos,
              ultimo_status: resultado.status ?? null,
              ultimo_error: detalleFallo || null,
              saltada_en: new Date().toISOString(),
              revisada: false,
            },
            { onConflict: 'codigo' }
          )
          if (errorSaltada) throw errorSaltada

          saltadas++
          pendientes = pendientes.slice(1)
          console.error(
            `SALTADA ${item.codigo} tras ${intentos} intentos (status=${resultado.status ?? 'n/a'}). ` +
            `Restantes en lote: ${pendientes.length}`
          )
        } else {
          // Al final de la cola, para no martillar el mismo código seguido.
          pendientes = [...pendientes.slice(1), { ...item, intentos }]
        }
      }
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
    saltadas,
    procesados,
    cortadoPorCircuito,
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
  let bloqueoPropio = false // solo true si ESTA invocación tomó el lock

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

      bloqueoPropio = bloqueoObtenido === true

      if (!bloqueoPropio) {
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
    let cantidadSaltadas = 0
    let procesados = 0
    let loteCompletado = false
    let cortadoPorCircuito = false
    let enPausa = false
    let detenidoPorTopeDiario = false

    if (lote) {
      enPausa = await pausaActiva(supabase)

      if (enPausa) {
        console.log('Pausa corta activa — se omite el enriquecimiento esta vez.')
      } else {
        const resultado = await procesarLote(supabase, lote, ticket, inicioMs)
        cantidadEnriquecidas = resultado.enriquecidas
        cantidadSaltadas = resultado.saltadas
        procesados = resultado.procesados
        loteCompletado = resultado.pendientesRestantes.length === 0
        cortadoPorCircuito = resultado.cortadoPorCircuito
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

    const mensajes: string[] = []
    if (detenidoPorTopeDiario) mensajes.push(`TOPE DIARIO alcanzado (${TOPE_DIARIO_LLAMADAS} peticiones/día)`)
    if (cortadoPorCircuito) mensajes.push('CORTACIRCUITO: revisar logs de la función')
    if (cantidadSaltadas > 0) mensajes.push(`${cantidadSaltadas} licitación(es) saltada(s) — ver licitaciones_saltadas`)
    const mensajeError = mensajes.length > 0 ? mensajes.join(' | ') : null

    // Paso 5: en `continuar`, solo se registra en logs_ingesta si hubo actividad
    // real contra la API (procesados > 0). Así no se inserta una fila cada 3
    // minutos cuando solo se detectó pausa activa o el tope diario ya estaba lleno.
    const debeRegistrarLog = accion !== 'continuar' || procesados > 0

    if (debeRegistrarLog) {
      const { error: logError } = await supabase.from('logs_ingesta').insert({
        ok: true,
        fecha_consultada: fecha,
        cantidad_insertadas: cantidadInsertadas,
        cantidad_enriquecidas: cantidadEnriquecidas,
        mensaje_error: mensajeError,
      })
      if (logError) console.error('Error al insertar en logs_ingesta:', logError)
    }

    return new Response(
      JSON.stringify({
        ok: true,
        accion,
        fecha,
        insertadas: cantidadInsertadas,
        enriquecidas: cantidadEnriquecidas,
        saltadas: cantidadSaltadas,
        loteId: lote?.id ?? null,
        loteCompletado,
        cortadoPorCircuito,
        enPausa,
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
    if (supabase && accion === 'continuar' && bloqueoPropio) {
      await supabase.rpc('liberar_bloqueo_enriquecimiento')
    }
  }
})