'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Radio } from '@/components/icons'

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
  const isScoring = pathname?.includes('/score')
  if (isInRonda || isScoring) return null

  return (
    <Link
      href={`/ronda-libre/${active.codigo}`}
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
      aria-label={`Volver a ronda en ${active.courseName}`}
      style={{ fontFamily: 'var(--font-dm-mono), ui-monospace, monospace' }}
    >
      <span className="relative inline-flex">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping opacity-75" />
      </span>
      <span className="text-[10px] font-bold text-emerald-500 tracking-wider">EN VIVO</span>
      <Radio className="w-3 h-3 text-emerald-500 sr-only" aria-hidden />
    </Link>
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
