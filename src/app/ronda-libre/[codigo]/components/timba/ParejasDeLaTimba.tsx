import type { CasillaDelTramo, ParejaDelTramo, TramoDelJuego } from '@/golf/ronda-libre/tabla-del-juego'
import { CasillaDeHoyo, COLOR_DEL_LADO } from '../CasillaDeHoyo'

/** Casillas por fila: todas si caben (≤ 9); si no, filas parejas de hasta 9 (parejas fijas en 18 → 2 de 9). */
export function casillasPorFila(n: number): number {
  if (n <= 9) return Math.max(1, n)
  return Math.ceil(n / Math.ceil(n / 9))
}

function Cuadradito({ lado }: { lado: 'a' | 'b' }) {
  return <span aria-hidden style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '3px', flex: '0 0 auto', background: COLOR_DEL_LADO[lado] }} />
}

/** Estado del tramo con palabras: "Terminado", "En juego · quedan 3", "Parte en el 13". */
export function textoDelEstadoDelTramo(tramo: TramoDelJuego, primerDuelo: boolean): string {
  switch (tramo.estado.tipo) {
    case 'terminado': return 'Terminado'
    case 'en_juego': return `En juego · quedan ${tramo.estado.quedan}`
    case 'no_se_jugo': return 'No se jugó'
    case 'por_jugar': return primerDuelo ? 'Primer duelo' : `Parte en el ${tramo.primerHoyo}`
  }
}

function EstadoDelTramo({ tramo, primerDuelo }: { tramo: TramoDelJuego; primerDuelo: boolean }) {
  const tipo = tramo.estado.tipo
  const color = tipo === 'terminado' ? 'var(--status-live-fg)' : tipo === 'en_juego' ? 'var(--brand-on-bg)' : 'var(--text-2)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: tipo === 'por_jugar' || tipo === 'no_se_jugo' ? 500 : 600, color, whiteSpace: 'nowrap' }}>
      {tipo === 'terminado' && (
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline' }}>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
      {textoDelEstadoDelTramo(tramo, primerDuelo)}
    </span>
  )
}

function descripcionDeCasilla(c: CasillaDelTramo, parejas: [ParejaDelTramo, ParejaDelTramo]): string {
  switch (c.ganador) {
    case 'a': return `Hoyo ${c.numero}: ganan ${parejas[0].nombre}`
    case 'b': return `Hoyo ${c.numero}: ganan ${parejas[1].nombre}`
    case 'empate': return `Hoyo ${c.numero}: empate`
    case 'sin_jugar': return `Hoyo ${c.numero}: no se jugó`
    case 'pendiente': return `Hoyo ${c.numero}: por jugar`
  }
}

/** Ancho real de una casilla con 9 por fila en un teléfono de 390 px. */
const CASILLA_ANGOSTA_PX = 30

/** Tira de casillas del tramo: quién ganó cada hoyo (iniciales de la pareja), "=" empate, punteada sin jugar. */
export function TiraDelTramo({ tramo, tamano }: { tramo: TramoDelJuego; tamano: number }) {
  const porFila = casillasPorFila(tramo.casillas.length)
  // 8 o 9 por fila (parejas fijas a 18) a 390 px: cada casilla mide ~30 px aunque el tope sea mayor.
  const tamanoReal = porFila >= 8 ? Math.min(tamano, CASILLA_ANGOSTA_PX) : tamano
  return (
    <div
      role="group"
      aria-label={`Hoyo a hoyo, ${tramo.titulo.toLocaleLowerCase('es-CL')}`}
      style={{ display: 'grid', gridTemplateColumns: `repeat(${porFila}, minmax(0, 1fr))`, gap: '8px 6px' }}
    >
      {tramo.casillas.map(c => (
        <CasillaDeHoyo
          key={c.numero}
          numero={c.numero}
          lado={c.ganador}
          etiqueta={c.ganador === 'a' ? tramo.parejas[0].etiqueta : c.ganador === 'b' ? tramo.parejas[1].etiqueta : ''}
          tamano={tamanoReal}
          descripcion={descripcionDeCasilla(c, tramo.parejas)}
        />
      ))}
    </div>
  )
}

function Retiros({ tramo }: { tramo: TramoDelJuego }) {
  if (tramo.retiros.length === 0) return null
  return (
    <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, fontSize: '13px', lineHeight: 1.4, color: 'var(--text-2)' }}>
      {tramo.retiros.map(r => <li key={r}>{r}</li>)}
    </ul>
  )
}

