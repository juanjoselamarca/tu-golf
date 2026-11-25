'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { LIMITES_SKINS, type ConfigSkins } from '@/golf/formats/skins'
import { formatPesos } from '@/lib/format'
import { conPozoEscrito } from '../../hooks/skins-del-formulario'
import { colores, input } from '../estilos'
import { NOTA_SKINS } from './catalogo'
import { TituloDePerilla } from '../juego/controles'

export const MENSAJE_POZO_TOPE = `Máximo ${formatPesos(LIMITES_SKINS.pozoPorJugador.max)} por jugador.`

/** Cuántos dígitos hay antes de la posición `pos` de un texto con puntos de miles. */
function digitosAntes(texto: string, pos: number): number {
  return texto.slice(0, pos).replace(/\D/g, '').length
}

/** La posición en el texto formateado que deja `n` dígitos a su izquierda. */
function posicionTrasDigitos(texto: string, n: number): number {
  if (n === 0) return 0
  let vistos = 0
  for (let i = 0; i < texto.length; i++) {
    if (/\d/.test(texto[i])) vistos++
    if (vistos === n) return i + 1
  }
  return texto.length
}

/**
 * Pozo por jugador en pesos, con miles chilenos mientras se escribe. El cursor queda tras el mismo dígito aunque el
 * punto de miles se mueva (editar por el medio no lo manda al final). Lo que pasa el techo no entra y se avisa.
 */
export function PozoPorJugador({ skins, onSkins }: { skins: ConfigSkins; onSkins: (c: ConfigSkins) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const cursor = useRef<number | null>(null)
  const [sobreElTope, setSobreElTope] = useState(false)
  const texto = skins.pozoPorJugador === 0 ? '' : formatPesos(skins.pozoPorJugador).slice(1)

  useLayoutEffect(() => {
    const el = ref.current
    if (el == null || cursor.current == null || document.activeElement !== el) return
    const pos = posicionTrasDigitos(texto, cursor.current)
    el.setSelectionRange(pos, pos)
    cursor.current = null
  }, [texto])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <TituloDePerilla htmlFor="skins-pozo">Pozo por jugador</TituloDePerilla>
      <span style={{ fontSize: '12px', color: colores.texto2, lineHeight: 1.4 }}>{NOTA_SKINS.pozo}</span>
      <div style={{ position: 'relative' }}>
        <span aria-hidden="true" style={{
          position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: colores.texto2,
        }}>$</span>
        <input
          ref={ref}
          id="skins-pozo"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          aria-describedby={sobreElTope ? 'skins-pozo-tope' : undefined}
          aria-invalid={sobreElTope || undefined}
          value={texto}
          onChange={e => {
            const r = conPozoEscrito(skins, e.target.value)
            setSobreElTope(r.sobreElTope)
            if (r.config === skins) {
              // No entró: el texto vuelve al de antes y el cursor, adonde estaba antes de la tecla.
              cursor.current = digitosAntes(texto, Math.max(0, (e.target.selectionStart ?? texto.length) - (e.target.value.length - texto.length)))
              e.target.value = texto
              const pos = posicionTrasDigitos(texto, cursor.current)
              e.target.setSelectionRange(pos, pos)
              cursor.current = null
              return
            }
            cursor.current = digitosAntes(e.target.value, e.target.selectionStart ?? e.target.value.length)
            onSkins(r.config)
          }}
          style={{
            ...input, width: '100%', minHeight: '48px', paddingLeft: '28px', fontSize: '16px', fontVariantNumeric: 'tabular-nums',
            ...(sobreElTope ? { border: '2px solid var(--error-fg)' } : {}),
          }}
        />
      </div>
      {sobreElTope && (
        <span id="skins-pozo-tope" role="status" style={{ fontSize: '12px', color: 'var(--error-fg)', lineHeight: 1.4 }}>
          {MENSAJE_POZO_TOPE}
        </span>
      )}
    </div>
  )
}
