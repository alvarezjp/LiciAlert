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

// Evita el bug de "un día menos": parseamos los componentes y armamos la fecha
// en hora LOCAL, sin pasar por UTC.
function formatearFechaLocal(fechaISO: string) {
  const [anio, mes, dia] = fechaISO.slice(0, 10).split('-').map(Number)
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-CL')
}

// Calcula cuántos días quedan hasta el cierre (puede ser negativo)
function diasHastaCierre(fechaISO: string): number {
  const [anio, mes, dia] = fechaISO.slice(0, 10).split('-').map(Number)
  const cierre = new Date(anio, mes - 1, dia).getTime()
  return Math.ceil((cierre - Date.now()) / (1000 * 60 * 60 * 24))
}

const URL_BASE_MERCADO_PUBLICO =
  'http://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion='

/* ── Badge de estado usuario ── */
function BadgeEstadoUsuario({ estado }: { estado: Licitacion['estado_usuario'] }) {
  const config = {
    nueva:     { label: 'Nueva',     cls: 'lic-badge--nueva' },
    vista:     { label: 'Vista',     cls: 'lic-badge--vista' },
    postulada: { label: 'Postulada', cls: 'lic-badge--postulada' },
  }
  const { label, cls } = config[estado] ?? config.nueva
  return <span className={`lic-badge ${cls}`}>{label}</span>
}

