'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'

export type EstadoRegistro = { error?: string; ok?: string } | null

export async function crearUsuario(
  _prev: EstadoRegistro,
  formData: FormData
): Promise<EstadoRegistro> {
  // 1) Re-verificar admin EN EL SERVIDOR (nunca confiar en el cliente)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { data: esAdmin } = await supabase.rpc('es_admin_actual')
  if (!esAdmin) return { error: 'No autorizado' }

  // 2) Validar datos
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  if (!email) return { error: 'Ingresa un correo.' }
  if (password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres.' }

  // 3) Crear usuario con la API de administración
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // queda confirmado, puede entrar de inmediato
  })

  if (error) return { error: error.message }
  return { ok: `Usuario ${email} creado. Entrégale sus credenciales.` }
}