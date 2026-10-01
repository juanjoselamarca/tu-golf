'use client'

import { useEffect } from 'react'

/**
 * Avisa antes de cerrar o recargar la pestaña mientras hay scores sin guardar.
 * Compartido por los dos scorers de ronda libre.
 */
export function useBeforeUnloadWarning(hasUnsaved: boolean): void {
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsaved) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsaved])
}
