'use client'

import { useEffect, useState } from 'react'

/**
 * Si el usuario puede elegir Timba libre en el asistente. No copia la regla: la pregunta a
 * `GET /api/ronda-libre/permiso-timba`, que usa `puedeCrearJuegoPersonalizado` (la misma función que valida
 * `POST /create`). Falla CERRADO: mientras carga, sin señal o con error, `false` → se ve "Próximamente".
 */
export function usePuedeCrearTimba(): boolean {
  const [puede, setPuede] = useState(false)
  useEffect(() => {
    let vigente = true
    fetch('/api/ronda-libre/permiso-timba', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { puedeCrear?: unknown } | null) => { if (vigente) setPuede(d?.puedeCrear === true) })
      .catch(() => { /* sin señal: queda en false (cerrado); el servidor igual valida al crear */ })
    return () => { vigente = false }
  }, [])
  return puede
}