const marcadorEnPalabras = (t: TramoDelJuego) => `${t.parejas[0].nombre} ${t.marcador[0]}, ${t.parejas[1].nombre} ${t.marcador[1]}`

/**
 * Tarjeta grande del tramo que importa ahora (el que está en juego): parejas a cada lado con su color, marcador
 * grande y la tira de casillas.
 */
export function DueloDelTramo({ tramo, primerDuelo }: { tramo: TramoDelJuego; primerDuelo: boolean }) {
  const partio = tramo.estado.tipo !== 'por_jugar'
  const destacado = tramo.estado.tipo === 'en_juego'
  const lado = (p: ParejaDelTramo, l: 'a' | 'b') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, fontSize: '16px', fontWeight: 600, lineHeight: 1.3, color: 'var(--text)', textAlign: l === 'a' ? 'left' : 'right' }}>
      {p.jugadores.map((n, i) => (
        <span key={i}style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: l === 'a' ? 'flex-start' : 'flex-end', minWidth: 0 }}>
          {partio && l === 'a' && <Cuadradito lado="a" />}
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{n}</span>
          {partio && l === 'b' && <Cuadradito lado="b" />}
        </span>
      ))}
    </div>
  )
  return (
    <section
      aria-label={`${tramo.titulo}: ${marcadorEnPalabras(tramo)}`}
      style={{ background: 'var(--bg-surface)', border: `1px solid ${destacado ? 'var(--brand-on-bg)' : 'var(--border-md)'}`, borderRadius: '16px', padding: '16px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, color: 'var(--text-2)' }}>
        <span>{tramo.titulo}</span>
        <EstadoDelTramo tramo={tramo} primerDuelo={primerDuelo} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', gap: '8px', margin: '12px 0 16px' }}>
        {lado(tramo.parejas[0], 'a')}
        <span aria-hidden className="num" style={{ fontSize: '40px', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.01em', color: 'var(--text)', whiteSpace: 'nowrap' }}>
          {tramo.marcador[0]}<span style={{ margin: '0 8px', fontWeight: 500, color: 'var(--text-2)' }}>–</span>{tramo.marcador[1]}
        </span>
        {lado(tramo.parejas[1], 'b')}
      </div>
      <TiraDelTramo tramo={tramo} tamano={40} />
      <Retiros tramo={tramo} />
    </section>
  )
}

/** Un tramo dentro del bloque "Parejas": estado, parejas, resultado y su tira. */
function FilaDelTramo({ tramo, primero }: { tramo: TramoDelJuego; primero: boolean }) {
  const partio = tramo.estado.tipo !== 'por_jugar'
  const nombre = (p: ParejaDelTramo, l: 'a' | 'b') => (
    <span style={{
      flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: l === 'a' ? 'flex-start' : 'flex-end',
      textAlign: l === 'a' ? 'left' : 'right', fontSize: '14px', fontWeight: partio ? 600 : 500, color: partio ? 'var(--text)' : 'var(--text-2)',
    }}>
      {partio && l === 'a' && <Cuadradito lado="a" />}
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{p.nombre}</span>
      {partio && l === 'b' && <Cuadradito lado="b" />}
    </span>
  )
  return (
    <li aria-label={`${tramo.titulo}, ${textoDelEstadoDelTramo(tramo, false).toLocaleLowerCase('es-CL')}: ${partio ? marcadorEnPalabras(tramo) : `${tramo.parejas[0].nombre} contra ${tramo.parejas[1].nombre}`}`}
      style={{ padding: '12px 0', borderTop: primero ? 'none' : '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, color: 'var(--text-2)' }}>
        <span>{tramo.titulo}</span>
        <EstadoDelTramo tramo={tramo} primerDuelo={false} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', margin: '6px 0 10px' }}>
        {nombre(tramo.parejas[0], 'a')}
        {partio
          ? <b aria-hidden className="num" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{tramo.marcador[0]} – {tramo.marcador[1]}</b>
          : <span aria-hidden style={{ fontSize: '13px', color: 'var(--text-2)' }}>vs</span>}
        {nombre(tramo.parejas[1], 'b')}
      </div>
      <TiraDelTramo tramo={tramo} tamano={36} />
      <Retiros tramo={tramo} />
    </li>
  )
}

/** Bloque "Parejas": todos los tramos de la ronda, del primero al último. */
export function TramosDeLaTimba({ tramos }: { tramos: readonly TramoDelJuego[] }) {
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: '4px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border-md)', borderRadius: '16px' }}>
      {tramos.map((t, i) => <FilaDelTramo key={t.indice} tramo={t} primero={i === 0} />)}
    </ol>
  )
}
