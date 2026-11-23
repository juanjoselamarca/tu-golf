'use client'

import { useState } from 'react'
import { Upload } from '@/components/icons'
import { ConfirmarFinalizarHoja } from './ConfirmarFinalizarHoja'
import { HojaDelScorer, estiloBotonDeHoja } from './HojaDelScorer'
import { OpcionesParaCompartir, type EnlacesDeLaRonda } from './OpcionesParaCompartir'

interface CompartirEnJuegoProps {
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
export function CompartirEnJuego({ enlaces, color }: CompartirEnJuegoProps) {
  const [paso, setPaso] = useState<Paso>('cerrado')
  const cerrar = () => setPaso('cerrado')

  return (
    <>
      <button
        type="button"
        onClick={() => setPaso('pregunta')}
        aria-label="Compartir la ronda"
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
          titulo="¿Quieres compartir tu ronda con amigos?"
          detalle="La siguen en vivo desde su celular, hoyo a hoyo."
          textoConfirmar="Sí"
          textoCancelar="No"
          onConfirmar={() => setPaso('opciones')}
          onCancelar={cerrar}
        />
      )}

      {paso === 'opciones' && (
        <HojaDelScorer titulo="Compartir la ronda" onCerrar={cerrar} fondoTestId="compartir-en-juego-fondo">
          <OpcionesParaCompartir enlaces={enlaces} onCompartido={cerrar} />
          <button onClick={cerrar} style={{ ...estiloBotonDeHoja(false), marginTop: '8px' }}>
            Volver al scorer
          </button>
        </HojaDelScorer>
      )}
    </>
  )
}
