'use client'

import { secundario } from './estilos'

/** «Reintentar» junto a un aviso de lectura que falló (la señal en cancha): 48 px de alto, todo el ancho. */
export function BotonReintentar({ onReintentar }: { onReintentar: () => void }) {
  return (
    <button
      type="button"
      onClick={onReintentar}
      style={{ ...secundario, flex: 'none', width: '100%', minHeight: '48px', color: 'var(--text)', fontWeight: 600 }}
    >
      Reintentar
    </button>
  )
}
