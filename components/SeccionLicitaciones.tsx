'use client'

import { useMemo, useState, useTransition } from 'react'
import ListaLicitaciones from '@/components/ListaLicitaciones'

type Licitacion = {
  codigo: string
  nombre: string
  organismo: string | null
  monto_estimado: number | null
  estado: string | null
  fecha_cierre: string | null
  fecha_publicacion: string | null
  estado_usuario: 'nueva' | 'vista' | 'postulada'
}

type Orden = 'relevancia' | 'recientes'

export default function SeccionLicitaciones({
  licitaciones,
  userId,
  totalNuevas,
}: {
  licitaciones: Licitacion[]
  userId: string
  totalNuevas: number
}) {
  const [orden, setOrden] = useState<Orden>('relevancia')
  const [isPending, startTransition] = useTransition()

  const licitacionesOrdenadas = useMemo(() => {
    if (orden === 'recientes') {
      return [...licitaciones].sort(
        (a, b) =>
          new Date(b.fecha_publicacion ?? 0).getTime() -
          new Date(a.fecha_publicacion ?? 0).getTime()
      )
    }
    return licitaciones
  }, [licitaciones, orden])

  const cambiarOrden = (nuevoOrden: Orden) => {
    startTransition(() => {
      setOrden(nuevoOrden)
    })
  }

  return (
    <div className="flex-1 min-w-0 w-full">

      {/* Cabecera sección */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Licitaciones</h1>
          <p className="text-slate-500 text-sm mt-1 flex flex-wrap items-center gap-2">
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

        {/* Botones de orden */}
        <div className="flex items-center gap-2 sm:self-center shrink-0">
          <button
            onClick={() => cambiarOrden('relevancia')}
            disabled={isPending}
            className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors border cursor-pointer disabled:cursor-wait ${
              orden === 'relevancia'
                ? 'bg-[#0d1b2e] text-white border-[#0d1b2e]'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Relevancia
          </button>
          <button
            onClick={() => cambiarOrden('recientes')}
            disabled={isPending}
            className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors border cursor-pointer disabled:cursor-wait ${
              orden === 'recientes'
                ? 'bg-[#0d1b2e] text-white border-[#0d1b2e]'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Más recientes
          </button>
        </div>
      </div>

      {/* Área de lista con overlay de carga */}
      <div className="relative">
        {isPending && (
          <div className="absolute inset-0 z-10 flex items-start justify-center pt-16 bg-[#f0f4f8]/70 rounded-xl">
            <div className="flex items-center gap-2.5 bg-white border border-slate-200 shadow-sm rounded-xl px-4 py-2.5 text-sm text-slate-600">
              <svg
                className="animate-spin shrink-0 text-[#0891b2]"
                width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Ordenando licitaciones…
            </div>
          </div>
        )}
        <div className={isPending ? 'opacity-50 pointer-events-none transition-opacity' : 'transition-opacity'}>
          <ListaLicitaciones licitaciones={licitacionesOrdenadas} userId={userId} />
        </div>
      </div>

    </div>
  )
}
