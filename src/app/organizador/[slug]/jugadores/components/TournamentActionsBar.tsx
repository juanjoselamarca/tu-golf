'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'
import { useTecladoAbierto } from '../hooks/useTecladoAbierto'

/** id del texto con el motivo para no iniciar (lo referencia el botón con aria-describedby). */
const MOTIVO_ID = 'motivo-no-iniciar'

/** Acción secundaria de la barra (Abrir inscripciones / Compartir link).
 *  Variante nav (DESIGN §5): sin relleno, borde y texto --brand-on-bg (con el
 *  tinte dorado de fondo el texto bajaba a 4,37:1 en claro). */
const estiloSecundario: CSSProperties = {
  background: 'transparent',
  color: 'var(--brand-on-bg)',
  fontWeight: 600,
  fontSize: '14px',
  lineHeight: 1.25,
  padding: '12px 14px',
  minHeight: '48px',
  borderRadius: '8px',
  border: '1px solid var(--brand-on-bg)',
  cursor: 'pointer',
  transition: 'all 200ms',
  flex: '1 1 0',
  minWidth: 0,
}

interface Props {
  tournamentStatus: string
  slug: string
  /** Jugadores APROBADOS (los que reciben tarjeta al iniciar). */
  playersCount: number
  /** Por qué todavía no se puede iniciar (`motivoParaNoIniciar`), o null si se puede. */
  motivoNoIniciar: string | null
  starting: boolean
  preparandoInicio: boolean
  closing: boolean
  opening: boolean
  allRoundsClosed: boolean
  onStart: () => void
  onOpenInscriptions: () => void
  onClose: () => void
  onReopen: () => void
  /** Altura real de la barra (cambia con el motivo y el ancho): la página la usa de holgura inferior. */
  onAltura?: (px: number) => void
}

/** Barra de acciones fija inferior: cambia según estado del torneo
 *  (draft → abrir inscripciones/iniciar; open → compartir link/iniciar;
 *  in_progress → salida/scoring/cerrar; closed → reabrir/leaderboard). */
export function TournamentActionsBar({
  tournamentStatus, slug, playersCount, motivoNoIniciar, starting, preparandoInicio, closing, opening, allRoundsClosed,
  onStart, onOpenInscriptions, onClose, onReopen, onAltura,
}: Props) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const barraRef = useRef<HTMLDivElement>(null)
  // Con el teclado abierto la barra fija sube con él y tapa el campo que se
  // está escribiendo: se esconde (y su alto pasa a 0) mientras dure.
  const tecladoAbierto = useTecladoAbierto()

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
    const url = `${window.location.origin}/torneo/${slug}/unirse`
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

  // Antes de iniciar, la barra fija lleva UNA fila: la acción que sigue + Iniciar.
  // Eliminar y "Volver a borrador" viven al final de la página
  // (`AccionesDeGestion`): con 3 botones apilados + el motivo en caja, la barra
  // tapaba media pantalla en un teléfono (inbox 16-nov).
  const preInicio = tournamentStatus === 'draft' || tournamentStatus === 'open'

  return (
    <div ref={barraRef} className="organizador-barra-acciones" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg)', borderTop: '1px solid var(--border-md)', padding: preInicio ? '10px 16px' : '16px 24px', paddingBottom: `calc(${preInicio ? 22 : 16}px + env(safe-area-inset-bottom, 0px))` /* ≥20: el botón JUGAR del nav sobresale ~15 px hacia arriba */, display: tecladoAbierto ? 'none' : 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: preInicio ? '8px' : '12px', zIndex: 50 }}>
      {preInicio && motivoNoIniciar && (
        // El motivo se ve ANTES de apretar "Iniciar" (antes llegaba como toast
        // del 400 recién al apretarlo). Una línea de texto, sin caja.
        <p
          id={MOTIVO_ID}
          role="status"
          style={{
            flexBasis: '100%',
            maxWidth: '640px',
            margin: 0,
            color: 'var(--text-2)',
            fontSize: '13px',
            lineHeight: 1.4,
            textAlign: 'center',
          }}
        >
          <strong style={{ fontWeight: 600, color: 'var(--text)' }}>Aún no puedes iniciar: </strong>
          {motivoNoIniciar}
        </p>
      )}

      {preInicio && (
        <div style={{ display: 'flex', gap: '10px', width: '100%', maxWidth: '640px' }}>
          {tournamentStatus === 'draft' ? (
            <button
              onClick={onOpenInscriptions}
              disabled={opening}
              style={{ ...estiloSecundario, cursor: opening ? 'not-allowed' : 'pointer' }}
            >
              {opening ? 'Abriendo...' : 'Abrir inscripciones'}
            </button>
          ) : (
            // En 'open' el estado ya lo dice el badge del header ("Inscripciones abiertas").
            <button onClick={handleShareLink} style={estiloSecundario}>
              {copied ? '¡Link copiado!' : 'Compartir link'}
            </button>
          )}
          <BotonIniciar playersCount={playersCount} motivo={motivoNoIniciar} starting={starting} preparando={preparandoInicio} onStart={onStart} />
        </div>
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
function BotonIniciar({ playersCount, motivo, starting, preparando, onStart }: {
  playersCount: number
  motivo: string | null
  starting: boolean
  preparando: boolean
  onStart: () => void
}) {
  const habilitado = !motivo && !starting && !preparando
  return (
    <button
      onClick={onStart}
      disabled={!habilitado}
      aria-describedby={motivo ? MOTIVO_ID : undefined}
      style={{
        background: !motivo ? 'var(--brand)' : 'rgba(122,143,168,0.2)',
        color: !motivo ? '#070d18' : 'var(--text-2)',
        fontWeight: 700,
        fontSize: '15px',
        lineHeight: 1.25,
        padding: '12px 14px',
        minHeight: '48px',
        borderRadius: '8px',
        border: 'none',
        cursor: habilitado ? 'pointer' : 'not-allowed',
        transition: 'all 200ms',
        // Comparte la fila con la acción secundaria: en 390 px el texto puede
        // partirse en dos líneas antes que empujar la barra a dos filas.
        flex: '1.3 1 0',
        minWidth: 0,
      }}
    >
      {preparando ? 'Preparando...' : starting ? 'Iniciando...' : `Iniciar torneo (${playersCount} jugador${playersCount !== 1 ? 'es' : ''})`}
    </button>
  )
}
