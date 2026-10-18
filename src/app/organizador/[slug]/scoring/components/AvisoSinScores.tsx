'use client'

import Link from 'next/link'
import { tournamentStatusLabel, type MotivoSinScores } from '@/golf/tournament-status'

/**
 * Por qué el organizador no puede anotar en este torneo, y qué hacer. Sólo ofrece reabrir cuando se puede: el
 * servidor reabre únicamente un torneo 'closed' (`reopenTournamentAction`); uno publicado no tiene vuelta atrás.
 */
export function AvisoSinScores({ motivo, status, slug }: {
  motivo: MotivoSinScores
  status: string | null
  slug: string
}) {
  const noEmpezo = motivo === 'no_empezo'
  const reabrible = status === 'closed'
  const titulo = noEmpezo ? 'El torneo todavía no empieza' : reabrible ? 'Torneo cerrado' : tournamentStatusLabel(status, 'organizer')
  const detalle = noEmpezo
    ? 'Inícialo desde Jugadores para anotar scores.'
    : reabrible
      ? 'Las tarjetas son solo lectura. Si necesitas corregir un score, reábrelo desde Jugadores.'
      : 'Ya no acepta scores. Las tarjetas son solo lectura.'
  const conAccion = noEmpezo || reabrible

  return (
    <div role="status" style={{
      background: 'var(--card-bg)', border: '1px solid var(--surface-border)', borderRadius: '14px',
      padding: noEmpezo ? '40px 24px' : '20px 24px', marginBottom: noEmpezo ? 0 : '16px',
      textAlign: 'center', color: 'var(--text-2)',
    }}>
      <div style={{ fontSize: '16px', color: 'var(--text)', marginBottom: '6px' }}>{titulo}</div>
      <div style={{ fontSize: '13px', marginBottom: conAccion ? '20px' : 0 }}>{detalle}</div>
      {conAccion && (
        <Link href={`/organizador/${slug}/jugadores`}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: '44px', padding: '10px 24px', borderRadius: '8px', background: 'rgba(196,153,42,0.12)', color: 'var(--brand-on-bg)', border: '1px solid rgba(196,153,42,0.3)', fontSize: '14px', fontWeight: 600, textDecoration: 'none' }}>
          Ir a Jugadores
        </Link>
      )}
    </div>
  )
}
