'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'

// Al registrarse se dispara el trigger de Postgres (crear_perfil_nuevo_usuario)
// que crea la fila en `perfiles` con el trial de 7 días.

export default function RegistroPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [enviado, setEnviado]   = useState(false)
  const [cargando, setCargando] = useState(false)

  const handleRegistro = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setCargando(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setCargando(false)

    if (error) {
      setError(error.message)
      return
    }

    setEnviado(true)
  }

  /* ── Estado: correo de confirmación enviado ── */
  if (enviado) {
    return (
      <div className="reg-root">
        <div className="reg-bg">
          <div className="reg-blob reg-blob-1" />
          <div className="reg-blob reg-blob-2" />
          <div className="reg-blob reg-blob-3" />
        </div>

        <div className="reg-card">
          {/* Branding */}
          <div className="reg-brand">
            <div className="reg-icon-wrap">
              <svg width="38" height="38" viewBox="0 0 38 38" fill="none" aria-hidden="true">
                <path d="M19 3L34 10V21C34 28.18 27.39 34.46 19 36C10.61 34.46 4 28.18 4 21V10L19 3Z"
                  fill="url(#reg-shield-ok)" stroke="rgba(99,210,255,0.3)" strokeWidth="1" />
                <path d="M19 10C19 10 13 15.5 13 20.5C13 23.54 15.69 26 19 26C22.31 26 25 23.54 25 20.5C25 15.5 19 10 19 10Z"
                  fill="rgba(99,210,255,0.9)" />
                <circle cx="19" cy="29" r="1.5" fill="white" />
                <defs>
                  <linearGradient id="reg-shield-ok" x1="4" y1="3" x2="34" y2="36" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#1a3a5c" />
                    <stop offset="100%" stopColor="#0d2340" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="reg-brand-text">
              <h1 className="reg-title">MercaLerta</h1>
              <p className="reg-subtitle">Alertas de Mercado Público</p>
            </div>
          </div>

          <div className="reg-divider" />

          {/* Mensaje de éxito */}
          <div className="reg-success">
            <div className="reg-success-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="14" r="13" fill="rgba(34,197,94,0.12)" stroke="rgba(34,197,94,0.35)" strokeWidth="1.5"/>
                <path d="M8 14l4 4 8-8" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="reg-success-title">Revisa tu correo</h2>
            <p className="reg-success-body">
              Enviamos un enlace de confirmación a{' '}
              <strong className="reg-success-email">{email}</strong>.
              Haz clic en él para activar tu cuenta e iniciar tu período de prueba.
            </p>
          </div>

          <a href="/login" className="reg-btn-link">
            Ir al inicio de sesión
          </a>

          <p className="reg-footer">
            Mercado Público Chile · Solo acceso autorizado
          </p>
        </div>

        <Styles />
      </div>
    )
  }

  /* ── Formulario de registro ── */
  return (
    <div className="reg-root">
      <div className="reg-bg">
        <div className="reg-blob reg-blob-1" />
        <div className="reg-blob reg-blob-2" />
        <div className="reg-blob reg-blob-3" />
      </div>

      <div className="reg-card">
        {/* Branding */}
        <div className="reg-brand">
          <div className="reg-icon-wrap">
            <svg width="38" height="38" viewBox="0 0 38 38" fill="none" aria-hidden="true">
              <path d="M19 3L34 10V21C34 28.18 27.39 34.46 19 36C10.61 34.46 4 28.18 4 21V10L19 3Z"
                fill="url(#reg-shield)" stroke="rgba(99,210,255,0.3)" strokeWidth="1" />
              <path d="M19 10C19 10 13 15.5 13 20.5C13 23.54 15.69 26 19 26C22.31 26 25 23.54 25 20.5C25 15.5 19 10 19 10Z"
                fill="rgba(99,210,255,0.9)" />
              <circle cx="19" cy="29" r="1.5" fill="white" />
              <defs>
                <linearGradient id="reg-shield" x1="4" y1="3" x2="34" y2="36" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1a3a5c" />
                  <stop offset="100%" stopColor="#0d2340" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="reg-brand-text">
            <h1 className="reg-title">MercaLerta</h1>
            <p className="reg-subtitle">Alertas de Mercado Público</p>
          </div>
        </div>

        <div className="reg-divider" />

        {/* Formulario */}
        <form onSubmit={handleRegistro} className="reg-form" noValidate>
          <div className="reg-field">
            <label htmlFor="email" className="reg-label">Correo electrónico</label>
            <div className="reg-input-wrap">
              <svg className="reg-input-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 4h12v8H2V4zm0 0l6 5 6-5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              <input
                id="email"
                type="email"
                placeholder="usuario@ejemplo.cl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="reg-input"
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="reg-field">
            <label htmlFor="password" className="reg-label">Contraseña</label>
            <div className="reg-input-wrap">
              <svg className="reg-input-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                id="password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="reg-input"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <span className="reg-hint">La contraseña debe tener al menos 6 caracteres.</span>
          </div>

          {error && (
            <div className="reg-error" role="alert">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="6" stroke="#f87171" strokeWidth="1.4" />
                <path d="M7 4v3.5M7 9.5v.5" stroke="#f87171" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              {error}
            </div>
          )}

          <button type="submit" disabled={cargando} className="reg-btn">
            {cargando ? (
              <>
                <span className="reg-spinner" aria-hidden="true" />
                Creando cuenta…
              </>
            ) : (
              'Crear cuenta'
            )}
          </button>
        </form>

        <p className="reg-login-link">
          ¿Ya tienes cuenta?{' '}
          <a href="/login" className="reg-link">Inicia sesión</a>
        </p>

        <p className="reg-footer">
          Mercado Público Chile · Solo acceso autorizado
        </p>
      </div>

      <Styles />
    </div>
  )
}

