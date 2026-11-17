// src/app/torneo/[slug]/components/TournamentCountdown.tsx
//
// Countdown sutil para torneos con inscripciones abiertas que todavía no se juegan.
// Cuenta días calendario de Chile (`diasHastaFecha`): "Hoy", "Mañana", "Faltan N días".
// Antes restaba milisegundos contra la medianoche UTC de date_start: el día antes del
// torneo decía "Hoy" y desde las 21:00 de Chile del día anterior desaparecía. Las horas
// ("y M horas") se calculaban contra esa medianoche UTC, no contra la hora de salida.

import { estadoDelTorneo, diasHastaFecha } from '@/golf/tournament-live-status'

export interface TournamentCountdownProps {
  dateStart: string | null
  dateEnd: string | null
  status: string | null
}

/** Texto del countdown, o null si no corresponde mostrarlo. Exportado para test. */
export function textoCountdown(p: TournamentCountdownProps, ahora: Date): string | null {
  if (p.status !== 'open') return null
  if (estadoDelTorneo({ status: p.status, date_start: p.dateStart, date_end: p.dateEnd }, ahora) !== 'por_jugar') return null
  const dias = diasHastaFecha(p.dateStart, ahora)
  if (dias == null || dias < 0) return null
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Mañana'
  return `Faltan ${dias} días`
}

export function TournamentCountdown(props: TournamentCountdownProps) {
  const label = textoCountdown(props, new Date())
  if (!label) return null

  return (
    <div
      style={{
        maxWidth: '1080px',
        margin: '0 auto',
        padding: '8px 16px 0',
        fontSize: '13px',
        color: 'var(--text-3)',
        fontFamily: "var(--font-dm-sans, 'DM Sans', system-ui, sans-serif)",
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0, opacity: 0.7 }}
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      {label}
    </div>
  )
}
