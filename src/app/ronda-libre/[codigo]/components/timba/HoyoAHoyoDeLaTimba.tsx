'use client'

import { useState } from 'react'
import { TEXTO_HOYO_PENDIENTE, TEXTO_NO_SE_JUGO, type CeldaDelJuego, type TablaDelJuego } from '@/golf/ronda-libre/tabla-del-juego'

/** Marca de golpe recibido en un hoyo (neto): un punto por golpe. */
export const MARCA_GOLPE_RECIBIDO = '•'

function Celda({ celda }: { celda: CeldaDelJuego }) {
  const golpes = celda.golpesRecibidos
  if (celda.noJugo) {
    return <span role="cell" aria-label="no jugó" style={{ textAlign: 'right', color: 'var(--text-2)' }}>{celda.texto}</span>
  }
  const partes = [celda.texto]
  if (golpes > 0) partes.push(`recibe ${golpes} ${golpes === 1 ? 'golpe' : 'golpes'}`)
  if (celda.especiales.length > 0) partes.push(celda.especiales.join(', '))
  return (
    <span role="cell" aria-label={partes.join(', ')} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
      {golpes > 0 && (
        <span aria-hidden data-testid="golpe-recibido" style={{ color: 'var(--brand-on-bg)', fontSize: '13px', marginRight: '3px', letterSpacing: '1px' }}>
          {MARCA_GOLPE_RECIBIDO.repeat(golpes)}
        </span>
      )}
      <span aria-hidden>{celda.texto}</span>
      {celda.especiales.map((l, i) => (
        <span key={i} aria-hidden data-testid="punto-especial" style={{ marginLeft: '3px', fontSize: '13px', fontWeight: 700, color: 'var(--brand-on-bg)' }}>{l}</span>
      ))}
    </span>
  )
}

/**
 * "Hoyo a hoyo" plegable de la pestaña Juego: los puntos de cada uno en cada hoyo, con las marcas de golpe recibido
 * y las letras de los puntos especiales. Cerrado por defecto (lo de arriba ya cuenta la historia).
 */
export function HoyoAHoyoDeLaTimba({ tabla, abiertoAlInicio = false, encabezadoFijoEn }: {
  tabla: TablaDelJuego
  abiertoAlInicio?: boolean
  /** `top` del encabezado de nombres fijo al bajar por la tabla (según el contenedor que hace scroll). */
  encabezadoFijoEn?: string
}) {
  const [abierto, setAbierto] = useState(abiertoAlInicio)
  const columnas = `minmax(40px, 0.7fr) repeat(${tabla.columnas.length}, minmax(0, 1fr))`
  const conGolpes = tabla.muestraGolpesRecibidos
  const tituloDelTramo = (fila: { indice: number }) => tabla.tramos.find(t => t.indice === fila.indice)?.titulo ?? ''
  const leyenda = [
    ...(conGolpes ? [{ marca: MARCA_GOLPE_RECIBIDO, texto: 'golpe recibido' }] : []),
    ...tabla.letrasEnLaTabla.map(l => ({ marca: l.letra, texto: l.nombre })),
  ]
  return (
    <details
      open={abierto}
      onToggle={e => setAbierto(e.currentTarget.open)}
      style={{ border: '1px solid var(--border-md)', borderRadius: '16px', background: 'var(--bg-surface)' }}
    >
      <summary className="plegable-summary" style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '52px', padding: '0 16px',
        fontSize: '16px', fontWeight: 600, color: 'var(--text)', cursor: 'pointer',
      }}>
        <span>Hoyo a hoyo</span>
        <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" style={{ display: 'block', transform: abierto ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div role="table" aria-label="Puntos por hoyo" style={{ display: 'flex', flexDirection: 'column', fontSize: '16px', color: 'var(--text)' }}>
        {/* Fijo arriba al bajar por la tabla: si no, en el hoyo 15 ya no se sabe de quién es cada columna. */}
        <div role="row" style={{
          display: 'grid', gridTemplateColumns: columnas, gap: '4px', padding: '8px 16px', color: 'var(--text-2)', fontSize: '13px', fontWeight: 500,
          borderTop: '1px solid var(--border)', background: 'var(--bg-surface)',
          ...(encabezadoFijoEn != null && { position: 'sticky', top: encabezadoFijoEn, zIndex: 1, borderBottom: '1px solid var(--border)' }),
        }}>
          <span role="columnheader">Hoyo</span>
          {tabla.columnas.map(c => (
            <span key={c.jugadorId} role="columnheader" style={{ textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</span>
          ))}
        </div>
        {tabla.filas.map((f, i) => f.tipo === 'tramo' ? (
          <div key={`tramo-${i}`} role="row">
            <span role="cell" style={{ display: 'block', padding: '8px 16px', background: 'var(--surface-soft)', borderTop: '1px solid var(--border)', fontSize: '13px', lineHeight: 1.4, color: 'var(--text-2)' }}>
              {tituloDelTramo(f)} · {f.marcador.parejas[0]}{' '}
              <b className="num" style={{ color: 'var(--text)', whiteSpace: 'nowrap' }}>{f.marcador.puntos[0]} – {f.marcador.puntos[1]}</b>{' '}
              {f.marcador.parejas[1]}
            </span>
          </div>
        ) : (
          <div
            key={f.numero}
            role="row"
            className="num"
            style={{
              display: 'grid', gridTemplateColumns: columnas, gap: '4px', padding: '10px 16px', borderTop: '1px solid var(--border)',
              color: f.pendiente ? 'var(--text-2)' : 'var(--text)',
            }}
          >
            <span role="rowheader" style={{ color: 'var(--text-2)', fontWeight: 500 }}>{f.numero}</span>
            {f.pendiente ? (
              // Una sola leyenda para el hoyo (ni puntos ni marcas de golpe): falta anotar, o nadie lo jugó.
              <span role="cell" aria-colspan={f.celdas.length} style={{ gridColumn: '2 / -1', textAlign: 'right', fontSize: '14px' }}>
                {f.sinJugar ? TEXTO_NO_SE_JUGO : TEXTO_HOYO_PENDIENTE}
              </span>
            ) : f.celdas.map(c => <Celda key={c.jugadorId} celda={c} />)}
          </div>
        ))}
      </div>
      {leyenda.length > 0 && (
        <p style={{ margin: 0, padding: '10px 16px 14px', borderTop: '1px solid var(--border)', fontSize: '13px', lineHeight: 1.5, color: 'var(--text-2)' }}>
          {leyenda.map((l, i) => (
            <span key={l.texto} style={{ whiteSpace: 'nowrap' }}>
              {i > 0 && ' · '}
              <span style={{ color: 'var(--brand-on-bg)', fontWeight: 700 }}>{l.marca}</span> {l.texto}
            </span>
          ))}
        </p>
      )}
    </details>
  )
}
