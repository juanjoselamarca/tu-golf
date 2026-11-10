'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { actualizarNombreEIndice, type Profile } from '@/lib/data/perfil'
import {
  esIndiceDeHandicapValido,
  leerCampoHandicap,
  MENSAJE_HANDICAP_NO_ES_NUMERO,
  MENSAJE_INDICE_FUERA_DE_RANGO,
  textoCampoHandicap,
} from '@/golf/handicap-index-range'

/**
 * Aviso del campo "Índice Federación" para lo que hay tipeado, o null si se puede guardar así.
 * A medio escribir ("+", "-") no avisa, pero tampoco deja guardar (`indiceGuardable`).
 */
function avisoDelIndice(texto: string): string | null {
  const campo = leerCampoHandicap(texto)
  if (campo.estado === 'invalido') return MENSAJE_HANDICAP_NO_ES_NUMERO
  if (campo.estado === 'ok' && !esIndiceDeHandicapValido(campo.valor)) return MENSAJE_INDICE_FUERA_DE_RANGO
  return null
}

export function useProfileEdit(profile: Profile, onProfile: (p: Profile) => void) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editName, setEditName] = useState(profile.name || '')
  // Un plus guardado (−2) se precarga "+2": con String(−2) el usuario veía "-2" y, al guardar, quedaba igual
  // pero el campo decía otra cosa que el resto de la app.
  const [editIndice, setEditIndice] = useState(textoCampoHandicap(profile.indice))

  const campoIndice = leerCampoHandicap(editIndice)
  const indiceAviso = avisoDelIndice(editIndice)
  // Vacío = sin índice federado (se guarda null, como antes); ok y dentro del rango WHS = se guarda.
  const indiceGuardable = indiceAviso == null && campoIndice.estado !== 'incompleto'

  const save = async () => {
    // El botón ya viene bloqueado; esto es la red de seguridad: nunca se escribe un índice que no es número
    // o que está fuera de rango (antes, parseFloat("+2") guardaba 2 y "abc" guardaba NaN → null).
    if (!indiceGuardable) return
    setSaving(true)
    const updated = await actualizarNombreEIndice(createClient(), profile.id, {
      name: editName.trim(),
      indice: campoIndice.valor,
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
