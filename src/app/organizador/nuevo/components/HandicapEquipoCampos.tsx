'use client'

// src/app/organizador/nuevo/components/HandicapEquipoCampos.tsx
//
// Piezas compartidas del handicap del equipo (scramble y foursome): la opción
// Oficial / Personalizado como tarjeta con radio, y el input de un porcentaje.

import { useState } from 'react'
import type { ModoHandicapEquipo } from '../hooks/useTeamConfig'
import { helperStyle, inputStyle, labelStyle } from '../styles'

export const NOTA_WHS = 'Se calcula sobre el handicap de cancha de cada jugador, con un solo redondeo final (WHS).'

export function OpcionHandicap({
  nombreGrupo, modo, seleccionado, titulo, descripcion, onElegir,
}: {
  nombreGrupo: string
  modo: ModoHandicapEquipo
  seleccionado: boolean
  titulo: string
  descripcion: string
  onElegir: (modo: ModoHandicapEquipo) => void
}) {
  return (
    <label
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44,
        padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
        border: seleccionado ? '1.5px solid var(--brand)' : '1px solid var(--border)',
        background: seleccionado ? 'var(--gold-soft)' : 'var(--input-bg)',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <input
        type="radio"
        name={nombreGrupo}
        value={modo}
        checked={seleccionado}
        onChange={() => onElegir(modo)}
        // Indicador propio: el radio nativo no sigue el tema (en oscuro queda un
        // disco blanco) porque la app no declara color-scheme.
        style={{
          appearance: 'none', WebkitAppearance: 'none', margin: '3px 0 0', flexShrink: 0,
          width: 18, height: 18, borderRadius: '50%', boxSizing: 'border-box', cursor: 'pointer',
          border: `2px solid ${seleccionado ? 'var(--brand)' : 'var(--text-secondary)'}`,
          background: seleccionado
            ? 'radial-gradient(circle, var(--brand) 0 4px, transparent 4.5px)'
            : 'transparent',
        }}
      />
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{titulo}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
          {descripcion}
        </div>
      </div>
    </label>
  )
}

/** Entero 0-100 escrito por el organizador, o null si no lo es. */
export function leerPorcentaje(texto: string): number | null {
  const t = texto.replace('%', '').trim()
  if (!/^\d{1,3}$/.test(t)) return null
  const n = Number(t)
  return n <= 100 ? n : null
}

const textoDe = (v: number | null) => (v === null ? '' : String(v))

/**
 * Input de un porcentaje (entero 0-100). Guarda solo valores válidos; mientras
 * se escribe uno inválido muestra el motivo y al salir del campo vuelve al
 * último guardado. `placeholder` = el oficial, para un personalizado aún vacío.
 */
export function PorcentajeInput({
  id, etiqueta, valor, placeholder, onGuardar,
}: {
  id: string
  etiqueta: string
  valor: number | null
  placeholder: number
  onGuardar: (valor: number) => void
}) {
  const [texto, setTexto] = useState(textoDe(valor))
  const [valorPrevio, setValorPrevio] = useState(valor)
  if (valor !== valorPrevio) {
    // El valor cambió desde afuera (otro cambio del borrador): se muestra ese.
    setValorPrevio(valor)
    setTexto(textoDe(valor))
  }
  const invalido = texto.trim() !== '' && leerPorcentaje(texto) === null
  const errorId = `${id}-error`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label htmlFor={id} style={labelStyle}>{etiqueta}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          autoComplete="off"
          placeholder={String(placeholder)}
          value={texto}
          aria-invalid={invalido || undefined}
          aria-describedby={invalido ? errorId : undefined}
          onChange={(e) => {
            setTexto(e.target.value)
            const n = leerPorcentaje(e.target.value)
            if (n !== null && n !== valor) onGuardar(n)
          }}
          onBlur={() => {
            if (leerPorcentaje(texto) === null) setTexto(textoDe(valor))
          }}
          style={{
            ...inputStyle, width: 88, minHeight: 44, boxSizing: 'border-box', fontSize: 16,
            ...(invalido ? { border: '1px solid var(--error-border)' } : {}),
          }}
        />
        <span aria-hidden style={{ ...helperStyle, fontSize: 14 }}>%</span>
      </div>
      {invalido && (
        <span id={errorId} style={{ fontSize: 12, color: 'var(--error-fg)' }}>
          Escribe un número entero entre 0 y 100
        </span>
      )}
    </div>
  )
}
