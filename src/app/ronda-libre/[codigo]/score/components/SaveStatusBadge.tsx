'use client'

import type { SaveStatus } from '../types'
import { Portal } from '@/components/ui/Portal'

/** Indicador fijo arriba a la derecha: Guardando / Guardado / Offline / Error. */
export function SaveStatusBadge({ saveStatus }: { saveStatus: SaveStatus }) {
  if (saveStatus === 'idle') return null
  return (
    <Portal>
      <div style={{
        position: 'fixed', top: '4px', right: '12px', zIndex: 200,
        padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
        transition: 'opacity 0.3s',
        background: saveStatus === 'saving' ? 'rgba(196,153,42,0.9)'
          : saveStatus === 'saved' ? 'rgba(0,230,118,0.85)'
          : saveStatus === 'offline' ? 'rgba(252,211,77,0.9)'
          : 'rgba(255,68,68,0.9)',
        color: saveStatus === 'saved' ? 'var(--bg-deep)' : saveStatus === 'offline' ? 'var(--bg-deep)' : 'var(--ivory)',
        animation: saveStatus === 'saving' ? 'savePulse 1s ease infinite' : 'none',
        pointerEvents: 'none',
      }}>
        {saveStatus === 'saving' ? 'Guardando...'
          : saveStatus === 'saved' ? '✓ Guardado'
          : saveStatus === 'offline' ? 'Offline — local'
          : 'Error al guardar'}
      </div>
    </Portal>
  )
}
