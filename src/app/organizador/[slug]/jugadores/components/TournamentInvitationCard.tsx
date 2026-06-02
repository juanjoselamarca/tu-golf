'use client'

import { useState } from 'react'

interface Props {
  slug: string
  codigo: string
}

/** Tarjeta de invitación: copiar link de unirse + código del torneo.
 *  El estado de feedback de copiado es local (presentacional). */
export function TournamentInvitationCard({ slug, codigo }: Props) {
  const [codeCopied, setCodeCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-md)',
        borderRadius: '16px',
        boxShadow: 'var(--shadow-card)',
        padding: '24px 28px',
        marginBottom: '24px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '12px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
        Invitar jugadores
      </div>

      {/* Copy link button - primary action */}
      <button
        type="button"
        onClick={() => {
          const link = `${window.location.origin}/torneo/${slug}/unirse`
          navigator.clipboard.writeText(link).then(() => {
            setLinkCopied(true)
            setTimeout(() => setLinkCopied(false), 2500)
          })
        }}
        style={{
          background: linkCopied ? 'rgba(34,197,94,0.15)' : '#c4992a',
          border: linkCopied ? '1px solid rgba(34,197,94,0.4)' : '1px solid #c4992a',
          color: linkCopied ? '#22c55e' : 'var(--brand-dark)',
          padding: '12px 28px',
          borderRadius: '10px',
          fontSize: '15px',
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'all 200ms',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '14px',
        }}
      >
        {linkCopied ? 'Link copiado!' : 'Copiar link de invitacion'}
      </button>

      {/* Code reference - secondary */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>Codigo:</span>
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--brand-on-bg)',
            letterSpacing: '0.1em',
          }}
        >
          {codigo}
        </span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(codigo).then(() => {
              setCodeCopied(true)
              setTimeout(() => setCodeCopied(false), 2000)
            })
          }}
          style={{
            background: 'none',
            border: 'none',
            color: codeCopied ? '#22c55e' : 'var(--text-2)',
            padding: '2px 6px',
            fontSize: '12px',
            cursor: 'pointer',
            textDecoration: 'underline',
            textUnderlineOffset: '2px',
          }}
        >
          {codeCopied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
    </div>
  )
}
