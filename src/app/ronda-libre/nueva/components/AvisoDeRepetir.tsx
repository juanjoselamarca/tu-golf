'use client'

import { colores } from './estilos'

/**
 * Aviso de «Repetir ronda» con un Skins: «Confirmando el Skins…» mientras llega el permiso, o que no se pudo activar.
 * La X lo descarta (y cancela el Skins que esperaba): 44 px, se toca con el pulgar.
 */
export function AvisoDeRepetir(props: { texto: string; onDescartar: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 16px' }}>
      <p role="status" style={{ flex: 1, fontSize: '14px', lineHeight: 1.45, color: colores.texto2, margin: 0 }}>
        {props.texto}
      </p>
      <button
        type="button"
        onClick={props.onDescartar}
        aria-label="Descartar aviso"
        style={{
          minWidth: '44px', minHeight: '44px', flexShrink: 0, display: 'grid', placeItems: 'center',
          background: 'transparent', border: 'none', color: colores.texto2, fontSize: '18px', cursor: 'pointer',
        }}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  )
}
