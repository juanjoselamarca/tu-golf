import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { CheckCircle } from '@/components/icons'
import type { CapacityInfo } from '@/lib/data/tournaments/enrollPlayer'
import type { MotivoNoInscribible } from '@/golf/tournament-status'

/** Link de texto con área táctil de 44px (DESIGN §1) aunque el texto sea de 13px. */
export const LINK_SECUNDARIO_44: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '44px',
  fontSize: '13px',
  color: 'var(--text-2)',
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
}

/**
 * Estado honesto en lugar del botón de inscribirse (cerrado, completo, sin
 * índice, ya inscrito): título, explicación opcional y la acción que sí sirve.
 *
 * `tono="ok"` (ya inscrito): fondo verde de estado con check verde y el título en
 * `--text`. El título en `--status-live-fg` sobre el verde daba 4.42:1 en claro.
 */
export function AvisoInscripcion({
  titulo,
  detalle,
  tono = 'neutro',
  children,
}: {
  titulo: string
  detalle?: string
  tono?: 'neutro' | 'ok'
  children: ReactNode
}) {
  const ok = tono === 'ok'
  return (
    <div
      style={{
        background: ok ? 'var(--status-live-bg)' : 'var(--surface-soft)',
        border: ok ? '1px solid transparent' : '1px solid var(--surface-border)',
        borderRadius: '12px',
        padding: '20px',
        textAlign: 'center',
        marginBottom: '16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          fontSize: '15px',
          color: 'var(--text)',
          fontWeight: 600,
          marginBottom: '6px',
        }}
      >
        {ok && <CheckCircle size={18} strokeWidth={2} aria-hidden style={{ color: 'var(--status-live-fg)', flexShrink: 0 }} />}
        <span>{titulo}</span>
      </div>
      {detalle && (
        <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '14px' }}>
          {detalle}
        </div>
      )}
      {children}
    </div>
  )
}

/** Link secundario "Ver leaderboard →" al torneo. */
export function LinkVerLeaderboard({ slug }: { slug: string }) {
  return (
    <Link href={`/torneo/${slug}`} style={LINK_SECUNDARIO_44}>
      Ver leaderboard →
    </Link>
  )
}

const COPY_NO_INSCRIBIBLE: Record<MotivoNoInscribible, { titulo: string; detalle: string }> = {
  borrador: {
    titulo: 'Las inscripciones de este torneo aún no están abiertas',
    detalle: 'El organizador todavía no abrió las inscripciones. Vuelve a intentarlo más tarde.',
  },
  fecha_vencida: {
    titulo: 'La fecha de este torneo ya pasó',
    detalle: 'Las inscripciones están cerradas.',
  },
  cerrado: {
    titulo: 'Las inscripciones de este torneo están cerradas',
    detalle: 'Ya no se puede inscribir en este torneo.',
  },
}

/**
 * Guard CERO FALLOS: el torneo NO acepta auto-inscripción (`motivoNoInscribible`: borrador,
 * fecha vencida o cerrado). Estado honesto en vez de un botón que falla.
 */
export function AvisoInscripcionesCerradas({ motivo, slug }: { motivo: MotivoNoInscribible; slug: string }) {
  const { titulo, detalle } = COPY_NO_INSCRIBIBLE[motivo]
  return (
    <AvisoInscripcion
      titulo={titulo}
      detalle={detalle}
    >
      <LinkVerLeaderboard slug={slug} />
    </AvisoInscripcion>
  )
}

/**
 * Guard CERO FALLOS: el torneo llegó a su cupo. El RPC rechaza con un 409 cuyo mensaje
 * ("Amplía el cupo máximo...") está escrito para el ORGANIZADOR. Al jugador, con o sin
 * sesión, se le muestra un estado honesto ANTES.
 */
export function AvisoTorneoCompleto({ capacity, slug }: { capacity: CapacityInfo; slug: string }) {
  return (
    <AvisoInscripcion
      titulo="Torneo completo"
      detalle={capacity.maxPlayers != null
        ? `Este torneo llegó a su cupo de ${capacity.maxPlayers} jugadores. Habla con el organizador para que lo amplíe.`
        : 'Este torneo ya no admite más inscritos. Habla con el organizador.'}
    >
      <LinkVerLeaderboard slug={slug} />
    </AvisoInscripcion>
  )
}
