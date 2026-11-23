'use client'

import { useRef, useState } from 'react'
import { Upload } from '@/components/icons'
import { ConfirmarFinalizarHoja } from './ConfirmarFinalizarHoja'
import { HojaDelScorer, estiloBotonDeHoja } from './HojaDelScorer'
import { OpcionesParaCompartir, type EnlacesDeLaRonda } from './OpcionesParaCompartir'

/** El texto de la hoja según qué se comparte: "tu ronda" no calza en el scorer de un torneo. */
const TEXTOS = {
  ronda: {
    pregunta: '¿Quieres compartir tu ronda con amigos?',
    detalle: 'La siguen en vivo desde su celular, hoyo a hoyo.',
    titulo: 'Compartir la ronda',
  },
  torneo: {
    pregunta: '¿Quieres compartir el torneo con amigos?',
    detalle: 'Siguen el leaderboard en vivo desde su celular.',
    titulo: 'Compartir el torneo',
  },
} as const

interface CompartirEnJuegoProps {
  /** `ronda` (ronda libre) o `torneo`: cambia el texto de la hoja. */
  de: keyof typeof TEXTOS
  enlaces: EnlacesDeLaRonda
  /** Color del ícono: el texto tenue del scorer donde va. */
  color: string
}

type Paso = 'cerrado' | 'pregunta' | 'opciones'

/**
 * Botón de compartir de los scorers. Antes el único momento para invitar a alguien a seguir la ronda era la
 * pantalla "Ronda creada": desaparecía al empezar a jugar y el scorer de grupo no tenía cómo compartir.
 *
 * Primero pregunta: en cancha el ícono se toca sin querer, con el guante o al guardar el teléfono, y la
 * pregunta se descarta en un toque. Con "Sí" aparecen las mismas opciones de "Ronda creada".
 */
export function CompartirEnJuego({ de, enlaces, color }: CompartirEnJuegoProps) {
  const [paso, setPaso] = useState<Paso>('cerrado')
  const textos = TEXTOS[de]
  const iconoRef = useRef<HTMLButtonElement>(null)
  // La hoja de opciones reemplaza a la pregunta: el foco que ella guardó ("Sí") ya no existe al cerrar,
  // así que vuelve explícitamente al ícono.
  const cerrar = () => { setPaso('cerrado'); iconoRef.current?.focus() }

  return (
    <>
      <button
        ref={iconoRef}
        type="button"
        onClick={() => setPaso('pregunta')}
        aria-label={textos.titulo}
        style={{
          minWidth: '44px', minHeight: '44px', padding: 0, background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color,
          touchAction: 'manipulation',
        }}
      >
        <Upload size={18} strokeWidth={2} aria-hidden="true" />
      </button>

      {paso === 'pregunta' && (
        <ConfirmarFinalizarHoja
          titulo={textos.pregunta}
          detalle={textos.detalle}
          textoConfirmar="Sí"
          textoCancelar="No"
          onConfirmar={() => setPaso('opciones')}
          onCancelar={cerrar}
        />
      )}

      {paso === 'opciones' && (
        <HojaDelScorer titulo={textos.titulo} onCerrar={cerrar} fondoTestId="compartir-en-juego-fondo">
          <OpcionesParaCompartir enlaces={enlaces} onCompartido={cerrar} />
          <button onClick={cerrar} style={{ ...estiloBotonDeHoja(false), marginTop: '8px' }}>
            Volver al scorer
          </button>
        </HojaDelScorer>
      )}
    </>
  )
}
