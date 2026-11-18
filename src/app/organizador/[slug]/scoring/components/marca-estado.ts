// Cómo se marca un hoyo que no está en la base tal como se ve. FUENTE ÚNICA de los colores del estado de guardado:
// la grilla, la tabla de stats y los avisos usan estos tokens (light/dark en globals.css).
//
// La celda de la grilla ya se pinta con la paleta del score (bogey dorado, doble rosado): el estado no puede depender
// sólo del fondo. Por eso sin confirmar y rechazado llevan además un distintivo SÓLIDO con un glifo de 16 px.
// Contraste del glifo (--bg-surface sobre el sólido): light 5,0:1 (ámbar) y 4,8:1 (rojo); dark 8,6:1 y 6,2:1.

import type { EstadoHoyo } from '../hooks/estado-hoyos'

export interface MarcaEstado {
  bg: string
  border: string
  fg: string
  /** Fondo del distintivo sólido (null: sin distintivo, el borde punteado basta). */
  solido: string | null
  glifo: string
}

export const MARCA_ESTADO: Record<EstadoHoyo, MarcaEstado | null> = {
  limpio: null,
  guardando: { bg: 'var(--surface-soft)', border: '2px dashed var(--text-2)', fg: 'var(--text-2)', solido: null, glifo: '···' },
  sin_confirmar: { bg: 'var(--status-open-bg)', border: '2px solid var(--status-open-fg)', fg: 'var(--status-open-fg)', solido: 'var(--status-open-fg)', glifo: '!' },
  rechazado: { bg: 'var(--error-bg)', border: '2px solid var(--error-border)', fg: 'var(--error-fg)', solido: 'var(--error-border)', glifo: '✕' },
}

/** Texto sobre el distintivo sólido. */
export const TEXTO_SOBRE_SOLIDO = 'var(--bg-surface)'
