import Link from 'next/link'
import type { CoachSession } from '@/lib/data/coach-home'
import { textoPlano } from '@/lib/text/texto-plano'

const SESSION_LABELS: Record<string, string> = {
  continuous: 'Conversación continua',
  post_round: 'Análisis post-ronda',
  weekly_plan: 'Plan semanal',
  pre_tournament: 'Pre-torneo',
  free: 'Consulta libre',
  onboarding: 'Onboarding',
}

/** Lista de sesiones del coach. No pinta nada si la lista está vacía. */
export function SesionesAnteriores({ sesiones }: { sesiones: CoachSession[] }) {
  if (sesiones.length === 0) return null
  return (
    <div style={{ padding: '0 20px', marginBottom: '24px' }}>
      <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>
        Sesiones anteriores
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {sesiones.map(s => (
          <Link key={s.id} href={`/coach/sesion/${s.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '14px 16px', textDecoration: 'none' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{SESSION_LABELS[s.session_type] ?? s.session_type}</div>
              {s.next_focus && <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>Foco: {textoPlano(s.next_focus, 90)}</div>}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{new Date(s.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'America/Santiago' })}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
