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
    <div className="min-h-screen flex font-sans">

      {/* ══════════════════════════════
          PANEL IZQUIERDO — branding
      ══════════════════════════════ */}
      <div className="hidden lg:flex flex-col justify-between w-[52%] bg-[#0d1b2e] px-14 py-12 relative overflow-hidden">

        {/* Círculos decorativos de fondo */}
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
            Nunca pierdas<br />
            una licitación<br />
            <span className="text-[#38bdf8]">relevante.</span>
          </h1>

          {/* Descripción */}
          <p className="text-[#7fa8c4] text-base leading-relaxed max-w-sm">
            Monitoreo inteligente de licitaciones del Estado. Filtra
            por palabras clave y recibe alertas cuando aparezcan
            oportunidades para tu negocio.
          </p>

          {/* Stats */}
          <div className="flex gap-12 pt-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-white text-2xl font-bold tracking-tight">+5.000</span>
              <span className="text-[#6a96b2] text-sm">licitaciones/mes</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-white text-2xl font-bold tracking-tight">24 h</span>
              <span className="text-[#6a96b2] text-sm">actualización diaria</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-[#4a6a80] text-xs">
          © {new Date().getFullYear()} LiciAlert — Datos de Mercado Público Chile
        </p>
      </div>

      {/* ══════════════════════════════
          PANEL DERECHO — formulario
      ══════════════════════════════ */}
      <div className="flex flex-1 flex-col justify-center items-center bg-[#f0f4f8] px-6 py-12">

        {/* Logo visible sólo en móvil */}
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
              Bienvenido de vuelta
            </h2>
            <p className="text-[#38bdf8] text-base mt-1.5">
              Ingresa tus credenciales para continuar
            </p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-5" noValidate>

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
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-base font-medium text-slate-700">
                  Contraseña
                </label>
                <a href="#" className="text-sm text-[#38bdf8] hover:text-[#0096c7] transition-colors">
                  ¿Olvidaste tu contraseña?
                </a>
              </div>
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
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#38bdf8] focus:border-transparent transition"
                />
              </div>
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
                  Ingresando...
                </>
              ) : (
                'Ingresar'
              )}
            </button>
          </form>

          {/* Link registro */}
          <p className="mt-7 text-center text-base text-slate-500">
            ¿No tienes cuenta?{' '}
            <a href="/registro" className="text-[#38bdf8] font-semibold hover:text-[#0096c7] transition-colors">
              Crear cuenta gratis
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
