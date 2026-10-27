'use client'

/**
 * /tarjeta/[id] — Página PÚBLICA de tarjeta de golf.
 *
 * Cualquier persona puede ver esta tarjeta sin login.
 * Se genera cuando un jugador comparte su ronda.
 * Si el visitante no tiene cuenta, se le muestra un CTA de registro.
 */

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Scorecard, { type ScorecardProps } from '@/components/Scorecard'
import { ArrowLeft, Share2, Flag } from 'lucide-react'
import { ShareSheet } from '@/components/share/ShareSheet'
import { ShareToast } from '@/components/share/ShareToast'
import { ErrorState } from '@/components/ui/ErrorState'
import { buildRoundShare } from '@/golf/share/payload'
import { SITE_URL } from '@/lib/site-url'
import { useTarjetaGuardada } from '@/hooks/useTarjetaGuardada'

export default function TarjetaPublicaPage() {
  const params = useParams()
  const id = params.id as string

  // Misma carga, mismos hoyos y mismo compartir que `/perfil/historial/[id]`
  // (hook compartido): el par de la RONDA manda sobre el catálogo, igual que el
  // preview del link (`tarjeta-og.ts`). Compartir publica sólo si es del que mira.
  const { carga, vista, reintentar, compartir, publicando, shareOpen, cerrarShare } = useTarjetaGuardada(id)
  const [shareCopied, setShareCopied] = useState(false)

  // Loading
  if (carga === null) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", sans-serif' }}>
        <div style={{ color: 'var(--text-3)', fontSize: 14 }}>Cargando tarjeta...</div>
      </div>
    )
  }

  // Sin conexión no es "no existe": el que abrió el link puede reintentar.
  if (carga.estado === 'error') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", sans-serif', padding: 24 }}>
        <ErrorState message="No pudimos cargar la tarjeta. Revisa tu conexión." onRetry={reintentar} />
      </div>
    )
  }

  // Not found
  if (carga.estado === 'no_existe' || !vista) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", sans-serif', padding: 24 }}>
        <div style={{ marginBottom: 16, color: 'var(--brand-on-bg)' }}><Flag size={48} strokeWidth={1.5} /></div>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: 24, color: 'var(--text)', marginBottom: 8 }}>Tarjeta no encontrada</h1>
        <p style={{ color: 'var(--text-3)', fontSize: 14, textAlign: 'center', maxWidth: 300 }}>
          Esta tarjeta no existe o fue eliminada.
        </p>
        <Link href="/" style={{ color: 'var(--brand-on-bg)', textDecoration: 'none', fontSize: 14, marginTop: 16, fontWeight: 600 }}>
          Ir a Golfers+
        </Link>
      </div>
    )
  }

  const { ronda: round, esDueño: isOwner, hayVisitanteConSesion: isLoggedIn } = carga
  const playerName = carga.nombreDelJugador ?? 'Jugador'
  const totalHoles = vista.totalHoles

  const dateStr = round.played_at
    ? new Date(round.played_at + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''

  const sharePayload = buildRoundShare({
    gross: round.total_gross ?? 0,
    vsParLabel: vista.vsParLabel,
    courseName: round.course_name,
    url: `${SITE_URL}/tarjeta/${id}`,
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: '"DM Sans", sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', padding: '12px 16px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href={isLoggedIn ? '/perfil/historial' : '/'} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
            <ArrowLeft size={16} />
            {isLoggedIn ? 'Mi historial' : 'Golfers+'}
          </Link>
          <button onClick={() => void compartir()} disabled={publicando} aria-busy={publicando} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', minHeight: '44px', color: 'var(--text-3)', fontSize: 12, fontWeight: 600, cursor: publicando ? 'wait' : 'pointer', opacity: publicando ? 0.7 : 1 }}>
            <Share2 size={14} />
            Compartir
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 60px' }}>
        {/* Course header */}
        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
            {round.course_name}
          </h1>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {dateStr}
            {round.tee_color && ` · ${round.tee_color}`}
            {` · ${totalHoles} hoyos`}
          </div>
        </div>

        {/* Scorecard */}
        <Scorecard
          holes={vista.hoyos}
          scores={vista.golpes}
          courseHandicap={0}
          modo="gross"
          formato={(round.formato_juego as ScorecardProps['formato']) ?? 'stroke_play'}
          playerName={playerName}
          courseName={round.course_name}
          date={dateStr}
        />

        {/* Notes */}
        {isOwner && round.notes && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 4 }}>Notas</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{round.notes}</div>
          </div>
        )}

        {/* CTA para usuarios no logueados */}
        {!isLoggedIn && (
          <div style={{ marginTop: 24, padding: '20px', background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
              Registra tu propio score
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14, lineHeight: 1.5 }}>
              Crea tu cuenta gratis y juega con Golfers+
            </div>
            <Link href="/register" style={{
              display: 'inline-block', padding: '10px 24px', background: 'var(--brand)',
              color: 'var(--brand-dark)', fontWeight: 700, fontSize: 14, borderRadius: 10,
              textDecoration: 'none',
            }}>
              Unirme gratis
            </Link>
          </div>
        )}
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
