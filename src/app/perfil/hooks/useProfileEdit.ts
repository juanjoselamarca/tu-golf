'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Profile } from '@/lib/data/perfil'

export function useProfileEdit(profile: Profile, onProfile: (p: Profile) => void) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editName, setEditName] = useState(profile.name || '')
  const [editIndice, setEditIndice] = useState(profile.indice != null ? String(profile.indice) : '')

  const save = async () => {
    setSaving(true)
    const supabase = createClient()
    const indiceParsed = editIndice.trim() !== '' ? parseFloat(editIndice) : null
    const { data: updated } = await supabase
      .from('profiles')
      .update({ name: editName.trim(), indice: indiceParsed })
      .eq('id', profile.id)
      .select('id, name, indice, avatar_url')
      .single()
    if (updated) onProfile({ ...profile, ...(updated as Partial<Profile>) } as Profile)
    setSaving(false)
    setSaved(true)
    setEditing(false)
    setTimeout(() => setSaved(false), 2000)
  }

  const cancel = () => {
    setEditing(false)
    setEditName(profile.name || '')
    setEditIndice(profile.indice != null ? String(profile.indice) : '')
  }

  return { editing, setEditing, saving, saved, editName, setEditName, editIndice, setEditIndice, save, cancel }
}
