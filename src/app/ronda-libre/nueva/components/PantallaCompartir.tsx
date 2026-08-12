'use client'

import { copyToClipboard } from '@/lib/clipboard'
import { RoundCode } from '@/components/ui/RoundCode'
import { colores } from './estilos'

type DestinoDelLink = 'jugar' | 'seguir'

interface Props {
  codigo: string
  cancha: string
  holes: number
  llevaElScoreDelGrupo: boolean
  onEmpezar: () => void
}

function urlDeLaRonda(codigo: string, destino: DestinoDelLink): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://golfersplus.vercel.app'
  return destino === 'jugar' ? `${base}/ronda-libre/${codigo}/score` : `${base}/ronda-libre/${codigo}`
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

/** Confirmación con el código de la ronda y los links para invitar. */
export function PantallaCompartir({ codigo, cancha, holes, llevaElScoreDelGrupo, onEmpezar }: Props) {
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
            <RoundCode code={codigo} size="xl" />
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
                <button
                  onClick={() => compartir(codigo, bloque.destino)}
                  style={{
                    flex: 1, background: colores.oro, color: colores.oroSobreTexto,
                    fontWeight: 700, fontSize: '15px', padding: '14px 16px',
                    borderRadius: '12px', border: 'none', cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  Compartir
                </button>
                <button
                  onClick={() => { copyToClipboard(urlDeLaRonda(codigo, bloque.destino)).catch(() => {}) }}
                  style={{
                    padding: '14px 16px', background: colores.tarjeta,
                    border: `1px solid ${colores.borde}`, color: colores.texto2,
                    fontWeight: 500, fontSize: '14px', borderRadius: '12px', cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  Copiar link
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={onEmpezar}
            style={{
              width: '100%', background: colores.oro, color: colores.oroSobreTexto,
              fontWeight: 700, fontSize: '16px', padding: '16px',
              borderRadius: '14px', border: 'none', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {llevaElScoreDelGrupo ? 'Empezar score de grupo →' : 'Empezar a jugar →'}
          </button>
        </div>
      </div>
    </div>
  )
}
