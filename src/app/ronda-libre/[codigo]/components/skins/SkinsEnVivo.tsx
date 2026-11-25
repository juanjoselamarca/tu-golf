'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { nombresDeCelda } from '@/golf/ronda-libre/tabla-del-juego'
import type { VistaDelSkinsEnElScorer } from '@/golf/ronda-libre/skins-del-scorer'
import {
  armarResultadoDelSkins, textoDelNeto, textoDelPozoSinLiquidar, textoParaCompartirElSkins, type ResultadoDelSkins, type TablaDelSkins,
} from '@/golf/ronda-libre/tabla-del-skins'
import { useShare } from '@/components/share/useShare'
import { ALTO_NAVBAR_PX } from '@/lib/constants'
import { formatPesos } from '@/lib/format'
import { enElOrden } from '@/lib/ronda/orden-jugadores'
import type { EstadoDelJuego } from '../../hooks/useJuegoDeLaTimba'
import { PestanasDeLaTimba, PANEL_DE_PESTANA, type PestanaDeLaTimba } from '../timba/PestanasDeLaTimba'
import { ResultadoFinalDeLaTimba } from '../timba/ResultadoFinalDeLaTimba'
import { TarjetaDeGolpes, VOLVER } from '../timba/TimbaEnVivo'
import { TablaDelSkinsEnVivo } from './TablaDelSkinsEnVivo'

interface Jugador { id: string; nombre: string; scores: Readonly<Record<string, number | null | undefined>> | null }

const caja = {
  margin: 0, padding: '16px', borderRadius: '14px', background: 'var(--bg-surface)', border: '1px solid var(--border)',
  fontSize: '15px', lineHeight: 1.45, color: 'var(--text-2)',
} as const
const boton = {
  marginTop: '12px', width: '100%', minHeight: '48px', borderRadius: '12px', border: '1px solid var(--border-md)',
  background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
} as const

export const TEXTO_SKINS_ERROR = 'No pudimos cargar el skins. Revisa la señal.'
export const TEXTO_SKINS_SIN_REGLAS = 'No pudimos leer las reglas de este skins. Los golpes de cada uno quedan guardados.'

/**
 * Ronda en vivo de un Skins de ronda libre (reemplaza al ranking de golpes, que daría un ganador falso). Pestañas Juego
 * (tira de hoyos + lista por skins) y Tarjeta (golpes, con la X). Cerrada, primero el resultado con la liquidación;
 * «Hoyo a hoyo» abre las pestañas. Todo sale de `GET /juego` (o `/juego/publico` sin sesión): la página lo pide una vez.
 */
