'use client'

import type { ReactNode } from 'react'
import { colores } from '../estilos'

/** Rótulo de sección de los paneles de juego (Timba, Skins). */
export const caption = {
  fontSize: '12px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: colores.texto2,
}

/** Botón de dos estados de los paneles de juego (chips y segmentos): activo = tinta llena, como en la maqueta. */
export function pastilla(activa: boolean) {
  return {
    minHeight: '44px', padding: '0 16px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
    background: activa ? colores.texto : 'transparent', color: activa ? colores.tarjeta : colores.texto2,
  }
}

/** Una regla con interruptor a la derecha. `nota`: la explicación en una línea. */
export function Fila({ etiqueta, nota, children }: { etiqueta: string; nota?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', minHeight: '44px' }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ fontSize: '14px', color: colores.texto, fontWeight: nota ? 600 : undefined }}>{etiqueta}</span>
        {nota && <span style={{ fontSize: '12px', color: colores.texto2, lineHeight: 1.4 }}>{nota}</span>}
      </span>
      {children}
    </div>
  )
}

/** Una regla con opciones excluyentes (una fila de pastillas). `nota`: la explicación en una línea. */
export function Opciones<T extends string | number>({ titulo, nota, valor, opciones, onCambiar }: {
  titulo: string; nota?: string; valor: T; opciones: { valor: T; etiqueta: string }[]; onCambiar: (v: T) => void
}) {
  return (
    <div role="group" aria-label={titulo} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={{ fontSize: '14px', fontWeight: 600, color: colores.texto }}>{titulo}</span>
      {nota && <span style={{ fontSize: '12px', color: colores.texto2, lineHeight: 1.4 }}>{nota}</span>}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {opciones.map(o => (
          <button
            key={o.valor}
            type="button"
            aria-pressed={valor === o.valor}
            onClick={() => onCambiar(o.valor)}
            style={{
              ...pastilla(valor === o.valor), flex: '1 1 auto', borderRadius: '10px',
              border: `1px solid ${valor === o.valor ? colores.texto : colores.borde}`,
            }}
          >
            {o.etiqueta}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Chips de puntos especiales (Timba y Skins): uno por tipo, se prenden y apagan. */
export function SelectorPuntosEspeciales<T extends string>({ tipos, nombre, activo, onAlternar }: {
  tipos: readonly T[]; nombre: (t: T) => string; activo: (t: T) => boolean; onAlternar: (t: T) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {tipos.map(t => {
        const on = activo(t)
        return (
          <button
            key={t}
            type="button"
            aria-pressed={on}
            onClick={() => onAlternar(t)}
            style={{ ...pastilla(on), borderRadius: '22px', border: `1px solid ${on ? colores.texto : colores.borde}` }}
          >
            {on ? '✓' : '+'} {nombre(t)}
          </button>
        )
      })}
    </div>
  )
}

/** Neto | Gross de un juego (el mismo orden que el selector estándar). Sin candado Pro: los juegos no son features Pro. */
export function SegmentoModo({ modo, onModo }: { modo: 'neto' | 'gross'; onModo: (m: 'neto' | 'gross') => void }) {
  return (
    <div role="group" aria-label="Modo de scoring" style={{
      display: 'flex', gap: '8px', background: colores.tarjeta, border: `1px solid ${colores.borde}`, borderRadius: '12px', padding: '4px',
    }}>
      {(['neto', 'gross'] as const).map(m => (
        <button
          key={m}
          type="button"
          aria-pressed={modo === m}
          onClick={() => onModo(m)}
          style={{ ...pastilla(modo === m), flex: 1, border: 0, borderRadius: '9px' }}
        >
          {m === 'neto' ? 'Neto' : 'Gross'}
        </button>
      ))}
    </div>
  )
}
