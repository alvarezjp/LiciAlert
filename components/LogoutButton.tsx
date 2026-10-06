'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

export default function LogoutButton() {
  const [cerrando, setCerrando] = useState(false)
  const router = useRouter()

  const handleLogout = async () => {
    setCerrando(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  /* ── Pantalla de cierre de sesión ── */
  if (cerrando) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#f0f4f8] font-sans">
        <div className="flex flex-col items-center gap-5 bg-white border border-slate-200 rounded-2xl shadow-md px-10 py-10 w-full max-w-xs text-center">

          {/* Spinner */}
          <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-[#1e6fb5] animate-spin" aria-hidden="true" />

          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#0d1b2e] flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                <rect x="2" y="3" width="18" height="16" rx="2.5" stroke="white" strokeWidth="1.6" />
                <path d="M6 8h10M6 11h7M6 14h5" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-[#0d1b2e] font-bold text-base tracking-tight">LiciAlert</span>
          </div>

          <div>
            <p className="text-slate-900 font-semibold text-base">Cerrando sesión</p>
            <p className="text-slate-400 text-sm mt-1">Hasta pronto…</p>
          </div>
        </div>
      </div>
    )
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
