'use client'

import { useState } from 'react'
import { ConfirmModal } from '@/components/ConfirmModal'

interface DejarEsteEquipoProps {
  /** El equipo que anota este celular. */
  equipo: { id: string; nombre: string }
  /** Quien creó la ronda (`nombreDelCreador`): el equipo vuelve a su celular. `null` = sin nombre. */
  nombreCreador: string | null
  /** Pedido en vuelo (`useAnotadorDeEquipo.enCurso`): no acepta otro toque. */
  enCurso: string | null
  onDejar: (equipoId: string, nombreEquipo: string) => void
}

/**
 * Un celular por equipo: quien anota un equipo sin ser el creador puede soltarlo (se equivocó de equipo o le pasa el
 * celular a otro). Pide confirmación; el equipo vuelve al celular del creador y este vuelve a «Elige tu equipo».
 */
export function DejarEsteEquipo({ equipo, nombreCreador, enCurso, onDejar }: DejarEsteEquipoProps) {
  const [confirmando, setConfirmando] = useState(false)
  const dejando = enCurso === equipo.id

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        disabled={enCurso != null}
        aria-busy={dejando}
        style={{
          alignSelf: 'center', minHeight: '44px', minWidth: '44px', padding: '0 16px', border: 'none',
          background: 'transparent', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: '14px', fontWeight: 600,
          textDecoration: 'underline', textUnderlineOffset: '3px', touchAction: 'manipulation',
          cursor: enCurso != null ? 'default' : 'pointer',
        }}
      >
        {dejando ? 'Dejando…' : 'Dejar este equipo'}
      </button>

      <ConfirmModal
        isOpen={confirmando}
        variant="warning"
        title={`¿Dejar ${equipo.nombre}?`}
        description={`Lo vuelve a anotar ${nombreCreador ?? 'quien creó la ronda'}. Lo que ya subiste queda guardado.`}
        confirmText="Dejar"
        cancelText="Cancelar"
        onCancel={() => setConfirmando(false)}
        onConfirm={() => {
          setConfirmando(false)
          onDejar(equipo.id, equipo.nombre)
        }}
      />
    </>
  )
}
