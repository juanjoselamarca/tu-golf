'use client'

import { colores } from './estilos'

/**
 * Aviso de «Repetir ronda» con un Skins: «Confirmando el Skins…» mientras llega el permiso, o que no se pudo
 * activar / que se canceló.
 *
 * Mientras confirma, el único control es «Cancelar el Skins», con texto (no una X): cancelar ahí libera «Crear» y la
 * ronda va sin Skins, así que tiene que decirlo. Una X «Descartar aviso» que cancelaba en silencio fue el P2 de la
 * vuelta 3 de Fable. Con el aviso ya resuelto, la X solo lo cierra. Los dos controles miden 44 px.
 */
export function AvisoDeRepetir(props: {
  texto: string
  /** Se está confirmando el permiso del Skins: el control es «Cancelar el Skins». */
  confirmando: boolean
  onCancelarSkins: () => void
  onDescartar: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 16px' }}>
      <p role="status" style={{ flex: 1, minWidth: 0, fontSize: '14px', lineHeight: 1.45, color: colores.texto2, margin: 0 }}>
        {props.texto}
      </p>
      {props.confirmando ? (
        <button
          type="button"
          onClick={props.onCancelarSkins}
          style={{
            minHeight: '44px', flexShrink: 0, padding: '0 14px', borderRadius: '10px',
            background: 'transparent', border: `1px solid ${colores.borde}`, color: colores.texto,
            fontSize: '14px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          Cancelar el Skins
        </button>
      ) : (
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
      )}
    </div>
  )
}
