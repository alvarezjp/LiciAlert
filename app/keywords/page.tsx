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
    <div className="min-h-screen bg-[#f0f4f8] font-sans">

      {/* ── Navbar azul marino ── */}
      <header className="bg-[#0d1b2e] sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">

          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1e6fb5] flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                <rect x="2" y="3" width="18" height="16" rx="2.5" stroke="white" strokeWidth="1.6" />
                <path d="M6 8h10M6 11h7M6 14h5" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-white font-bold text-base tracking-tight">LicitaAlerta</span>
          </div>

          {/* Volver al inicio */}
          <a
            href="/"
            className="flex items-center gap-1.5 text-[#94bcd8] hover:text-white transition-colors text-sm"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Volver al inicio
          </a>
        </div>
      </header>

      {/* ── Contenido ── */}
      <main className="max-w-2xl mx-auto px-6 py-10 pb-20">

        {/* Título fuera de la card */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">
            Mis palabras clave
          </h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            Las licitaciones cuyo nombre contenga alguna de estas palabras aparecerán en tu
            panel.
          </p>
        </div>

        {/* ── Card principal ── */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-4">

          {/* Formulario agregar */}
          <form onSubmit={agregarKeyword} className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
            <div className="relative flex-1 flex items-center">
              <svg
                className="absolute left-3 text-slate-400 pointer-events-none shrink-0"
                width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"
              >
                <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                placeholder="Ej: informática, aseo, construcción"
                disabled={guardando}
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#38bdf8] focus:border-transparent transition disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={guardando || !nueva.trim()}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {guardando ? (
                <>
                  <svg className="animate-spin shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Agregando…
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 8h10M8 13l5-5-5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Agregar
                </>
              )}
            </button>
          </form>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 mx-5 my-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-600" role="alert">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="shrink-0" aria-hidden="true">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              {error}
            </div>
          )}

          {/* Cargando */}
          {cargando && (
            <div className="flex items-center gap-3 px-5 py-8 text-slate-400 text-sm">
              <svg className="animate-spin shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Cargando palabras clave…
            </div>
          )}

          {/* Estado vacío */}
          {!cargando && keywords.length === 0 && (
            <div className="flex flex-col items-center py-14 px-6 text-center gap-2">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-1" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="8" stroke="#94a3b8" strokeWidth="1.5" />
                  <path d="M21 21l-4.35-4.35" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-700">Sin palabras clave todavía</p>
              <p className="text-xs text-slate-400">Agrega la primera usando el campo de arriba.</p>
            </div>
          )}

          {/* Lista de keywords */}
          {!cargando && keywords.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {keywords.map((k) => (
                <li key={k.id} className="flex items-center justify-between px-5 py-3.5">
                  {/* Keyword con punto cian */}
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-[#38bdf8] shrink-0" aria-hidden="true" />
                    <span className="text-slate-800 text-sm font-medium">{k.palabra_clave}</span>
                  </div>

                  {/* Botón eliminar — siempre visible con ícono papelera */}
                  <button
                    onClick={() => eliminarKeyword(k.id)}
                    aria-label={`Eliminar "${k.palabra_clave}"`}
                    className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Eliminar
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Pie de la card: contador */}
          {!cargando && keywords.length > 0 && (
            <div className="px-5 py-3 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                {keywords.length} palabra{keywords.length !== 1 ? 's' : ''} clave activa{keywords.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>

        {/* ── Card de tip/consejo ── */}
        <div className="bg-[#e0f7ff] border border-[#38bdf8]/30 rounded-2xl px-5 py-4 flex gap-3">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-[#0891b2] mt-0.5" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 7v5M8 5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <p className="text-sm text-[#0e7490] leading-relaxed">
            Las palabras clave se comparan contra el nombre de la licitación y sus elementos
            internos. Usa términos generales para mejores resultados — por ejemplo{' '}
            <strong className="font-semibold">aseo</strong> en lugar de{' '}
            <strong className="font-semibold">servicio de aseo y limpieza</strong>.
          </p>
        </div>
      </main>
    </div>
  )
}
