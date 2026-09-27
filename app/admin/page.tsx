import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

// Server Component: verifica sesión + rol admin antes de renderizar.
export const dynamic = 'force-dynamic'

type StatsLicitaciones = {
  total: number
  completas: number
  cargadas_hoy: number
  cargadas_hoy_completas: number
}

type StatsUsuario = {
  user_id: string
  email: string
  trial_inicio: string | null
  trial_fin: string | null
  dias_restantes: number | null
  notificado_hoy: boolean
}

type StatsLote = {
  id: string
  fecha: string
  corrida: string
  total_codigos: number
  pendientes_actuales: number
  procesados_aprox: number
  completado: boolean
  creado_en: string
  completado_en: string | null
}

type StatsHistoricoDiario = {
  fecha: string
  total: number
  con_organismo: number
  sin_organismo_con_detalle: number
  sin_organismo_sin_detalle: number
}

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user) redirect('/login')

  const { data: esAdmin, error: errorAdmin } = await supabase.rpc('es_admin_actual')
  if (errorAdmin || !esAdmin) redirect('/')

  const [
    { data: lic, error: errorLic },
    { data: statsUsuarios, error: errorUsuarios },
    { data: statsLotes, error: errorLotes },
    { data: statsHistorico, error: errorHistorico },
  ] = await Promise.all([
    supabase.rpc('admin_stats_licitaciones').single<StatsLicitaciones>(),
    supabase.rpc('admin_stats_usuarios'),
    supabase.rpc('admin_stats_lotes'),
    supabase.rpc('admin_stats_historico_diario'),
  ])

  if (errorLic)       throw new Error('Error al cargar estadísticas de licitaciones: ' + errorLic.message)
  if (errorUsuarios)  throw new Error('Error al cargar estadísticas de usuarios: ' + errorUsuarios.message)
  if (errorLotes)     throw new Error('Error al cargar estadísticas de lotes: ' + errorLotes.message)
  if (errorHistorico) throw new Error('Error al cargar histórico diario: ' + errorHistorico.message)

  const stats    = lic ?? { total: 0, completas: 0, cargadas_hoy: 0, cargadas_hoy_completas: 0 }
  const usuarios = (statsUsuarios  ?? []) as StatsUsuario[]
  const lotes    = (statsLotes     ?? []) as StatsLote[]
  const historico= (statsHistorico ?? []) as StatsHistoricoDiario[]

  const pctCompletas = stats.total > 0
    ? Math.round((stats.completas / stats.total) * 100)
    : 0

  return (
    <div className="adm-root">
      {/* Fondo blobs */}
      <div className="adm-bg">
        <div className="adm-blob adm-blob-1" />
        <div className="adm-blob adm-blob-2" />
        <div className="adm-blob adm-blob-3" />
      </div>

      {/* Navbar */}
      <header className="mp-navbar">
        <div className="mp-navbar-inner">
          <div className="mp-brand">
            <div className="mp-nav-icon">
              <svg width="20" height="20" viewBox="0 0 38 38" fill="none" aria-hidden="true">
                <path
                  d="M19 3L34 10V21C34 28.18 27.39 34.46 19 36C10.61 34.46 4 28.18 4 21V10L19 3Z"
                  fill="url(#adm-shield)"
                />
                <path
                  d="M19 10C19 10 13 15.5 13 20.5C13 23.54 15.69 26 19 26C22.31 26 25 23.54 25 20.5C25 15.5 19 10 19 10Z"
                  fill="rgba(99,210,255,0.9)"
                />
                <defs>
                  <linearGradient id="adm-shield" x1="4" y1="3" x2="34" y2="36" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#1a3a5c" />
                    <stop offset="100%" stopColor="#0d2340" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <a href="/" className="mp-nav-title" style={{ textDecoration: 'none' }}>MercaLerta</a>
          </div>
          <nav className="mp-nav-links">
            <span className="mp-nav-badge">Admin</span>
            <a href="/" className="mp-nav-link">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 8L8 2l6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4 6v7h3v-3h2v3h3V6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Inicio
            </a>
          </nav>
        </div>
      </header>

      <main className="adm-main">

        {/* ── Cabecera ── */}
        <div className="adm-page-header">
          <h1 className="adm-page-title">Panel de administrador</h1>
          <p className="adm-page-sub">Estadísticas del sistema en tiempo real</p>
        </div>

        {/* ── Stat cards ── */}
        <div className="adm-stat-grid">
          <div className="adm-stat-card">
            <span className="adm-stat-label">Licitaciones totales</span>
            <span className="adm-stat-value">{stats.total.toLocaleString('es-CL')}</span>
            <span className="adm-stat-sub">
              {stats.completas.toLocaleString('es-CL')} completas · {pctCompletas}%
            </span>
            <div className="adm-stat-bar">
              <div className="adm-stat-bar__fill" style={{ width: `${pctCompletas}%` }} />
            </div>
          </div>

          <div className="adm-stat-card">
            <span className="adm-stat-label">Cargadas hoy</span>
            <span className="adm-stat-value">{stats.cargadas_hoy.toLocaleString('es-CL')}</span>
            <span className="adm-stat-sub">
              {stats.cargadas_hoy_completas.toLocaleString('es-CL')} con datos completos
            </span>
          </div>

          <div className="adm-stat-card">
            <span className="adm-stat-label">Usuarios activos</span>
            <span className="adm-stat-value">{usuarios.length}</span>
            <span className="adm-stat-sub">
              {usuarios.filter(u => u.notificado_hoy).length} notificados hoy
            </span>
          </div>

          <div className="adm-stat-card">
            <span className="adm-stat-label">Lotes (14 días)</span>
            <span className="adm-stat-value">{lotes.length}</span>
            <span className="adm-stat-sub">
              {lotes.filter(l => l.completado).length} completados
              · {lotes.filter(l => !l.completado).length} pendientes
            </span>
          </div>
        </div>

        {/* ── Tabla: Lotes de enriquecimiento ── */}
        <section className="adm-section">
          <div className="adm-section-header">
            <h2 className="adm-section-title">Lotes de enriquecimiento</h2>
            <span className="adm-section-badge">últimos 14 días · por corrida</span>
          </div>
          <p className="adm-section-desc">
            Cada fila es una corrida (mañana/tarde). "Procesados aprox." refleja los códigos
            que salieron de la cola — no distingue si llegaron con dato o no.
          </p>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Corrida</th>
                  <th className="adm-th-right">Total códigos</th>
                  <th className="adm-th-right">Procesados (aprox.)</th>
                  <th className="adm-th-right">Pendientes</th>
                  <th>Estado</th>
                  <th>Completado en</th>
                </tr>
              </thead>
              <tbody>
                {lotes.map((l) => (
                  <tr key={l.id} className="adm-tr">
                    <td>{l.fecha.split('-').reverse().join('/')}</td>
                    <td className="adm-td-cap">{l.corrida}</td>
                    <td className="adm-td-right adm-td-num">{l.total_codigos.toLocaleString('es-CL')}</td>
                    <td className="adm-td-right adm-td-num">{l.procesados_aprox.toLocaleString('es-CL')}</td>
                    <td className="adm-td-right adm-td-num">
                      <span className={l.pendientes_actuales > 0 ? 'adm-warn' : 'adm-muted'}>
                        {l.pendientes_actuales.toLocaleString('es-CL')}
                      </span>
                    </td>
                    <td>
                      {l.completado
                        ? <span className="adm-badge adm-badge--ok">Completado</span>
                        : <span className="adm-badge adm-badge--pending">En proceso</span>
                      }
                    </td>
                    <td className="adm-muted">
                      {l.completado_en
                        ? new Date(l.completado_en).toLocaleString('es-CL')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Tabla: Histórico diario ── */}
        <section className="adm-section">
          <div className="adm-section-header">
            <h2 className="adm-section-title">Histórico diario de enriquecimiento</h2>
            <span className="adm-section-badge">últimos 14 días · agregado por día</span>
          </div>
          <p className="adm-section-desc">
            "Sin organismo con detalle" corresponde a casos procesados pero sin dato confirmado
            (bug tipo 16/09). "Sin organismo sin detalle" son los aún no procesados o que
            fallaron antes de guardar.
          </p>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th className="adm-th-right">Total</th>
                  <th className="adm-th-right">Con organismo</th>
                  <th className="adm-th-right">Sin org. (con detalle) ⚠</th>
                  <th className="adm-th-right">Sin org. (sin detalle)</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.fecha} className="adm-tr">
                    <td>{new Date(h.fecha).toLocaleDateString('es-CL')}</td>
                    <td className="adm-td-right adm-td-num">{h.total.toLocaleString('es-CL')}</td>
                    <td className="adm-td-right adm-td-num adm-ok">{h.con_organismo.toLocaleString('es-CL')}</td>
                    <td className="adm-td-right adm-td-num">
                      <span className={h.sin_organismo_con_detalle > 0 ? 'adm-danger' : 'adm-muted'}>
                        {h.sin_organismo_con_detalle.toLocaleString('es-CL')}
                      </span>
                    </td>
                    <td className="adm-td-right adm-td-num adm-muted">
                      {h.sin_organismo_sin_detalle.toLocaleString('es-CL')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Tabla: Usuarios ── */}
        <section className="adm-section">
          <div className="adm-section-header">
            <h2 className="adm-section-title">Usuarios registrados</h2>
            <span className="adm-section-badge">{usuarios.length} en total</span>
          </div>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Registrado</th>
                  <th>Trial</th>
                  <th>Notificado hoy</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => {
                  const vencido = u.dias_restantes !== null && u.dias_restantes < 0
                  return (
                    <tr key={u.user_id} className="adm-tr">
                      <td className="adm-td-email">{u.email}</td>
                      <td className="adm-muted">
                        {u.trial_inicio
                          ? new Date(u.trial_inicio).toLocaleDateString('es-CL')
                          : '—'}
                      </td>
                      <td>
                        {u.dias_restantes === null ? (
                          <span className="adm-muted">—</span>
                        ) : vencido ? (
                          <span className="adm-danger">
                            Vencido hace {Math.abs(u.dias_restantes)}d
                          </span>
                        ) : (
                          <span className={u.dias_restantes <= 3 ? 'adm-warn' : 'adm-ok'}>
                            {u.dias_restantes}d restantes
                          </span>
                        )}
                      </td>
                      <td>
                        {u.notificado_hoy
                          ? <span className="adm-badge adm-badge--ok">Enviado</span>
                          : <span className="adm-badge adm-badge--none">No</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <style>{`
        /* ── Reset ── */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── Root ── */
        .adm-root {
          min-height: 100vh;
          background: #050f1e;
          position: relative;
          font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
          color: #d6eaf8;
        }

        /* ── Blobs ── */
        .adm-bg { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
        .adm-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(90px);
          opacity: 0.28;
        }
        .adm-blob-1 {
          width: 600px; height: 600px;
          background: radial-gradient(circle, #0a4f8a 0%, transparent 70%);
          top: -180px; left: -140px;
        }
        .adm-blob-2 {
          width: 450px; height: 450px;
          background: radial-gradient(circle, #063560 0%, transparent 70%);
          bottom: -100px; right: -80px;
        }
        .adm-blob-3 {
          width: 300px; height: 300px;
          background: radial-gradient(circle, #005fa3 0%, transparent 70%);
          top: 45%; left: 60%;
          transform: translate(-50%, -50%);
        }

        /* ── Navbar ── */
        .mp-navbar {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(5, 15, 30, 0.85);
          border-bottom: 1px solid rgba(99, 180, 255, 0.1);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
        .mp-navbar-inner {
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 24px;
          height: 58px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .mp-brand { display: flex; align-items: center; gap: 10px; }
        .mp-nav-icon {
          width: 32px; height: 32px;
          border-radius: 8px;
          background: linear-gradient(135deg, #0d2340 0%, #0a3a6e 100%);
          border: 1px solid rgba(99,210,255,0.2);
          display: flex; align-items: center; justify-content: center;
        }
        .mp-nav-title {
          font-size: 1rem;
          font-weight: 700;
          color: #e8f4ff;
          letter-spacing: -0.01em;
        }
        .mp-nav-links { display: flex; align-items: center; gap: 8px; }
        .mp-nav-badge {
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 3px 9px;
          border-radius: 4px;
          background: rgba(21,101,192,0.2);
          border: 1px solid rgba(56,189,248,0.25);
          color: #38bdf8;
        }
        .mp-nav-link {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 0.82rem;
          font-weight: 500;
          color: #7fb8d6;
          text-decoration: none;
          border: 1px solid rgba(99,180,255,0.1);
          transition: background 0.2s, color 0.2s;
        }
        .mp-nav-link:hover { background: rgba(99,180,255,0.07); color: #c8e6f5; }

        /* ── Main ── */
        .adm-main {
          position: relative;
          z-index: 1;
          max-width: 1100px;
          margin: 0 auto;
          padding: 36px 24px 80px;
        }

        /* ── Page header ── */
        .adm-page-header { margin-bottom: 32px; }
        .adm-page-title {
          font-size: 1.3rem;
          font-weight: 700;
          color: #e8f4ff;
          letter-spacing: -0.02em;
          margin-bottom: 4px;
        }
        .adm-page-sub {
          font-size: 0.82rem;
          color: #4a7a99;
        }

        /* ── Stat grid ── */
        .adm-stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 14px;
          margin-bottom: 40px;
        }
        .adm-stat-card {
          background: rgba(8,22,42,0.72);
          border: 1px solid rgba(99,180,255,0.1);
          border-radius: 14px;
          padding: 18px 20px;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          display: flex;
          flex-direction: column;
          gap: 6px;
          transition: border-color 0.2s;
        }
        .adm-stat-card:hover { border-color: rgba(56,189,248,0.2); }
        .adm-stat-label {
          font-size: 0.72rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: #4a7a99;
        }
        .adm-stat-value {
          font-size: 2rem;
          font-weight: 700;
          color: #e8f4ff;
          letter-spacing: -0.03em;
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .adm-stat-sub {
          font-size: 0.75rem;
          color: #6ab3d8;
        }
        .adm-stat-bar {
          height: 3px;
          background: rgba(99,180,255,0.1);
          border-radius: 2px;
          margin-top: 4px;
          overflow: hidden;
        }
        .adm-stat-bar__fill {
          height: 100%;
          background: linear-gradient(90deg, #1565c0, #38bdf8);
          border-radius: 2px;
          transition: width 0.4s;
        }

        /* ── Secciones ── */
        .adm-section { margin-bottom: 40px; }
        .adm-section-header {
          display: flex;
          align-items: baseline;
          gap: 10px;
          margin-bottom: 6px;
        }
        .adm-section-title {
          font-size: 1rem;
          font-weight: 600;
          color: #e8f4ff;
          letter-spacing: -0.01em;
        }
        .adm-section-badge {
          font-size: 0.7rem;
          color: #4a7a99;
          background: rgba(99,180,255,0.07);
          border: 1px solid rgba(99,180,255,0.12);
          padding: 2px 8px;
          border-radius: 999px;
        }
        .adm-section-desc {
          font-size: 0.78rem;
          color: #4a7a99;
          line-height: 1.6;
          margin-bottom: 14px;
        }

        /* ── Tabla ── */
        .adm-table-wrap {
          border: 1px solid rgba(99,180,255,0.1);
          border-radius: 12px;
          overflow-x: auto;
          background: rgba(8,22,42,0.55);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        .adm-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.82rem;
        }
        .adm-table thead tr {
          border-bottom: 1px solid rgba(99,180,255,0.1);
        }
        .adm-table th {
          padding: 10px 16px;
          text-align: left;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: #4a7a99;
          white-space: nowrap;
          background: transparent;
        }
        .adm-th-right { text-align: right; }

        .adm-tr {
          border-bottom: 1px solid rgba(99,180,255,0.06);
          transition: background 0.12s;
        }
        .adm-tr:last-child { border-bottom: none; }
        .adm-tr:hover { background: rgba(99,180,255,0.04); }

        .adm-table td {
          padding: 11px 16px;
          vertical-align: middle;
          color: #c8e6f5;
        }
        .adm-td-right { text-align: right; }
        .adm-td-num {
          font-variant-numeric: tabular-nums;
          font-feature-settings: 'tnum';
        }
        .adm-td-cap { text-transform: capitalize; }
        .adm-td-email {
          font-family: ui-monospace, 'SFMono-Regular', monospace;
          font-size: 0.78rem;
          color: #7fb8d6;
        }

        /* ── Estados de color ── */
        .adm-ok     { color: #4ade80; }
        .adm-warn   { color: #fb923c; font-weight: 600; }
        .adm-danger { color: #f87171; font-weight: 600; }
        .adm-muted  { color: #4a7a99; }

        /* ── Badges ── */
        .adm-badge {
          display: inline-block;
          padding: 2px 9px;
          border-radius: 4px;
          font-size: 0.69rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .adm-badge--ok {
          background: rgba(34,197,94,0.1);
          color: #4ade80;
          border: 1px solid rgba(34,197,94,0.25);
        }
        .adm-badge--pending {
          background: rgba(251,146,60,0.1);
          color: #fb923c;
          border: 1px solid rgba(251,146,60,0.25);
        }
        .adm-badge--none {
          background: rgba(99,180,255,0.06);
          color: #4a7a99;
          border: 1px solid rgba(99,180,255,0.1);
        }
      `}</style>
    </div>
  )
}
