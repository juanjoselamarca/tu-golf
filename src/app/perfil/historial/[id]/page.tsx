'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { SITE_URL } from '@/lib/site-url'
import { formatLabel } from '@/golf/core/rules'
import Scorecard, { type ScorecardProps } from '@/components/Scorecard'
import { ShareSheet } from '@/components/share/ShareSheet'
import { ShareToast } from '@/components/share/ShareToast'
import { ErrorState } from '@/components/ui/ErrorState'
import { buildRoundShare } from '@/golf/share/payload'
import { useTarjetaGuardada } from '@/hooks/useTarjetaGuardada'

/* ─── Helpers ──────────────────────────────────────────── */
function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

/* ─── Page ─────────────────────────────────────────────── */
export default function HistorialDetallePage() {
  const params = useParams()
  const id = params.id as string

  // Carga, hoyos (el par de la RONDA manda sobre el catálogo) y compartir viven
  // en el hook que comparte con la tarjeta pública `/tarjeta/[id]`: las dos
  // pintan la misma ronda y no pueden mostrar vs-par distintos.
  const { carga, vista, reintentar, compartir, publicando, shareOpen, cerrarShare } = useTarjetaGuardada(id)
  const [shareCopied, setShareCopied] = useState(false)

  /* ─── Loading state ─────────────────────────────────── */
  if (carga === null) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)',
      }}>
        <div style={{
          width: '32px', height: '32px', border: '3px solid var(--border)',
          borderTopColor: 'var(--brand)', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  /* ─── Error state ───────────────────────────────────── */
  if (carga.estado === 'error') {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <ErrorState message="No pudimos cargar la ronda. Revisa tu conexión." onRetry={reintentar} />
        <Link href="/perfil/historial" style={{ color: 'var(--brand-on-bg)', fontWeight: 600, fontSize: '14px', textDecoration: 'none' }}>
          Volver al historial
        </Link>
      </div>
    )
  }

  if (carga.estado === 'no_existe' || !vista) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px', textAlign: 'center', background: 'var(--bg)',
      }}>
        <p style={{ fontSize: '16px', color: 'var(--text-2)', marginBottom: '16px' }}>
          No se encontró la ronda
        </p>
        <Link
          href="/perfil/historial"
          style={{
            color: 'var(--brand-on-bg)', fontWeight: 600, fontSize: '14px',
            textDecoration: 'none',
          }}
        >
          Volver al historial
        </Link>
      </div>
    )
  }

  /* ─── Build scorecard data ──────────────────────────── */
  const { ronda: round, nombreDelJugador: playerName } = carga
  const dateStr = round.played_at ? formatDateLong(round.played_at) : ''
  const fmtLabel = formatLabel(
    round.formato_juego ?? 'stroke_play',
    round.modo_juego ?? null,
  )

  const sharePayload = buildRoundShare({
    gross: round.total_gross ?? 0,
    vsParLabel: vista.vsParLabel,
    courseName: round.course_name,
    url: `${SITE_URL}/tarjeta/${id}`,
  })

  /* ─── Render ────────────────────────────────────────── */
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      padding: '0 0 40px',
    }}>
      {/* Header */}
      <div style={{
        maxWidth: '720px', margin: '0 auto',
        padding: '20px 16px 0',
      }}>
        {/* Back button */}
        <Link
          href="/perfil/historial"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            color: 'var(--brand-on-bg)', fontWeight: 600, fontSize: '14px',
            textDecoration: 'none', marginBottom: '20px',
          }}
        >
          <span style={{ fontSize: '18px', lineHeight: 1 }}>&larr;</span>
          Volver al historial
        </Link>

        {/* Round info */}
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '22px', fontWeight: 700, color: 'var(--text)',
            margin: '0 0 6px',
            lineHeight: 1.3,
          }}>
            {round.course_name}
          </h1>
          <p style={{
            fontSize: '14px', color: 'var(--text-2)', margin: 0,
            display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
          }}>
            <span>{dateStr}</span>
            <span style={{ color: 'var(--text-3)' }}>&middot;</span>
            <span>{fmtLabel}</span>
            {round.tee_color && (
              <>
                <span style={{ color: 'var(--text-3)' }}>&middot;</span>
                <span>Tee {round.tee_color}</span>
              </>
            )}
            <span style={{ color: 'var(--text-3)' }}>&middot;</span>
            <span>{vista.totalHoles} hoyos</span>
          </p>
        </div>
      </div>

      {/* Scorecard */}
      <div style={{
        maxWidth: '720px', margin: '0 auto',
        padding: '0 16px',
      }}>
        <div style={{
          background: 'var(--bg-surface)',
          borderRadius: '14px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        }}>
          <Scorecard
            holes={vista.hoyos}
            scores={vista.golpes}
            courseHandicap={0}
            modo="gross"
            formato={(round.formato_juego as ScorecardProps['formato']) ?? 'stroke_play'}
            playerName={playerName || undefined}
            courseName={round.course_name}
            date={dateStr}
            formatLabel={fmtLabel}
          />
        </div>

        {/* Notes */}
        {round.notes && (
          <div style={{
            marginTop: '16px', padding: '14px 16px',
            background: 'var(--bg-surface)', borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <p style={{
              fontSize: '12px', fontWeight: 600, color: 'var(--text-3)',
              margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              Notas
            </p>
            <p style={{
              fontSize: '14px', color: 'var(--text-2)', margin: 0,
              lineHeight: 1.5, whiteSpace: 'pre-wrap',
            }}>
              {round.notes}
            </p>
          </div>
        )}

        {/* Share button */}
        <div style={{
          marginTop: '20px', display: 'flex', justifyContent: 'center',
        }}>
          <button
            onClick={() => void compartir()}
            disabled={publicando}
            aria-busy={publicando}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'var(--brand)',
              color: 'var(--brand-dark)', fontWeight: 700, fontSize: '14px',
              padding: '12px 28px', borderRadius: '10px',
              border: 'none', cursor: publicando ? 'wait' : 'pointer',
              minHeight: '44px', opacity: publicando ? 0.7 : 1,
              transition: 'background 0.2s',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            {publicando ? 'Preparando…' : 'Compartir tarjeta'}
          </button>
        </div>
      </div>

      <ShareSheet
        open={shareOpen}
        onClose={cerrarShare}
        payload={sharePayload}
        onCopied={() => { cerrarShare(); setShareCopied(true) }}
      />
      <ShareToast show={shareCopied} onDismiss={() => setShareCopied(false)} />
    </div>
  )
}
