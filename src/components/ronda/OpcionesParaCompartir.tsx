'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Check } from '@/components/icons'
import { useShare } from '@/components/share/useShare'
import { buildLiveShare, buildRoundInviteShare, buildFollowTournamentShare, buildTeamScorerShare } from '@/golf/share/payload'
import type { SharePayload } from '@/golf/share/types'
import { SITE_URL } from '@/lib/site-url'

/**
 * Qué se comparte: el mensaje completo (texto + link) de cada invitación, armado con los builders de
 * `golf/share`. Sin `jugar` (un solo celular anota por todos, o un torneo) solo se invita a seguir.
 */
export interface EnlacesDeLaRonda {
  /** Un celular por equipo: anotar el score de su equipo (`/ronda-libre/<codigo>/score-grupo`, elige equipo). */
  anotar?: SharePayload
  /** Sumarse a anotar (`/ronda-libre/<codigo>/score`). */
  jugar?: SharePayload
  /** Seguirla en vivo, sin cuenta. */
  seguir: SharePayload
}

/**
 * Links de una ronda libre. `conJugar: false` cuando un solo celular anota por todos (score de grupo, o el
 * admin anotando): un link para "sumarse a anotar" no lleva a ninguna parte útil. `unCelularPorEquipo`
 * (`@/golf/ronda-libre/anotador-de-equipo`): primero el link para que cada equipo anote el suyo.
 */
export function enlacesDeRondaLibre(
  codigo: string,
  { conJugar, unCelularPorEquipo = false }: { conJugar: boolean; unCelularPorEquipo?: boolean },
): EnlacesDeLaRonda {
  const url = `${SITE_URL}/ronda-libre/${codigo}`
  const seguir = buildLiveShare({ url })
  if (unCelularPorEquipo) return { anotar: buildTeamScorerShare({ url: `${url}/score-grupo` }), seguir }
  return conJugar ? { jugar: buildRoundInviteShare({ url: `${url}/score` }), seguir } : { seguir }
}

/**
 * Un torneo se invita a seguir por su página pública (`/torneo/<slug>`): `/en-vivo` pide sesión (cuenta
 * gratis basta), y quien recibe el link por WhatsApp sin cuenta se toparía con el login.
 */
export function enlacesDeTorneo(slug: string, nombre: string): EnlacesDeLaRonda {
  return { seguir: buildFollowTournamentShare({ tournamentName: nombre, url: `${SITE_URL}/torneo/${slug}` }) }
}

type Destino = 'anotar' | 'jugar' | 'seguir'

/**
 * Cada link dice para qué es («para anotar» / «para mirar») y quién lo recibe. Antes eran «Un celular por equipo»
 * e «Invitar a seguir» con los mismos dos botones: no se distinguía cuál mandarle al otro equipo (feedback de
 * Juanjo, 26-nov). El botón del de anotar va dorado (`nav`); el de mirar, neutro.
 */
const DESTINO: Record<Destino, { titulo: string; detalle: string; para: string }> = {
  anotar: {
    titulo: 'Link para anotar',
    detalle: 'Mándaselo a quien anota cada uno de los otros equipos. Al abrirlo elige su equipo.',
    para: 'para anotar',
  },
  jugar: {
    titulo: 'Link para anotar',
    detalle: 'Cada jugador lo abre y anota su tarjeta en su celular.',
    para: 'para anotar',
  },
  seguir: {
    titulo: 'Link para mirar',
    detalle: 'Para familia y amigos: ven el marcador en vivo, sin crear cuenta.',
    para: 'para mirar',
  },
}

interface OpcionesParaCompartirProps {
  enlaces: EnlacesDeLaRonda
  /** Se llama cuando el link salió (no si la persona canceló la hoja del teléfono): el scorer vuelve a la tarjeta. */
  onCompartido?: () => void
}

/**
 * Las opciones para invitar a una ronda: compartir (hoja nativa del teléfono, si no WhatsApp) o copiar el
 * link, para jugar y para seguir. Fuente única: la pantalla "Ronda creada" y el botón de compartir de los
 * scorers muestran exactamente esto. La cascada vive en `useShare` y el texto del mensaje en `golf/share`.
 */
export function OpcionesParaCompartir({ enlaces, onCompartido }: OpcionesParaCompartirProps) {
  const { share, copyLink } = useShare()
  // Qué link se acaba de copiar: sin este feedback, "Copiar link" no hacía nada visible.
  // `n` cambia en cada copia para que copiar dos veces reinicie los 2 s.
  const [copiado, setCopiado] = useState<{ destino: Destino; n: number } | null>(null)
  useEffect(() => {
    if (!copiado) return
    const t = setTimeout(() => setCopiado(null), 2000)
    return () => clearTimeout(t)
  }, [copiado])

  const destinos = (['anotar', 'jugar', 'seguir'] as const).filter(d => enlaces[d])

  const compartir = async (destino: Destino) => {
    if ((await share(enlaces[destino]!)).ok) onCompartido?.()
  }

  const copiar = async (destino: Destino) => {
    if (await copyLink(enlaces[destino]!.url)) setCopiado(c => ({ destino, n: (c?.n ?? 0) + 1 }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
      {destinos.map(destino => {
        const { titulo, detalle, para } = DESTINO[destino]
        const esParaAnotar = destino !== 'seguir'
        return (
          <section
            key={destino}
            aria-labelledby={`compartir-${destino}`}
            style={{
              padding: '16px', borderRadius: '12px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
            }}
          >
            <h3 id={`compartir-${destino}`} style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              {titulo}
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-2)', lineHeight: 1.4, margin: '4px 0 12px' }}>{detalle}</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              {esParaAnotar ? (
                <Button variant="nav" className="flex-1" aria-label={`Compartir link ${para}`} onClick={() => { void compartir(destino) }}>
                  Compartir
                </Button>
              ) : (
                // Neutro a propósito: el dorado queda para lo que hace jugar (DESIGN §5, dieta del dorado).
                <button
                  type="button"
                  aria-label={`Compartir link ${para}`}
                  onClick={() => { void compartir(destino) }}
                  className="flex-1 inline-flex items-center justify-center h-12 px-5 rounded-xl font-semibold select-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-on-bg)] focus-visible:ring-offset-2"
                  style={{ background: 'transparent', color: 'var(--text)', border: '1px solid var(--input-border)', fontSize: '16px' }}
                >
                  Compartir
                </button>
              )}
              <Button
                variant="ghost"
                className="min-w-[128px]"
                aria-label={copiado?.destino === destino ? `Link ${para} copiado` : `Copiar link ${para}`}
                onClick={() => copiar(destino)}
                leftIcon={copiado?.destino === destino ? <Check size={16} strokeWidth={2} /> : undefined}
              >
                {copiado?.destino === destino ? 'Copiado' : 'Copiar link'}
              </Button>
            </div>
          </section>
        )
      })}
      {/* El lector de pantalla no siempre anuncia un cambio de texto dentro del botón enfocado. */}
      <span role="status" className="sr-only">{copiado ? 'Link copiado' : ''}</span>
    </div>
  )
}
