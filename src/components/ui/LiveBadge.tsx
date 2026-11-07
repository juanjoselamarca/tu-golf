'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Radio } from '@/components/icons'
import { esRutaDeScoring } from '@/lib/rutas'

const SESSION_KEY = 'golfers-active-ronda'

interface ActiveRonda {
  codigo: string
  courseName: string
}

/**
 * LiveBadge Golfers+ — pill inline (NO floating) en el shell (audit 2026-04-22 P1).
 *
 * Reglas:
 * 1. NO renderizar si no hay ronda activa del usuario.
 * 2. NO usar `position: fixed` — es inline en la topbar, reserva espacio propio.
 *    (El pill viejo `LiveRoundIndicator` usaba fixed y pisaba títulos/contenido
 *    en 14 pantallas; este lo reemplaza.)
 * 3. Tap → deep-link a la ronda activa (antes era decoración estática).
 * 4. Auto-oculto en la propia ronda (ya estás ahí) y páginas /score/*.
 */
export function LiveBadge() {
  const [active, setActive] = useState<ActiveRonda | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    function read() {
      if (typeof window === 'undefined') return
      try {
        const raw = sessionStorage.getItem(SESSION_KEY)
        if (!raw) {
          setActive(null)
          return
        }
        const parsed = JSON.parse(raw) as ActiveRonda
        if (parsed?.codigo) setActive(parsed)
        else setActive(null)
      } catch {
        setActive(null)
      }
    }
    read()
    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_KEY) read()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [pathname])

  if (!active) return null

  const isInRonda = pathname?.startsWith(`/ronda-libre/${active.codigo}`)
  const isScoring = esRutaDeScoring(pathname)
  if (isInRonda || isScoring) return null

  // Wrapper incluido aquí (no en layout.tsx) para que, cuando no hay ronda
  // activa, no quede una franja vacía bajo la navbar. La franja mide 44 px
  // (py-1.5 + píldora de 32) y el área de toque del link la cubre entera
  // (before: -inset-y-1.5) sin pisar el contenido que viene debajo (§1: ≥44 px).
  // Colores: tokens --status-live-* (los mismos badges de LiveHeader), compuestos
  // sobre --bg-surface para que el verde se lea ≥4,5:1 también en claro
  // (antes text-emerald-500 sobre emerald-500/10 daba 2,21:1).
  return (
    <div className="flex justify-end px-3 py-1.5">
      <Link
        href={`/ronda-libre/${active.codigo}`}
        className="relative inline-flex items-center gap-1.5 h-8 px-3 rounded-full border transition-opacity hover:opacity-80 before:absolute before:-inset-y-1.5 before:-inset-x-2 before:content-['']"
        aria-label={`Volver a ronda en ${active.courseName}`}
        style={{
          fontFamily: 'var(--font-dm-mono), ui-monospace, monospace',
          color: 'var(--status-live-fg)',
          background: 'linear-gradient(var(--status-live-bg), var(--status-live-bg)), var(--bg-surface)',
          borderColor: 'color-mix(in srgb, var(--status-live-fg) 30%, transparent)',
        }}
      >
        <span className="relative inline-flex">
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          <span className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-current animate-ping opacity-75" />
        </span>
        <span className="text-xs font-bold tracking-wider">EN VIVO</span>
        <Radio className="w-3 h-3 sr-only" aria-hidden />
      </Link>
    </div>
  )
}

export function setActiveRondaSession(codigo: string, courseName: string) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ codigo, courseName }))
  } catch {
    // ignore
  }
}

export function clearActiveRondaSession() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}
