'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { HojaDelScorer, estiloBotonDeHoja } from './HojaDelScorer'

interface ConfirmarFinalizarHojaProps {
  /** La pregunta: `textoConfirmarFinalizar` (hoyos que se marcan como par, o tarjeta completa). */
  titulo: string
  /** Texto bajo la pregunta (opcional): qué pasa si se confirma. */
  detalle?: string
  /** Botón de confirmar; por defecto "Finalizar". La misma hoja confirma el retiro de un jugador en la Timba. */
  textoConfirmar?: string
  /** Botón de cancelar; por defecto "Cancelar". */
  textoCancelar?: string
  /** Algo para elegir antes de confirmar (el retiro elige desde qué hoyo), entre el detalle y los botones. */
  children?: ReactNode
  onConfirmar: () => void
  onCancelar: () => void
}

/** Más que el intervalo de un doble toque y menos de lo que tarda alguien en leer la pregunta. */
export const MS_ANTES_DE_ARMAR = 400

/**
 * Confirmación de los scorers (finalizar la ronda, retirar a un jugador, compartir). Queda abierta hasta
 * que la persona decide: antes "Finalizar" era el mismo botón armado por 5 segundos, y quien se distraía
 * entre hoyos volvía a verlo desarmado sin saber si la ronda se había cerrado.
 *
 * Confirmar no recibe toques durante los primeros 400 ms: la hoja aparece bajo el dedo que tocó el botón
 * que la abrió y, según lo alta que esté la barra (sube si debajo está "Descartar ronda"), el segundo toque
 * de un doble toque caía justo en él y cerraba la ronda.
 */
export function ConfirmarFinalizarHoja({
  titulo, detalle, textoConfirmar = 'Finalizar', textoCancelar = 'Cancelar', children, onConfirmar, onCancelar,
}: ConfirmarFinalizarHojaProps) {
  const confirmarRef = useRef<HTMLButtonElement>(null)
  const [armada, setArmada] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setArmada(true), MS_ANTES_DE_ARMAR)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => { confirmarRef.current?.focus() }, [])

  return (
    <HojaDelScorer titulo={titulo} detalle={detalle} onCerrar={onCancelar} fondoTestId="confirmar-finalizar-fondo">
      {children}
      <button
        ref={confirmarRef}
        onClick={onConfirmar}
        style={{ ...estiloBotonDeHoja(true), pointerEvents: armada ? 'auto' : 'none' }}
      >
        {textoConfirmar}
      </button>
      <button onClick={onCancelar} style={estiloBotonDeHoja(false)}>
        {textoCancelar}
      </button>
    </HojaDelScorer>
  )
}
