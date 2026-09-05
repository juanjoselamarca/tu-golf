// src/app/torneo/[slug]/components/TournamentCountdown.tsx
//
// Countdown sutil para torneos abiertos con fecha futura.
// Formato humano: >7d → "Faltan N días", <7d → "Faltan N días y M horas",
// <24h → "Mañana" o "Hoy".

export interface TournamentCountdownProps {
  dateStart: string | null
  status: string | null
}

export function TournamentCountdown({ dateStart, status }: TournamentCountdownProps) {
  if (!dateStart) return null
  if (status !== 'open') return null

  const now = new Date()
  const target = new Date(dateStart)
  const diffMs = target.getTime() - now.getTime()

  // Fecha ya pasó — no mostrar nada
  if (diffMs <= 0) return null

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const remainingHours = diffHours - diffDays * 24

  let label: string
  if (diffHours < 1) {
    label = 'Comienza pronto'
  } else if (diffHours < 24) {
    label = 'Hoy'
  } else if (diffHours < 48) {
    label = 'Mañana'
  } else if (diffDays <= 7) {
    label = remainingHours > 0
      ? `Faltan ${diffDays} días y ${remainingHours} hora${remainingHours !== 1 ? 's' : ''}`
      : `Faltan ${diffDays} días`
  } else {
    label = `Faltan ${diffDays} días`
  }

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
