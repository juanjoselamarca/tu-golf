// src/app/torneo/[slug]/components/TournamentEventCard.tsx
//
// Tarjeta de informacion del evento para torneos abiertos/proximos.
// Muestra fecha formateada, lugar, formato, hoyos, cupos y jugadores inscritos.

import { getFormat, KNOWN_FORMAT_KEYS } from '@/golf/formats'

export interface TournamentEventCardProps {
  dateStart: string | null
  courseName: string | null
  courseCity: string | null
  formatoJuego: string
  modoJuego: 'gross' | 'neto'
  totalHoyos: number
  maxPlayers: number | null
  enrolledCount: number
  enrolledNames: string[]
}

function formatDatePretty(dateStr: string | null): string | null {
  if (!dateStr) return null
  // date_start viene como 'YYYY-MM-DD' — agregar mediodía para evitar
  // que el timezone local corra la fecha un día atrás.
  const d = new Date(dateStr + 'T12:00:00')
  if (isNaN(d.getTime())) return null
  const weekday = d.toLocaleDateString('es-CL', { weekday: 'long' })
  const day = d.getDate()
  const month = d.toLocaleDateString('es-CL', { month: 'long' })
  const year = d.getFullYear()
  // "Viernes 12 de diciembre 2025"
  const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  return `${cap} ${day} de ${month} ${year}`
}

function formatName(format: string): string {
  if (KNOWN_FORMAT_KEYS.includes(format)) return getFormat(format).name
  return format
}

const MODO_LABEL: Record<string, string> = { gross: 'Bruto', neto: 'Neto' }

export function TournamentEventCard({
  dateStart,
  courseName,
  courseCity,
  formatoJuego,
  modoJuego,
  totalHoyos,
  maxPlayers,
  enrolledCount,
  enrolledNames,
}: TournamentEventCardProps) {
  const datePretty = formatDatePretty(dateStart)
  const location = [courseName, courseCity].filter(Boolean).join(', ')
  const fmtName = `${formatName(formatoJuego)} ${MODO_LABEL[modoJuego] ?? ''}`

  return (
    <div
      className="dark:bg-gray-900 dark:border-gray-800"
      style={{
        maxWidth: '1080px',
        margin: '0 auto',
        padding: '0 16px',
      }}
    >
      <div
        className="dark:bg-gray-900/80 dark:border-gray-700/50"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          padding: '16px 20px',
          borderRadius: '12px',
          background: 'var(--bg-surface, #f8f9fa)',
          border: '1px solid var(--border, rgba(26,29,36,0.08))',
        }}
      >
        {/* Fecha */}
        {datePretty && (
          <InfoItem icon={<CalendarIcon />} label="Fecha" value={datePretty} />
        )}

        {/* Lugar */}
        {location && (
          <InfoItem icon={<MapPinIcon />} label="Lugar" value={location} />
        )}

        {/* Formato */}
        <InfoItem icon={<FlagIcon />} label="Formato" value={`${fmtName} · ${totalHoyos} hoyos`} />

        {/* Cupos */}
        {maxPlayers != null && (
          <InfoItem
            icon={<UsersIcon />}
            label="Cupos"
            value={`${enrolledCount}/${maxPlayers} inscritos`}
          />
        )}
        {maxPlayers == null && enrolledCount > 0 && (
          <InfoItem
            icon={<UsersIcon />}
            label="Inscritos"
            value={`${enrolledCount} jugador${enrolledCount !== 1 ? 'es' : ''}`}
          />
        )}
      </div>

      {/* Lista compacta de jugadores inscritos */}
      {enrolledNames.length > 0 && (
        <div
          className="dark:text-gray-400"
          style={{
            marginTop: '10px',
            padding: '0 4px',
            fontSize: '13px',
            color: 'var(--text-3, #6B7280)',
            lineHeight: 1.6,
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--text-2, #5a6573)' }}>Inscritos: </span>
          {enrolledNames.join(', ')}
          {enrolledCount > enrolledNames.length && (
            <span> y {enrolledCount - enrolledNames.length} mas</span>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Helpers UI ── */

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      <div
        className="dark:text-amber-500"
        style={{ color: 'var(--brand-gold, #c4992a)', marginTop: '2px', flexShrink: 0 }}
      >
        {icon}
      </div>
      <div>
        <div
          className="dark:text-gray-500"
          style={{
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-3, #94a3b8)',
            marginBottom: '2px',
          }}
        >
          {label}
        </div>
        <div
          className="dark:text-gray-200"
          style={{
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--text, #1a1d24)',
          }}
        >
          {value}
        </div>
      </div>
    </div>
  )
}

/* ── Mini iconos SVG (inline, sin dependencia) ── */

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function MapPinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function FlagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
