'use client'

import Link from 'next/link'
import type { ImportRoundData } from '@/lib/import-types'
import type { ResultadoConfirmacion } from '@/hooks/useConfirmarImportacion'
import { useRevisionImportacion, type FormatoImportacion, type ModoImportacion } from '@/hooks/useRevisionImportacion'
import TarjetaRevision from './TarjetaRevision'

interface StepReviewProps {
  rounds: ImportRoundData[]
  jobId: string | null
  /** Aviso que el jugador debe ver sobre la lista (p. ej. fotos que no se pudieron leer). */
  aviso?: string | null
  onBack: () => void
  onConfirm: (resultado: ResultadoConfirmacion, aceptadas: ImportRoundData[]) => void
}

export default function StepReview({ rounds: rondasIniciales, jobId, aviso, onBack, onConfirm }: StepReviewProps) {
  const {
    rounds, decisions, expandedCards, resumen, formato, setFormato, modoEfectivo, modoForzado, setModo,
    confirmando, confirmError, todasDuplicadas, toggleExpand, decidir, corregirGolpe, confirmarAceptadas,
  } = useRevisionImportacion({ rondasIniciales, jobId, onConfirm })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <style>{`
        @keyframes reviewFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes reviewCardEnter {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        padding: '12px 16px',
        paddingTop: 'calc(12px + env(safe-area-inset-top))',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <button onClick={onBack} aria-label="Volver" style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)', border: 'none',
            color: 'var(--text)', fontSize: '18px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>{'←'}</button>
          <div style={{ flex: 1 }}>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '20px', fontWeight: 700, color: 'var(--text)',
              margin: 0, lineHeight: 1.2,
            }}>
              {`Revisar ${rounds.length} ${rounds.length === 1 ? 'ronda' : 'rondas'}`}
            </h2>
          </div>
        </div>

        {/* Summary pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {resumen.garmin > 0 && (
            <span style={{
              padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
              background: 'rgba(34,197,94,0.10)', color: 'var(--status-live-fg)',
              border: '1px solid rgba(34,197,94,0.15)',
            }}>
              {resumen.garmin} Garmin
            </span>
          )}
          {resumen.listas > 0 && (
            <span style={{
              padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
              background: 'rgba(34,197,94,0.10)', color: '#50c878',
              border: '1px solid rgba(34,197,94,0.15)',
            }}>
              {resumen.listas} {resumen.listas === 1 ? 'lista' : 'listas'}
            </span>
          )}
          {resumen.porRevisar > 0 && (
            <span style={{
              padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
              background: 'rgba(245,158,11,0.08)', color: '#f59e0b',
              border: '1px solid rgba(245,158,11,0.15)',
            }}>
              {resumen.porRevisar} revisar
            </span>
          )}
          {resumen.incompletas > 0 && (
            <span style={{
              padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
              background: 'rgba(239,68,68,0.08)', color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.15)',
            }}>
              {resumen.incompletas} {resumen.incompletas === 1 ? 'incompleta' : 'incompletas'}
            </span>
          )}
          {resumen.descartadas > 0 && (
            <span style={{
              padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
              background: 'rgba(255,255,255,0.03)', color: '#5a7494',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              {resumen.descartadas} {resumen.descartadas === 1 ? 'descartada' : 'descartadas'}
            </span>
          )}
        </div>
      </div>

      {/* ── Card list (scrollable) ── */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px',
        WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '100px' }}>
          {aviso && (
            <p
              role="alert"
              style={{
                margin: 0, padding: '10px 12px', borderRadius: '10px',
                background: 'var(--error-bg)', border: '1px solid var(--error-border)',
                color: 'var(--error-fg)', fontSize: '14px', lineHeight: 1.45,
              }}
            >
              {aviso}
            </p>
          )}
          {rounds.map((round, idx) => (
            <TarjetaRevision
              key={round.tempId}
              round={round}
              idx={idx}
              status={decisions[round.tempId]}
              expandida={expandedCards[round.tempId] ?? false}
              onToggle={() => toggleExpand(round.tempId)}
              onDecidir={status => decidir(round.tempId, status)}
              onCorregirGolpe={(hoyo, golpes) => corregirGolpe(round.tempId, hoyo, golpes)}
            />
          ))}
        </div>
      </div>

      {/* ── Sticky bottom bar ── */}
      {resumen.aceptadas > 0 && (
        <div style={{
          position: 'sticky', bottom: 0, left: 0, right: 0,
          padding: '16px',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
          background: 'linear-gradient(to top, var(--bg) 60%, transparent)',
        }}>
          {/* Format + mode selectors — se aplican a todas las rondas aceptadas */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
            marginBottom: '12px',
            background: 'rgba(14,28,47,0.95)',
            border: '1px solid rgba(196,153,42,0.2)',
            borderRadius: '10px', padding: '10px 12px',
          }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-2)', fontFamily: '"DM Mono", monospace', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Formato</span>
              <select
                value={formato}
                onChange={e => setFormato(e.target.value as FormatoImportacion)}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.25)',
                  color: 'var(--text)', fontSize: '13px', padding: '8px 10px',
                  borderRadius: '8px', outline: 'none', cursor: 'pointer',
                }}
              >
                <option value="stroke_play">Stroke Play</option>
                <option value="stableford">Stableford</option>
                <option value="match_play">Match Play</option>
                <option value="best_ball">Best Ball</option>
                <option value="scramble">Scramble</option>
                <option value="foursome">Foursome</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-2)', fontFamily: '"DM Mono", monospace', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Modo</span>
              <select
                value={modoEfectivo}
                onChange={e => setModo(e.target.value as ModoImportacion)}
                disabled={modoForzado}
                title={modoForzado ? 'Stableford y Match Play usan neto por regla R&A/USGA' : undefined}
                style={{
                  background: modoForzado ? 'rgba(14,28,47,0.5)' : 'var(--bg-surface)',
                  border: '1px solid rgba(196,153,42,0.25)',
                  color: modoForzado ? 'var(--text-2)' : 'var(--text)', fontSize: '13px', padding: '8px 10px',
                  borderRadius: '8px', outline: 'none', cursor: modoForzado ? 'not-allowed' : 'pointer',
                }}
              >
                <option value="gross">Gross</option>
                <option value="neto">Neto</option>
              </select>
            </label>
          </div>
          {confirmError && (
            <p
              role="alert"
              style={{
                margin: '0 0 12px', padding: '10px 12px', borderRadius: '10px',
                background: 'var(--error-bg)', border: '1px solid var(--error-border)',
                color: 'var(--error-fg)', fontSize: '13px', lineHeight: 1.45, textAlign: 'center',
              }}
            >
              {confirmError}
              {todasDuplicadas && (
                <>
                  <br />
                  <Link
                    href="/perfil/historial"
                    style={{
                      color: 'inherit', fontWeight: 700, textDecoration: 'underline',
                      display: 'inline-flex', alignItems: 'center', minHeight: '44px', padding: '0 8px',
                    }}
                  >
                    Ver mi historial
                  </Link>
                </>
              )}
            </p>
          )}
          <button
            onClick={confirmarAceptadas}
            disabled={confirmando}
            style={{
              width: '100%', padding: '16px', borderRadius: '14px',
              background: confirmando ? 'rgba(196,153,42,0.4)' : 'linear-gradient(135deg, var(--brand), #e8c06a)',
              color: 'var(--brand-dark)', fontSize: '16px', fontWeight: 700,
              border: 'none',
              cursor: confirmando ? 'wait' : 'pointer',
              minHeight: '52px',
              transition: 'all 0.2s ease',
            }}
          >
            {confirmando ? 'Importando...' : `Importar ${resumen.aceptadas} ${resumen.aceptadas === 1 ? 'ronda' : 'rondas'} →`}
          </button>
        </div>
      )}
    </div>
  )
}
