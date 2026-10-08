'use client'

import { useActionState } from 'react'
import { crearUsuario, type EstadoRegistro } from '@/app/registro/actions'

export default function RegistroForm() {
  const [estado, accion, pendiente] = useActionState<EstadoRegistro, FormData>(crearUsuario, null)

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-md border border-slate-200 px-9 py-10">
      <h1 className="text-2xl font-bold text-[#0d1b2e] tracking-tight">Crear usuario</h1>
      <p className="text-slate-500 text-sm mt-1 mb-7">
        El usuario tendrá 7 días de prueba desde su creación.
      </p>

      <form action={accion} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">Correo electrónico</label>
          <input
            id="email" name="email" type="email" required autoComplete="off"
            placeholder="cliente@empresa.cl"
            className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#38bdf8] transition"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">Contraseña inicial</label>
          <input
            id="password" name="password" type="text" required minLength={6} autoComplete="off"
            placeholder="Mínimo 6 caracteres"
            className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#38bdf8] transition"
          />
        </div>

        {estado?.error && (
          <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-3 text-sm text-red-600">
            {estado.error}
          </p>
        )}
        {estado?.ok && (
          <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-3 text-sm text-emerald-700">
            {estado.ok}
          </p>
        )}

        <button
          type="submit" disabled={pendiente}
          className="w-full py-3.5 rounded-lg bg-[#0d1b2e] hover:bg-[#1a3a5c] text-white font-semibold transition-colors disabled:opacity-60"
        >
          {pendiente ? 'Creando…' : 'Crear usuario'}
        </button>
      </form>
    </div>
  )
}