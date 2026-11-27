'use client'

import { Button } from '@/components/ui/Button'
import { RoundCode } from '@/components/ui/RoundCode'
import { Check } from '@/components/icons'
import { OpcionesParaCompartir, enlacesDeRondaLibre } from '@/components/ronda/OpcionesParaCompartir'
import { colores } from './estilos'

interface Props {
  codigo: string
  cancha: string
  holes: number
  llevaElScoreDelGrupo: boolean
  /** Un celular por equipo: el primer bloque es el link para que cada equipo anote el suyo. */
  unCelularPorEquipo?: boolean
  onEmpezar: () => void
}

/** El botón que lleva al scorer: dice qué va a hacer quien lo toca. */
export function textoDeEmpezar(unCelularPorEquipo: boolean, llevaElScoreDelGrupo: boolean): string {
  if (unCelularPorEquipo) return 'Anotar mi equipo'
  return llevaElScoreDelGrupo ? 'Empezar a anotar' : 'Empezar a jugar'
}

/**
 * «Ronda creada»: qué se creó, los links (cada uno dice si es para anotar o para mirar) y UNA acción principal que
 * lleva al scorer. Jerarquía §5 de DESIGN.md: el único `commit` dorado sólido es el de empezar; el link para anotar
 * va en dorado outline y el de mirar, neutro (feedback de Juanjo, 26-nov: «no se entiende nada, es enredado»).
 */
export function PantallaCompartir({ codigo, cancha, holes, llevaElScoreDelGrupo, unCelularPorEquipo = false, onEmpezar }: Props) {
  const enlaces = enlacesDeRondaLibre(codigo, { conJugar: !llevaElScoreDelGrupo, unCelularPorEquipo })
  return (
    <div style={{ background: colores.fondo, minHeight: '100vh', padding: '24px 16px 32px' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Check size={24} strokeWidth={2} aria-hidden="true" style={{ color: colores.ok, flexShrink: 0 }} />
          <h1 style={{ fontSize: '28px', fontWeight: 600, color: colores.texto, margin: 0, lineHeight: 1.2 }}>Ronda creada</h1>
        </div>
        {/* Los hoyos vienen de la ronda que se acaba de crear: con "18 hoyos" fijo, quien creaba una vuelta de 9
            leía que había creado una de 18. */}
        <div style={{ fontSize: '16px', color: colores.texto2, marginTop: '4px', overflowWrap: 'anywhere' }}>
          {cancha} · {holes} hoyos
        </div>

        {/* Con un solo celular anotando por todos no hay link para anotar: solo se invita a mirar. Las mismas
            opciones que el botón de compartir del scorer. */}
        <div style={{ marginTop: '24px' }}>
          {/* Sin título «Comparte los links»: cada tarjeta ya dice para qué es su link (revisión Fable 27-nov). */}
          <OpcionesParaCompartir enlaces={enlaces} />
        </div>

        {/* El código va después de los links: es lo menos usado en este paso (revisión Fable 27-nov). */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
          marginTop: '24px', padding: '12px 16px', borderRadius: '12px',
          background: colores.tarjeta, border: `1px solid ${colores.borde}`,
        }}>
          <div style={{ fontSize: '14px', color: colores.texto2 }}>Código</div>
          {/* Sin encogerse: el código partido en dos líneas se lee como dos códigos. */}
          <div style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
            <RoundCode code={codigo} size="md" />
          </div>
        </div>

        <div style={{ marginTop: '24px' }}>
          <Button variant="commit" size="lg" fullWidth onClick={onEmpezar}>
            {textoDeEmpezar(unCelularPorEquipo, llevaElScoreDelGrupo)} →
          </Button>
        </div>
      </div>
    </div>
  )
}
