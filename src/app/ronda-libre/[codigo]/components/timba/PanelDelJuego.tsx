'use client'

import { useMemo, type ReactNode } from 'react'
import { armarTablaDelJuego } from '@/golf/ronda-libre/tabla-del-juego'
import type { MotivoSinJuego } from '@/golf/ronda-libre/juego-de-la-ronda'
import type { EstadoDelJuego } from '../../hooks/useJuegoDeLaTimba'
import { JuegoDeLaTimba } from './JuegoDeLaTimba'

/** Por qué no hay puntos, en palabras del grupo. Los golpes siempre quedan guardados. */
export const TEXTO_SIN_JUEGO: Record<MotivoSinJuego, string> = {
  reglas_invalidas: 'No pudimos leer las reglas de este juego. Los golpes de cada uno quedan guardados.',
  jugadores_cambiaron: 'Cambiaron los jugadores de la ronda y las parejas ya no calzan. Los golpes de cada uno quedan guardados.',
  neto_no_disponible: 'El juego en neto todavía no está disponible en 27 hoyos. Los golpes de cada uno quedan guardados.',
  sin_datos_de_cancha: 'Faltan datos de la cancha (par o hándicap de hoyo) para calcular los puntos. Los golpes quedan guardados.',
}
export const TEXTO_JUEGO_SIN_SESION = 'Ingresa con tu cuenta para ver los puntos de la Timba.'
export const TEXTO_JUEGO_ERROR = 'No pudimos cargar los puntos. Revisa la señal.'

const caja = {
  margin: 0, padding: '16px', borderRadius: '14px', background: 'var(--bg-surface)', border: '1px solid var(--border)',
  fontSize: '15px', lineHeight: 1.45, color: 'var(--text-2)',
} as const

const boton = {
  marginTop: '12px', width: '100%', minHeight: '48px', borderRadius: '12px', border: '1px solid var(--border-md)',
  background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
} as const

/** Pestaña Juego con todos sus estados: cargando, sin juego (motivo), sin sesión, sin señal, y el juego. */
export function PanelDelJuego(props: {
  juego: EstadoDelJuego
  nombres: Readonly<Record<string, string>>
  hoyoActual: number | null
  onReintentar: () => void
  onIngresar?: () => void
  pie?: ReactNode
  /** `JuegoDeLaTimba.encabezadoFijoEn`. */
  encabezadoFijoEn?: string
}) {
  const { juego, nombres, hoyoActual, onReintentar, onIngresar, pie, encabezadoFijoEn } = props
  const tabla = useMemo(
    () => (juego.estado === 'ok' ? armarTablaDelJuego(juego.vista, nombres, hoyoActual) : null),
    [juego, nombres, hoyoActual],
  )

  if (juego.estado === 'ok' && tabla) return <JuegoDeLaTimba tabla={tabla} desactualizado={juego.desactualizado} pie={pie} encabezadoFijoEn={encabezadoFijoEn} />
  if (juego.estado === 'cargando') return <p role="status" style={caja}>Cargando los puntos…</p>
  if (juego.estado === 'sin_juego') return <p role="note" style={caja}>{TEXTO_SIN_JUEGO[juego.motivo]}</p>
  if (juego.estado === 'sin_sesion') {
    return (
      <div style={caja}>
        <p style={{ margin: 0 }}>{TEXTO_JUEGO_SIN_SESION}</p>
        {onIngresar && <button type="button" onClick={onIngresar} style={boton}>Ingresar</button>}
      </div>
    )
  }
  return (
    <div role="alert" style={caja}>
      <p style={{ margin: 0 }}>{TEXTO_JUEGO_ERROR}</p>
      <button type="button" onClick={onReintentar} style={boton}>Reintentar</button>
    </div>
  )
}
