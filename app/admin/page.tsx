import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

// Ubicación en el proyecto: app/admin/page.tsx
// Server Component: verifica sesión + rol admin en el servidor, antes de
// renderizar cualquier dato. No hay acciones ni edición, solo lectura.

export const dynamic = 'force-dynamic' // nunca cachear: siempre datos frescos

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

type StatsLote = {
  id: string
  fecha: string
  corrida: string
  total_codigos: number
  pendientes_actuales: number
  procesados_aprox: number
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
  if (userError || !userData?.user) {
    redirect('/login') // ⚠️ ajusta si tu ruta de login se llama distinto
  }

  const { data: esAdmin, error: errorAdmin } = await supabase.rpc('es_admin_actual')
  if (errorAdmin || !esAdmin) {
    redirect('/')
  }

  const [
    { data: lic, error: errorLic },
    { data: statsUsuarios, error: errorUsuarios },
    { data: statsLotes, error: errorLotes },
    { data: statsHistorico, error: errorHistorico },
  ] = await Promise.all([
    supabase.rpc('admin_stats_licitaciones').single<StatsLicitaciones>(),
    supabase.rpc('admin_stats_usuarios'),
    supabase.rpc('admin_stats_lotes'),
    supabase.rpc('admin_stats_historico_diario'),
  ])

  if (errorLic) throw new Error('Error al cargar estadísticas de licitaciones: ' + errorLic.message)
  if (errorUsuarios) throw new Error('Error al cargar estadísticas de usuarios: ' + errorUsuarios.message)
  if (errorLotes) throw new Error('Error al cargar estadísticas de lotes: ' + errorLotes.message)
  if (errorHistorico) throw new Error('Error al cargar histórico diario: ' + errorHistorico.message)

  const stats = lic ?? { total: 0, completas: 0, cargadas_hoy: 0, cargadas_hoy_completas: 0 }
  const usuarios = (statsUsuarios ?? []) as StatsUsuario[]
  const lotes = (statsLotes ?? []) as StatsLote[]
  const historico = (statsHistorico ?? []) as StatsHistoricoDiario[]

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1>Panel de administrador</h1>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
          marginTop: 24,
        }}
      >
        <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Licitaciones totales</h2>
          <p>Total: <strong>{stats.total}</strong></p>
          <p>
            Completas: <strong>{stats.completas}</strong>{' '}
            ({stats.total > 0 ? Math.round((stats.completas / stats.total) * 100) : 0}%)
          </p>
        </div>

        <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Cargadas hoy</h2>
          <p>Hoy: <strong>{stats.cargadas_hoy}</strong></p>
          <p>Completas hoy: <strong>{stats.cargadas_hoy_completas}</strong></p>
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Lotes de enriquecimiento por corrida (últimos 14 días)</h2>
        <p style={{ color: '#888', fontSize: 14 }}>
          Cada fila es una corrida (mañana/tarde). "Procesados aprox." son los que salieron
          de la cola de pendientes — no distingue si realmente llegaron con dato o no
          (ver histórico diario abajo para esa distinción, aunque ahí ya no se puede separar por corrida).
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: 8 }}>Fecha</th>
              <th style={{ padding: 8 }}>Corrida</th>
              <th style={{ padding: 8 }}>Total códigos</th>
              <th style={{ padding: 8 }}>Procesados (aprox.)</th>
              <th style={{ padding: 8 }}>Pendientes</th>
              <th style={{ padding: 8 }}>Completado</th>
              <th style={{ padding: 8 }}>Completado en</th>
            </tr>
          </thead>
          <tbody>
            {lotes.map((l) => (
              <tr key={l.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: 8 }}>{new Date(l.fecha).toLocaleDateString('es-CL')}</td>
                <td style={{ padding: 8, textTransform: 'capitalize' }}>{l.corrida}</td>
                <td style={{ padding: 8 }}>{l.total_codigos}</td>
                <td style={{ padding: 8 }}>{l.procesados_aprox}</td>
                <td style={{ padding: 8 }}>{l.pendientes_actuales}</td>
                <td style={{ padding: 8 }}>{l.completado ? '✅' : '⏳'}</td>
                <td style={{ padding: 8 }}>
                  {l.completado_en ? new Date(l.completado_en).toLocaleString('es-CL') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Histórico diario de enriquecimiento (últimos 14 días)</h2>
        <p style={{ color: '#888', fontSize: 14 }}>
          Agregado por día completo (no separable por corrida). "Sin organismo con detalle"
          son los casos tipo bug del 16/09 — código procesado pero sin dato confirmado.
          "Sin organismo sin detalle" son los que aún no se procesan (o fallaron antes de guardar el detalle).
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: 8 }}>Fecha</th>
              <th style={{ padding: 8 }}>Total</th>
              <th style={{ padding: 8 }}>Con organismo</th>
              <th style={{ padding: 8 }}>Sin organismo (con detalle) ⚠️</th>
              <th style={{ padding: 8 }}>Sin organismo (sin detalle)</th>
            </tr>
          </thead>
          <tbody>
            {historico.map((h) => (
              <tr key={h.fecha} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: 8 }}>{new Date(h.fecha).toLocaleDateString('es-CL')}</td>
                <td style={{ padding: 8 }}>{h.total}</td>
                <td style={{ padding: 8 }}>{h.con_organismo}</td>
                <td
                  style={{
                    padding: 8,
                    color: h.sin_organismo_con_detalle > 0 ? '#c62828' : undefined,
                    fontWeight: h.sin_organismo_con_detalle > 0 ? 600 : undefined,
                  }}
                >
                  {h.sin_organismo_con_detalle}
                </td>
                <td style={{ padding: 8 }}>{h.sin_organismo_sin_detalle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Usuarios registrados ({usuarios.length})</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: 8 }}>Email</th>
              <th style={{ padding: 8 }}>Registrado</th>
              <th style={{ padding: 8 }}>Días de trial restantes</th>
              <th style={{ padding: 8 }}>Correo enviado hoy</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const vencido = u.dias_restantes !== null && u.dias_restantes < 0
              return (
                <tr key={u.user_id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: 8 }}>{u.email}</td>
                  <td style={{ padding: 8 }}>
                    {u.trial_inicio ? new Date(u.trial_inicio).toLocaleDateString('es-CL') : '—'}
                  </td>
                  <td
                    style={{
                      padding: 8,
                      color: vencido ? '#c62828' : undefined,
                      fontWeight: vencido ? 600 : undefined,
                    }}
                  >
                    {u.dias_restantes === null
                      ? '—'
                      : vencido
                      ? `Vencido hace ${Math.abs(u.dias_restantes)} días`
                      : `${u.dias_restantes} días`}
                  </td>
                  <td style={{ padding: 8 }}>{u.notificado_hoy ? '✅ Sí' : '❌ No'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </main>
  )
}