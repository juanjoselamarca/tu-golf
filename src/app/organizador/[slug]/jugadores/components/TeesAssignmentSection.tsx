'use client'
// components/TeesAssignmentSection.tsx
//
// Feature bug #6 inbox 25-may: el admin asigna tee por jugador.
// Visible sólo cuando alguna ronda usa mode='manual' (decisión del orquestador).
//
// Light mode (surface operativa per DESIGN.md §2).
// Patrón visual auditado contra The Grint + V-Par + Apple Settings.

import { Avatar } from '@/components/ui/Avatar'
import { ChevronDown, Loader2, Users } from '@/components/icons'
import { resolvePlayerTee, type CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import type { PlayerRow } from '@/lib/data/tournaments/players'

// Mapa nombre tee → color hex (no canónicamente exportado del módulo de colors —
// estos son los colores estándar de tees chilenos. Si no matchea cae a neutro gris).
const TEE_HEX: Record<string, string> = {
  azul:     '#1a4fd6',
  azules:   '#1a4fd6',
  blanco:   '#9ca3af',
  blancas:  '#9ca3af',
  rojo:     '#dc2626',
  rojas:    '#dc2626',
  negro:    '#0f172a',
  negras:   '#0f172a',
  dorado:   '#c4992a',
  amarillo: '#eab308',
  amarillas:'#eab308',
  verde:    '#16a34a',
}

function colorOf(nombre: string | null | undefined): string {
  if (!nombre) return '#6b7280'
  return TEE_HEX[nombre.toLowerCase()] ?? '#6b7280'
}

export interface TeesAssignmentSectionProps {
  players: PlayerRow[]
  courseTees: CourseTeeRow[]
  tournamentTeesGlobal: string | null
  loading: Set<string>
  errors: Map<string, string>
  onAssign: (playerId: string, teeId: string | null) => void
}

export function TeesAssignmentSection({
  players,
  courseTees,
  tournamentTeesGlobal,
  loading,
  errors,
  onAssign,
}: TeesAssignmentSectionProps) {
  if (courseTees.length === 0) {
    return (
      <section style={sectionStyle}>
        <h3 style={captionStyle}>Asignación de tees</h3>
        <p style={emptyStyle}>
          Esta cancha aún no tiene tees cargados. Contactá al admin de canchas o
          ejecutá la sincronización FedeGolf.
        </p>
      </section>
    )
  }

  if (players.length === 0) {
    return (
      <section style={sectionStyle}>
        <h3 style={captionStyle}>Asignación de tees</h3>
        <div style={{ ...emptyStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24 }}>
          <Users size={32} color="#6b7280" />
          <span>Inscribe jugadores en la sección de arriba. Después asigna sus tees.</span>
        </div>
      </section>
    )
  }

  return (
    <section style={sectionStyle}>
      <h3 style={captionStyle}>Asignación de tees</h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {players
          .filter(p => p.status === 'approved')
          .map(p => {
            const isLoading = loading.has(p.id)
            const hasError = errors.has(p.id)
            const r = resolvePlayerTee({
              playerTeeId: p.tee_id,
              categoryDefaultTeeColor: p.categories?.default_tee_color ?? null,
              tournamentTeesGlobal,
              courseTees,
            })
            const displayName = r.tee?.nombre ?? '—'
            const c = colorOf(r.tee?.nombre)
            const isAssigned = r.source === 'manual'
            const hcp = p.profiles?.indice

            return (
              <li
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 60,
                  padding: '14px 16px',
                  borderBottom: '1px solid rgba(0,0,0,0.06)',
                  borderLeft: hasError ? '3px solid #dc2626' : '3px solid transparent',
                  opacity: isLoading ? 0.6 : 1,
                  transition: 'opacity 200ms ease, border-left-color 300ms ease',
                }}
              >
                <Avatar name={p.profiles?.name || '?'} size="sm" />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: 'var(--font-dm-sans), sans-serif',
                    fontSize: 15,
                    color: '#111',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {p.profiles?.name || 'Jugador'}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-dm-mono), monospace',
                    fontSize: 14,
                    color: '#6b7280',
                    paddingRight: 12,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {hcp != null ? hcp.toFixed(1) : '—'}
                </span>
                <label
                  style={{
                    position: 'relative',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '10px 12px',
                    borderRadius: 999,
                    border: isAssigned ? `1px solid ${c}55` : '1px dashed rgba(0,0,0,0.2)',
                    background: isAssigned ? `${c}14` : 'transparent',
                    color: isAssigned ? c : '#6b7280',
                    fontFamily: 'var(--font-dm-sans), sans-serif',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: isLoading ? 'wait' : 'pointer',
                    minHeight: 44,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: isAssigned ? c : 'transparent',
                      border: isAssigned ? 'none' : '1.5px solid currentColor',
                      flexShrink: 0,
                    }}
                    aria-hidden
                  />
                  <span>{displayName}</span>
                  {isLoading ? (
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                  <select
                    value={p.tee_id ?? ''}
                    disabled={isLoading}
                    onChange={e => onAssign(p.id, e.target.value || null)}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      opacity: 0,
                      cursor: 'pointer',
                      appearance: 'none',
                      fontSize: 16,
                    }}
                    aria-label={`Tee de ${p.profiles?.name || 'jugador'}`}
                  >
                    <option value="">— Sin asignar (hereda) —</option>
                    {courseTees.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                        {t.yardaje_total ? `   ${t.yardaje_total} yd · slope ${t.slope ?? '—'}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            )
          })}
      </ul>
    </section>
  )
}

const sectionStyle: React.CSSProperties = {
  background: '#ffffff',
  borderRadius: 14,
  padding: '20px 16px',
  marginTop: 32,
  border: '1px solid rgba(0,0,0,0.06)',
}

const captionStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: 16,
  fontFamily: 'var(--font-dm-sans), sans-serif',
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#6b7280',
}

const emptyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: '#6b7280',
  textAlign: 'center',
  padding: 20,
}
