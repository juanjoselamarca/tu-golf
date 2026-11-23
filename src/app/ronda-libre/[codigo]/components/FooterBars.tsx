// Bloques chicos del pie de la vista live: info admin, links post-ronda,
// barra admin "volver a scorear", banner de registro. Verbatim del monolito.
'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ClipboardList } from '@/components/icons'
import { registerUrl } from '@/lib/auth/login-url'

/** Banner informativo cuando un admin lleva el score del grupo. */
export function AdminInfoBanner({ adminPlayerName }: { adminPlayerName: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      background: 'rgba(196,153,42,0.08)', border: '1px solid rgba(196,153,42,0.2)',
      borderRadius: '12px', padding: '12px 16px', marginBottom: '16px',
    }}>
      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}><ClipboardList size={18} /></span>
      <span style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.4 }}>
        <strong style={{ color: 'var(--text)' }}>{adminPlayerName}</strong> lleva el score del grupo
      </span>
    </div>
  )
}

/** Links post-ronda (ver estadísticas) — para rondas finalizadas. */
export function PostRondaLinks({ isAnonymous, onRequireAuth }: { isAnonymous: boolean; onRequireAuth: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginTop: '8px', paddingBottom: '24px' }}>
      {isAnonymous ? (
        <button
          onClick={onRequireAuth}
          style={{
            background: 'none', border: 'none',
            color: 'var(--brand-on-bg)', textDecoration: 'none', fontSize: '15px',
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          Ver mis estadísticas →
        </button>
      ) : (
        <Link
          href="/perfil/stats"
          style={{
            color: 'var(--brand-on-bg)', textDecoration: 'none', fontSize: '15px',
            fontWeight: 600,
          }}
        >
          Ver mis estadísticas →
        </Link>
      )}
    </div>
  )
}

/**
 * Pie fijo abajo de la pantalla para las barras de esta vista, que RESERVA su alto al final de la página: sin eso las
 * barras flotaban sobre lo último (el pie del sitio con Términos y Privacidad, "Copiar link") y no se podía ver.
 *
 * El alto se mide (cambia con el texto y el ancho) y se suma como `padding-bottom` del `body`, porque el pie del sitio
 * vive en el layout, fuera de esta página. No se usa `position: sticky`: `html, body { overflow-x: hidden }`
 * (globals.css) hace del body un contenedor de scroll y el sticky nunca se pega a la pantalla.
 */
/**
 * Uno más que la barra de navegación de abajo (Navbar, z-index 100, archivo protegido): le gana sin depender del
 * orden en el DOM, y "Volver a scorear" / "Continuar marcando" (solo con sesión, donde esa barra siempre está)
 * quedan tocables. Con 50 el nav los tapaba. Los modales (AuthModal, Z_OVERLAY 250) siguen por encima.
 */
const Z_PIE_FIJO = 101

export function PieFijo({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [alto, setAlto] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setAlto(Math.ceil(el.getBoundingClientRect().height))
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (alto <= 0) return
    const antes = document.body.style.paddingBottom
    document.body.style.paddingBottom = `${alto}px`
    return () => { document.body.style.paddingBottom = antes }
  }, [alto])

  return <div ref={ref} style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: Z_PIE_FIJO }}>{children}</div>
}

/** Barra con el botón para ir a anotar (va dentro de `PieFijo`). */
function BarraParaAnotar({ href, children }: { href: string; children: ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', borderTop: '1px solid var(--border)',
      padding: '12px 20px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
      display: 'flex', justifyContent: 'center',
    }}>
      <Link href={href} style={{
        background: 'var(--brand)', color: 'var(--brand-dark)', fontWeight: 700,
        fontSize: '15px', padding: '14px 32px', borderRadius: '12px',
        textDecoration: 'none', textAlign: 'center', width: '100%', maxWidth: '400px',
        display: 'block',
      }}>
        {children}
      </Link>
    </div>
  )
}

/** Barra "Volver a scorear" para el admin de la ronda en curso. */
export function AdminScoringBar({ codigo }: { codigo: string }) {
  return <BarraParaAnotar href={`/ronda-libre/${codigo}/score-grupo`}>Volver a scorear</BarraParaAnotar>
}

/** Barra "Continuar marcando" para jugadores (no-admin) en ronda individual en curso. */
export function PlayerScoringBar({ codigo }: { codigo: string }) {
  return <BarraParaAnotar href={`/ronda-libre/${codigo}/score`}>Continuar marcando</BarraParaAnotar>
}

/**
 * Un celular por equipo: cualquiera que llegue a la ronda en vivo puede ir a anotar su equipo (el scorer de grupo le
 * pide elegir uno, o lo lleva al que ya anota; sin sesión, al login y de vuelta).
 */
export function TeamScoringBar({ codigo }: { codigo: string }) {
  return <BarraParaAnotar href={`/ronda-libre/${codigo}/score-grupo`}>Anotar mi equipo</BarraParaAnotar>
}

/** Banner de registro para espectadores anónimos (tras 8s o scroll; va dentro de `PieFijo`). */
export function RegistrationBanner({ codigo, onDismiss }: { codigo: string; onDismiss: () => void }) {
  return (
    <div style={{
      // Superficie del tema (antes blanco fijo: en oscuro el texto claro no se leía).
      background: 'var(--bg-surface)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      borderTop: '1px solid var(--border)',
      padding: '14px 16px',
      paddingBottom: 'calc(14px + env(safe-area-inset-bottom))',
      animation: 'slideUpBanner 0.4s ease-out',
    }}>
      <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
            Registra tu propio score
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>
            Crea tu cuenta gratis y juega con Golfers+
          </div>
        </div>
        <Link
          href={registerUrl(`/ronda-libre/${codigo}`)}
          style={{
            background: 'var(--brand)', color: 'var(--brand-dark)', fontWeight: 700,
            fontSize: '13px', padding: '10px 18px', borderRadius: '8px', minHeight: '44px',
            display: 'inline-flex', alignItems: 'center',
            textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          Unirme gratis
        </Link>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onDismiss}
          style={{
            background: 'none', border: 'none', color: 'var(--text-2)',
            fontSize: '20px', cursor: 'pointer', padding: '4px 8px',
            flexShrink: 0, minHeight: '44px', minWidth: '44px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}
