'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

type Keyword = {
  id: string
  palabra_clave: string
  activo: boolean
}

export default function KeywordsPanel() {
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [nueva, setNueva] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

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
    startTransition(() => { router.refresh() })
  }

  const eliminarKeyword = async (id: string) => {
    setError(null)
    const { error } = await supabase.from('keywords_usuario').delete().eq('id', id)

    if (error) {
      setError(error.message)
      return
    }

    setKeywords((prev) => prev.filter((k) => k.id !== id))
    startTransition(() => { router.refresh() })
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Título ── */}
      <div>
        <h2 className="text-base font-bold text-slate-900 tracking-tight mb-0.5 flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="shrink-0 text-slate-500" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          Mis palabras clave
        </h2>
        <p className="text-slate-500 text-xs leading-relaxed">
          Las licitaciones cuyo nombre contenga alguna de estas palabras aparecerán en tu panel.
        </p>
      </div>

      {/* ── Banner: actualizando licitaciones ── */}
      {isPending && (
        <div className="flex items-center gap-2 bg-[#e0f2fe] border border-[#38bdf8]/40 rounded-xl px-3 py-2.5 text-xs text-[#0891b2]" role="status" aria-live="polite">
          <svg className="animate-spin shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Actualizando licitaciones…
        </div>
      )}

      {/* ── Card principal ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

        {/* Formulario agregar */}
        <form onSubmit={agregarKeyword} className="flex flex-col gap-2 px-4 py-3 border-b border-slate-100">
          <div className="relative flex items-center">
            <svg
              className="absolute left-3 text-slate-400 pointer-events-none shrink-0"
              width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"
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
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#38bdf8] focus:border-transparent transition disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={guardando || !nueva.trim()}
            className="inline-flex items-center justify-center gap-2 w-full px-4 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {guardando ? (
              <>
                <svg className="animate-spin shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Agregando…
              </>
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M8 13l5-5-5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Agregar
              </>
            )}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 mx-4 my-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600" role="alert">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            {error}
          </div>
        )}

        {/* Cargando */}
        {cargando && (
          <div className="flex items-center gap-2 px-4 py-6 text-slate-400 text-xs">
            <svg className="animate-spin shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Cargando palabras clave…
          </div>
        )}

        {/* Estado vacío */}
        {!cargando && keywords.length === 0 && (
          <div className="flex flex-col items-center py-8 px-4 text-center gap-1.5">
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center mb-0.5" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="8" stroke="#94a3b8" strokeWidth="1.5" />
                <path d="M21 21l-4.35-4.35" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-700">Sin palabras clave todavía</p>
            <p className="text-xs text-slate-400">Agrega la primera usando el campo de arriba.</p>
          </div>
        )}

        {/* Lista de keywords */}
        {!cargando && keywords.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {keywords.map((k) => (
              <li key={k.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] shrink-0" aria-hidden="true" />
                  <span className="text-slate-800 text-sm font-medium">{k.palabra_clave}</span>
                </div>
                <button
                  onClick={() => eliminarKeyword(k.id)}
                  aria-label={`Eliminar "${k.palabra_clave}"`}
                  className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Pie: contador */}
        {!cargando && keywords.length > 0 && (
          <div className="px-4 py-2.5 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              {keywords.length} palabra{keywords.length !== 1 ? 's' : ''} clave activa{keywords.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* ── Card tip ── */}
      <div className="bg-[#e0f2fe] border border-[#38bdf8]/40 rounded-2xl px-4 py-3.5 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#0891b2]">¿Cómo funciona?</p>
        <div className="text-xs text-[#0e7490] leading-relaxed space-y-1.5">
          <p>
            <strong className="font-semibold">Una palabra:</strong> amplía los resultados.{' '}
            <em>aseo</em> encuentra "servicio de aseo", "insumos de aseo", etc.
          </p>
          <p>
            <strong className="font-semibold">Varias palabras juntas:</strong> la licitación debe tenerlas todas.{' '}
            <em>mantención computadores</em> solo muestra las que mencionen ambas.
          </p>
          <p>
            <strong className="font-semibold">¿Quieres opciones distintas?</strong> Agrégalas por separado: una para <em>aseo</em> y otra para <em>limpieza</em>.
          </p>
          <p>
            No importan las mayúsculas ni el plural: <em>computador</em> también encuentra "computadores".
          </p>
        </div>
      </div>

    </div>
  )
}
