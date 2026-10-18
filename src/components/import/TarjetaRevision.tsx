'use client'

// Una ronda en el paso "Revisar rondas" del importador: total y vs-par, club y
// fecha, estado de confianza, barra por hoyo, tarjeta desplegable con corrección
// de golpes y Aceptar/Descartar/Restaurar. El estado vive en useRevisionImportacion.
import type { ImportRoundData } from '@/lib/import-types'
import { formatVsPar } from '@/golf/share/vs-par'
import { type CardStatus, getConfidenceLevel, getStatusLabel, getCardBorder, getCardShadow, vsParDeImportacion } from './review-helpers'
import ScoreSymbol from '@/components/ScoreSymbol'
import HoleBar from '@/components/HoleBar'
import { Check, CheckCircle, Flag, ChevronDown } from '@/components/icons'
import { formatDate } from '@/lib/format'

interface Props {
  round: ImportRoundData
  idx: number
  status: CardStatus | undefined
  expandida: boolean
  onToggle: () => void
  onDecidir: (status: CardStatus) => void
  onCorregirGolpe: (hoyo: number, golpes: number) => void
}

/** Par del hoyo según la ronda importada; `null` si no viene (no se inventa un par 4). */
function parDelHoyo(round: ImportRoundData, h: number): number | null {
  const p = Number(round.par_per_hole?.[String(h)])
  return Number.isFinite(p) && p > 0 ? p : null
}

function lineaDeStatsGarmin(round: ImportRoundData): string | null {
  const parts: string[] = []
  if (round.metadata?.putts != null) parts.push(`Putts: ${round.metadata.putts}`)
  if (round.metadata?.fairways != null) parts.push(`Fairways: ${round.metadata.fairways}`)
  if (round.metadata?.penalties != null) parts.push(`Penalidades: ${round.metadata.penalties}`)
  return parts.length > 0 ? parts.join(' | ') : null
}

