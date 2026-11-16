'use client'

import { useState } from 'react'
import { Check } from '@/components/icons'
import { BottomSheet } from '@/components/ui/BottomSheet'
import type { ConfigJuego } from '@/golf/formats/personalizado'
import { colores } from '../estilos'
import { fraseDelJuego, type TrozoDeFrase } from './frase-del-juego'

type Valor = Extract<TrozoDeFrase, { tipo: 'valor' }>

/** Alto táctil mínimo de cada valor de la frase (se usa con guante y al sol). */
const ALTO_TACTIL = 44
/** Cuánto del ancho táctil se le devuelve al texto a cada lado (el valor se ve pegado a la frase). */
const MARGEN_TACTIL_PX = 13

type Pieza = { tipo: 'texto'; texto: string } | { tipo: 'valor'; valor: Valor; puntuacion: string }

/** Pega a cada valor la puntuación con que empieza el texto que lo sigue (".", ",", ":"…). */
export function renglonesConPuntuacion(trozos: readonly TrozoDeFrase[]): Pieza[] {
  const piezas: Pieza[] = []
  for (const t of trozos) {
    if (t.tipo === 'valor') {
      piezas.push({ tipo: 'valor', valor: t, puntuacion: '' })
      continue
    }
    const previa = piezas[piezas.length - 1]
    const signos = previa?.tipo === 'valor' ? (/^[.,;:!?)]+/.exec(t.texto)?.[0] ?? '') : ''
    if (signos && previa?.tipo === 'valor') previa.puntuacion = signos
    const resto = t.texto.slice(signos.length)
    if (resto) piezas.push({ tipo: 'texto', texto: resto })
  }
  return piezas
}

interface Props {
  config: ConfigJuego
  holes: number
  onConfig: (c: ConfigJuego) => void
}

/** "Así se juega": la frase con cada valor tocable; tocarlo abre sus alternativas en una hoja inferior. */
export function FraseDelJuego({ config, holes, onConfig }: Props) {
  const [abierto, setAbierto] = useState<Valor | null>(null)
  const trozos = fraseDelJuego(config, holes)

  return (
    <>
      {/* Cada renglón mide 44px (el alto táctil del valor): así dos valores en renglones seguidos no se pisan. */}
      <p style={{ margin: 0, fontSize: '17px', lineHeight: `${ALTO_TACTIL}px`, color: colores.texto }}>
        {renglonesConPuntuacion(trozos).map((t, i) => t.tipo === 'texto'
          ? <span key={i}>{t.texto}</span>
          : (
            // El valor y la puntuación que lo sigue van juntos: nunca queda un "." huérfano al inicio del renglón.
            <span key={i} style={{ whiteSpace: 'nowrap' }}>
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={`${t.valor.titulo}: ${t.valor.texto}. Cambiar`}
                onClick={() => setAbierto(t.valor)}
                style={{
                  // 44×44 de toque, pero la frase se lee corrida ("vale 2, peor bola 1"): el valor va centrado
                  // y el margen negativo devuelve a la línea el ancho extra del área táctil.
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minHeight: `${ALTO_TACTIL}px`, minWidth: `${ALTO_TACTIL}px`, verticalAlign: 'top',
                  margin: `0 -${MARGEN_TACTIL_PX}px`, position: 'relative',
                  border: 0, background: 'transparent', padding: 0, font: 'inherit', fontWeight: 700,
                  lineHeight: 1.2, color: colores.oroTexto, cursor: 'pointer',
                  textDecoration: `underline dotted ${colores.oroTexto}`, textDecorationThickness: '2px', textUnderlineOffset: '4px',
                }}
              >
                {t.valor.texto}
              </button>
              {t.puntuacion}
            </span>
          ))}
      </p>
      <BottomSheet abierto={abierto != null} onCerrar={() => setAbierto(null)} etiqueta={abierto?.titulo ?? ''}>
        {abierto && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>{abierto.titulo}</div>
            {abierto.opciones.map(o => (
              <button
                key={o.etiqueta}
                type="button"
                aria-pressed={o.activa}
                onClick={() => { onConfig(o.config); setAbierto(null) }}
                style={{
                  minHeight: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0 16px', borderRadius: '12px', fontSize: '16px', fontWeight: 600, cursor: 'pointer',
                  textAlign: 'left', color: colores.texto, background: colores.tarjeta,
                  border: o.activa ? `2px solid ${colores.texto}` : `1px solid ${colores.borde}`,
                }}
              >
                <span>{o.etiqueta.charAt(0).toUpperCase() + o.etiqueta.slice(1)}</span>
                {o.activa && <Check size={18} strokeWidth={2} aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}
      </BottomSheet>
    </>
  )
}
