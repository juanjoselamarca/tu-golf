import type { CSSProperties } from 'react'

/** Estilo base de inputs del panel de jugadores. Compartido por los
 *  componentes de formulario (inscribir, grupos, asignación). */
export const inputStyle: CSSProperties = {
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  color: 'var(--text)',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '14px',
  outline: 'none',
  transition: 'border-color 200ms',
  boxSizing: 'border-box',
}
