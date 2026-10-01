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

  if (!user) redirect('/login')

  const { data: perfil, error } = await supabase
    .from('perfiles')
    .select('plan, trial_fin, activo')
    .eq('id', user.id)
    .single()

  /* ── Error de perfil ── */
  if (error || !perfil) {
    return (
      <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900 mb-3">No pudimos cargar tu perfil</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            Intenta recargar la página. Si el problema persiste, contáctanos.
          </p>
        </div>
      </div>
    )
  }

  const trialVencido = perfil.plan === 'trial' && new Date(perfil.trial_fin) < new Date()

  /* ── Trial vencido / cuenta inactiva ── */
  if (trialVencido || !perfil.activo) {
    return (
      <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
          <div className="text-4xl mb-4" aria-hidden="true">🔒</div>
          <h1 className="text-xl font-bold text-slate-900 mb-3">Tu período de prueba terminó</h1>
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            Tu prueba gratuita finalizó el{' '}
            <strong className="text-slate-800">
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
      (a, b) =>
        new Date(b.fecha_publicacion).getTime() - new Date(a.fecha_publicacion).getTime()
    )
  }

  const totalNuevas = licitaciones.filter((l) => l.estado_usuario === 'nueva').length

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
            <span className="text-white font-bold text-base tracking-tight">LiciAlert</span>
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            <a
              href="/keywords"
              className="inline-flex items-center gap-2 px-4 py-1 text-[#94bcd8] hover:text-white transition-colors text-sm cursor-pointer"
            >
             
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="mb-0.5" aria-hidden="true">
                <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Palabras clave
            </a>
            <div className="w-px h-8 bg-white/10 mx-1" />
            <LogoutButton />
          </nav>
        </div>
      </header>

      {/* ── Contenido ── */}
      <main className="max-w-5xl mx-auto px-6 py-8 pb-16">

        {/* Banner trial */}
        {perfil.plan === 'trial' && (
          <div className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-3 mb-6 text-sm text-slate-600 shadow-sm">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="shrink-0 text-slate-400" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Estás en período de prueba. Te quedan{' '}
            <strong className="text-slate-900">{diasRestantes}</strong>{' '}
            día{diasRestantes !== 1 ? 's' : ''}.
          </div>
        )}

        {/* Cabecera sección */}
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Licitaciones</h1>
            <p className="text-slate-500 text-sm mt-1 flex items-center gap-2 flex-wrap">
              Resultados que coinciden con tus palabras clave
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                {licitaciones.length} en total
              </span>
              {totalNuevas > 0 && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#38bdf8]/15 text-[#0891b2] border border-[#38bdf8]/30">
                  {totalNuevas} sin revisar
                </span>
              )}
            </p>
          </div>

          {/* Ordenamiento */}
          <div className="flex items-center gap-2 self-center">
            <a
              href="/"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                orden !== 'recientes'
                  ? 'bg-[#0d1b2e] text-white border-[#0d1b2e]'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Relevancia
            </a>
            <a
              href="/?orden=recientes"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                orden === 'recientes'
                  ? 'bg-[#0d1b2e] text-white border-[#0d1b2e]'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Más recientes
            </a>
          </div>
        </div>

        {/* Error de carga */}
        {errorLicitaciones && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 mb-4">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            No se pudieron cargar las licitaciones: {errorLicitaciones.message}
          </div>
        )}

        {!errorLicitaciones && (
          <ListaLicitaciones licitaciones={licitaciones} userId={user.id} />
        )}
      </main>
    </div>
  )
}
