'use client'

import Link from 'next/link'

interface Props {
  currentHandicap: number | null
  targetHandicap: number | null
  targetDeadline: string | null
}

function fmtDeadline(d: string | null): string | null {
  if (!d) return null
  const date = new Date(d + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

const mono = { fontFamily: 'var(--font-dm-mono)' } as const

export function MetaResumen({ currentHandicap, targetHandicap, targetDeadline }: Props) {
  const hcp = currentHandicap != null ? currentHandicap.toFixed(1) : '—'

  if (targetHandicap == null) {
    return (
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--line)', borderRadius: '8px', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px' }}>
        <div>
          <div style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600, marginBottom: '4px' }}>
            Hándicap actual
          </div>
          <div style={{ ...mono, fontSize: '28px', fontWeight: 600, color: 'var(--text)', lineHeight: 1 }}>{hcp}</div>
        </div>
        <Link href="/coach" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--brand-on-bg, #8A6A16)', textDecoration: 'none', textAlign: 'right', lineHeight: 1.4, maxWidth: '150px' }}>
          Fijá tu meta con el coach para medir el avance →
        </Link>
      </div>
    )
  }

  const delta = currentHandicap != null ? currentHandicap - targetHandicap : null
  const deadline = fmtDeadline(targetDeadline)

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--line)', borderRadius: '8px', padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600, marginBottom: '4px' }}>Hoy</div>
          <div style={{ ...mono, fontSize: '28px', fontWeight: 600, color: 'var(--text)', lineHeight: 1 }}>{hcp}</div>
        </div>
        <div style={{ color: 'var(--text-3)', fontSize: '20px', paddingBottom: '2px' }}>→</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--coach-recovery-high)', fontWeight: 700, marginBottom: '4px' }}>Meta</div>
          <div style={{ ...mono, fontSize: '28px', fontWeight: 600, color: 'var(--coach-recovery-high)', lineHeight: 1 }}>{targetHandicap.toFixed(1)}</div>
        </div>
      </div>
      <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-2)' }}>
        <span>
          {delta != null && delta > 0 ? (
            <><strong style={{ ...mono, color: 'var(--text)' }}>{delta.toFixed(1)}</strong> puntos para tu objetivo</>
          ) : (
            <strong style={{ color: 'var(--coach-recovery-high)' }}>Estás en tu meta.</strong>
          )}
        </span>
        {deadline && <span style={{ color: 'var(--text-3)' }}>antes de {deadline}</span>}
      </div>
    </div>
  )
}
