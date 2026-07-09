import { useState } from 'react'
import { useToast } from '@/hooks/useToast'

interface UseCupoArgs {
  slug: string
  initialMax: number | null
}

/**
 * Estado + edición del cupo máximo del torneo (`tournaments.max_players`).
 * Política "bloquear + ampliar": el organizador sube el cupo acá; el backend
 * (`PATCH /api/torneos/[slug]/cupo`) valida que no baje por debajo de los ya
 * inscritos. Fuente única de la escritura del cupo desde el panel.
 */
export function useCupo({ slug, initialMax }: UseCupoArgs) {
  const { showSuccess, showError } = useToast()
  const [maxPlayers, setMaxPlayers] = useState<number | null>(initialMax)
  const [saving, setSaving] = useState(false)

  /**
   * Persiste un nuevo cupo. `value = null` quita el tope. Devuelve true si se
   * guardó (para que la UI cierre el editor). Muestra toast en éxito/fracaso.
   */
  const save = async (value: number | null): Promise<boolean> => {
    setSaving(true)
    try {
      const res = await fetch(`/api/torneos/${slug}/cupo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxPlayers: value }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showError('No se pudo actualizar el cupo', data?.message || 'Intenta nuevamente.')
        return false
      }
      setMaxPlayers(data.maxPlayers ?? value)
      showSuccess(
        'Cupo actualizado',
        value == null ? 'El torneo quedó sin tope de jugadores.' : `Cupo máximo: ${value} jugadores.`
      )
      return true
    } finally {
      setSaving(false)
    }
  }

  return { maxPlayers, saving, save }
}
