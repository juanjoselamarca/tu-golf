'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import CopyLinkButton from '@/components/CopyLinkButton'
import QRModal from '@/components/QRModal'

interface Props {
  slug: string
  isActive: boolean
}

export default function TournamentCardMenu({ slug, isActive }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      {/* Boton ancho oculto en mobile — en pantallas chicas pisaba el nombre y
          la cancha de la card en /mi-golf > Organizando (inbox 63f38687). El
          link al torneo sigue accesible via el name de la card (es <Link>).
          En el menu "..." de abajo agregamos tambien Ver torneo para parity. */}
      <Link href={`/torneo/${slug}`} className="hidden sm:inline-flex" style={{
        background: 'var(--brand)', color: 'var(--brand-dark)', borderRadius: '10px',
        padding: '10px 18px', fontWeight: 600, fontSize: '14px',
        textDecoration: 'none', whiteSpace: 'nowrap',
      }}>
        Ver torneo →
      </Link>

      <div ref={ref} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            width: '44px', height: '44px', borderRadius: '10px',
            border: '1px solid var(--border-md)', background: 'var(--bg-card-light)',
            cursor: 'pointer', fontSize: '18px', color: 'var(--text-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 0, minWidth: 0,
          }}
          aria-label="Más opciones"
        >
          ···
        </button>

        {open && (
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 4px)',
            background: 'var(--bg-card-light)', border: '1px solid var(--border)',
            borderRadius: '10px', boxShadow: 'var(--shadow-md)',
            minWidth: '180px', zIndex: 20, overflow: 'hidden',
          }}>
            <Link href={`/torneo/${slug}`} onClick={() => setOpen(false)}
              className="sm:hidden"
              style={{ display: 'block', padding: '12px 16px', fontSize: '14px', color: 'var(--brand)', fontWeight: 600, textDecoration: 'none', borderBottom: '1px solid var(--border)' }}>
              Ver torneo →
            </Link>
            <Link href={`/organizador/${slug}/editar`} onClick={() => setOpen(false)}
              style={{ display: 'block', padding: '12px 16px', fontSize: '14px', color: 'var(--text)', textDecoration: 'none' }}>
              Editar
            </Link>
            <Link href={`/organizador/${slug}/jugadores`} onClick={() => setOpen(false)}
              style={{ display: 'block', padding: '12px 16px', fontSize: '14px', color: 'var(--text)', textDecoration: 'none', borderTop: '1px solid var(--border)' }}>
              Jugadores
            </Link>
            {isActive && (
              <Link href={`/organizador/${slug}/scoring`} onClick={() => setOpen(false)}
                style={{ display: 'block', padding: '12px 16px', fontSize: '14px', color: 'var(--brand)', fontWeight: 600, textDecoration: 'none', borderTop: '1px solid var(--border)' }}>
                Scoring
              </Link>
            )}
            <div style={{ borderTop: '1px solid var(--border)', padding: '8px 16px', display: 'flex', gap: '8px' }}>
              <CopyLinkButton slug={slug} />
              <QRModal slug={slug} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
