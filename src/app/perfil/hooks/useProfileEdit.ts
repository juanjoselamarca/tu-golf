'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { actualizarNombreEIndice, type Profile } from '@/lib/data/perfil'
import { leerCampoHandicap, MENSAJE_INDICE_NO_SE_GUARDO, textoCampoHandicap } from '@/golf/handicap-index-range'
import { useAvisoIndiceAlEnviar } from '@/hooks/useAvisoIndiceAlEnviar'

export function useProfileEdit(profile: Profile, onProfile: (p: Profile) => void) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editName, setEditName] = useState(profile.name || '')
  // Un plus guardado (−2) se precarga "+2": con String(−2) el campo decía "-2", distinto del resto de la app.
  const [editIndice, setEditIndice] = useState(textoCampoHandicap(profile.indice))

  // Vacío = sin índice federado (se guarda null, como antes). "Guardar" no se apaga por el índice: con "+" a
  // medio escribir, al guardar se avisa en el campo y se le da el foco.
  const campoIndice = useAvisoIndiceAlEnviar(editIndice, 'perfil-indice', { opcional: true, rango: 'indice' })

  const save = async () => {
    // Nunca se escribe un índice que no es número o que está fuera de rango (antes, parseFloat("+2")
    // guardaba 2 y "abc" guardaba NaN → null).
    if (!campoIndice.validarAlEnviar()) return
    setSaving(true)
    const updated = await actualizarNombreEIndice(createClient(), profile.id, {
      name: editName.trim(),
      indice: leerCampoHandicap(editIndice).valor,
    })
    if (!updated) {
      // El UPDATE falló: no se cierra la edición ni se marca "Guardado" (antes decía "Guardado" igual, #776).
      campoIndice.avisar(MENSAJE_INDICE_NO_SE_GUARDO)
      setSaving(false)
      return
    }
    onProfile({ ...profile, ...updated } as Profile)
    setSaving(false)
    setSaved(true)
    setEditing(false)
    setTimeout(() => setSaved(false), 2000)
  }

  const cancel = () => {
    setEditing(false)
    setEditName(profile.name || '')
    setEditIndice(textoCampoHandicap(profile.indice))
  }

  return {
    editing, setEditing, saving, saved, editName, setEditName, editIndice, setEditIndice,
    campoIndice, save, cancel,
  }
}
