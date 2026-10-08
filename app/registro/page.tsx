import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import RegistroForm from '@/components/RegistroForm'

export const dynamic = 'force-dynamic'

export default async function RegistroPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: esAdmin } = await supabase.rpc('es_admin_actual')
  if (!esAdmin) redirect('/')

  return (
    <div className="min-h-screen bg-[#f0f4f8] font-sans">
      <header className="bg-[#0d1b2e]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-white font-bold">LiciAlert</span>
          <a href="/admin" className="text-[#94bcd8] hover:text-white text-sm transition-colors">
            Volver al panel
          </a>
        </div>
      </header>
      <main className="flex justify-center px-6 py-12">
        <RegistroForm />
      </main>
    </div>
  )
}