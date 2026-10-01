import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

type StatsLicitaciones = {
  total: number
  completas: number
  cargadas_hoy: number
  cargadas_hoy_completas: number
}

type StatsUsuario = {
  user_id: string
  email: string
  trial_inicio: string | null
  trial_fin: string | null
  dias_restantes: number | null
  notificado_hoy: boolean
}

type StatsSaltada = {
  codigo: string
  nombre: string | null
  intentos: number
  ultimo_status: number | null
  ultimo_error: string | null
  saltada_en: string
  revisada: boolean
}

type StatsLote = {
  id: string
  fecha: string
  corrida: string
  total_codigos: number
  pendientes_actuales: number
  procesados_aprox: number
  saltadas: number
  completado: boolean
  creado_en: string
  completado_en: string | null
}

type StatsHistoricoDiario = {
  fecha: string
  total: number
  con_organismo: number
  sin_organismo_con_detalle: number
  sin_organismo_sin_detalle: number
}

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user) redirect('/login')

  const { data: esAdmin, error: errorAdmin } = await supabase.rpc('es_admin_actual')
  if (errorAdmin || !esAdmin) redirect('/')

  const [
    { data: lic, error: errorLic },
    { data: statsUsuarios, error: errorUsuarios },
    { data: statsLotes, error: errorLotes },
    { data: statsHistorico, error: errorHistorico },
    { data: statsSaltadas, error: errorSaltadas },
  ] = await Promise.all([
    supabase.rpc('admin_stats_licitaciones').single<StatsLicitaciones>(),
    supabase.rpc('admin_stats_usuarios'),
    supabase.rpc('admin_stats_lotes'),
    supabase.rpc('admin_stats_historico_diario'),
    supabase.rpc('admin_stats_saltadas'),
  ])

  if (errorLic)       throw new Error('Error al cargar estadísticas de licitaciones: ' + errorLic.message)
  if (errorUsuarios)  throw new Error('Error al cargar estadísticas de usuarios: ' + errorUsuarios.message)
  if (errorLotes)     throw new Error('Error al cargar estadísticas de lotes: ' + errorLotes.message)
  if (errorHistorico) throw new Error('Error al cargar histórico diario: ' + errorHistorico.message)

  if (errorSaltadas)  throw new Error('Error al cargar licitaciones saltadas: ' + errorSaltadas.message)

  const saltadas  = (statsSaltadas  ?? []) as StatsSaltada[]
  const stats     = lic ?? { total: 0, completas: 0, cargadas_hoy: 0, cargadas_hoy_completas: 0 }
  const usuarios  = (statsUsuarios  ?? []) as StatsUsuario[]
  const lotes     = (statsLotes     ?? []) as StatsLote[]
  const historico = (statsHistorico ?? []) as StatsHistoricoDiario[]

  const pctCompletas = stats.total > 0
    ? Math.round((stats.completas / stats.total) * 100)
    : 0

  return (
    <div className="min-h-screen bg-[#f0f4f8] font-sans">

      {/* ── Navbar azul marino ── */}
      <header className="bg-[#0d1b2e] sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">

          {/* Brand */}
          <a href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1e6fb5] flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                <rect x="2" y="3" width="18" height="16" rx="2.5" stroke="white" strokeWidth="1.6" />
                <path d="M6 8h10M6 11h7M6 14h5" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-white font-bold text-base tracking-tight">LiciAlert</span>
          </a>

          {/* Nav derecha */}
          <nav className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded text-xs font-bold uppercase tracking-widest bg-[#38bdf8]/15 border border-[#38bdf8]/30 text-[#38bdf8]">
              Admin
            </span>
            <a
              href="/"
              className="flex items-center gap-1.5 text-[#94bcd8] hover:text-white transition-colors text-sm"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Volver al inicio
            </a>
          </nav>
        </div>
      </header>

      {/* ── Contenido principal ── */}
      <main className="max-w-6xl mx-auto px-6 py-8 pb-20">

        {/* Cabecera */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-1">
            Panel de administrador
          </h1>
          <p className="text-slate-500 text-sm">Estadísticas del sistema en tiempo real</p>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-10">

          {/* Licitaciones totales */}
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
              Licitaciones totales
            </p>
            <p className="text-3xl font-bold text-slate-900 tabular-nums tracking-tight mb-1">
              {stats.total.toLocaleString('es-CL')}
            </p>
            <p className="text-xs text-slate-500 mb-3">
              {stats.completas.toLocaleString('es-CL')} completas · {pctCompletas}%
            </p>
            {/* Barra de progreso */}
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#0d1b2e] rounded-full transition-all duration-500"
                style={{ width: `${pctCompletas}%` }}
              />
            </div>
          </div>

          {/* Cargadas hoy */}
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
              Cargadas hoy
            </p>
            <p className="text-3xl font-bold text-slate-900 tabular-nums tracking-tight mb-1">
              {stats.cargadas_hoy.toLocaleString('es-CL')}
            </p>
            <p className="text-xs text-slate-500">
              {stats.cargadas_hoy_completas.toLocaleString('es-CL')} con datos completos
            </p>
          </div>

          {/* Usuarios activos */}
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
              Usuarios activos
            </p>
            <p className="text-3xl font-bold text-slate-900 tabular-nums tracking-tight mb-1">
              {usuarios.length}
            </p>
            <p className="text-xs text-slate-500">
              {usuarios.filter(u => u.notificado_hoy).length} notificados hoy
            </p>
          </div>

          {/* Lotes */}
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
              Lotes (14 días)
            </p>
            <p className="text-3xl font-bold text-slate-900 tabular-nums tracking-tight mb-1">
              {lotes.length}
            </p>
            <p className="text-xs text-slate-500">
              {lotes.filter(l => l.completado).length} completados
              · {lotes.filter(l => !l.completado).length} pendientes
            </p>
          </div>

          {/* Saltadas */}
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
              Licitaciones saltadas
            </p>
            <p className={`text-3xl font-bold tabular-nums tracking-tight mb-1 ${saltadas.length > 0 ? 'text-red-500' : 'text-slate-900'}`}>
              {saltadas.length}
            </p>
            <p className="text-xs text-slate-500">
              {saltadas.filter(s => !s.revisada).length} sin revisar
            </p>
          </div>
        </div>

        {/* ── Tabla: Lotes de enriquecimiento ── */}
        <section className="mb-10">
          <div className="flex items-baseline gap-3 mb-1">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Lotes de enriquecimiento
            </h2>
            <span className="text-xs text-slate-400 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
              últimos 14 días · por corrida
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Cada fila es una corrida (mañana/tarde). "Procesados aprox." refleja los códigos
            que salieron de la cola — no distingue si llegaron con dato o no. "Saltadas" son códigos que la API rechazó
            3 veces y se sacaron del lote para que pueda completarse.
          </p>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Corrida</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Total</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Procesados</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Saltadas</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Pendientes</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Completado en</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lotes.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {l.fecha.split('-').reverse().join('/')}
                    </td>
                    <td className="px-4 py-3 text-slate-700 capitalize">{l.corrida}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {l.total_codigos.toLocaleString('es-CL')}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {l.procesados_aprox.toLocaleString('es-CL')}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={l.saltadas > 0 ? 'font-semibold text-red-500' : 'text-slate-400'}>
                        {l.saltadas.toLocaleString('es-CL')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={l.pendientes_actuales > 0 ? 'font-semibold text-orange-500' : 'text-slate-400'}>
                        {l.pendientes_actuales.toLocaleString('es-CL')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {l.completado ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Completado
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-600 border border-orange-200">
                          En proceso
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {l.completado_en
                        ? new Date(l.completado_en).toLocaleString('es-CL')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Tabla: Histórico diario ── */}
        <section className="mb-10">
          <div className="flex items-baseline gap-3 mb-1">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Histórico diario de enriquecimiento
            </h2>
            <span className="text-xs text-slate-400 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
              últimos 14 días · agregado por día
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            "Sin organismo con detalle" corresponde a casos procesados pero sin dato confirmado
            (bug tipo 16/09). "Sin organismo sin detalle" son los aún no procesados o que
            fallaron antes de guardar.
          </p>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Fecha</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Total</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Con organismo</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Sin org. (con detalle) ⚠</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Sin org. (sin detalle)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historico.map((h) => (
                  <tr key={h.fecha} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {new Date(h.fecha).toLocaleDateString('es-CL')}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {h.total.toLocaleString('es-CL')}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-600">
                      {h.con_organismo.toLocaleString('es-CL')}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={h.sin_organismo_con_detalle > 0 ? 'font-semibold text-red-500' : 'text-slate-400'}>
                        {h.sin_organismo_con_detalle.toLocaleString('es-CL')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-400">
                      {h.sin_organismo_sin_detalle.toLocaleString('es-CL')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Tabla: Licitaciones saltadas ── */}
        <section className="mb-10">
          <div className="flex items-baseline gap-3 mb-1">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Licitaciones saltadas
            </h2>
            <span className="text-xs text-slate-400 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
              últimas 200 · no se reintentan solas
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Fallaron 3 veces con un error propio del código (ej. HTTP 500). Para reintentar una:
            borrar su fila de <span className="font-mono">licitaciones_saltadas</span>.
          </p>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Código</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Motivo</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Intentos</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {saltadas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-xs text-slate-400">
                      Ninguna licitación saltada.
                    </td>
                  </tr>
                ) : (
                  saltadas.map((s) => (
                    <tr key={s.codigo} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{s.codigo}</td>
                      <td className="px-4 py-3 text-slate-700 max-w-xs truncate" title={s.nombre ?? ''}>
                        {s.nombre ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-sm">
                        <span className="font-semibold text-red-500">HTTP {s.ultimo_status ?? 'n/a'}</span>
                        {s.ultimo_error ? ` · ${s.ultimo_error}` : ''}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{s.intentos}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                        {new Date(s.saltada_en).toLocaleString('es-CL')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Tabla: Usuarios ── */}
        <section>
          <div className="flex items-baseline gap-3 mb-4">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Usuarios registrados
            </h2>
            <span className="text-xs text-slate-400 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
              {usuarios.length} en total
            </span>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Registrado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Trial</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Notificado hoy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usuarios.map((u) => {
                  const vencido = u.dias_restantes !== null && u.dias_restantes < 0
                  return (
                    <tr key={u.user_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-[#0891b2]">
                        {u.email}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                        {u.trial_inicio
                          ? new Date(u.trial_inicio).toLocaleDateString('es-CL')
                          : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {u.dias_restantes === null ? (
                          <span className="text-slate-400 text-xs">—</span>
                        ) : vencido ? (
                          <span className="text-xs font-semibold text-red-500">
                            Vencido hace {Math.abs(u.dias_restantes)}d
                          </span>
                        ) : (
                          <span className={`text-xs font-semibold ${u.dias_restantes <= 3 ? 'text-orange-500' : 'text-emerald-600'}`}>
                            {u.dias_restantes}d restantes
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.notificado_hoy ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Enviado
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-400 border border-slate-200">
                            No
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}