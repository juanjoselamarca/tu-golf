'use client'

import { useMemo, useState } from 'react'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { nombresCortos } from '@/golf/ronda-libre/tabla-del-juego'
import { useJuegoDeLaTimba } from '../../hooks/useJuegoDeLaTimba'
import { ALTO_NAVBAR_PX } from '@/lib/constants'
import { PestanasDeLaTimba, PANEL_DE_PESTANA, type PestanaDeLaTimba } from './PestanasDeLaTimba'
import { PanelDelJuego } from './PanelDelJuego'

const MONO = 'var(--font-dm-mono), "DM Mono", monospace'

interface Jugador { id: string; nombre: string; scores: Readonly<Record<string, number | null | undefined>> | null }

/** Tarjeta de golpes (gross) hoyo a hoyo de una Timba: los golpes de cada uno, sin puntos. */
export function TarjetaDeGolpes({ jugadores, hoyos }: { jugadores: readonly Jugador[]; hoyos: readonly number[] }) {
  const cortos = nombresCortos(jugadores.map(j => j.nombre))
  const golpes = (j: Jugador, h: number) => j.scores?.[String(h)] ?? null
  const ultimo = hoyos.reduce((u, h, i) => (jugadores.some(j => golpes(j, h) != null) ? i : u), -1)
  const filas = hoyos.slice(0, ultimo + 1)
  const columnas = `minmax(44px, 0.8fr) repeat(${jugadores.length}, minmax(0, 1fr))`
  if (filas.length === 0) {
    return <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-2)', textAlign: 'center' }}>Todavía no hay golpes anotados.</p>
  }
  return (
    <div role="table" aria-label="Golpes por hoyo" style={{ display: 'flex', flexDirection: 'column', fontSize: '14px', color: 'var(--text)' }}>
      <div role="row" style={{ display: 'grid', gridTemplateColumns: columnas, gap: '4px', padding: '6px 4px', color: 'var(--text-2)', fontSize: '12px', fontWeight: 600 }}>
        <span role="columnheader">Hoyo</span>
        {cortos.map((n, i) => <span key={jugadores[i].id} role="columnheader" style={{ textAlign: 'right' }}>{n}</span>)}
      </div>
      {filas.map(h => (
        <div key={h} role="row" style={{ display: 'grid', gridTemplateColumns: columnas, gap: '4px', padding: '8px 4px', borderBottom: '1px solid var(--border)', fontFamily: MONO }}>
          <span role="rowheader">{h}</span>
          {jugadores.map(j => {
            const g = golpes(j, h)
            return <span key={j.id} role="cell" aria-label={g == null ? 'sin golpes' : String(g)} style={{ textAlign: 'right', color: g == null ? 'var(--text-3)' : 'var(--text)' }}>{g ?? '·'}</span>
          })}
        </div>
      ))}
    </div>
  )
}

/**
 * Ronda en vivo de una Timba libre: pestañas Juego (por defecto: es lo que el grupo vino a ver) y Tarjeta. Reemplaza
 * al ranking de golpes, que en una Timba diría un ganador falso. Los puntos se leen solo de `GET /juego`.
 */
export function TimbaEnVivo(props: {
  codigo: string
  jugadores: readonly Jugador[]
  hoyoInicio: number | null | undefined
  holes: number
  /** Cambia con cada actualización en vivo (y al iniciar sesión): vuelve a pedir el juego. */
  firma: string
  /** Ronda finalizada: los puntos ya no cambian; no se vuelve a pedir el juego cada 20 s. */
  cerrada: boolean
  onIngresar: () => void
}) {
  const { codigo, jugadores, hoyoInicio, holes, firma, cerrada, onIngresar } = props
  const [pestana, setPestana] = useState<PestanaDeLaTimba>('juego')
  const { juego, recargar } = useJuegoDeLaTimba(codigo, { activo: true, firma, intervaloS: cerrada ? 0 : undefined })
  const nombres = useMemo(() => Object.fromEntries(jugadores.map(j => [j.id, j.nombre])), [jugadores])
  const hoyos = useMemo(() => hoyosDeLaRonda(hoyoInicio ?? 1, holes), [hoyoInicio, holes])

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
      <PestanasDeLaTimba activa={pestana} onCambiar={setPestana} />
      <div id={PANEL_DE_PESTANA(pestana)} role="tabpanel">
        {pestana === 'juego' ? (
          <PanelDelJuego
            juego={juego} nombres={nombres} hoyoActual={null} onReintentar={() => { void recargar() }} onIngresar={onIngresar}
            encabezadoFijoEn={`${ALTO_NAVBAR_PX}px`}
          />
        ) : (
          <TarjetaDeGolpes jugadores={jugadores} hoyos={hoyos} />
        )}
      </div>
    </section>
  )
}
