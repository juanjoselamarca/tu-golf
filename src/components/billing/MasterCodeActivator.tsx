'use client'
import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { activateMasterCode } from '@/golf/billing/master-code'

/** Componente invisible: captura ?master=XXXX de la URL y activa el override. */
export function MasterCodeActivator() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('master')
    if (code) {
      const ok = activateMasterCode(code)
      if (ok) {
        // Limpiar la URL sin recargar
        const url = new URL(window.location.href)
        url.searchParams.delete('master')
        window.history.replaceState({}, '', url.toString())
        window.location.reload()
      }
    }
  }, [searchParams])

  return null
}
