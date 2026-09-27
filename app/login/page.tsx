'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setCargando(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setCargando(false)

    if (error) {
      setError('Correo o contraseña incorrectos.')
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="login-root">
      {/* Fondo con partículas decorativas */}
      <div className="login-bg">
        <div className="login-blob login-blob-1" />
        <div className="login-blob login-blob-2" />
        <div className="login-blob login-blob-3" />
      </div>

      {/* Card principal */}
      <div className="login-card">
        {/* Logo / Branding */}
        <div className="login-brand">
          <div className="login-icon-wrap">
            {/* Ícono: campana de alerta con borde de escudo */}
            <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M19 3L34 10V21C34 28.18 27.39 34.46 19 36C10.61 34.46 4 28.18 4 21V10L19 3Z"
                fill="url(#shield-grad)" stroke="rgba(99,210,255,0.3)" strokeWidth="1" />
              <path d="M19 10C19 10 13 15.5 13 20.5C13 23.54 15.69 26 19 26C22.31 26 25 23.54 25 20.5C25 15.5 19 10 19 10Z"
                fill="rgba(99,210,255,0.9)" />
              <circle cx="19" cy="29" r="1.5" fill="white" />
              <defs>
                <linearGradient id="shield-grad" x1="4" y1="3" x2="34" y2="36" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1a3a5c" />
                  <stop offset="100%" stopColor="#0d2340" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="login-brand-text">
            <h1 className="login-title">MercaLerta</h1>
            <p className="login-subtitle">Alertas de Mercado Público</p>
          </div>
        </div>

        {/* Separador */}
        <div className="login-divider" />

        {/* Formulario */}
        <form onSubmit={handleLogin} className="login-form" noValidate>
          <div className="login-field">
            <label htmlFor="email" className="login-label">Correo electrónico</label>
            <div className="login-input-wrap">
              <svg className="login-input-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 4h12v8H2V4zm0 0l6 5 6-5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              <input
                id="email"
                type="email"
                placeholder="usuario@ejemplo.cl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="login-input"
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="login-field">
            <label htmlFor="password" className="login-label">Contraseña</label>
            <div className="login-input-wrap">
              <svg className="login-input-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="login-input"
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          {error && (
            <div className="login-error" role="alert">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="6" stroke="#f87171" strokeWidth="1.4" />
                <path d="M7 4v3.5M7 9.5v.5" stroke="#f87171" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              {error}
            </div>
          )}

          <button type="submit" disabled={cargando} className="login-btn">
            {cargando ? (
              <>
                <span className="login-spinner" aria-hidden="true" />
                Ingresando...
              </>
            ) : (
              'Ingresar'
            )}
          </button>
        </form>

        <p className="login-register-link">
          ¿No tienes cuenta?{' '}
          <a href="/registro" className="login-link">Regístrate</a>
        </p>

        <p className="login-footer">
          Mercado Público Chile · Solo acceso autorizado
        </p>
      </div>

      <style>{`
        /* ── Reset base ── */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── Root: fondo oscuro centrado ── */
        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #050f1e;
          position: relative;
          overflow: hidden;
          font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
        }

        /* ── Blobs de fondo ── */
        .login-bg { position: absolute; inset: 0; pointer-events: none; }

        .login-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.35;
        }
        .login-blob-1 {
          width: 500px; height: 500px;
          background: radial-gradient(circle, #0a4f8a 0%, transparent 70%);
          top: -120px; left: -100px;
        }
        .login-blob-2 {
          width: 400px; height: 400px;
          background: radial-gradient(circle, #063560 0%, transparent 70%);
          bottom: -80px; right: -60px;
        }
        .login-blob-3 {
          width: 280px; height: 280px;
          background: radial-gradient(circle, #005fa3 0%, transparent 70%);
          top: 50%; left: 60%;
          transform: translate(-50%, -50%);
        }

        /* ── Card glassmorphism ── */
        .login-card {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 400px;
          margin: 1rem;
          padding: 2.25rem 2rem 1.75rem;
          border-radius: 20px;
          background: rgba(8, 22, 42, 0.78);
          border: 1px solid rgba(99, 180, 255, 0.12);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          box-shadow:
            0 0 0 1px rgba(99, 180, 255, 0.06),
            0 24px 64px rgba(0, 0, 0, 0.55),
            inset 0 1px 0 rgba(255, 255, 255, 0.06);
        }

        /* ── Branding ── */
        .login-brand {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 0;
        }

        .login-icon-wrap {
          width: 52px; height: 52px;
          border-radius: 14px;
          background: linear-gradient(135deg, #0d2340 0%, #0a3a6e 100%);
          border: 1px solid rgba(99, 210, 255, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 0 20px rgba(0, 120, 220, 0.25);
        }

        .login-brand-text { display: flex; flex-direction: column; }

        .login-title {
          font-size: 1.45rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #e8f4ff;
          line-height: 1.2;
        }

        .login-subtitle {
          font-size: 0.72rem;
          color: #6ab3d8;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-top: 2px;
        }

        /* ── Separador ── */
        .login-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(99,180,255,0.15), transparent);
          margin: 1.5rem 0;
        }

        /* ── Formulario ── */
        .login-form { display: flex; flex-direction: column; gap: 1rem; }

        .login-field { display: flex; flex-direction: column; gap: 6px; }

        .login-label {
          font-size: 0.78rem;
          font-weight: 500;
          color: #7fb8d6;
          letter-spacing: 0.03em;
        }

        .login-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .login-input-icon {
          position: absolute;
          left: 12px;
          color: #4a7a99;
          pointer-events: none;
          flex-shrink: 0;
        }

        .login-input {
          width: 100%;
          padding: 11px 14px 11px 38px;
          border-radius: 10px;
          border: 1px solid rgba(99, 180, 255, 0.14);
          background: rgba(255, 255, 255, 0.04);
          color: #d6eaf8;
          font-size: 0.9rem;
          outline: none;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }
        .login-input::placeholder { color: rgba(100, 160, 200, 0.4); }
        .login-input:focus {
          border-color: rgba(56, 189, 248, 0.55);
          background: rgba(56, 189, 248, 0.05);
          box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.08);
        }

        /* ── Error ── */
        .login-error {
          display: flex;
          align-items: center;
          gap: 7px;
          background: rgba(220, 38, 38, 0.1);
          border: 1px solid rgba(248, 113, 113, 0.25);
          border-radius: 8px;
          padding: 9px 12px;
          color: #fca5a5;
          font-size: 0.82rem;
        }

        /* ── Botón ── */
        .login-btn {
          margin-top: 0.25rem;
          padding: 12px;
          border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, #1565c0 0%, #1976d2 50%, #1e88e5 100%);
          color: #fff;
          font-size: 0.92rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
          box-shadow: 0 4px 20px rgba(21, 101, 192, 0.4);
        }
        .login-btn:hover:not(:disabled) {
          opacity: 0.92;
          transform: translateY(-1px);
          box-shadow: 0 6px 28px rgba(21, 101, 192, 0.55);
        }
        .login-btn:active:not(:disabled) { transform: translateY(0); }
        .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        /* ── Spinner ── */
        .login-spinner {
          width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Link a registro ── */
        .login-register-link {
          text-align: center;
          margin-top: 1.25rem;
          font-size: 0.8rem;
          color: #4a7a99;
        }
        .login-link {
          color: #38bdf8;
          text-decoration: none;
          font-weight: 500;
        }
        .login-link:hover { text-decoration: underline; }

        /* ── Footer ── */
        .login-footer {
          text-align: center;
          margin-top: 1.5rem;
          font-size: 0.7rem;
          color: rgba(100, 150, 180, 0.5);
          letter-spacing: 0.04em;
        }
      `}</style>
    </div>
  )
}
