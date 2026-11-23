'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ConfirmModal } from '@/components/ConfirmModal'
import { nombreDelAnotador } from '@/golf/ronda-libre/anotador-de-equipo'
import type { EquipoDelScorer } from '@/lib/data/ronda-libre-scorer'

interface EquiposDeOtroCelularProps {
  codigo: string
  equipos: readonly EquipoDelScorer[]
  /** Quien cierra la ronda (`cierraLaRonda`) puede liberar un equipo: vuelve a su celular. */
  puedeLiberar: boolean
  /** Equipo cuyo pedido está en vuelo (`useAnotadorDeEquipo.enCurso`). */
  enCurso: string | null
  onLiberar: (equipoId: string, nombreEquipo: string) => void
}

/**
 * Un celular por equipo: los equipos que anota otro celular, como franja (no tarjeta: desde acá no se tocan). Sus
 * golpes se ven en la tabla en vivo. El creador puede liberar uno (con confirmación) para anotarlo él.
 */
export function EquiposDeOtroCelular({ codigo, equipos, puedeLiberar, enCurso, onLiberar }: EquiposDeOtroCelularProps) {
  const [porLiberar, setPorLiberar] = useState<EquipoDelScorer | null>(null)
  if (equipos.length === 0) return null

  return (
    <section aria-label="Equipos que anota otro celular" style={{ marginTop: '4px', padding: '10px 12px', borderRadius: '12px', border: '1px dashed var(--border-md)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {equipos.map(e => (
          <li key={e.id} style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '15px', color: 'var(--text)' }}>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <span style={{ fontWeight: 600 }}>{e.nombre}</span>
              <span style={{ color: 'var(--text-2)' }}> · lo anota {nombreDelAnotador(e)}</span>
            </span>
            {puedeLiberar && (
              <button
                type="button"
                onClick={() => setPorLiberar(e)}
                disabled={enCurso != null}
                style={{ flexShrink: 0, minHeight: '44px', minWidth: '44px', padding: '0 12px', border: 'none', background: 'transparent', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: '14px', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '3px', cursor: enCurso != null ? 'default' : 'pointer' }}
              >
                {enCurso === e.id ? 'Liberando…' : 'Liberar'}
              </button>
            )}
          </li>
        ))}
      </ul>
      <Link
        href={`/ronda-libre/${codigo}`}
        style={{ alignSelf: 'flex-start', minHeight: '44px', display: 'inline-flex', alignItems: 'center', color: 'var(--brand-on-bg)', fontSize: '14px', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '3px' }}
      >
        Ver tabla en vivo
      </Link>

      <ConfirmModal
        isOpen={porLiberar != null}
        variant="warning"
        title={porLiberar ? `¿Liberar ${porLiberar.nombre}?` : ''}
        description={porLiberar ? `Pasa a tu celular y ${nombreDelAnotador(porLiberar)} ya no puede anotarlo. Lo que ya subió queda guardado.` : ''}
        confirmText="Liberar"
        onCancel={() => setPorLiberar(null)}
        onConfirm={() => {
          const e = porLiberar
          setPorLiberar(null)
          if (e) onLiberar(e.id, e.nombre)
        }}
      />
    </section>
  )
}
