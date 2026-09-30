'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

type Licitacion = {
  codigo: string
  nombre: string
  organismo: string | null
  monto_estimado: number | null
  estado: string | null
  fecha_cierre: string | null
  fecha_publicacion: string | null
  estado_usuario: 'nueva' | 'vista' | 'postulada'
}

// Evita el bug de "un día menos": parseamos en hora LOCAL
function formatearFechaLocal(fechaISO: string) {
  const [anio, mes, dia] = fechaISO.slice(0, 10).split('-').map(Number)
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
  })
}

function diasHastaCierre(fechaISO: string): number {
  const [anio, mes, dia] = fechaISO.slice(0, 10).split('-').map(Number)
  const cierre = new Date(anio, mes - 1, dia).getTime()
  return Math.ceil((cierre - Date.now()) / (1000 * 60 * 60 * 24))
}

const URL_BASE_MERCADO_PUBLICO =
  'http://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion='

/* ── Badge estado usuario (esquina superior derecha de la card) ── */
function BadgeEstadoUsuario({ estado }: { estado: Licitacion['estado_usuario'] }) {
  const config = {
    nueva: {
      label: 'Nueva',
      dot: 'bg-[#38bdf8]',
      className: 'bg-[#e0f7ff] text-[#0891b2] border border-[#38bdf8]/40',
    },
    vista: {
      label: 'Vista',
      dot: 'bg-slate-400',
      className: 'bg-slate-100 text-slate-500 border border-slate-200',
    },
    postulada: {
      label: 'Postulada',
      dot: 'bg-emerald-500',
      className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    },
  }
  const { label, dot, className } = config[estado] ?? config.nueva
  return (
    <span className={`inline-flex items-center gap-1.5 shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

/* ── Texto de cierre con color según urgencia ── */
function TextoCierre({ fechaISO }: { fechaISO: string }) {
  const dias = diasHastaCierre(fechaISO)

  if (dias < 0)
    return <span className="text-slate-400">Cerrada</span>
  if (dias === 0)
    return <span className="font-semibold text-red-500">Cierra hoy</span>
  if (dias <= 3)
    return <span className="font-semibold text-orange-500">Cierra en {dias} días</span>
  return <span className="text-slate-500">Cierra en {dias} días</span>
}

export default function ListaLicitaciones({
  licitaciones,
  userId,
}: {
  licitaciones: Licitacion[]
  userId: string
}) {
  const router = useRouter()
  const supabase = createClient()

  const marcarEstado = async (codigo: string, estado: 'vista' | 'postulada') => {
    const { error } = await supabase.from('licitacion_usuario_estado').upsert(
      {
        user_id: userId,
        codigo_licitacion: codigo,
        estado,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: 'user_id,codigo_licitacion' }
    )

    if (error) {
      alert('No se pudo actualizar el estado: ' + error.message)
      return
    }

    router.refresh()
  }

  const verDetalle = async (lic: Licitacion) => {
    // Abrir la pestaña ANTES del await — los navegadores bloquean popups asincrónicos
    window.open(URL_BASE_MERCADO_PUBLICO + encodeURIComponent(lic.codigo), '_blank')
    if (lic.estado_usuario === 'nueva') {
      await marcarEstado(lic.codigo, 'vista')
    }
  }

  /* ── Estado vacío ── */
  if (licitaciones.length === 0) {
    return (
      <div className="flex flex-col items-center py-20 text-center gap-3">
        <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-2" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="#94a3b8" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-base font-semibold text-slate-800">Sin resultados todavía</p>
        <p className="text-sm text-slate-500">
          Agrega o revisa tus{' '}
          <a href="/keywords" className="text-[#0891b2] hover:underline font-medium">
            palabras clave
          </a>
          .
        </p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {licitaciones.map((lic) => (
        <li
          key={lic.codigo}
          className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-200 px-6 py-5"
        >
          {/* Cabecera: nombre + badge estado */}
          <div className="flex justify-between items-start gap-4 mb-2">
            <h3 className="text-base font-bold text-slate-900 leading-snug flex-1 uppercase tracking-wide">
              {lic.nombre}
            </h3>
            <BadgeEstadoUsuario estado={lic.estado_usuario} />
          </div>

          {/* Organismo */}
          <p className="flex items-center gap-1.5 text-sm text-slate-500 mb-3">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="shrink-0 text-slate-400" aria-hidden="true">
              <rect x="1" y="6" width="14" height="9" rx="1" stroke="currentColor" strokeWidth="1.3" />
              <path d="M5 6V4a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 10v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            {lic.organismo ?? 'Organismo no disponible'}
          </p>

          {/* Fila de metadatos: ID · publicada · cierre · monto · días restantes */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-4">

            <span className="font-mono text-slate-400">{lic.codigo}</span>

            {lic.fecha_publicacion && (
              <span>
                Publicada {formatearFechaLocal(lic.fecha_publicacion)}
              </span>
            )}

            {lic.fecha_cierre && (
              <span>
                Cierre {formatearFechaLocal(lic.fecha_cierre)}
              </span>
            )}

            {lic.monto_estimado && (
              <span className="flex items-center gap-1">
                <span className="text-slate-400">$</span>
                <span className="text-slate-600 font-medium">
                  {Number(lic.monto_estimado).toLocaleString('es-CL')}
                </span>
              </span>
            )}

            {lic.fecha_cierre && (
              <TextoCierre fechaISO={lic.fecha_cierre} />
            )}
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Botón principal */}
            <button
              onClick={() => verDetalle(lic)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0d1b2e] hover:bg-[#1a3a5c] text-white text-sm font-medium transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M10 2h4v4M14 2L8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Ver en Mercado Público
            </button>

            {/* Acción Vista — estilo inline con ícono */}
            <button
              onClick={() => marcarEstado(lic.codigo, 'vista')}
              disabled={lic.estado_usuario === 'vista' || lic.estado_usuario === 'postulada'}
              className={`inline-flex items-center gap-1.5 text-sm transition-colors disabled:cursor-not-allowed ${
                lic.estado_usuario === 'vista' || lic.estado_usuario === 'postulada'
                  ? 'text-slate-400'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {lic.estado_usuario === 'vista' || lic.estado_usuario === 'postulada' ? (
                /* ícono ojo tachado cuando ya está vista */
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M1.5 8C3 4.5 5 3 8 3s5 1.5 6.5 5c-1.5 3.5-3.5 5-6.5 5s-5-1.5-6.5-5z" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M1.5 8C3 4.5 5 3 8 3s5 1.5 6.5 5c-1.5 3.5-3.5 5-6.5 5s-5-1.5-6.5-5z" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              )}
              Vista
            </button>

            {/* Acción Postulada */}
            <button
              onClick={() => marcarEstado(lic.codigo, 'postulada')}
              disabled={lic.estado_usuario === 'postulada'}
              className={`inline-flex items-center gap-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                lic.estado_usuario === 'postulada'
                  ? 'text-emerald-600'
                  : 'text-slate-500 hover:text-emerald-600'
              }`}
            >
              {lic.estado_usuario === 'postulada' ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2.5 8.5l4 4 7-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
              Postulada
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
