import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import LogoutButton from '@/components/LogoutButton'
import ListaLicitaciones from '@/components/ListaLicitaciones'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ orden?: string }>
}) {
  const { orden } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: perfil, error } = await supabase
    .from('perfiles')
    .select('plan, trial_fin, activo')
    .eq('id', user.id)
    .single()

  /* ── Error de perfil ── */
  if (error || !perfil) {
    return (
      <div className="mp-root">
        <div className="mp-bg">
          <div className="mp-blob mp-blob-1" />
          <div className="mp-blob mp-blob-2" />
        </div>
        <div className="mp-error-card">
          <h1 className="mp-error-title">No pudimos cargar tu perfil</h1>
          <p className="mp-error-body">Intenta recargar la página. Si el problema persiste, contáctanos.</p>
        </div>
        <GlobalStyles />
      </div>
    )
  }

  const trialVencido = perfil.plan === 'trial' && new Date(perfil.trial_fin) < new Date()

  /* ── Trial vencido / cuenta inactiva ── */
  if (trialVencido || !perfil.activo) {
    return (
      <div className="mp-root">
        <div className="mp-bg">
          <div className="mp-blob mp-blob-1" />
          <div className="mp-blob mp-blob-2" />
        </div>
        <div className="mp-expired-card">
          <div className="mp-expired-icon" aria-hidden="true">🔒</div>
          <h1 className="mp-expired-title">Tu período de prueba terminó</h1>
          <p className="mp-expired-body">
            Tu prueba gratuita finalizó el{' '}
            <strong>
              {new Date(perfil.trial_fin).toLocaleDateString('es-CL', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </strong>
            . Contáctanos para seguir usando la plataforma.
          </p>
          <LogoutButton />
        </div>
        <GlobalStyles />
      </div>
    )
  }

  const diasRestantes = Math.ceil(
    (new Date(perfil.trial_fin).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )

  const { data: licitacionesData, error: errorLicitaciones } = await supabase.rpc(
    'buscar_licitaciones_por_keywords',
    { p_user_id: user.id }
  )

  const licitaciones = [...(licitacionesData ?? [])]
  if (orden === 'recientes') {
    licitaciones.sort(
      (a, b) => new Date(b.fecha_publicacion).getTime() - new Date(a.fecha_publicacion).getTime()
    )
  }

  return (
    <div className="mp-root">
      {/* Fondo */}
      <div className="mp-bg">
        <div className="mp-blob mp-blob-1" />
        <div className="mp-blob mp-blob-2" />
        <div className="mp-blob mp-blob-3" />
      </div>

      {/* Navbar */}
      <header className="mp-navbar">
        <div className="mp-navbar-inner">
          <div className="mp-brand">
            {/* Ícono escudo */}
            <div className="mp-nav-icon">
              <svg width="20" height="20" viewBox="0 0 38 38" fill="none" aria-hidden="true">
                <path d="M19 3L34 10V21C34 28.18 27.39 34.46 19 36C10.61 34.46 4 28.18 4 21V10L19 3Z"
                  fill="url(#nav-shield)" />
                <path d="M19 10C19 10 13 15.5 13 20.5C13 23.54 15.69 26 19 26C22.31 26 25 23.54 25 20.5C25 15.5 19 10 19 10Z"
                  fill="rgba(99,210,255,0.9)" />
                <defs>
                  <linearGradient id="nav-shield" x1="4" y1="3" x2="34" y2="36" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#1a3a5c" />
                    <stop offset="100%" stopColor="#0d2340" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="mp-nav-title">MercaLerta</span>
          </div>

          <nav className="mp-nav-links">
            <a href="/keywords" className="mp-nav-link">
              {/* Ícono etiqueta */}
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 2h6l6 6-6 6-6-6V2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                <circle cx="5.5" cy="5.5" r="1" fill="currentColor"/>
              </svg>
              Palabras clave
            </a>
            <LogoutButton />
          </nav>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="mp-main">

        {/* Banner trial */}
        {perfil.plan === 'trial' && (
          <div className="mp-trial-banner">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            Período de prueba · Te quedan <strong>{diasRestantes}</strong> día{diasRestantes !== 1 ? 's' : ''}
          </div>
        )}

        {/* Cabecera sección */}
        <div className="mp-section-header">
          <div className="mp-section-title-wrap">
            <h2 className="mp-section-title">Licitaciones activas</h2>
            <span className="mp-section-count">{licitaciones.length} resultado{licitaciones.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Ordenamiento */}
          <div className="mp-sort">
            <span className="mp-sort-label">Ordenar:</span>
            <a href="/" className={`mp-sort-btn${orden !== 'recientes' ? ' mp-sort-btn--active' : ''}`}>
              Relevancia
            </a>
            <a href="/?orden=recientes" className={`mp-sort-btn${orden === 'recientes' ? ' mp-sort-btn--active' : ''}`}>
              Más recientes
            </a>
          </div>
        </div>

        {/* Error de carga */}
        {errorLicitaciones && (
          <div className="mp-load-error">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" stroke="#f87171" strokeWidth="1.4"/>
              <path d="M8 5v3.5M8 10.5v.5" stroke="#f87171" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            No se pudieron cargar las licitaciones: {errorLicitaciones.message}
          </div>
        )}

        {!errorLicitaciones && (
          <ListaLicitaciones licitaciones={licitaciones} userId={user.id} />
        )}
      </main>

      <GlobalStyles />
    </div>
  )
}

/* Estilos globales inyectados como Server Component */
function GlobalStyles() {
  return (
    <style>{`
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      /* ── Root ── */
      .mp-root {
        min-height: 100vh;
        background: #050f1e;
        position: relative;
        font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
        color: #d6eaf8;
      }

      /* ── Blobs de fondo ── */
      .mp-bg { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
      .mp-blob {
        position: absolute;
        border-radius: 50%;
        filter: blur(90px);
        opacity: 0.28;
      }
      .mp-blob-1 {
        width: 600px; height: 600px;
        background: radial-gradient(circle, #0a4f8a 0%, transparent 70%);
        top: -180px; left: -140px;
      }
      .mp-blob-2 {
        width: 450px; height: 450px;
        background: radial-gradient(circle, #063560 0%, transparent 70%);
        bottom: -100px; right: -80px;
      }
      .mp-blob-3 {
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
        max-width: 900px;
        margin: 0 auto;
        padding: 0 20px;
        height: 58px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .mp-brand {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .mp-nav-icon {
        width: 32px; height: 32px;
        border-radius: 8px;
        background: linear-gradient(135deg, #0d2340 0%, #0a3a6e 100%);
        border: 1px solid rgba(99,210,255,0.2);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .mp-nav-title {
        font-size: 1rem;
        font-weight: 700;
        color: #e8f4ff;
        letter-spacing: -0.01em;
      }
      .mp-nav-links {
        display: flex;
        align-items: center;
        gap: 8px;
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
      .mp-nav-link:hover {
        background: rgba(99,180,255,0.07);
        color: #c8e6f5;
      }

      /* ── Main ── */
      .mp-main {
        position: relative;
        z-index: 1;
        max-width: 900px;
        margin: 0 auto;
        padding: 28px 20px 60px;
      }

      /* ── Trial banner ── */
      .mp-trial-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(21, 101, 192, 0.15);
        border: 1px solid rgba(56, 189, 248, 0.2);
        border-radius: 10px;
        padding: 10px 16px;
        font-size: 0.82rem;
        color: #7ec8e3;
        margin-bottom: 24px;
      }
      .mp-trial-banner strong { color: #38bdf8; }

      /* ── Cabecera sección ── */
      .mp-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 20px;
      }
      .mp-section-title-wrap {
        display: flex;
        align-items: baseline;
        gap: 10px;
      }
      .mp-section-title {
        font-size: 1.15rem;
        font-weight: 600;
        color: #e8f4ff;
        letter-spacing: -0.01em;
      }
      .mp-section-count {
        font-size: 0.75rem;
        color: #4a7a99;
        background: rgba(99,180,255,0.07);
        border: 1px solid rgba(99,180,255,0.12);
        padding: 2px 8px;
        border-radius: 999px;
      }

      /* ── Ordenamiento ── */
      .mp-sort {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .mp-sort-label {
        font-size: 0.78rem;
        color: #4a7a99;
      }
      .mp-sort-btn {
        font-size: 0.78rem;
        padding: 4px 12px;
        border-radius: 6px;
        border: 1px solid rgba(99,180,255,0.1);
        color: #6ab3d8;
        text-decoration: none;
        transition: background 0.2s, color 0.2s;
      }
      .mp-sort-btn:hover { background: rgba(99,180,255,0.07); }
      .mp-sort-btn--active {
        background: rgba(21,101,192,0.2);
        border-color: rgba(56,189,248,0.3);
        color: #38bdf8;
        font-weight: 600;
      }

      /* ── Error carga ── */
      .mp-load-error {
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(220, 38, 38, 0.1);
        border: 1px solid rgba(248,113,113,0.2);
        border-radius: 10px;
        padding: 12px 16px;
        color: #fca5a5;
        font-size: 0.85rem;
      }

      /* ── Error/Expirado cards ── */
      .mp-error-card, .mp-expired-card {
        position: relative;
        z-index: 10;
        max-width: 420px;
        margin: 100px auto;
        padding: 2rem;
        border-radius: 20px;
        background: rgba(8, 22, 42, 0.78);
        border: 1px solid rgba(99,180,255,0.12);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        box-shadow: 0 24px 64px rgba(0,0,0,0.55);
        text-align: center;
      }
      .mp-expired-icon { font-size: 2.5rem; margin-bottom: 1rem; }
      .mp-error-title, .mp-expired-title {
        font-size: 1.25rem;
        font-weight: 700;
        color: #e8f4ff;
        margin-bottom: 0.75rem;
      }
      .mp-error-body, .mp-expired-body {
        font-size: 0.88rem;
        color: #7fb8d6;
        line-height: 1.6;
      }
      .mp-expired-body strong { color: #d6eaf8; }
    `}</style>
  )
}
