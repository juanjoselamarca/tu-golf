'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ConfirmModal } from '@/components/ConfirmModal'
import { equiposLibres, equiposTomados, nombreDelAnotador } from '@/golf/ronda-libre/anotador-de-equipo'
import type { EquipoDelScorer } from '@/lib/data/ronda-libre-scorer'

interface ElegirEquipoProps {
  codigo: string
  courseName: string | null | undefined
  equipos: readonly EquipoDelScorer[]
  /** Equipo cuyo reclamo está en vuelo (`useAnotadorDeEquipo.enCurso`): la lista no acepta otro toque. */
  enCurso: string | null
  /** Último reclamo que no resultó (otro celular lo ganó, sin señal): se muestra arriba de la lista ya refrescada. */
  aviso: { equipoId: string; mensaje: string } | null
  /** Solo tras confirmar en el modal: un toque suelto no reclama un equipo. */
  onElegir: (equipoId: string) => void
}

/**
 * Un celular por equipo: quien abre el link y todavía no anota un equipo elige cuál. Los libres se tocan y se
 * confirman (un toque suelto con el guante no reclama un equipo ajeno); los que ya anota otro celular se ven con su
 * anotador y no se tocan. Sin libres: a la tabla en vivo.
 */
export function ElegirEquipo({ codigo, courseName, equipos, enCurso, aviso, onElegir }: ElegirEquipoProps) {
  const libres = equiposLibres(equipos)
  const tomados = equiposTomados(equipos)
  const [porReclamar, setPorReclamar] = useState<EquipoDelScorer | null>(null)

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)', padding: '24px 16px calc(24px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <header>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, lineHeight: 1.2 }}>Elige tu equipo</h1>
        <p style={{ margin: '6px 0 0', fontSize: '15px', color: 'var(--text-2)', lineHeight: 1.4 }}>
          {courseName ? `${courseName} · ` : ''}Anotas el score de tu equipo desde este celular.
        </p>
      </header>

      {/* Región viva montada siempre: pasar de vacía a con texto lo anuncian todos los lectores de pantalla. */}
      <div role="alert" aria-live="assertive">
        {aviso && (
          <p style={{ margin: 0, padding: '12px 14px', borderRadius: '12px', background: 'var(--error-bg)', border: '1px solid var(--error-border)', color: 'var(--error-fg)', fontSize: '15px', fontWeight: 600, lineHeight: 1.4 }}>
            {aviso.mensaje}
          </p>
        )}
      </div>

      {libres.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }} aria-label="Equipos libres">
          {libres.map(e => {
            const tomando = enCurso === e.id
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setPorReclamar(e)}
                  disabled={enCurso != null}
                  aria-busy={tomando}
                  style={{
                    width: '100%', minHeight: '64px', padding: '12px 16px', borderRadius: '14px',
                    border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                    fontFamily: 'inherit', fontSize: '17px', fontWeight: 600, textAlign: 'left',
                    cursor: enCurso != null ? 'default' : 'pointer', touchAction: 'manipulation',
                    opacity: enCurso != null && !tomando ? 0.6 : 1,
                  }}
                >
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{e.nombre}</span>
                  <span style={{ flexShrink: 0, fontSize: '15px', fontWeight: 700, color: 'var(--brand-on-bg)' }}>
                    {tomando ? 'Tomando…' : 'Anotar'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div style={{ padding: '16px', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          <p style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Todos los equipos ya tienen quién los anote.</p>
          <p style={{ margin: '6px 0 0', fontSize: '15px', color: 'var(--text-2)', lineHeight: 1.4 }}>
            Si te toca anotar uno, pídele a quien creó la ronda que lo libere.
          </p>
        </div>
      )}

      {tomados.length > 0 && (
        <section aria-label="Equipos que ya se anotan">
          <h2 style={{ margin: '4px 0 8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Ya tienen quién anote
          </h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {tomados.map(e => (
              <li key={e.id} style={{ minHeight: '48px', padding: '10px 16px', borderRadius: '12px', border: '1px dashed var(--border-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', fontSize: '15px' }}>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere', fontWeight: 600 }}>{e.nombre}</span>
                <span style={{ flexShrink: 0, color: 'var(--text-2)' }}>lo anota {nombreDelAnotador(e)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        href={`/ronda-libre/${codigo}`}
        style={{ marginTop: 'auto', minHeight: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '12px', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '15px', fontWeight: 600, textDecoration: 'none' }}
      >
        Ver tabla en vivo
      </Link>

      <ConfirmModal
        isOpen={porReclamar != null}
        variant="warning"
        title={porReclamar ? `¿Anotar ${porReclamar.nombre} desde este celular?` : ''}
        description="Desde ahora solo este celular anota su score."
        confirmText="Anotar"
        cancelText="Cancelar"
        onCancel={() => setPorReclamar(null)}
        onConfirm={() => {
          const e = porReclamar
          setPorReclamar(null)
          if (e) onElegir(e.id)
        }}
      />
    </main>
  )
}
