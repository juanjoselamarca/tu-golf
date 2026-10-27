'use client'

// src/app/organizador/nuevo/components/HandicapEquipoScramble.tsx
//
// Handicap del equipo en scramble: Oficial (asignación por tamaño, de
// `@/golf/formats/team-handicap`) o Personalizado (un % por posición, del
// jugador con menor handicap al de mayor).

import { asignacionOficialScramble, avisoSumaScramble } from '@/golf/formats/team-handicap'
import type { ModoHandicapEquipo, TamanoEquipo } from '../hooks/useTeamConfig'
import { fieldStyle, helperStyle, labelStyle } from '../styles'
import { NOTA_WHS, OpcionHandicap, PorcentajeInput } from './HandicapEquipoCampos'

/** "2 jugadores: 35 % del de menor handicap + 15 % del de mayor" (y 3-4 jugadores). */
export function describirAsignacionScramble(size: TamanoEquipo): string {
  const pcts = asignacionOficialScramble(size) ?? []
  if (pcts.length === 2) {
    return `2 jugadores: ${pcts[0]} % del de menor handicap + ${pcts[1]} % del de mayor`
  }
  return `${size} jugadores: ${pcts.map((p) => `${p} %`).join(' + ')}, del menor al mayor handicap`
}

const ORDINALES = ['Segundo', 'Tercer']

/** Etiqueta del input de la posición `i` (0 = menor handicap). */
export function etiquetaPosicion(i: number, size: TamanoEquipo): string {
  if (i === 0) return 'Jugador con menor handicap'
  if (i === size - 1) return 'Jugador con mayor handicap'
  return `${ORDINALES[i - 1]} menor handicap`
}

export function HandicapEquipoScramble({
  size, modo, porcentajes, onModo, onPorcentaje,
}: {
  size: TamanoEquipo
  modo: ModoHandicapEquipo
  /** Guardados; null = personalizado todavía sin % (se muestran vacíos). */
  porcentajes: readonly number[] | null
  onModo: (modo: ModoHandicapEquipo) => void
  onPorcentaje: (posicion: number, valor: number) => void
}) {
  const oficiales = asignacionOficialScramble(size) ?? []
  const valores = porcentajes && porcentajes.length === size ? porcentajes : null
  const aviso = modo === 'personalizado' && valores ? avisoSumaScramble(valores) : null

  return (
    <fieldset style={{ ...fieldStyle, border: 'none', margin: 0, padding: 0 }}>
      <legend style={labelStyle}>Handicap del equipo</legend>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        <OpcionHandicap
          nombreGrupo="team-handicap-modo"
          modo="oficial"
          seleccionado={modo === 'oficial'}
          titulo="Oficial"
          descripcion={describirAsignacionScramble(size)}
          onElegir={onModo}
        />
        <OpcionHandicap
          nombreGrupo="team-handicap-modo"
          modo="personalizado"
          seleccionado={modo === 'personalizado'}
          titulo="Personalizado"
          descripcion="Define tú el porcentaje de cada jugador"
          onElegir={onModo}
        />
      </div>
      {modo === 'personalizado' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
          {oficiales.map((oficial, i) => (
            <PorcentajeInput
              key={`${size}-${i}`}
              id={`t-team-pct-${i}`}
              etiqueta={etiquetaPosicion(i, size)}
              valor={valores ? valores[i] : null}
              placeholder={oficial}
              onGuardar={(v) => onPorcentaje(i, v)}
            />
          ))}
          {aviso && (
            <p role="status" style={{ fontSize: 12, lineHeight: 1.4, margin: 0, fontWeight: 500, color: 'var(--brand-on-bg)' }}>
              {aviso}
            </p>
          )}
        </div>
      )}
      <p style={{ ...helperStyle, fontSize: 12, lineHeight: 1.4, marginTop: 4 }}>{NOTA_WHS}</p>
    </fieldset>
  )
}
