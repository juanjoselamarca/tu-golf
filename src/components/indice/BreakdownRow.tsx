// src/components/indice/BreakdownRow.tsx
//
// La fila de un desglose de índice: qué ronda es, su diferencial, y si entra o
// no al cálculo. La usan los DOS sheets que explican un índice —
// `IndiceBreakdownModal` (índice Golfers+) y `FedegolfIndiceModal` (índice
// federado). Ambos se abren desde /perfil y muestran la misma clase de objeto,
// así que la forma la manda un solo archivo (DESIGN.md P4).
//
// El estado "cuenta" se codifica DOS veces a propósito y no más: una regla
// dorada al canto izquierdo (para escanear) y la palabra `cuenta` bajo el número
// (para no depender del color — WCAG 1.4.1). La versión anterior lo codificaba
// cuatro veces: borde propio, fondo teñido, color del número y etiqueta.
//
// El dorado sale de `--brand-on-bg`, no de `#c4992a` literal: en tema claro ese
// literal da 2.65:1 sobre blanco y reprueba AA. El token ya resuelve #8A6A16 en
// claro y #C4992A en oscuro.

import type { ReactNode } from 'react'

interface BreakdownRowProps {
  /** Nombre de la cancha. Se trunca con ellipsis en una línea. */
  titulo: string
  /** Línea de datos (fecha · tee · rating · gross). Va en mono. */
  meta: string
  /** Valor ya formateado — la fila no decide decimales. */
  valor: string
  /** Si entra al cálculo del índice. */
  cuenta: boolean
  /** Marca inline junto al título (ej. el trofeo ×2 de una ronda de campeonato). */
  marca?: ReactNode
  /** Última de la lista: sin hairline, que si no cuelga contra el padding del sheet. */
  ultimo?: boolean
}

export default function BreakdownRow({ titulo, meta, valor, cuenta, marca, ultimo }: BreakdownRowProps) {
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '11px 0 11px 11px',
        borderBottom: ultimo ? undefined : '1px solid var(--border)',
        boxShadow: cuenta ? 'inset 2px 0 0 var(--brand-on-bg)' : undefined,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* La marca va como hermana en un flex, no inline dentro del título: el
            preflight de Tailwind pone `svg { display: block }`, así que un icono
            inline rompe la línea aunque el contenedor sea `nowrap`. Acá el
            título se queda con el ellipsis y la marca no se encoge. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              fontSize: '13.5px',
              fontWeight: cuenta ? 600 : 500,
              color: cuenta ? 'var(--text)' : 'var(--text-2)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
          >
            {titulo}
          </span>
          {marca}
        </div>
        <div
          style={{
            fontSize: '10.5px',
            color: 'var(--text-3)',
            fontFamily: '"DM Mono", monospace',
            marginTop: '3px',
            letterSpacing: '0.02em',
          }}
        >
          {meta}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div
          style={{
            fontFamily: '"DM Mono", monospace',
            fontSize: '17px',
            fontWeight: 500,
            fontVariantNumeric: 'tabular-nums',
            color: cuenta ? 'var(--text)' : 'var(--text-3)',
            lineHeight: 1,
          }}
        >
          {valor}
        </div>
        {cuenta && (
          <div
            style={{
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: '0.09em',
              fontFamily: '"DM Mono", monospace',
              marginTop: '4px',
              color: 'var(--brand-on-bg)',
            }}
          >
            cuenta
          </div>
        )}
      </div>
    </li>
  )
}

/** El `<ul>` de un desglose. Existe para que los dos sheets no puedan divergir en el contenedor. */
export function BreakdownLista({ children }: { children: ReactNode }) {
  return <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{children}</ul>
}

/** Rótulo de sección sobre la lista, con una línea de apoyo opcional debajo. */
export function BreakdownSeccion({ rotulo, nota }: { rotulo: string; nota?: string }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border-md)', paddingBottom: '9px' }}>
      <p
        style={{
          fontFamily: '"DM Mono", monospace',
          fontSize: '10px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text-3)',
          margin: 0,
        }}
      >
        {rotulo}
      </p>
      {nota && (
        <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: '5px 0 0', lineHeight: 1.5 }}>
          {nota}
        </p>
      )}
    </div>
  )
}
