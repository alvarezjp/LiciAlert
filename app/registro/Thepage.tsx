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
      <div className="min-h-screen flex font-sans">

        {/* Panel izquierdo */}
        <PanelIzquierdo />

        {/* Panel derecho */}
        <div className="flex flex-1 flex-col justify-center items-center bg-[#f0f4f8] px-6 py-12">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-md border border-slate-200 px-9 py-10 text-center">

            {/* Ícono de éxito */}
            <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-5">
              <svg width="26" height="26" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <path d="M6 14l5 5 11-10" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">
              Revisa tu correo
            </h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-6">
              Enviamos un enlace de confirmación a{' '}
              <strong className="text-slate-800">{email}</strong>.
              Haz clic en él para activar tu cuenta e iniciar tu período de prueba.
            </p>

            <a
              href="/login"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-[#0d1b2e] hover:bg-[#1a3a5c] text-white text-base font-semibold transition-colors"
            >
              Ir al inicio de sesión
            </a>

            <p className="mt-6 text-xs text-slate-400">
              Mercado Público Chile · Solo acceso autorizado
            </p>
          </div>
        </div>
      </div>
    )
  }

  /* ── Formulario de registro ── */
  return (
    <div className="min-h-screen flex font-sans">

      {/* Panel izquierdo */}
      <PanelIzquierdo />

      {/* Panel derecho */}
      <div className="flex flex-1 flex-col justify-center items-center bg-[#f0f4f8] px-6 py-12">

        {/* Logo móvil */}
        <div className="flex items-center gap-2 mb-8 lg:hidden">
          <div className="w-9 h-9 rounded-lg bg-[#0d1b2e] flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <rect x="2" y="3" width="18" height="16" rx="2.5" stroke="white" strokeWidth="1.6" />
              <path d="M6 8h10M6 11h7M6 14h5" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-[#0d1b2e] font-bold text-lg">LiciAlert</span>
        </div>

        {/* Card */}
        <div className="w-full max-w-md bg-white rounded-2xl shadow-md border border-slate-200 px-9 py-10">

          {/* Encabezado */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-[#0d1b2e] tracking-tight">
              Crea tu cuenta
            </h2>
            <p className="text-[#38bdf8] text-base mt-1.5">
              Comienza tu período de prueba gratis
            </p>
          </div>

          <form onSubmit={handleRegistro} className="flex flex-col gap-5" noValidate>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-base font-medium text-slate-700">
                Correo electrónico
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-slate-400 pointer-events-none">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </span>
                <input
                  id="email"
                  type="email"
                  placeholder="tucorreo@empresa.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#38bdf8] focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Contraseña */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-base font-medium text-slate-700">
                Contraseña
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-slate-400 pointer-events-none">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  id="password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#38bdf8] focus:border-transparent transition"
                />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                La contraseña debe tener al menos 6 caracteres.
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3.5 py-3" role="alert">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" x2="12" y1="8" y2="12" />
                  <line x1="12" x2="12.01" y1="16" y2="16" />
                </svg>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Botón */}
            <button
              type="submit"
              disabled={cargando}
              className="w-full py-3.5 mt-1 rounded-lg bg-[#0d1b2e] hover:bg-[#1a3a5c] text-white text-base font-semibold tracking-wide transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {cargando ? (
                <>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Creando cuenta…
                </>
              ) : (
                'Crear cuenta'
              )}
            </button>
          </form>

          {/* Link login */}
          <p className="mt-7 text-center text-base text-slate-500">
            ¿Ya tienes cuenta?{' '}
            <a href="/login" className="text-[#38bdf8] font-semibold hover:text-[#0096c7] transition-colors">
              Inicia sesión
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

/* ── Panel izquierdo compartido ── */
function PanelIzquierdo() {
  return (
    <div className="hidden lg:flex flex-col justify-between w-[52%] bg-[#0d1b2e] px-14 py-12 relative overflow-hidden">

      {/* Círculos decorativos */}
      <div className="absolute -bottom-44 -right-28 w-[520px] h-[520px] rounded-full bg-[#1e508c] opacity-40 pointer-events-none" />
      <div className="absolute -top-16 -left-20 w-72 h-72 rounded-full bg-[#143c6e] opacity-30 pointer-events-none" />

      {/* Logo */}
      <div className="relative z-10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#1e6fb5] flex items-center justify-center shrink-0">
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <rect x="2" y="3" width="18" height="16" rx="2.5" stroke="white" strokeWidth="1.6" />
            <path d="M6 8h10M6 11h7M6 14h5" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
        <span className="text-white font-bold text-xl tracking-tight">LiciAlert</span>
      </div>

      {/* Contenido hero */}
      <div className="relative z-10 flex flex-col gap-6">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-white/8 border border-white/10 rounded-full px-4 py-1.5 w-fit">
          <span className="w-2 h-2 rounded-full bg-[#38bdf8] shrink-0" />
          <span className="text-[#94bcd8] text-sm font-medium">Mercado Público de Chile</span>
        </div>

        {/* Headline */}
        <h1 className="text-5xl font-extrabold text-white leading-[1.15] tracking-tight">
          Empieza gratis,<br />
          sin tarjeta<br />
          <span className="text-[#38bdf8]">de crédito.</span>
        </h1>

        {/* Descripción */}
        <p className="text-[#7fa8c4] text-base leading-relaxed max-w-sm">
          Crea tu cuenta en segundos y comienza a monitorear licitaciones del Estado
          con tus propias palabras clave.
        </p>

        {/* Beneficios */}
        <ul className="flex flex-col gap-3 pt-1">
          {[
            'Período de prueba gratuito incluido',
            'Alertas automáticas por email',
            'Más de 5.000 licitaciones por mes',
          ].map((item) => (
            <li key={item} className="flex items-center gap-3 text-[#94bcd8] text-sm">
              <span className="w-5 h-5 rounded-full bg-[#38bdf8]/15 border border-[#38bdf8]/30 flex items-center justify-center shrink-0">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 6l3 3 5-5" stroke="#38bdf8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Footer */}
      <p className="relative z-10 text-[#4a6a80] text-xs">
        © {new Date().getFullYear()} LiciAlert — Datos de Mercado Público Chile
      </p>
    </div>
  )
}
