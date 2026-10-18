'use client'

import { useEffect, useState } from 'react'
import { copyToClipboard } from '@/lib/clipboard'
import { Button } from '@/components/ui/Button'
import { Check } from '@/components/icons'
import { RoundCode } from '@/components/ui/RoundCode'
import { colores } from './estilos'
import { SITE_URL } from '@/lib/site-url'

type DestinoDelLink = 'jugar' | 'seguir'

interface Props {
  codigo: string
  cancha: string
  holes: number
  llevaElScoreDelGrupo: boolean
  onEmpezar: () => void
}

function urlDeLaRonda(codigo: string, destino: DestinoDelLink): string {
  return destino === 'jugar' ? `${SITE_URL}/ronda-libre/${codigo}/score` : `${SITE_URL}/ronda-libre/${codigo}`
}

const TEXTO: Record<DestinoDelLink, string> = {
  jugar: 'Únete a mi ronda en Golfers+',
  seguir: 'Sigue mi ronda en vivo en Golfers+',
}

/**
 * P15: share unificado. Usa la API nativa cuando existe (iOS Safari, Android
 * Chrome) y cae a WhatsApp cuando no. Copiar link queda como acción secundaria
 * explícita, no como botón dominante.
 *
 * TODO(foundation): reemplazar por `<ShareSheet url title text onShare />`
 * cuando Foundation publique el componente. Mantener la prioridad
 * navigator.share > WhatsApp > copiar.
 */
async function compartir(codigo: string, destino: DestinoDelLink): Promise<void> {
  const url = urlDeLaRonda(codigo, destino)
  const text = TEXTO[destino]

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: 'Golfers+', text, url })
    } catch {
      // El usuario canceló el share nativo. No hay nada que hacer ni que avisar.
    }
    return
  }

  window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank')
}

/**
 * Confirmación con el código de la ronda y los links para invitar.
 *
 * Jerarquía §5 de DESIGN.md: el único `commit` dorado sólido es "Empezar a
 * jugar". Antes los dos "Compartir" también eran dorado sólido → tres CTAs
 * idénticos y el usuario no distinguía cuál lo lleva al scorer.
 */
export function PantallaCompartir({ codigo, cancha, holes, llevaElScoreDelGrupo, onEmpezar }: Props) {
  // Qué link se acaba de copiar: sin este feedback, "Copiar link" no hacía nada visible.
  const [copiado, setCopiado] = useState<DestinoDelLink | null>(null)
  useEffect(() => {
    if (!copiado) return
    const t = setTimeout(() => setCopiado(null), 2000)
    return () => clearTimeout(t)
  }, [copiado])

  const copiar = async (destino: DestinoDelLink) => {
    if (await copyToClipboard(urlDeLaRonda(codigo, destino))) setCopiado(destino)
  }

  return (
    <div style={{
      background: colores.fondo, minHeight: '100vh', padding: '20px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
        <div style={{
          background: colores.tarjeta, border: `1px solid ${colores.borde}`,
          borderRadius: '20px', padding: '40px 28px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        }}>
          <div style={{
            fontSize: '14px', color: colores.texto3, textTransform: 'uppercase',
            letterSpacing: '0.1em', marginBottom: '8px',
          }}>
            Ronda creada
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <RoundCode code={codigo} size="lg" />
          </div>

          <div style={{ fontSize: '14px', color: colores.texto2, marginBottom: '32px' }}>
            {/* Los hoyos vienen de la ronda que se acaba de crear. Estaban
                escritos "18 hoyos" fijo: quien creaba una vuelta de 9 leía en la
                pantalla de confirmación que había creado una de 18. */}
            {cancha} &middot; {holes} hoyos
          </div>

          {([
            { destino: 'jugar' as const, titulo: 'Invitar a jugar' },
            { destino: 'seguir' as const, titulo: 'Invitar a seguir' },
          ]).map((bloque, i) => (
            <div key={bloque.destino} style={{ marginBottom: i === 0 ? '16px' : '32px' }}>
              <div style={{
                fontFamily: '"DM Sans", sans-serif', fontSize: '13px',
                color: colores.texto2, marginBottom: '8px', fontWeight: 500,
              }}>
                {bloque.titulo}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="nav" className="flex-1" onClick={() => compartir(codigo, bloque.destino)}>
                  Compartir
                </Button>
                <Button
                  variant="ghost"
                  className="min-w-[128px]"
                  onClick={() => copiar(bloque.destino)}
                  leftIcon={copiado === bloque.destino ? <Check size={16} strokeWidth={2} /> : undefined}
                  aria-live="polite"
                >
                  {copiado === bloque.destino ? 'Copiado' : 'Copiar link'}
                </Button>
              </div>
            </div>
          ))}

          <Button variant="commit" size="lg" fullWidth onClick={onEmpezar}>
            {llevaElScoreDelGrupo ? 'Empezar score de grupo →' : 'Empezar a jugar →'}
          </Button>
        </div>
      </div>
    </div>
  )
}
