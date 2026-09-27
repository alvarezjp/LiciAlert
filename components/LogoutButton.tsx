'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

export default function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="inline-flex items-center gap-2 px-4 py-1 text-[#94bcd8] hover:text-white transition-colors text-sm cursor-pointer"
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M6 3H3a1 1 0 00-1 1v8a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M11 5l3 3-3 3M14 8H7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Cerrar sesión
    </button>
  )
}
