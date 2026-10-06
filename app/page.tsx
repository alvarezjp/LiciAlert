import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import LogoutButton from '@/components/LogoutButton'
import KeywordsPanel from '@/components/KeywordsPanel'
import SeccionLicitaciones from '@/components/SeccionLicitaciones'

export default async function HomePage() {
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
            <LogoutButton />
          </nav>
        </div>
      </header>

      {/* ── Contenido ── */}
      <main className="max-w-7xl mx-auto px-6 py-8 pb-16">

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

        {/* Layout de dos columnas */}
        <div className="flex gap-8 items-start">

          {/* ── Columna principal ── */}
          {errorLicitaciones ? (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0" aria-hidden="true">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                No se pudieron cargar las licitaciones: {errorLicitaciones.message}
              </div>
            </div>
          ) : (
            <SeccionLicitaciones
              licitaciones={licitaciones}
              userId={user.id}
              totalNuevas={totalNuevas}
            />
          )}

          {/* ── Sidebar keywords (sticky) ── */}
          <aside className="w-80 shrink-0 sticky top-20">
            <KeywordsPanel />
          </aside>

        </div>
      </main>
    </div>
  )
}
