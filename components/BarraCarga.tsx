'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

// Escucha cambios de ruta y muestra una barra de progreso en la parte superior
function BarraCargaInterna() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [visible, setVisible] = useState(false)
  const [ancho, setAncho] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cada vez que cambia la URL (pathname o searchParams) se dispara la barra
  useEffect(() => {
    // Limpiar timers anteriores
    if (timerRef.current) clearTimeout(timerRef.current)
    if (animRef.current) clearInterval(animRef.current)

    // Arrancar: mostrar barra desde 0 → 80% de forma progresiva
    setAncho(0)
    setVisible(true)

    // Avanzar hasta ~80% suavemente
    let progreso = 0
    animRef.current = setInterval(() => {
      progreso += Math.random() * 12 + 4
      if (progreso >= 80) {
        progreso = 80
        if (animRef.current) clearInterval(animRef.current)
      }
      setAncho(progreso)
    }, 120)

    // Completar al 100% y ocultar tras un breve delay
    timerRef.current = setTimeout(() => {
      if (animRef.current) clearInterval(animRef.current)
      setAncho(100)
      setTimeout(() => setVisible(false), 300)
    }, 600)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (animRef.current) clearInterval(animRef.current)
    }
  }, [pathname, searchParams])

  if (!visible) return null

  return (
    <div
      role="progressbar"
      aria-label="Cargando"
      aria-valuenow={ancho}
      className="fixed top-0 left-0 z-[9999] h-[3px] transition-all duration-200 ease-out"
      style={{
        width: `${ancho}%`,
        background: 'linear-gradient(90deg, #38bdf8, #0891b2)',
        opacity: ancho >= 100 ? 0 : 1,
        transition: ancho >= 100
          ? 'width 150ms ease-out, opacity 300ms ease-out'
          : 'width 200ms ease-out',
      }}
    />
  )
}

// Suspense obligatorio porque useSearchParams requiere límite de Suspense
export default function BarraCarga() {
  return (
    <Suspense fallback={null}>
      <BarraCargaInterna />
    </Suspense>
  )
}
