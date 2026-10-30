'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { urlInscripcion } from '@/lib/site-url'

/** id del texto con el motivo para no iniciar (lo referencia el botón con aria-describedby). */
const MOTIVO_ID = 'motivo-no-iniciar'

interface Props {
  tournamentStatus: string
  slug: string
  /** Jugadores APROBADOS (los que reciben tarjeta al iniciar). */
  playersCount: number
  /** Por qué todavía no se puede iniciar (`motivoParaNoIniciar`), o null si se puede. */
  motivoNoIniciar: string | null
  starting: boolean
  closing: boolean
  opening: boolean
  allRoundsClosed: boolean
  onStart: () => void
  onOpenInscriptions: () => void
  onRevertToDraft: () => void
  onCancel: () => void
  onClose: () => void
  onReopen: () => void
  /** Altura real de la barra (cambia con el motivo y el ancho): la página la usa de holgura inferior. */
  onAltura?: (px: number) => void
}

/** Barra de acciones fija inferior: cambia según estado del torneo
 *  (draft → eliminar/iniciar; in_progress → salida/scoring/cerrar;
 *  closed → leaderboard). Extraído verbatim de JugadoresPanel. */
export function TournamentActionsBar({
  tournamentStatus, slug, playersCount, motivoNoIniciar, starting, closing, opening, allRoundsClosed,
  onStart, onOpenInscriptions, onRevertToDraft, onCancel, onClose, onReopen, onAltura,
}: Props) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const barraRef = useRef<HTMLDivElement>(null)

  // La barra es fija y su alto depende del motivo (largo variable) y de cuántas
  // filas ocupan los botones: se mide en vez de estimarlo, para que nunca tape
  // la última fila de la tabla.
  useEffect(() => {
    const el = barraRef.current
    if (!el || !onAltura) return
    const informar = () => onAltura(el.getBoundingClientRect().height)
    informar()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(informar)
    ro.observe(el)
    return () => ro.disconnect()
  }, [onAltura])

  const handleShareLink = async () => {
    const url = urlInscripcion(slug)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: si clipboard falla (http inseguro / permisos), abrir el link
      // para que el organizador lo copie a mano. Nunca dejamos sin salida.
      window.prompt('Copia el link de inscripción:', url)
    }
  }

  return (
    <div ref={barraRef} style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg)', borderTop: '1px solid var(--border-md)', padding: '16px 24px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '12px', zIndex: 50 }}>
      {(tournamentStatus === 'draft' || tournamentStatus === 'open') && motivoNoIniciar && (
        // El motivo se ve ANTES de apretar "Iniciar" (antes llegaba como toast
        // del 400 recién al apretarlo). Ocupa la fila completa sobre los botones.
        <p
          id={MOTIVO_ID}
          role="status"
          style={{
            flexBasis: '100%',
            maxWidth: '640px',
            margin: 0,
            padding: '10px 14px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-md)',
            borderLeft: '3px solid var(--brand-on-bg)',
            borderRadius: '8px',
            color: 'var(--text)',
            fontSize: '14px',
            lineHeight: 1.45,
          }}
        >
          <strong style={{ fontWeight: 600 }}>Aún no puedes iniciar: </strong>
          {motivoNoIniciar}
        </p>
      )}

      {tournamentStatus === 'draft' && (
        <>
          <button
            onClick={onCancel}
            style={{
              background: 'rgba(220,38,38,0.1)',
              color: '#fca5a5',
              fontWeight: 600,
              fontSize: '14px',
              padding: '14px 24px',
              borderRadius: '8px',
              border: '1px solid rgba(220,38,38,0.25)',
              cursor: 'pointer',
              transition: 'all 200ms',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Eliminar torneo
          </button>
          <button
            onClick={onOpenInscriptions}
            disabled={opening}
            style={{
              background: 'rgba(196,153,42,0.12)',
              color: 'var(--brand-on-bg)',
              fontWeight: 600,
              fontSize: '14px',
              padding: '14px 24px',
              borderRadius: '8px',
              border: '1px solid rgba(196,153,42,0.3)',
              cursor: opening ? 'not-allowed' : 'pointer',
              transition: 'all 200ms',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {opening ? 'Abriendo...' : 'Abrir inscripciones'}
          </button>
          <BotonIniciar playersCount={playersCount} motivo={motivoNoIniciar} starting={starting} onStart={onStart} />
        </>
      )}

      {tournamentStatus === 'open' && (
        // En 'open' el estado ya se comunica con el badge del header
        // ("Inscripciones abiertas"), así que la barra no repite el indicador.
        // Tampoco expone "Eliminar": para borrar, primero "Volver a borrador"
        // (un paso extra para lo destructivo = CERO FALLOS). Quedan 3 botones.
        <>
          <button
            onClick={onRevertToDraft}
            disabled={opening}
            style={{
              background: 'rgba(122,143,168,0.12)',
              color: 'var(--text-2)',
              fontWeight: 600,
              fontSize: '14px',
              padding: '14px 20px',
              borderRadius: '8px',
              border: '1px solid var(--border-md)',
              cursor: opening ? 'not-allowed' : 'pointer',
              transition: 'all 200ms',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {opening ? '...' : 'Volver a borrador'}
          </button>
          <button
            onClick={handleShareLink}
            style={{
              // Variante nav (DESIGN §5): sin relleno. Con el tinte dorado el texto
              // --brand-on-bg bajaba a 4,37:1 en claro.
              background: 'transparent',
              color: 'var(--brand-on-bg)',
              fontWeight: 600,
              fontSize: '14px',
              padding: '14px 24px',
              borderRadius: '8px',
              border: '1px solid var(--brand-on-bg)',
              cursor: 'pointer',
              transition: 'all 200ms',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {copied ? '¡Link copiado!' : 'Compartir link'}
          </button>
          <BotonIniciar playersCount={playersCount} motivo={motivoNoIniciar} starting={starting} onStart={onStart} />
        </>
      )}

      {tournamentStatus === 'in_progress' && (
        <>
          <button
            onClick={() => router.push(`/organizador/${slug}/salida`)}
            style={{
              background: 'rgba(196,153,42,0.12)',
              color: 'var(--brand-on-bg)',
              fontWeight: 600,
              fontSize: '14px',
              padding: '14px 20px',
              borderRadius: '8px',
              border: '1px solid var(--border-md)',
              cursor: 'pointer',
              transition: 'all 200ms',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Hoja de salida
          </button>
          <button
            onClick={() => router.push(`/organizador/${slug}/scoring`)}
            style={{
              background: 'var(--brand)',
              color: '#1a1a2e',
              fontWeight: 700,
              fontSize: '16px',
              padding: '14px 30px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 200ms',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Ver scoring
          </button>
          {allRoundsClosed && (
            <button
              onClick={onClose}
              disabled={closing}
              style={{
                background: 'rgba(220,38,38,0.15)',
                color: '#fca5a5',
                fontWeight: 700,
                fontSize: '16px',
                padding: '14px 30px',
                borderRadius: '8px',
                border: '1px solid rgba(220,38,38,0.3)',
                cursor: closing ? 'not-allowed' : 'pointer',
                transition: 'all 200ms',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {closing ? 'Cerrando...' : 'Cerrar torneo'}
            </button>
          )}
        </>
      )}

      {tournamentStatus === 'closed' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={onReopen}
            disabled={closing}
            style={{
              background: 'rgba(220,38,38,0.1)',
              color: '#fca5a5',
              fontWeight: 600,
              fontSize: '14px',
              padding: '12px 20px',
              borderRadius: '8px',
              border: '1px solid rgba(220,38,38,0.25)',
              cursor: closing ? 'not-allowed' : 'pointer',
              transition: 'all 200ms',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {closing ? 'Reabriendo...' : 'Reabrir torneo'}
          </button>
          <button
            onClick={() => window.open(`/torneo/${slug}`, '_blank')}
            style={{
              background: 'var(--brand)',
              color: '#070d18',
              fontWeight: 700,
              fontSize: '14px',
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Ver leaderboard
          </button>
        </div>
      )}
    </div>
  )
}


/**
 * "Iniciar torneo": deshabilitado mientras haya un motivo para no iniciar (el
 * mismo que valida la ruta). El conteo es de jugadores aprobados.
 */
function BotonIniciar({ playersCount, motivo, starting, onStart }: {
  playersCount: number
  motivo: string | null
  starting: boolean
  onStart: () => void
}) {
  const habilitado = !motivo && !starting
  return (
    <button
      onClick={onStart}
      disabled={!habilitado}
      aria-describedby={motivo ? MOTIVO_ID : undefined}
      style={{
        background: !motivo ? 'var(--brand)' : 'rgba(122,143,168,0.2)',
        color: !motivo ? '#070d18' : 'var(--text-2)',
        fontWeight: 700,
        fontSize: '16px',
        padding: '14px 40px',
        minHeight: '48px',
        borderRadius: '8px',
        border: 'none',
        cursor: habilitado ? 'pointer' : 'not-allowed',
        transition: 'all 200ms',
        minWidth: '200px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {starting ? 'Iniciando...' : `Iniciar torneo (${playersCount} jugador${playersCount !== 1 ? 'es' : ''})`}
    </button>
  )
}
