import type { ReactNode } from 'react'
import type { CeldaDelJuego, MarcadorDeParejas, TablaDelJuego } from '@/golf/ronda-libre/tabla-del-juego'

const MONO = 'var(--font-dm-mono), "DM Mono", monospace'

/** Marca de golpe recibido en un hoyo (neto): un punto por golpe. */
export const MARCA_GOLPE_RECIBIDO = '•'

export function textoSinHandicap(nombres: readonly string[]): string {
  const quien = nombres.length === 1 ? `de ${nombres[0]}` : `de ${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`
  return `Falta el hándicap ${quien}: mientras tanto el juego va sin golpes recibidos, como gross.`
}

function Marcador({ marcador, compacto }: { marcador: MarcadorDeParejas; compacto?: boolean }) {
  const [a, b] = marcador.parejas
  const [pa, pb] = marcador.puntos
  return (
    <div
      aria-label={`${a} ${pa}, ${b} ${pb}`}
      style={compacto
        ? { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '8px 10px', marginTop: '6px', borderRadius: '8px', background: 'var(--surface-soft)', color: 'var(--text-2)', fontSize: '12px', fontWeight: 600 }
        : { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '12px 14px', borderRadius: '12px', background: 'var(--text)', color: 'var(--bg)', fontSize: '14px', fontWeight: 600 }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{a}</span>
      <span style={{ fontFamily: MONO, fontSize: compacto ? '13px' : '18px', fontWeight: 500, whiteSpace: 'nowrap' }}>{pa} – {pb}</span>
      <span style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>{b}</span>
    </div>
  )
}

function Celda({ celda, pendiente }: { celda: CeldaDelJuego; pendiente: boolean }) {
  const golpes = celda.golpesRecibidos
  const etiqueta = pendiente ? 'pendiente' : celda.texto
  return (
    <span
      role="cell"
      aria-label={golpes > 0 ? `${etiqueta}, recibe ${golpes} ${golpes === 1 ? 'golpe' : 'golpes'}` : etiqueta}
      style={{ textAlign: 'right', whiteSpace: 'nowrap' }}
    >
      {golpes > 0 && (
        <span aria-hidden data-testid="golpe-recibido" style={{ color: 'var(--brand-on-bg)', fontSize: '12px', marginRight: '4px', letterSpacing: '1px' }}>
          {MARCA_GOLPE_RECIBIDO.repeat(golpes)}
        </span>
      )}
      <span aria-hidden>{celda.texto}</span>
    </span>
  )
}

/**
 * Pestaña Juego de una Timba libre (maqueta ScorerC aprobada por Juanjo): encabezado, ranking de puntos, marcador
 * del tramo en juego y tabla hoyo a hoyo. Todo viene armado de `armarTablaDelJuego` (que lee solo `GET /juego`).
 */
export function JuegoDeLaTimba({ tabla, desactualizado, pie }: { tabla: TablaDelJuego; desactualizado?: boolean; pie?: ReactNode }) {
  const columnas = `minmax(44px, 0.8fr) repeat(${tabla.columnas.length}, minmax(0, 1fr))`
  return (
    <section aria-label={`Puntos de ${tabla.titulo}`} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-playfair), "Playfair Display", serif', fontSize: '24px', fontWeight: 700, color: 'var(--text)' }}>
          {tabla.titulo}
        </h2>
        <span style={{ fontFamily: MONO, fontSize: '13px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
          {tabla.hoyosPuntuados} de {tabla.totalHoyos} hoyos
        </span>
      </div>

      {desactualizado && (
        <p role="status" style={{ margin: 0, fontSize: '13px', color: 'var(--text-2)' }}>
          Sin señal: son los puntos de hace un momento.
        </p>
      )}

      {tabla.sinHandicap.length > 0 && (
        <p role="note" style={{ margin: 0, padding: '10px 12px', borderRadius: '10px', background: 'var(--status-open-bg)', color: 'var(--text)', fontSize: '14px', lineHeight: 1.45 }}>
          {textoSinHandicap(tabla.sinHandicap)}
        </p>
      )}

      <ol aria-label="Ranking de puntos" style={{ listStyle: 'none', margin: 0, padding: '4px 14px', borderRadius: '14px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        {tabla.ranking.map((r, i) => (
          <li
            key={r.jugadorId}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '48px', borderBottom: i < tabla.ranking.length - 1 ? '1px solid var(--border)' : 'none' }}
          >
            <span style={{ width: '20px', fontFamily: MONO, fontSize: '14px', color: 'var(--text-2)' }}>{r.puesto}</span>
            <span style={{ flex: 1, fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>{r.nombre}</span>
            <span style={{ fontFamily: MONO, fontSize: '20px', fontWeight: 500, color: 'var(--text)' }}>{r.texto}</span>
          </li>
        ))}
      </ol>

      {tabla.marcadorActual && <Marcador marcador={tabla.marcadorActual} />}

      {tabla.filas.length === 0 ? (
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-2)', textAlign: 'center' }}>
          Los puntos de cada hoyo aparecen al anotar el primero.
        </p>
      ) : (
        <div role="table" aria-label="Puntos por hoyo" style={{ display: 'flex', flexDirection: 'column', fontSize: '14px', color: 'var(--text)' }}>
          <div role="row" style={{ display: 'grid', gridTemplateColumns: columnas, gap: '4px', padding: '6px 4px', color: 'var(--text-2)', fontSize: '12px', fontWeight: 600 }}>
            <span role="columnheader">Hoyo</span>
            {tabla.columnas.map(c => (
              <span key={c.jugadorId} role="columnheader" style={{ textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</span>
            ))}
          </div>
          {tabla.filas.map(f => f.tipo === 'tramo' ? (
            <div key={`t${f.indice}`} role="row">
              <span role="cell" style={{ display: 'block' }}><Marcador marcador={f.marcador} compacto /></span>
            </div>
          ) : (
            <div
              key={f.numero}
              role="row"
              style={{
                display: 'grid', gridTemplateColumns: columnas, gap: '4px', padding: '8px 4px', borderBottom: '1px solid var(--border)',
                fontFamily: MONO, color: f.pendiente ? 'var(--text-3)' : 'var(--text)',
              }}
            >
              <span role="rowheader">{f.numero}</span>
              {f.celdas.map(c => <Celda key={c.jugadorId} celda={c} pendiente={f.pendiente} />)}
            </div>
          ))}
        </div>
      )}

      {tabla.esNeto && tabla.sinHandicap.length === 0 && (
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-2)' }}>
          <span aria-hidden style={{ color: 'var(--brand-on-bg)' }}>{MARCA_GOLPE_RECIBIDO}</span> golpe recibido en el hoyo
        </p>
      )}

      {pie}
    </section>
  )
}
