'use client'

import type { CSSProperties } from 'react'
import {
  detalleDeLaFila, lecturaDeLaCelda, quienLlevaElHoyo, textoDeLaCelda, textoDeLaPlata, textoDeSkins, type HoyoDeLaTablaSkins, type TablaDelSkins,
} from '@/golf/ronda-libre/tabla-del-skins'
import { formatPesos } from '@/lib/format'

// DESIGN.md §4/§13: DM Sans, números con `.num`, escala 28/24/18/16/14/13, números en `--text`, oro como texto con
// `--brand-on-bg` (contraste AA sobre fondo claro y oscuro) y solo para lo que se ganó.
const GRUPO = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px' } as const
const SECCION = { margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text)' } as const
const NOTA = { margin: 0, fontSize: '13px', lineHeight: 1.4, color: 'var(--text-2)' } as const
const NOMBRE = { overflowWrap: 'anywhere', minWidth: 0 } as const

/**
 * Tabla en vivo de un skins de ronda libre: lo que vale el hoyo en juego, la tira de hoyos (ganado con quién, empate
 * que pasa, en disputa con el mejor score en gris, por jugar) y la lista por skins con la plata (estimada con «~»).
 * Solo muestra `TablaDelSkins` (la arma el servidor con el motor): no calcula nada.
 */