function FilaDeHoyos({ round, inicio, onCorregirGolpe }: {
  round: ImportRoundData
  inicio: number
  onCorregirGolpe: (hoyo: number, golpes: number) => void
}) {
  if (inicio >= round.holes_played) return null
  const fin = Math.min(inicio + 9, round.holes_played)
  const hoyos = Array.from({ length: fin - inicio }, (_, j) => inicio + j + 1)
  const pares = hoyos.map(h => parDelHoyo(round, h))
  const parCompleto = pares.every(p => p != null)
  const totalFila = hoyos.reduce((a, h) => a + (typeof round.scores[String(h)] === 'number' ? round.scores[String(h)] : 0), 0)
  const parFila = parCompleto ? pares.reduce<number>((a, p) => a + (p ?? 0), 0) : null

  const corregir = (h: number, actual: number | undefined) => {
    const input = window.prompt(`Hoyo ${h} — golpes:`, actual != null ? String(actual) : '')
    if (input === null) return
    onCorregirGolpe(h, Number(input.trim()))
  }

  return (
    <div style={{ marginBottom: inicio === 0 && round.holes_played > 9 ? '12px' : 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
          {hoyos.map((h, j) => {
            const score = round.scores[String(h)]
            const par = pares[j]
            const esAmbiguo = round.metadata?.ambiguous_holes?.includes(h)
            const tieneScore = typeof score === 'number'
            return (
              <div key={h} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                <div style={{ fontSize: '10px', color: 'var(--text-2)', marginBottom: '1px', fontWeight: 500 }}>{h}</div>
                {parCompleto && (
                  <div style={{ fontSize: '8px', color: 'var(--text-2)', marginBottom: '3px', letterSpacing: '0.02em' }}>P{par}</div>
                )}
                <button
                  type="button"
                  onClick={() => corregir(h, tieneScore ? score : undefined)}
                  aria-label={tieneScore ? `Hoyo ${h}: ${score} golpes. Corregir` : `Hoyo ${h}: sin golpes. Ingresar`}
                  style={{
                    minHeight: '44px', minWidth: 0, width: '100%', padding: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', cursor: 'pointer', position: 'relative',
                    background: 'none', border: 'none', color: 'inherit', font: 'inherit',
                  }}
                >
                  {tieneScore ? (
                    par != null ? (
                      <ScoreSymbol score={score} par={par} size="sm" theme="auto" />
                    ) : (
                      <div style={{
                        width: '22px', height: '22px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '13px', fontWeight: 700, color: 'var(--text)',
                      }}>{score}</div>
                    )
                  ) : (
                    <div style={{
                      width: '22px', height: '22px', borderRadius: '4px',
                      border: '1px dashed var(--surface-border-strong)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '9px', color: 'var(--text-3)',
                    }}>?</div>
                  )}
                  {esAmbiguo && (
                    <div style={{
                      position: 'absolute', top: -1, right: 0,
                      width: '5px', height: '5px', borderRadius: '50%', background: 'var(--status-draft-fg)',
                    }} />
                  )}
                </button>
              </div>
            )
          })}
        </div>
        <div style={{
          minWidth: '36px', textAlign: 'center', borderLeft: '1px solid var(--border)',
          paddingLeft: '8px', marginLeft: '6px',
        }}>
          <div style={{ fontSize: '10px', color: 'var(--text-2)', marginBottom: '1px', fontWeight: 600 }}>{inicio === 0 ? 'OUT' : 'IN'}</div>
          {parFila != null && <div style={{ fontSize: '8px', color: 'var(--text-2)', marginBottom: '3px' }}>P{parFila}</div>}
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--brand-on-bg)' }}>{totalFila}</div>
        </div>
      </div>
    </div>
  )
}

export default function TarjetaRevision({ round, idx, status, expandida, onToggle, onDecidir, onCorregirGolpe }: Props) {
  const level = getConfidenceLevel(round)
  const isRejected = status === 'rejected'
  const statusLabel = getStatusLabel(level)
  const garminStats = lineaDeStatsGarmin(round)
  // Misma convención que /perfil/historial: gris sin par, dorado si ≤ par, rojo si +4 o más.
  const vsPar = vsParDeImportacion(round)
  const colorDelScore = vsPar == null ? 'var(--text)' : vsPar <= 0 ? 'var(--brand-on-bg)' : vsPar <= 3 ? 'var(--text)' : 'var(--double)'

  return (
    <div
      style={{
        background: isRejected ? 'var(--surface-soft)' : 'var(--bg-surface)',
        border: getCardBorder(level, status),
        borderRadius: '16px',
        overflow: 'hidden',
        opacity: isRejected ? 0.5 : 1,
        transition: 'all 0.3s ease',
        boxShadow: getCardShadow(level, status),
        animation: `reviewCardEnter 0.4s ease-out ${idx * 0.05}s both`,
      }}
    >
      {/* Fila horizontal como la de /perfil/historial: score · club + fecha · chevron. */}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ flexShrink: 0, textAlign: 'center', minWidth: '50px' }}>
          {!isRejected ? (
            <>
              <div style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '28px', fontWeight: 700,
                color: colorDelScore,
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {round.total_gross ?? '—'}
              </div>
              {vsPar != null && (
                <div style={{
                  fontSize: '11px',
                  color: 'var(--text-3)',
                  marginTop: '2px',
                  fontFamily: '"DM Mono", monospace',
                  letterSpacing: '0.04em',
                }}>
                  {formatVsPar(vsPar)}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: '24px', color: 'var(--text-3)' }}>—</div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '16px', fontWeight: 700,
            color: isRejected ? 'var(--text-3)' : 'var(--text)',
            marginBottom: '2px',
            lineHeight: 1.2,
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <Flag size={12} strokeWidth={1.75} aria-hidden style={{ flexShrink: 0, opacity: 0.6 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {round.course_name || 'Campo desconocido'}
            </span>
          </div>
          <div style={{
            fontSize: '12px', color: 'var(--text-3)',
            display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
          }}>
            <span style={{ fontFamily: '"DM Mono", monospace' }}>{formatDate(round.played_at, 'short') || round.played_at}</span>
            <span aria-hidden>·</span>
            <span>{round.holes_played}h</span>
            <span
              style={{
                padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 600,
                background: isRejected ? 'var(--surface-soft)' : statusLabel.bg,
                color: isRejected ? 'var(--text-3)' : statusLabel.color,
                letterSpacing: '0.04em',
                display: 'inline-flex', alignItems: 'center', gap: '4px',
              }}
            >
              {!isRejected && (level === 'garmin' || level === 'high') && <CheckCircle size={10} strokeWidth={2} aria-hidden />}
              {isRejected ? 'DESCARTADA' : statusLabel.text}
            </span>
          </div>
        </div>

        {!isRejected && (
          <button
            onClick={onToggle}
            aria-label={expandida ? 'Ocultar scorecard' : 'Ver scorecard'}
            aria-expanded={expandida}
            style={{
              flexShrink: 0,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-3)', padding: '6px',
              minWidth: '44px', minHeight: '44px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '8px',
              transition: 'transform 0.2s ease, color 0.15s ease',
              transform: expandida ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            <ChevronDown size={16} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Barra por hoyo siempre visible (como en /perfil/historial): feedback inmediato del escaneo. */}
      {!isRejected && round.scores && Object.values(round.scores).some(s => typeof s === 'number' && s > 0) && (
        <div style={{ padding: '0 16px 12px' }}>
          <HoleBar
            scores={round.scores}
            pars={round.par_per_hole ?? {}}
            totalHoles={round.holes_played ?? 18}
            height={5}
            gap={1.5}
          />
        </div>
      )}

      {!isRejected && expandida && (
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{
            background: 'var(--surface-soft)',
            borderRadius: '12px',
            padding: '14px',
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            {[0, 9].map(inicio => (
              <FilaDeHoyos key={inicio} round={round} inicio={inicio} onCorregirGolpe={onCorregirGolpe} />
            ))}
            {round.metadata?.ambiguous_holes && round.metadata.ambiguous_holes.length > 0 && (
              <div style={{ fontSize: '11px', color: 'var(--status-draft-fg)', marginTop: '8px', textAlign: 'center' }}>
                Hoyos con punto azul fueron estimados — toca para corregir
              </div>
            )}
            {garminStats && (
              <div style={{
                marginTop: '10px',
                paddingTop: '10px',
                borderTop: '1px solid var(--border)',
                fontSize: '12px',
                color: 'var(--text-2)',
                textAlign: 'center',
                fontWeight: 500,
              }}>
                {garminStats}
              </div>
            )}
          </div>
        </div>
      )}

      {!isRejected && (
        <div style={{
          padding: '8px 16px 14px',
          display: 'flex', gap: '16px', alignItems: 'center',
          borderTop: '1px solid var(--border)',
        }}>
          {status === 'accepted' ? (
            <>
              <span style={{
                flex: 1, display: 'flex', alignItems: 'center',
                gap: '6px',
                color: 'var(--status-live-fg)', fontSize: '14px', fontWeight: 600,
                minHeight: '44px',
              }}>
                <Check size={16} strokeWidth={2} aria-hidden /> Aceptada
              </span>
              <button
                onClick={() => onDecidir('rejected')}
                style={{
                  padding: '8px 0', borderRadius: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--error-fg)', fontSize: '13px', fontWeight: 600,
                  cursor: 'pointer', minHeight: '44px',
                }}
              >
                Descartar
              </button>
            </>
          ) : (
            <button
              onClick={() => onDecidir('accepted')}
              style={{
                flex: 1, padding: '10px',
                background: 'transparent',
                border: 'none',
                color: 'var(--status-live-fg)', fontSize: '14px', fontWeight: 600,
                cursor: 'pointer', minHeight: '44px',
                textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <Check size={16} strokeWidth={2} aria-hidden /> Aceptar
            </button>
          )}
        </div>
      )}

      {isRejected && (
        <div style={{ padding: '0 16px 14px' }}>
          <button
            onClick={() => onDecidir('accepted')}
            style={{
              width: '100%', padding: '10px', borderRadius: '10px',
              background: 'var(--surface-soft)',
              border: '1px solid var(--border)',
              color: 'var(--text-2)', fontSize: '13px', fontWeight: 500,
              cursor: 'pointer', minHeight: '44px',
            }}
          >
            Restaurar
          </button>
        </div>
      )}
    </div>
  )
}
