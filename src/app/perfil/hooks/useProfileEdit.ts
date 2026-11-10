'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { actualizarNombreEIndice, type Profile } from '@/lib/data/perfil'
import {
  avisoCampoIndice,
  campoIndiceGuardable,
  leerCampoHandicap,
  textoCampoHandicap,
} from '@/golf/handicap-index-range'

export function useProfileEdit(profile: Profile, onProfile: (p: Profile) => void) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editName, setEditName] = useState(profile.name || '')
  // Un plus guardado (−2) se precarga "+2": con String(−2) el campo decía "-2", distinto del resto de la app.
  const [editIndice, setEditIndice] = useState(textoCampoHandicap(profile.indice))

  // Vacío = sin índice federado (se guarda null, como antes). A medio escribir ("+") no avisa ni deja guardar.
  const indiceAviso = avisoCampoIndice(editIndice)
  const indiceGuardable = campoIndiceGuardable(editIndice)

  const save = async () => {
    // El botón ya viene bloqueado; esto es la red de seguridad: nunca se escribe un índice que no es número
    // o que está fuera de rango (antes, parseFloat("+2") guardaba 2 y "abc" guardaba NaN → null).
    if (!indiceGuardable) return
    setSaving(true)
    const updated = await actualizarNombreEIndice(createClient(), profile.id, {
      name: editName.trim(),
      indice: leerCampoHandicap(editIndice).valor,
    })
    if (updated) onProfile({ ...profile, ...updated } as Profile)
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
    indiceAviso, indiceGuardable, save, cancel,
  }
}
