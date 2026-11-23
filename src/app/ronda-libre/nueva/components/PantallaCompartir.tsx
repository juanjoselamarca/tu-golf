'use client'

import { Button } from '@/components/ui/Button'
import { RoundCode } from '@/components/ui/RoundCode'
import { OpcionesParaCompartir, enlacesDeRondaLibre } from '@/components/ronda/OpcionesParaCompartir'
import { colores } from './estilos'

interface Props {
  codigo: string
  cancha: string
  holes: number
  llevaElScoreDelGrupo: boolean
  onEmpezar: () => void
}

/**
 * Confirmación con el código de la ronda y los links para invitar.
 *
 * Jerarquía §5 de DESIGN.md: el único `commit` dorado sólido es "Empezar a
 * jugar". Antes los dos "Compartir" también eran dorado sólido → tres CTAs
 * idénticos y el usuario no distinguía cuál lo lleva al scorer.
 */
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
            <RoundCode code={codigo} size="lg" />
          </div>

          <div style={{ fontSize: '14px', color: colores.texto2, marginBottom: '32px' }}>
            {/* Los hoyos vienen de la ronda que se acaba de crear. Estaban
                escritos "18 hoyos" fijo: quien creaba una vuelta de 9 leía en la
                pantalla de confirmación que había creado una de 18. */}
            {cancha} &middot; {holes} hoyos
          </div>

          {/* Con un solo celular anotando por todos, "Invitar a jugar" llevaba a un aviso de que el admin
              lleva el score: solo se invita a seguir. Las mismas opciones que el botón de compartir del scorer. */}
          <div style={{ marginBottom: '32px' }}>
            <OpcionesParaCompartir enlaces={enlacesDeRondaLibre(codigo, { conJugar: !llevaElScoreDelGrupo })} />
          </div>

          <Button variant="commit" size="lg" fullWidth onClick={onEmpezar}>
            {llevaElScoreDelGrupo ? 'Empezar score de grupo →' : 'Empezar a jugar →'}
          </Button>
        </div>
      </div>
    </div>
  )
}
