// Edición inline del handicap de inscripción desde el tab Resumen.
// Persistencia vía capa de datos; el caller decide qué refrescar al guardar
// (roster local + board del Resumen, que reparte golpes con este número).

import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { captureError } from '@/lib/error-tracking'
import { updatePlayerHandicap } from '@/lib/data/tournaments/scoring'

interface UseHcpEditorArgs {
  onSaved: (playerId: string, value: number) => void
}

export function useHcpEditor({ onSaved }: UseHcpEditorArgs) {
  const { showError, showSuccess, showWarning } = useToast()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const startEdit = useCallback((playerId: string, current: number | null) => {
    setEditingId(playerId)
    setEditValue(String(current ?? ''))
  }, [])

  const cancel = useCallback(() => setEditingId(null), [])

  const save = useCallback(
    async (playerId: string) => {
      const value = parseFloat(editValue)
      if (isNaN(value) || value < 0 || value > 54) {
        showWarning('Handicap inválido', 'Debe ser un número entre 0 y 54.')
        setEditingId(null)
        return
      }
      try {
        await updatePlayerHandicap(createClient(), playerId, value)
        onSaved(playerId, value)
        showSuccess('Handicap actualizado', '', { duration: 1500 })
      } catch (e) {
        void captureError(e, { context: 'scoring.useHcpEditor.save', meta: { playerId } })
        showError('Error', 'No se pudo actualizar el handicap.')
      }
      setEditingId(null)
    },
    [editValue, onSaved, showError, showSuccess, showWarning],
  )

  return { editingId, editValue, setEditValue, startEdit, cancel, save }
}

export type UseHcpEditorReturn = ReturnType<typeof useHcpEditor>