export function SkinsEnVivo(props: {
  juego: EstadoDelJuego<VistaDelSkinsEnElScorer>
  onReintentar: () => void
  jugadores: readonly Jugador[]
  hoyoInicio: number | null | undefined
  holes: number
  /** Estado de la base (nunca `?finished`). */
  finalizada: boolean
  cancha: string
  url: string
  compartirPrincipal?: boolean
}) {
  const { juego, onReintentar, jugadores, hoyoInicio, holes, finalizada, cancha, url, compartirPrincipal = true } = props
  const [pestana, setPestana] = useState<PestanaDeLaTimba>('juego')
  const [hoyoAHoyo, setHoyoAHoyo] = useState(false)
  const inicio = useRef<HTMLDivElement>(null)
  const montado = useRef(false)
  useEffect(() => {
    if (!montado.current) { montado.current = true; return }
    const el = inicio.current
    if (!el || typeof window === 'undefined') return
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - ALTO_NAVBAR_PX - 8) })
  }, [hoyoAHoyo])

  const enOrden = useMemo(
    () => (juego.estado === 'ok' ? enElOrden(juego.vista.jugadorIds, jugadores) : null) ?? jugadores,
    [juego, jugadores],
  )
  const nombres = useMemo(() => Object.fromEntries(enOrden.map(j => [j.id, j.nombre])), [enOrden])
  const cortos = useMemo(() => {
    const c = nombresDeCelda(enOrden.map(j => j.nombre))
    return Object.fromEntries(enOrden.map((j, i) => [j.id, c[i]]))
  }, [enOrden])
  const hoyos = useMemo(() => hoyosDeLaRonda(hoyoInicio ?? 1, holes), [hoyoInicio, holes])
  const tabla: TablaDelSkins | null = juego.estado === 'ok' ? juego.vista.tabla : null
  // Resultado final: ronda cerrada en la base, con la vista calculada ya cerrada (`useTimbaDeLaRonda` lo garantiza).
  const resultado = useMemo(
    () => (finalizada && tabla && !tabla.bloqueada ? armarResultadoDelSkins(tabla, nombres) : null),
    [finalizada, tabla, nombres],
  )
  const { share, isSharing } = useShare()
  const [aviso, setAviso] = useState<string | null>(null)
  const compartir = async () => {
    if (!resultado || !tabla) return
    const r = await share({ title: resultado.encabezado, text: textoParaCompartirElSkins(resultado, tabla, cancha), url })
    if (r.method === 'clipboard') setAviso(r.ok ? 'Resultado copiado: pégalo en el grupo.' : 'No pudimos compartir. Intenta de nuevo.')
    else setAviso(null)
  }

  if (resultado && tabla && !hoyoAHoyo) {
    return (
      <section style={{ marginBottom: '16px' }}>
        <div ref={inicio} />
        <ResultadoFinalDeLaTimba
          resultado={{ ...resultado, tramos: null, notaTramos: null, puntosEspeciales: null }}
          etiquetaDelRanking="Skins"
          alPieDelRanking={<LiquidacionDelSkins resultado={resultado} tabla={tabla} />}
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
          juego.estado === 'ok' && tabla ? (
            <TablaDelSkinsEnVivo tabla={tabla} nombres={nombres} cortos={cortos} desactualizado={juego.desactualizado} />
          ) : juego.estado === 'cargando' ? (
            <p role="status" style={caja}>Cargando el skins…</p>
          ) : juego.estado === 'sin_juego' ? (
            <p role="note" style={caja}>{TEXTO_SKINS_SIN_REGLAS}</p>
          ) : (
            <div role="alert" style={caja}>
              <p style={{ margin: 0 }}>{TEXTO_SKINS_ERROR}</p>
              <button type="button" onClick={onReintentar} style={boton}>Reintentar</button>
            </div>
          )
        ) : (
          <TarjetaDeGolpes jugadores={enOrden} hoyos={hoyos} fuera={tabla?.fuera} />
        )}
      </div>
    </section>
  )
}

/**
 * Liquidación al cierre: el valor del skin y, por jugador, lo que cobra y su neto en palabras («Gana», «Pierde»,
 * «Queda igual»: no depende del color). Sin pozo no hay liquidación. Con hoyos sin resolver al cerrar, no se liquida.
 */
export function LiquidacionDelSkins({ resultado, tabla }: { resultado: ResultadoDelSkins; tabla: TablaDelSkins }) {
  const titulo = { margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text)' } as const
  const nota = { margin: 0, fontSize: '13px', lineHeight: 1.4, color: 'var(--text-2)' } as const
  if (tabla.plata === 'sin_pozo') return <p style={nota}>Sin pozo: se jugó solo por skins.</p>
  if (!resultado.liquidacion) {
    return (
      <p role="note" style={{ ...caja, fontSize: '14px' }}>
        {textoDelPozoSinLiquidar(tabla)}
      </p>
    )
  }
  const bajada = tabla.plata === 'devolucion'
    ? `Pozo ${formatPesos(tabla.pozoTotal)}: cada uno recupera ${formatPesos(tabla.pozoPorJugador)}.`
    : `Pozo ${formatPesos(tabla.pozoTotal)} · ${tabla.filas.length} × ${formatPesos(tabla.pozoPorJugador)} · skin a ${formatPesos(tabla.valorSkin ?? 0)}`
  return (
    <section aria-labelledby="skins-liquidacion" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <h3 id="skins-liquidacion" style={titulo}>Liquidación</h3>
      <p className="num" style={nota}>{bajada}</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: '0 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px' }}>
        {resultado.liquidacion.map((l, i, todos) => (
          <li
            key={l.jugadorId}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '56px', padding: '8px 0', borderBottom: i < todos.length - 1 ? '1px solid var(--border)' : 'none' }}
          >
            <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '16px', color: 'var(--text)' }}>{l.nombre}</span>
              <span className="num" style={{ fontSize: '13px', color: 'var(--text-2)' }}>Cobra {formatPesos(l.cobra)}</span>
            </span>
            <span
              className="num"
              style={{ fontSize: '16px', fontWeight: l.neto > 0 ? 700 : 600, whiteSpace: 'nowrap', color: l.neto > 0 ? 'var(--brand-on-bg)' : 'var(--text)' }}
            >
              {textoDelNeto(l.neto)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
