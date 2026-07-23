// src/components/torneo/TorneoHeader.tsx
//
// Cabecera de torneo CANÓNICA — fuente única de la identidad visual del torneo
// (nombre + cancha + hoyos + formato + estado) en todas las superficies:
// /torneo/[slug], /torneo/[slug]/en-vivo, organizador/scoring, ronda-libre.
//
// Un solo componente con dos estados (decisión PM 21-jul):
//  - EN VIVO (tone === 'live') → bloque navy "broadcast" (energía de transmisión,
//    el look PGA que la calle valoró), reusa `--brand-dark`.
//  - borrador / finalizado → editorial claro con filete dorado.
//
// NO reinventa conceptos: el label + tono del estado vienen de la fuente única
// `tournament-status.ts` (audiencia player/organizer, tokens theme-aware) y el
// nombre del formato de `src/golf/formats` (getFormat().name). Ver
// [[feedback_un_concepto_una_fuente]].

import type { ReactNode } from 'react'
import { getFormat, KNOWN_FORMAT_KEYS } from '@/golf/formats'
import { tournamentStatusBadge, tournamentStatusTone } from '@/golf/tournament-status'
import type { StatusAudience } from '@/golf/tournament-status'

const MODO_LABEL: Record<'gross' | 'neto', string> = { gross: 'Bruto', neto: 'Neto' }

export interface TorneoHeaderProps {
  name: string
  format: string
  modo: 'gross' | 'neto'
  status: string | null | undefined
  courseName?: string | null
  holeCount?: number | null
  /** Ej. "20 jul". Fecha ya formateada por el caller. */
  dateStr?: string | null
  /** Línea auxiliar chica bajo la meta (ej. "recién actualizado" en en-vivo). */
  note?: string | null
  /** Vocabulario del estado: el jugador y el organizador no leen lo mismo. */
  audience?: StatusAudience
  /** Slot opcional a la derecha (acciones). En vivo suele ir el chip solo. */
  right?: ReactNode
  /**
   * Override de "en vivo" (decide V2 navy vs V1 claro). Por defecto se deriva del
   * tono del estado (`in_progress`). Los callers con noción de fecha (ej. /torneo
   * usa `torneoEnVivo(status, fechas)`) lo pasan explícito para que la cabecera
   * coincida con el resto de la página — un torneo in_progress pero pasado de
   * fecha no debe verse "en vivo" en un lado y cerrado en otro.
   */
  live?: boolean
}

function metaLine(p: TorneoHeaderProps): string {
  // Guardar el lookup: getFormat() dispara captureError sobre keys desconocidas y
  // este componente re-renderiza en cada tick de lastUpdate. Solo resolvemos vía la
  // fuente canónica si la key es válida; si no, mostramos el valor crudo sin ruido.
  const formatName = KNOWN_FORMAT_KEYS.includes(p.format) ? getFormat(p.format).name : p.format
  return [
    p.courseName || null,
    p.holeCount ? `${p.holeCount} hoyos` : null,
    `${formatName} ${MODO_LABEL[p.modo]}`.trim(),
    p.dateStr || null,
  ].filter(Boolean).join('  ·  ')
}

/** Chip de estado canónico. `onDark` fuerza el verde brillante sobre el navy
 *  (los tokens `--status-*` están calibrados para superficies claras). */
function StatusChip({ label, bg, fg, tone, onDark }: { label: string; bg: string; fg: string; tone: string; onDark?: boolean }) {
  const liveDark = onDark && tone === 'live'
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
        padding: '5px 11px', borderRadius: '999px',
        fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em',
        fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
        background: liveDark ? 'rgba(74,222,128,0.14)' : bg,
        color: liveDark ? '#4ade80' : fg,
      }}
    >
      {tone === 'live' && (
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'currentColor' }} />
      )}
      {label}
    </span>
  )
}

export function TorneoHeader(props: TorneoHeaderProps) {
  const { name, status, audience = 'player', note, right } = props
  const tone = tournamentStatusTone(status)
  const badge = tournamentStatusBadge(status, audience)
  // "en vivo" (V2 navy) = override explícito del caller, o el tono del estado.
  const isNavy = props.live ?? (tone === 'live')
  const meta = metaLine(props)

  const serif = "var(--font-playfair, Georgia, serif)"
  const sans = "var(--font-dm-sans, 'DM Sans', sans-serif)"

  if (isNavy) {
    // ── V2 · Broadcast navy ──
    return (
      <section
        style={{
          position: 'relative', overflow: 'hidden',
          padding: '22px 20px 20px', borderRadius: '16px',
          background: 'var(--brand-dark, #070D18)', color: '#ffffff', fontFamily: sans,
        }}
      >
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: 'var(--brand-gold, #c4992a)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--brand-gold, #c4992a)', fontWeight: 700, marginBottom: '8px' }}>
              Torneo en vivo
            </div>
            <h1 style={{ margin: 0, fontFamily: serif, fontSize: '25px', lineHeight: 1.14, fontWeight: 700, letterSpacing: '-0.01em', color: '#ffffff' }}>
              {name}
            </h1>
          </div>
          {right ?? <StatusChip label={badge.label} bg={badge.bg} fg={badge.fg} tone={tone} onDark />}
        </div>
        {meta && <div style={{ marginTop: '12px', fontSize: '13px', color: 'rgba(255,255,255,0.66)' }}>{meta}</div>}
        {note && <div style={{ marginTop: '6px', fontSize: '12px', color: 'rgba(255,255,255,0.56)' }}>{note}</div>}
      </section>
    )
  }

  // ── V1 · Editorial claro ──
  return (
    <section
      style={{
        padding: '22px 20px 20px', borderRadius: '16px',
        background: 'var(--bg-surface, #ffffff)',
        border: '1px solid var(--border, rgba(26,29,36,0.08))',
        boxShadow: 'var(--shadow-card, 0 1px 3px rgba(20,25,35,0.05))',
        fontFamily: sans,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <h1 style={{ margin: 0, fontFamily: serif, fontSize: '25px', lineHeight: 1.14, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text, #1a1d24)' }}>
          {name}
        </h1>
        {right ?? <StatusChip label={badge.label} bg={badge.bg} fg={badge.fg} tone={tone} />}
      </div>
      <div style={{ height: '2px', width: '40px', background: 'var(--brand-gold, #c4992a)', borderRadius: '2px', margin: '14px 0 0' }} />
      {meta && <div style={{ marginTop: '12px', fontSize: '13.5px', color: 'var(--text-2, #5a6573)' }}>{meta}</div>}
      {note && <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-3, #6B7280)' }}>{note}</div>}
    </section>
  )
}

export default TorneoHeader