export function TablaDelSkinsEnVivo({ tabla, nombres, cortos, desactualizado }: {
  tabla: TablaDelSkins
  /** Nombre completo de cada jugador (para leer en voz alta y en la lista). */
  nombres: Readonly<Record<string, string>>
  /** Nombre corto de cada jugador (entra en una celda de la tira). */
  cortos: Readonly<Record<string, string>>
  desactualizado: boolean
}) {
  const nombre = (id: string) => nombres[id] ?? ''
  // 4 columnas (3 en 9 hoyos): a 360 px entra un nombre corto o «No validó» sin cortarse (6 columnas lo cortaban).
  const columnas = tabla.hoyos.length <= 9 ? 3 : 4
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {desactualizado && (
        <p role="status" style={{ ...NOTA, padding: '8px 12px', borderRadius: '10px', background: 'var(--surface-soft)' }}>
          Sin señal: mostramos lo último que llegó.
        </p>
      )}
      <ResumenDelPozo tabla={tabla} />

      <section aria-labelledby="skins-tira" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h3 id="skins-tira" style={SECCION}>Hoyo a hoyo</h3>
        <ol
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))`, gap: '6px' }}
        >
          {tabla.hoyos.map(h => (
            <CeldaDelHoyo
              key={h.numero}
              h={h}
              texto={textoDeLaCelda(h, id => cortos[id] ?? '')}
              quien={quienLlevaElHoyo(h, id => cortos[id] ?? '')}
              lectura={lecturaDeLaCelda(h, nombre, tabla.modo)}
            />
          ))}
        </ol>
        <p style={NOTA}>
          Nombre: lo ganó. Empate: el hoyo pasa al siguiente. En gris, el mejor {tabla.modo === 'neto' ? 'neto' : 'score'} del hoyo en juego y quién lo lleva (Igual: van empatados).
        </p>
      </section>

      <section aria-labelledby="skins-lista" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h3 id="skins-lista" style={SECCION}>Skins</h3>
        <ol style={{ ...GRUPO, listStyle: 'none', margin: 0, padding: '0 16px', display: 'flex', flexDirection: 'column' }}>
          {tabla.filas.map((f, i) => {
            const plata = textoDeLaPlata(tabla, f.cobra)
            const detalle = detalleDeLaFila(f)
            return (
              <li
                key={f.jugadorId}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '56px', padding: '8px 0', borderBottom: i < tabla.filas.length - 1 ? '1px solid var(--border)' : 'none' }}
              >
                <span style={{ ...NOMBRE, flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '16px', fontWeight: f.puesto === 1 && f.skins > 0 ? 600 : 400, color: 'var(--text)' }}>{nombre(f.jugadorId)}</span>
                  {detalle && <span className="num" style={{ fontSize: '13px', color: 'var(--text-2)' }}>{detalle}</span>}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                  <span className="num" style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{textoDeSkins(f.skins)}</span>
                  {plata && <span className="num" style={{ fontSize: '14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{plata}</span>}
                </span>
              </li>
            )
          })}
        </ol>
        {tabla.plata === 'estimada' && <p style={NOTA}>~ Plata estimada: el skin vale menos si se ganan más.</p>}
      </section>
    </div>
  )
}

/** Lo que vale el hoyo en juego y el pozo, arriba de todo: es lo que el grupo pregunta entre hoyos. */
function ResumenDelPozo({ tabla }: { tabla: TablaDelSkins }) {
  if (tabla.bloqueada) {
    return (
      <p role="note" style={{ ...GRUPO, margin: 0, padding: '16px', fontSize: '15px', lineHeight: 1.45, color: 'var(--text-2)' }}>
        Faltan datos para calcular el skins (hándicap de un jugador o índices de los hoyos). Los golpes de cada uno quedan guardados.
      </p>
    )
  }
  const pozo = (() => {
    switch (tabla.plata) {
      case 'sin_pozo': return 'Sin pozo: solo skins'
      case 'sin_skins': return `Pozo ${formatPesos(tabla.pozoTotal)} · nadie ha ganado un skin`
      case 'estimada': return `Pozo ${formatPesos(tabla.pozoTotal)} · skin a ~${formatPesos(tabla.valorSkin ?? 0)}`
      case 'devolucion': return `Pozo ${formatPesos(tabla.pozoTotal)} · se devuelve`
      default: return `Pozo ${formatPesos(tabla.pozoTotal)} · skin a ${formatPesos(tabla.valorSkin ?? 0)}`
    }
  })()
  return (
    <div style={{ ...GRUPO, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {tabla.enJuego ? (
        <span className="num" style={{ fontSize: '24px', fontWeight: 600, lineHeight: 1.2, color: 'var(--text)' }}>
          Hoyo {tabla.enJuego.hoyo} vale {textoDeSkins(tabla.enJuego.valor)}{tabla.enJuego.provisional ? ' o más' : ''}
        </span>
      ) : (
        <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>Todos los hoyos cerrados</span>
      )}
      <span className="num" style={{ fontSize: '14px', color: 'var(--text-2)' }}>{pozo}</span>
    </div>
  )
}

function CeldaDelHoyo({ h, texto, quien, lectura }: { h: HoyoDeLaTablaSkins; texto: string; quien: string | null; lectura: string }) {
  const ganado = h.estado === 'ganado' || h.estado === 'repartido'
  const porValidar = h.estado === 'por_validar'
  const enJuego = h.estado === 'en_disputa'
  const porJugar = h.estado === 'por_jugar'
  const caja: CSSProperties = {
    minHeight: '56px', padding: '6px 4px', borderRadius: '10px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'space-between', gap: '2px', position: 'relative',
    // El tinte se compone sobre --bg-surface, no sobre el fondo de la página: el dorado de 13 px sobre --surface-soft
    // encima de --bg queda en 4,43:1 en claro (bajo AA); sobre --bg-surface, 4,63:1.
    background: ganado ? 'linear-gradient(var(--surface-soft), var(--surface-soft)), var(--bg-surface)' : 'var(--bg-surface)',
    border: porJugar ? '1px dashed var(--border-md)' : ganado ? '1px solid var(--brand-on-bg)' : '1px solid var(--border-md)',
  }
  const vale = h.valor > 1 ? `×${h.valor}${h.provisional ? '+' : ''}` : null
  return (
    <li aria-label={lectura} style={caja}>
      <span aria-hidden className="num" style={{ fontSize: '13px', color: 'var(--text-2)', display: 'flex', gap: '4px', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 600, color: porJugar ? 'var(--text-2)' : 'var(--text)' }}>{h.numero}</span>
        {vale && <span>{vale}</span>}
      </span>
      <span
        aria-hidden
        className={enJuego ? 'num' : undefined}
        style={{
          ...NOMBRE, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center',
          fontSize: enJuego ? '16px' : '13px',
          fontWeight: ganado || porValidar ? 700 : enJuego ? 600 : 500,
          color: ganado ? 'var(--brand-on-bg)' : 'var(--text-2)',
          fontStyle: porValidar ? 'italic' : undefined,
        }}
      >
        {texto || ' '}
      </span>
      {quien && (
        <span
          aria-hidden
          style={{ ...NOMBRE, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px', color: 'var(--text-2)' }}
        >
          {quien}
        </span>
      )}
    </li>
  )
}
