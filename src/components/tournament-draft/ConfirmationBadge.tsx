'use client'

// src/components/tournament-draft/ConfirmationBadge.tsx
//
// Badge "Confirmá" reutilizable que se planta al lado de un campo cuando la IA
// (o el sistema) marcó ese campo como needs_confirmation. Click → callback
// opcional para que el editor lo saque de pending_confirmations.
//
// Diseño:
// - Pill amarillo soft, borde más fuerte (var(--brand)).
// - Pequeño (text-xs) para no robar atención.
// - Tooltip nativo con el field path para debug.
// - Cero hardcodes de color — usa tokens.

import { type MouseEventHandler } from 'react'

export interface ConfirmationBadgeProps {
  /**
   * El field path que marcó la IA (ej. "team_config.handicap_pct"). Va al
   * tooltip nativo para debug, no se muestra inline (el organizador no
   * tiene por qué ver dot-paths).
   */
  fieldPath: string
  /**
   * Texto visible del badge. Default 'Confirmá'.
   * Se permite override por si el editor quiere personalizar
   * (ej. 'Revisá', 'Falta').
   */
  label?: string
  /**
   * Callback al hacer click. Lo típico es que el editor llame a
   * `removePendingConfirmation(fieldPath)` y haga focus en el campo real.
   *
   * Si no se pasa, el badge se renderiza como display-only (no clickable,
   * sin cursor pointer).
   */
  onConfirm?: (fieldPath: string) => void
  /** className extra. */
  className?: string
}

/**
 * Pill amarillo "Confirmá".
 *
 * Uso típico desde el editor:
 *   {config.pending_confirmations.includes('format') && (
 *     <ConfirmationBadge
 *       fieldPath="format"
 *       onConfirm={(fp) => removePending(fp)}
 *     />
 *   )}
 */
export function ConfirmationBadge({
  fieldPath,
  label = 'Confirmá',
  onConfirm,
  className,
}: ConfirmationBadgeProps) {
  const clickable = typeof onConfirm === 'function'

  const handleClick: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation()
    onConfirm?.(fieldPath)
  }

  const baseCls = [
    'tdraft-confirmation-badge',
    clickable ? 'tdraft-confirmation-badge--clickable' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  // Renderizamos siempre <button> para a11y (focusable, kbd). Si no es
  // clickable, le ponemos `tabIndex={-1}` y `aria-disabled`.
  return (
    <>
      <button
        type="button"
        className={baseCls}
        onClick={clickable ? handleClick : undefined}
        title={`Confirmá: ${fieldPath}`}
        aria-label={`Confirmá el campo ${fieldPath}`}
        aria-disabled={!clickable}
        tabIndex={clickable ? 0 : -1}
      >
        <svg
          className="tdraft-confirmation-badge__icon"
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden
        >
          <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.4" />
          <path d="M5 3v2.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="5" cy="7" r="0.7" fill="currentColor" />
        </svg>
        <span>{label}</span>
      </button>
      <style jsx>{`
        .tdraft-confirmation-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 999px;
          font-family: var(--font-dm-sans);
          font-size: 11px;
          font-weight: 600;
          line-height: 1.4;
          letter-spacing: 0.02em;
          background-color: rgba(196, 153, 42, 0.14);
          color: var(--brand-on-bg);
          border: 1px solid rgba(196, 153, 42, 0.4);
          cursor: default;
          transition: background-color 150ms ease, border-color 150ms ease, transform 80ms ease;
          user-select: none;
          white-space: nowrap;
        }
        .tdraft-confirmation-badge--clickable {
          cursor: pointer;
        }
        .tdraft-confirmation-badge--clickable:hover {
          background-color: rgba(196, 153, 42, 0.24);
          border-color: rgba(196, 153, 42, 0.65);
        }
        .tdraft-confirmation-badge--clickable:active {
          transform: scale(0.97);
        }
        .tdraft-confirmation-badge:focus-visible {
          outline: 2px solid var(--brand);
          outline-offset: 2px;
        }
        :global([data-theme='dark']) .tdraft-confirmation-badge {
          background-color: rgba(196, 153, 42, 0.22);
          color: #fcd34d;
          border-color: rgba(196, 153, 42, 0.55);
        }
        :global([data-theme='dark']) .tdraft-confirmation-badge--clickable:hover {
          background-color: rgba(196, 153, 42, 0.32);
        }
        .tdraft-confirmation-badge__icon {
          flex-shrink: 0;
          opacity: 0.85;
        }
      `}</style>
    </>
  )
}

/**
 * Helper: lista inline de ConfirmationBadges desde un array de field paths.
 * Útil dentro de un mensaje del asistente para mostrar "campos por confirmar:".
 */
export interface ConfirmationBadgeListProps {
  fieldPaths: string[]
  onConfirm?: (fieldPath: string) => void
  /** Label del primer prefix (default: "Por confirmar:"). */
  prefix?: string
  className?: string
}

export function ConfirmationBadgeList({
  fieldPaths,
  onConfirm,
  prefix = 'Por confirmar:',
  className,
}: ConfirmationBadgeListProps) {
  if (!fieldPaths.length) return null
  return (
    <div className={['tdraft-confirmation-list', className ?? ''].filter(Boolean).join(' ')}>
      <span className="tdraft-confirmation-list__prefix">{prefix}</span>
      <span className="tdraft-confirmation-list__badges">
        {fieldPaths.map((fp) => (
          <ConfirmationBadge
            key={fp}
            fieldPath={fp}
            label={humanizeFieldPath(fp)}
            onConfirm={onConfirm}
          />
        ))}
      </span>
      <style jsx>{`
        .tdraft-confirmation-list {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          font-family: var(--font-dm-sans);
          font-size: 12px;
          color: var(--text-2);
        }
        .tdraft-confirmation-list__prefix {
          font-weight: 500;
        }
        .tdraft-confirmation-list__badges {
          display: inline-flex;
          flex-wrap: wrap;
          gap: 4px;
        }
      `}</style>
    </div>
  )
}

/**
 * Traduce dot-paths del config a labels legibles en español.
 * No es exhaustivo — para paths desconocidos cae al último segmento.
 */
function humanizeFieldPath(path: string): string {
  const map: Record<string, string> = {
    'format': 'formato',
    'modo': 'modo',
    'use_handicap': 'handicap',
    'name': 'nombre',
    'date_start': 'fecha',
    'cover_image_url': 'foto',
    'team_config': 'equipos',
    'team_config.size': 'tamaño equipo',
    'team_config.handicap_pct': '% handicap',
    'team_config.formation_mode': 'armado equipos',
    'team_config.min_drives_per_player': 'mín. drives',
    'match_play_config': 'match play',
    'match_play_config.bracket_mode': 'bracket',
    'match_play_config.handicap_diff': 'diferencia HCP',
    'stableford_config': 'stableford',
    'stableford_config.points_table': 'tabla puntos',
    'categories': 'categorías',
    'rounds': 'rondas',
    'registration': 'inscripción',
    'registration.mode': 'modo inscripción',
    'registration.code': 'código',
    'registration.deadline': 'deadline',
    'registration.max_players': 'cupo máx.',
    'prizes': 'premios',
    'is_practice': 'práctica',
  }
  if (map[path]) return map[path]
  // path con índice tipo "rounds.0.course_id"
  const lastSegment = path.split('.').pop() ?? path
  return map[lastSegment] ?? lastSegment.replace(/_/g, ' ')
}
