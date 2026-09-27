'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

type Keyword = {
  id: string
  palabra_clave: string
  activo: boolean
}

export default function KeywordsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [nueva, setNueva] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const cargarKeywords = async () => {
    setCargando(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setError('No hay sesión activa.')
      setCargando(false)
      return
    }

    const { data, error } = await supabase
      .from('keywords_usuario')
      .select('id, palabra_clave, activo')
      .eq('user_id', user.id)
      .eq('activo', true)
      .order('creado_en', { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      setKeywords(data ?? [])
    }
    setCargando(false)
  }

  useEffect(() => {
    cargarKeywords()
  }, [])

  const agregarKeyword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const texto = nueva.trim()
    if (!texto) return

    setGuardando(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setGuardando(false); return }

    const { error } = await supabase
      .from('keywords_usuario')
      .insert({ user_id: user.id, palabra_clave: texto })

    setGuardando(false)

    if (error) {
      setError(error.message)
      return
    }

    setNueva('')
    cargarKeywords()
  }

  const eliminarKeyword = async (id: string) => {
    setError(null)
    const { error } = await supabase.from('keywords_usuario').delete().eq('id', id)

    if (error) {
      setError(error.message)
      return
    }

    setKeywords((prev) => prev.filter((k) => k.id !== id))
  }

  return (
    <div className="kw-root">
      {/* Fondo con blobs */}
      <div className="kw-bg">
        <div className="kw-blob kw-blob-1" />
        <div className="kw-blob kw-blob-2" />
        <div className="kw-blob kw-blob-3" />
      </div>

      {/* Navbar — idéntica a la página principal */}
      <header className="mp-navbar">
        <div className="mp-navbar-inner">
          <div className="mp-brand">
            <div className="mp-nav-icon">
              <svg width="20" height="20" viewBox="0 0 38 38" fill="none" aria-hidden="true">
                <path
                  d="M19 3L34 10V21C34 28.18 27.39 34.46 19 36C10.61 34.46 4 28.18 4 21V10L19 3Z"
                  fill="url(#kw-shield)"
                />
                <path
                  d="M19 10C19 10 13 15.5 13 20.5C13 23.54 15.69 26 19 26C22.31 26 25 23.54 25 20.5C25 15.5 19 10 19 10Z"
                  fill="rgba(99,210,255,0.9)"
                />
                <defs>
                  <linearGradient id="kw-shield" x1="4" y1="3" x2="34" y2="36" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#1a3a5c" />
                    <stop offset="100%" stopColor="#0d2340" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <a href="/" className="mp-nav-title" style={{ textDecoration: 'none' }}>MercaLerta</a>
          </div>

          <nav className="mp-nav-links">
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

      {/* Contenido */}
      <main className="kw-main">

        {/* Cabecera de sección */}
        <div className="kw-section-header">
          <div className="kw-title-wrap">
            <h2 className="kw-title">Palabras clave</h2>
            {!cargando && (
              <span className="kw-count">
                {keywords.length} activa{keywords.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="kw-description">
            Las licitaciones se filtran buscando estas palabras en su nombre y descripción.
          </p>
        </div>

        {/* Formulario agregar */}
        <form onSubmit={agregarKeyword} className="kw-form">
          <div className="kw-input-wrap">
            <svg className="kw-input-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              placeholder="Ej: informática, aseo, construcción…"
              className="kw-input"
              disabled={guardando}
            />
          </div>
          <button type="submit" disabled={guardando || !nueva.trim()} className="kw-btn-add">
            {guardando ? (
              <>
                <span className="kw-spinner" aria-hidden="true" />
                Agregando…
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                Agregar
              </>
            )}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="kw-error" role="alert">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="6" stroke="#f87171" strokeWidth="1.4"/>
              <path d="M7 4v3.5M7 9.5v.5" stroke="#f87171" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            {error}
          </div>
        )}

        {/* Estado cargando */}
        {cargando && (
          <div className="kw-loading">
            <span className="kw-spinner kw-spinner--lg" aria-hidden="true" />
            <span>Cargando palabras clave…</span>
          </div>
        )}

        {/* Lista de keywords */}
        {!cargando && keywords.length === 0 && (
          <div className="kw-empty">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <circle cx="18" cy="18" r="15" stroke="rgba(99,180,255,0.15)" strokeWidth="1.5"/>
              <path d="M18 11v7M18 22v1" stroke="rgba(99,180,255,0.3)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <p className="kw-empty__title">Sin palabras clave todavía</p>
            <p className="kw-empty__body">Agrega la primera usando el campo de arriba.</p>
          </div>
        )}

        {!cargando && keywords.length > 0 && (
          <ul className="kw-list">
            {keywords.map((k) => (
              <li key={k.id} className="kw-item">
                <div className="kw-item__left">
                  {/* Punto decorativo */}
                  <span className="kw-item__dot" aria-hidden="true" />
                  <span className="kw-item__label">{k.palabra_clave}</span>
                </div>
                <button
                  className="kw-btn-remove"
                  onClick={() => eliminarKeyword(k.id)}
                  aria-label={`Eliminar "${k.palabra_clave}"`}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      <style>{`
        /* ── Reset ── */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── Root ── */
        .kw-root {
          min-height: 100vh;
          background: #050f1e;
          position: relative;
          font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
          color: #d6eaf8;
        }

        /* ── Blobs ── */
        .kw-bg { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
        .kw-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(90px);
          opacity: 0.28;
        }
        .kw-blob-1 {
          width: 600px; height: 600px;
          background: radial-gradient(circle, #0a4f8a 0%, transparent 70%);
          top: -180px; left: -140px;
        }
        .kw-blob-2 {
          width: 450px; height: 450px;
          background: radial-gradient(circle, #063560 0%, transparent 70%);
          bottom: -100px; right: -80px;
        }
        .kw-blob-3 {
          width: 300px; height: 300px;
          background: radial-gradient(circle, #005fa3 0%, transparent 70%);
          top: 45%; left: 60%;
          transform: translate(-50%, -50%);
        }

        /* ── Navbar (idéntica a página principal) ── */
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
        .mp-brand { display: flex; align-items: center; gap: 10px; }
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
        .mp-nav-links { display: flex; align-items: center; gap: 8px; }
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
        .kw-main {
          position: relative;
          z-index: 1;
          max-width: 600px;
          margin: 0 auto;
          padding: 36px 20px 60px;
        }

        /* ── Cabecera ── */
        .kw-section-header { margin-bottom: 28px; }
        .kw-title-wrap {
          display: flex;
          align-items: baseline;
          gap: 10px;
          margin-bottom: 6px;
        }
        .kw-title {
          font-size: 1.15rem;
          font-weight: 600;
          color: #e8f4ff;
          letter-spacing: -0.01em;
        }
        .kw-count {
          font-size: 0.75rem;
          color: #4a7a99;
          background: rgba(99,180,255,0.07);
          border: 1px solid rgba(99,180,255,0.12);
          padding: 2px 8px;
          border-radius: 999px;
        }
        .kw-description {
          font-size: 0.82rem;
          color: #4a7a99;
          line-height: 1.5;
        }

        /* ── Formulario ── */
        .kw-form {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
        }
        .kw-input-wrap {
          position: relative;
          flex: 1;
          display: flex;
          align-items: center;
        }
        .kw-input-icon {
          position: absolute;
          left: 12px;
          color: #4a7a99;
          pointer-events: none;
        }
        .kw-input {
          width: 100%;
          padding: 10px 14px 10px 36px;
          border-radius: 10px;
          border: 1px solid rgba(99,180,255,0.14);
          background: rgba(255,255,255,0.04);
          color: #d6eaf8;
          font-size: 0.88rem;
          outline: none;
          font-family: inherit;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }
        .kw-input::placeholder { color: rgba(100,160,200,0.4); }
        .kw-input:focus {
          border-color: rgba(56,189,248,0.55);
          background: rgba(56,189,248,0.05);
          box-shadow: 0 0 0 3px rgba(56,189,248,0.08);
        }
        .kw-input:disabled { opacity: 0.5; }

        /* ── Botón agregar ── */
        .kw-btn-add {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, #1565c0, #1e88e5);
          color: #fff;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          font-family: inherit;
          transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
          box-shadow: 0 3px 16px rgba(21,101,192,0.35);
        }
        .kw-btn-add:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
          box-shadow: 0 5px 20px rgba(21,101,192,0.5);
        }
        .kw-btn-add:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

        /* ── Spinner ── */
        .kw-spinner {
          width: 12px; height: 12px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: kw-spin 0.7s linear infinite;
          flex-shrink: 0;
          display: inline-block;
        }
        .kw-spinner--lg {
          width: 16px; height: 16px;
          border-color: rgba(99,180,255,0.2);
          border-top-color: #38bdf8;
        }
        @keyframes kw-spin { to { transform: rotate(360deg); } }

        /* ── Error ── */
        .kw-error {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(220,38,38,0.1);
          border: 1px solid rgba(248,113,113,0.2);
          border-radius: 8px;
          padding: 10px 14px;
          color: #fca5a5;
          font-size: 0.82rem;
          margin-bottom: 16px;
        }

        /* ── Cargando ── */
        .kw-loading {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 32px 0;
          color: #4a7a99;
          font-size: 0.85rem;
        }

        /* ── Vacío ── */
        .kw-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 52px 20px;
          text-align: center;
        }
        .kw-empty__title { font-size: 0.92rem; color: #d6eaf8; font-weight: 500; }
        .kw-empty__body  { font-size: 0.82rem; color: #4a7a99; }

        /* ── Lista ── */
        .kw-list {
          list-style: none;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0;
          border: 1px solid rgba(99,180,255,0.1);
          border-radius: 12px;
          overflow: hidden;
          background: rgba(8,22,42,0.5);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        /* ── Item keyword ── */
        .kw-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 13px 16px;
          border-bottom: 1px solid rgba(99,180,255,0.07);
          transition: background 0.15s;
        }
        .kw-item:last-child { border-bottom: none; }
        .kw-item:hover { background: rgba(99,180,255,0.04); }

        .kw-item__left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .kw-item__dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: rgba(56,189,248,0.5);
          flex-shrink: 0;
        }
        .kw-item__label {
          font-size: 0.88rem;
          color: #c8e6f5;
          font-weight: 500;
        }

        /* ── Botón eliminar ── */
        .kw-btn-remove {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 6px;
          border: 1px solid rgba(248,113,113,0.15);
          background: rgba(220,38,38,0.06);
          color: #f87171;
          font-size: 0.74rem;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s, border-color 0.15s;
          opacity: 0;
        }
        .kw-item:hover .kw-btn-remove { opacity: 1; }
        .kw-btn-remove:hover {
          background: rgba(220,38,38,0.14);
          border-color: rgba(248,113,113,0.35);
        }
      `}</style>
    </div>
  )
}