/* ── Badge de días restantes ── */
function BadgeCierre({ fechaISO }: { fechaISO: string }) {
  const dias = diasHastaCierre(fechaISO)
  if (dias < 0) return <span className="lic-badge-cierre lic-badge-cierre--vencida">Cerrada</span>
  if (dias === 0) return <span className="lic-badge-cierre lic-badge-cierre--hoy">Cierra hoy</span>
  if (dias <= 3) return <span className="lic-badge-cierre lic-badge-cierre--urgente">Cierra en {dias}d</span>
  return <span className="lic-badge-cierre lic-badge-cierre--ok">Cierra en {dias}d</span>
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
    // Abrir la pestaña ANTES del await — los navegadores bloquean popups
    // que se abren después de operaciones asíncronas.
    window.open(URL_BASE_MERCADO_PUBLICO + encodeURIComponent(lic.codigo), '_blank')

    if (lic.estado_usuario === 'nueva') {
      await marcarEstado(lic.codigo, 'vista')
    }
  }

  if (licitaciones.length === 0) {
    return (
      <div className="lic-empty">
        <div className="lic-empty-icon" aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <circle cx="18" cy="18" r="16" stroke="rgba(99,180,255,0.2)" strokeWidth="1.5"/>
            <path d="M12 18h12M18 12v12" stroke="rgba(99,180,255,0.3)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <p className="lic-empty-title">Sin resultados todavía</p>
        <p className="lic-empty-body">
          Agrega o revisa tus{' '}
          <a href="/keywords" className="lic-link">palabras clave</a>.
        </p>
      </div>
    )
  }

  return (
    <>
      <ul className="lic-list">
        {licitaciones.map((lic) => (
          <li key={lic.codigo} className={`lic-card${lic.estado_usuario === 'nueva' ? ' lic-card--nueva' : ''}`}>

            {/* Cabecera de la card */}
            <div className="lic-card-header">
              <h3 className="lic-nombre">{lic.nombre}</h3>
              <BadgeEstadoUsuario estado={lic.estado_usuario} />
            </div>

            {/* Organismo */}
            <p className="lic-organismo">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="1" y="6" width="14" height="9" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M5 6V4a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M8 10v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              {lic.organismo ?? 'Organismo no disponible'}
            </p>

            {/* Meta: estado licitación + monto */}
            <div className="lic-meta">
              {lic.estado && (
                <span className="lic-meta-item">
                  Estado: <strong>{lic.estado}</strong>
                </span>
              )}
              {lic.monto_estimado && (
                <span className="lic-meta-item">
                  Monto: <strong>${Number(lic.monto_estimado).toLocaleString('es-CL')}</strong>
                </span>
              )}
            </div>

            {/* Fechas + código */}
            <div className="lic-fechas">
              <span className="lic-codigo">{lic.codigo}</span>
              {lic.fecha_publicacion && (
                <span>Publicada: {formatearFechaLocal(lic.fecha_publicacion)}</span>
              )}
              {lic.fecha_cierre && (
                <>
                  <span>Cierre: {formatearFechaLocal(lic.fecha_cierre)}</span>
                  <BadgeCierre fechaISO={lic.fecha_cierre} />
                </>
              )}
            </div>

            {/* Acciones */}
            <div className="lic-acciones">
              <button
                className="lic-btn lic-btn--primary"
                onClick={() => verDetalle(lic)}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  <path d="M10 2h4v4M14 2L8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Ver en Mercado Público
              </button>
              <button
                className="lic-btn lic-btn--secondary"
                onClick={() => marcarEstado(lic.codigo, 'vista')}
                disabled={lic.estado_usuario === 'vista' || lic.estado_usuario === 'postulada'}
              >
                Marcar vista
              </button>
              <button
                className="lic-btn lic-btn--success"
                onClick={() => marcarEstado(lic.codigo, 'postulada')}
                disabled={lic.estado_usuario === 'postulada'}
              >
                Postulada
              </button>
            </div>
          </li>
        ))}
      </ul>

      <style>{`
        /* ── Lista ── */
        .lic-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 12px; }

        /* ── Card ── */
        .lic-card {
          border-radius: 14px;
          padding: 18px 20px;
          background: rgba(8, 22, 42, 0.72);
          border: 1px solid rgba(99, 180, 255, 0.1);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .lic-card:hover {
          border-color: rgba(56, 189, 248, 0.22);
          box-shadow: 0 4px 32px rgba(0, 80, 160, 0.2);
        }
        /* Borde izquierdo para licitaciones nuevas */
        .lic-card--nueva {
          border-left: 3px solid rgba(56, 189, 248, 0.6);
        }

        /* ── Cabecera ── */
        .lic-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 10px;
        }
        .lic-nombre {
          font-size: 0.95rem;
          font-weight: 600;
          color: #d6eaf8;
          line-height: 1.45;
          flex: 1;
        }

        /* ── Badges estado usuario ── */
        .lic-badge {
          flex-shrink: 0;
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.04em;
        }
        .lic-badge--nueva {
          background: rgba(56, 189, 248, 0.12);
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.25);
        }
        .lic-badge--vista {
          background: rgba(148, 163, 184, 0.1);
          color: #94a3b8;
          border: 1px solid rgba(148,163,184,0.2);
        }
        .lic-badge--postulada {
          background: rgba(34, 197, 94, 0.1);
          color: #4ade80;
          border: 1px solid rgba(34,197,94,0.25);
        }

        /* ── Badge cierre ── */
        .lic-badge-cierre {
          font-size: 0.68rem;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 999px;
        }
        .lic-badge-cierre--ok      { background: rgba(34,197,94,0.1);   color: #4ade80; border: 1px solid rgba(34,197,94,0.2); }
        .lic-badge-cierre--urgente { background: rgba(251,146,60,0.12);  color: #fb923c; border: 1px solid rgba(251,146,60,0.25); }
        .lic-badge-cierre--hoy     { background: rgba(239,68,68,0.12);   color: #f87171; border: 1px solid rgba(239,68,68,0.25); }
        .lic-badge-cierre--vencida { background: rgba(100,116,139,0.1);  color: #64748b; border: 1px solid rgba(100,116,139,0.2); }

        /* ── Organismo ── */
        .lic-organismo {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.82rem;
          color: #6ab3d8;
          margin-bottom: 8px;
        }

        /* ── Meta ── */
        .lic-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 8px;
        }
        .lic-meta-item {
          font-size: 0.82rem;
          color: #7fb8d6;
        }
        .lic-meta-item strong { color: #c8e6f5; }

        /* ── Fechas ── */
        .lic-fechas {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          font-size: 0.75rem;
          color: #4a7a99;
          margin-bottom: 14px;
        }
        .lic-codigo {
          font-family: 'Courier New', monospace;
          font-size: 0.7rem;
          background: rgba(99,180,255,0.06);
          border: 1px solid rgba(99,180,255,0.1);
          padding: 1px 7px;
          border-radius: 4px;
          color: #5a9abf;
        }

        /* ── Acciones ── */
        .lic-acciones {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .lic-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          border-radius: 8px;
          border: 1px solid transparent;
          font-size: 0.78rem;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.15s;
        }
        .lic-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .lic-btn:not(:disabled):hover { opacity: 0.85; transform: translateY(-1px); }
        .lic-btn:not(:disabled):active { transform: translateY(0); }

        .lic-btn--primary {
          background: linear-gradient(135deg, #1565c0, #1e88e5);
          color: #fff;
          box-shadow: 0 2px 12px rgba(21,101,192,0.35);
        }
        .lic-btn--secondary {
          background: rgba(99,180,255,0.07);
          color: #7fb8d6;
          border-color: rgba(99,180,255,0.15);
        }
        .lic-btn--success {
          background: rgba(34,197,94,0.1);
          color: #4ade80;
          border-color: rgba(34,197,94,0.2);
        }

        /* ── Estado vacío ── */
        .lic-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 60px 20px;
          text-align: center;
          gap: 10px;
        }
        .lic-empty-icon { opacity: 0.6; margin-bottom: 4px; }
        .lic-empty-title { font-size: 1rem; color: #d6eaf8; font-weight: 600; }
        .lic-empty-body  { font-size: 0.85rem; color: #4a7a99; }
        .lic-link { color: #38bdf8; text-decoration: none; }
        .lic-link:hover { text-decoration: underline; }
      `}</style>
    </>
  )
}
