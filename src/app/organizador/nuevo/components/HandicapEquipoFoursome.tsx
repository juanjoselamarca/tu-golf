'use client'

// src/app/organizador/nuevo/components/HandicapEquipoFoursome.tsx
//
// Handicap de la pareja en foursome: Oficial (50 % de la suma, de
// `@/golf/formats/team-handicap`) o Personalizado (otro % de la suma).

import { FOURSOME_PCT_SUMA_OFICIAL } from '@/golf/formats/team-handicap'
import type { ModoHandicapEquipo } from '../hooks/useTeamConfig'
import { fieldStyle, helperStyle, labelStyle } from '../styles'
import { NOTA_WHS, OpcionHandicap, PorcentajeInput } from './HandicapEquipoCampos'

export function HandicapEquipoFoursome({
  modo, porcentajeSuma, onModo, onPorcentajeSuma,
}: {
  modo: ModoHandicapEquipo
  /** Guardado; null = personalizado todavía sin % (se muestra vacío). */
  porcentajeSuma: number | null
  onModo: (modo: ModoHandicapEquipo) => void
  onPorcentajeSuma: (valor: number) => void
}) {
  return (
    <fieldset style={{ ...fieldStyle, border: 'none', margin: 0, padding: 0 }}>
      <legend style={labelStyle}>Handicap del equipo</legend>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        <OpcionHandicap
          nombreGrupo="team-handicap-modo"
          modo="oficial"
          seleccionado={modo === 'oficial'}
          titulo="Oficial"
          descripcion={`${FOURSOME_PCT_SUMA_OFICIAL} % de la suma de los handicaps de la pareja`}
          onElegir={onModo}
        />
        <OpcionHandicap
          nombreGrupo="team-handicap-modo"
          modo="personalizado"
          seleccionado={modo === 'personalizado'}
          titulo="Personalizado"
          descripcion="Define tú el porcentaje de la suma"
          onElegir={onModo}
        />
      </div>
      {modo === 'personalizado' && (
        <div style={{ marginTop: 6 }}>
          <PorcentajeInput
            id="t-team-pct-suma"
            etiqueta="Porcentaje de la suma de los handicaps"
            valor={porcentajeSuma}
            placeholder={FOURSOME_PCT_SUMA_OFICIAL}
            onGuardar={onPorcentajeSuma}
          />
        </div>
      )}
      <p style={{ ...helperStyle, fontSize: 12, lineHeight: 1.4, marginTop: 4 }}>{NOTA_WHS}</p>
    </fieldset>
  )
}
