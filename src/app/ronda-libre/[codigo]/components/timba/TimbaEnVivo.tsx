'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { nombresCortos } from '@/golf/ronda-libre/tabla-del-juego'
import { armarResultadoDeLaTimba, textoParaCompartirLaTimba } from '@/golf/ronda-libre/resultado-de-la-timba'
import { useShare } from '@/components/share/useShare'
import type { EstadoDelJuego } from '../../hooks/useJuegoDeLaTimba'
import { ALTO_NAVBAR_PX } from '@/lib/constants'
import { PestanasDeLaTimba, PANEL_DE_PESTANA, type PestanaDeLaTimba } from './PestanasDeLaTimba'
import { PanelDelJuego } from './PanelDelJuego'
import { ResultadoFinalDeLaTimba } from './ResultadoFinalDeLaTimba'

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
    <div role="table" aria-label="Golpes por hoyo" style={{ display: 'flex', flexDirection: 'column', fontSize: '16px', color: 'var(--text)' }}>
      <div role="row" style={{ display: 'grid', gridTemplateColumns: columnas, gap: '4px', padding: '6px 4px', color: 'var(--text-2)', fontSize: '13px', fontWeight: 500 }}>
        <span role="columnheader">Hoyo</span>
        {cortos.map((n, i) => <span key={jugadores[i].id} role="columnheader" style={{ textAlign: 'right', overflowWrap: 'anywhere', minWidth: 0 }}>{n}</span>)}
      </div>
      {filas.map(h => (
        <div key={h} role="row" className="num" style={{ display: 'grid', gridTemplateColumns: columnas, gap: '4px', padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
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

const VOLVER = {
  alignSelf: 'flex-start', minHeight: '44px', padding: '0 4px', border: 0, background: 'transparent', cursor: 'pointer',
  color: 'var(--brand-on-bg)', fontFamily: 'inherit', fontSize: '16px', fontWeight: 600,
} as const

/**
 * Ronda en vivo de una Timba libre: pestañas Juego (por defecto: es lo que el grupo vino a ver) y Tarjeta. Reemplaza
 * al ranking de golpes, que en una Timba diría un ganador falso. Los puntos se leen solo de `GET /juego` (la página
 * lo pide una vez con `useJuegoDeLaTimba`: los retiros también los usa "Guardar en mi historial").
 *
 * Finalizada (estado de la base, nunca `?finished`): primero el resultado final; "Hoyo a hoyo" abre las pestañas.
 */
export function TimbaEnVivo(props: {
  juego: EstadoDelJuego
  onReintentar: () => void
  jugadores: readonly Jugador[]
  hoyoInicio: number | null | undefined
  holes: number
  /** `ronda.estado === 'finalizada'`: se muestra el resultado final. */
  finalizada: boolean
  cancha: string
  /** Link a la ronda, para compartir. */
  url: string
  /** `false` mientras falte guardar en el historial: un solo dorado sólido por vista (DESIGN.md §5). */
  compartirPrincipal?: boolean
  onIngresar: () => void
}) {
  const { juego, onReintentar, jugadores, hoyoInicio, holes, finalizada, cancha, url, compartirPrincipal = true, onIngresar } = props
  const [pestana, setPestana] = useState<PestanaDeLaTimba>('juego')
  const [hoyoAHoyo, setHoyoAHoyo] = useState(false)
  // Al pasar del resultado a la tabla (y de vuelta), la vista parte arriba: si no, queda a mitad de la tabla y
  // "Volver al resultado" fuera de la pantalla.
  const inicio = useRef<HTMLDivElement>(null)
  const montado = useRef(false)
  useEffect(() => {
    if (!montado.current) { montado.current = true; return }
    const el = inicio.current
    if (!el || typeof window === 'undefined') return
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - ALTO_NAVBAR_PX - 8) })
  }, [hoyoAHoyo])
  const nombres = useMemo(() => Object.fromEntries(jugadores.map(j => [j.id, j.nombre])), [jugadores])
  const hoyos = useMemo(() => hoyosDeLaRonda(hoyoInicio ?? 1, holes), [hoyoInicio, holes])
  const resultado = useMemo(
    () => (finalizada && juego.estado === 'ok' ? armarResultadoDeLaTimba(juego.vista, nombres) : null),
    [finalizada, juego, nombres],
  )
  const { share, isSharing } = useShare()
  const [aviso, setAviso] = useState<string | null>(null)

  const compartir = async () => {
    if (!resultado) return
    const r = await share({ title: resultado.encabezado, text: textoParaCompartirLaTimba(resultado, cancha), url })
    if (r.method === 'clipboard') setAviso(r.ok ? 'Resultado copiado: pégalo en el grupo.' : 'No pudimos compartir. Intenta de nuevo.')
    else setAviso(null)
  }

  if (resultado && !hoyoAHoyo) {
    return (
      <section style={{ marginBottom: '16px' }}>
        <div ref={inicio} />
        <ResultadoFinalDeLaTimba
          resultado={resultado}
          onHoyoAHoyo={() => { setPestana('juego'); setHoyoAHoyo(true) }}
          onCompartir={() => { void compartir() }}
          compartiendo={isSharing}
          compartirPrincipal={compartirPrincipal}
          aviso={aviso}
        />
      </section>
    )
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
      <div ref={inicio} />
      {resultado && (
        <button type="button" onClick={() => setHoyoAHoyo(false)} style={VOLVER}>
          Volver al resultado
        </button>
      )}
      <PestanasDeLaTimba activa={pestana} onCambiar={setPestana} />
      <div id={PANEL_DE_PESTANA(pestana)} role="tabpanel">
        {pestana === 'juego' ? (
          <PanelDelJuego
            juego={juego} nombres={nombres} hoyoActual={null} onReintentar={onReintentar} onIngresar={onIngresar}
            encabezadoFijoEn={`${ALTO_NAVBAR_PX}px`}
          />
        ) : (
          <TarjetaDeGolpes jugadores={jugadores} hoyos={hoyos} />
        )}
      </div>
    </section>
  )
}
