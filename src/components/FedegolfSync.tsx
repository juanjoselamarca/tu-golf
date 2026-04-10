'use client'

import { useEffect, useRef } from 'react'

export default function FedegolfSync() {
  const synced = useRef(false)

  useEffect(() => {
    if (synced.current) return
    synced.current = true

    fetch('/api/fedegolf/sync-indice', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.cambio) {
          console.log(`[FedegolfSync] Índice actualizado: ${data.indice}`)
        }
      })
      .catch(() => {
        // Silent — if it fails, nothing happens
      })
  }, [])

  return null
}
