'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Check } from '@/components/icons'
import { useShare } from '@/components/share/useShare'
import { buildLiveShare, buildRoundInviteShare, buildFollowTournamentShare } from '@/golf/share/payload'
import type { SharePayload } from '@/golf/share/types'
import { SITE_URL } from '@/lib/site-url'

/**
 * Qué se comparte: el mensaje completo (texto + link) de cada invitación, armado con los builders de
 * `golf/share`. Sin `jugar` (un solo celular anota por todos, o un torneo) solo se invita a seguir.
 */
export interface EnlacesDeLaRonda {
  /** Sumarse a anotar (`/ronda-libre/<codigo>/score`). */
  jugar?: SharePayload
  /** Seguirla en vivo, sin cuenta. */
  seguir: SharePayload
}

/**
 * Links de una ronda libre. `conJugar: false` cuando un solo celular anota por todos (score de grupo, o el
 * admin anotando): un link para "sumarse a anotar" no lleva a ninguna parte útil.
 */
export function enlacesDeRondaLibre(codigo: string, { conJugar }: { conJugar: boolean }): EnlacesDeLaRonda {
  const url = `${SITE_URL}/ronda-libre/${codigo}`
  const seguir = buildLiveShare({ url })
  return conJugar ? { jugar: buildRoundInviteShare({ url: `${url}/score` }), seguir } : { seguir }
}

/**
 * Un torneo se invita a seguir por su página pública (`/torneo/<slug>`): `/en-vivo` pide sesión y PRO, y
 * quien recibe el link por WhatsApp se topaba con el muro de pago.
 */
export function enlacesDeTorneo(slug: string, nombre: string): EnlacesDeLaRonda {
  return { seguir: buildFollowTournamentShare({ tournamentName: nombre, url: `${SITE_URL}/torneo/${slug}` }) }
}

type Destino = 'jugar' | 'seguir'

const TITULO: Record<Destino, string> = { jugar: 'Invitar a jugar', seguir: 'Invitar a seguir' }

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

  const destinos = (['jugar', 'seguir'] as const).filter(d => enlaces[d])

  const compartir = async (destino: Destino) => {
    if ((await share(enlaces[destino]!)).ok) onCompartido?.()
  }

  const copiar = async (destino: Destino) => {
    if (await copyLink(enlaces[destino]!.url)) setCopiado(c => ({ destino, n: (c?.n ?? 0) + 1 }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {destinos.map(destino => (
        <div key={destino}>
          <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '8px', fontWeight: 500 }}>
            {TITULO[destino]}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="nav" className="flex-1" onClick={() => { void compartir(destino) }}>
              Compartir
            </Button>
            <Button
              variant="ghost"
              className="min-w-[128px]"
              onClick={() => copiar(destino)}
              leftIcon={copiado?.destino === destino ? <Check size={16} strokeWidth={2} /> : undefined}
            >
              {copiado?.destino === destino ? 'Copiado' : 'Copiar link'}
            </Button>
          </div>
        </div>
      ))}
      {/* El lector de pantalla no siempre anuncia un cambio de texto dentro del botón enfocado. */}
      <span role="status" className="sr-only">{copiado ? 'Link copiado' : ''}</span>
    </div>
  )
}