function Styles() {
  return (
    <style>{`
      /* ── Reset ── */
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      /* ── Root ── */
      .reg-root {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #050f1e;
        position: relative;
        overflow: hidden;
        font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
      }

      /* ── Blobs ── */
      .reg-bg { position: absolute; inset: 0; pointer-events: none; }
      .reg-blob {
        position: absolute;
        border-radius: 50%;
        filter: blur(80px);
        opacity: 0.35;
      }
      .reg-blob-1 {
        width: 500px; height: 500px;
        background: radial-gradient(circle, #0a4f8a 0%, transparent 70%);
        top: -120px; left: -100px;
      }
      .reg-blob-2 {
        width: 400px; height: 400px;
        background: radial-gradient(circle, #063560 0%, transparent 70%);
        bottom: -80px; right: -60px;
      }
      .reg-blob-3 {
        width: 280px; height: 280px;
        background: radial-gradient(circle, #005fa3 0%, transparent 70%);
        top: 50%; left: 60%;
        transform: translate(-50%, -50%);
      }

      /* ── Card ── */
      .reg-card {
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
      .reg-brand {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .reg-icon-wrap {
        width: 52px; height: 52px;
        border-radius: 14px;
        background: linear-gradient(135deg, #0d2340 0%, #0a3a6e 100%);
        border: 1px solid rgba(99,210,255,0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        box-shadow: 0 0 20px rgba(0,120,220,0.25);
      }
      .reg-brand-text { display: flex; flex-direction: column; }
      .reg-title {
        font-size: 1.45rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: #e8f4ff;
        line-height: 1.2;
      }
      .reg-subtitle {
        font-size: 0.72rem;
        color: #6ab3d8;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        margin-top: 2px;
      }

      /* ── Separador ── */
      .reg-divider {
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(99,180,255,0.15), transparent);
        margin: 1.5rem 0;
      }

      /* ── Formulario ── */
      .reg-form { display: flex; flex-direction: column; gap: 1rem; }
      .reg-field { display: flex; flex-direction: column; gap: 6px; }
      .reg-label {
        font-size: 0.78rem;
        font-weight: 500;
        color: #7fb8d6;
        letter-spacing: 0.03em;
      }
      .reg-hint {
        font-size: 0.7rem;
        color: #4a7a99;
        margin-top: 2px;
      }
      .reg-input-wrap {
        position: relative;
        display: flex;
        align-items: center;
      }
      .reg-input-icon {
        position: absolute;
        left: 12px;
        color: #4a7a99;
        pointer-events: none;
        flex-shrink: 0;
      }
      .reg-input {
        width: 100%;
        padding: 11px 14px 11px 38px;
        border-radius: 10px;
        border: 1px solid rgba(99,180,255,0.14);
        background: rgba(255,255,255,0.04);
        color: #d6eaf8;
        font-size: 0.9rem;
        outline: none;
        font-family: inherit;
        transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
      }
      .reg-input::placeholder { color: rgba(100,160,200,0.4); }
      .reg-input:focus {
        border-color: rgba(56,189,248,0.55);
        background: rgba(56,189,248,0.05);
        box-shadow: 0 0 0 3px rgba(56,189,248,0.08);
      }

      /* ── Error ── */
      .reg-error {
        display: flex;
        align-items: center;
        gap: 7px;
        background: rgba(220,38,38,0.1);
        border: 1px solid rgba(248,113,113,0.25);
        border-radius: 8px;
        padding: 9px 12px;
        color: #fca5a5;
        font-size: 0.82rem;
      }

      /* ── Botón principal ── */
      .reg-btn {
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
        font-family: inherit;
        transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
        box-shadow: 0 4px 20px rgba(21,101,192,0.4);
      }
      .reg-btn:hover:not(:disabled) {
        opacity: 0.92;
        transform: translateY(-1px);
        box-shadow: 0 6px 28px rgba(21,101,192,0.55);
      }
      .reg-btn:active:not(:disabled) { transform: translateY(0); }
      .reg-btn:disabled { opacity: 0.6; cursor: not-allowed; }

      /* ── Spinner ── */
      .reg-spinner {
        width: 14px; height: 14px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: reg-spin 0.7s linear infinite;
        flex-shrink: 0;
      }
      @keyframes reg-spin { to { transform: rotate(360deg); } }

      /* ── Link a login ── */
      .reg-login-link {
        text-align: center;
        margin-top: 1.25rem;
        font-size: 0.8rem;
        color: #4a7a99;
      }
      .reg-link {
        color: #38bdf8;
        text-decoration: none;
        font-weight: 500;
      }
      .reg-link:hover { text-decoration: underline; }

      /* ── Footer ── */
      .reg-footer {
        text-align: center;
        margin-top: 1rem;
        font-size: 0.7rem;
        color: rgba(100,150,180,0.5);
        letter-spacing: 0.04em;
      }

      /* ── Estado: confirmación enviada ── */
      .reg-success {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 10px;
        margin-bottom: 1.5rem;
      }
      .reg-success-icon { margin-bottom: 2px; }
      .reg-success-title {
        font-size: 1.1rem;
        font-weight: 700;
        color: #e8f4ff;
        letter-spacing: -0.01em;
      }
      .reg-success-body {
        font-size: 0.85rem;
        color: #7fb8d6;
        line-height: 1.6;
      }
      .reg-success-email { color: #c8e6f5; }

      /* ── Botón-link (estado confirmación) ── */
      .reg-btn-link {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 11px;
        border-radius: 10px;
        border: 1px solid rgba(99,180,255,0.18);
        background: rgba(99,180,255,0.06);
        color: #7fb8d6;
        font-size: 0.88rem;
        font-weight: 500;
        text-decoration: none;
        font-family: inherit;
        transition: background 0.2s, border-color 0.2s, color 0.2s;
        margin-bottom: 0;
      }
      .reg-btn-link:hover {
        background: rgba(99,180,255,0.11);
        border-color: rgba(99,180,255,0.3);
        color: #c8e6f5;
      }
    `}</style>
  )
}
