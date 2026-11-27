'use client'

import { useState } from 'react'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Button } from '@/components/ui/Button'
import { useShare } from '@/components/share/useShare'
import { enlacesDeRondaLibre } from '@/components/ronda/OpcionesParaCompartir'
import { nombreDeQuienAnota } from '@/golf/ronda-libre/anotador-de-equipo'
import type { EquipoDelScorer } from '@/lib/data/ronda-libre-scorer'

interface EquiposDeOtroCelularProps {
  codigo: string
  equipos: readonly EquipoDelScorer[]
  /** `nombreDelCreador`: quien anota los equipos sin reclamar (para quien no es el creador). */
  nombreCreador: string | null
  /** Quien libera equipos (`liberaEquipos`: el creador) puede liberar uno: vuelve a su celular. */
  puedeLiberar: boolean
  /** Equipo cuyo pedido está en vuelo (`useAnotadorDeEquipo.enCurso`). */
  enCurso: string | null
  onLiberar: (equipoId: string, nombreEquipo: string) => void
  /** «Anotarlo yo»: quien cierra la ronda toma en este celular un equipo que nadie reclamó todavía. */
  onTomar: (equipoId: string) => void
  /**
   * Quien cierra la ronda y algún equipo sin celular (también uno que tomó con «Anotarlo yo»): el link para anotar va
   * a la vista. Es además la vuelta atrás de «Anotarlo yo»: su equipo abre el link, lo toma y sale de este celular.
   */
  hayEquipoSinCelular: boolean
}

/**
 * Un celular por equipo: los equipos que anota otro celular, como franja (no tarjeta: desde acá no se tocan). Sus
 * golpes se ven en la tabla en vivo. El creador puede liberar uno (con confirmación) para anotarlo él.
 * Uno que nadie reclamó todavía también va acá: para el creador dice «sin celular todavía» y ofrece «Anotarlo yo»
 * (discreto y con confirmación). Juanjo, 26-nov: que exista la forma, pero no tan a la vista; nunca bloquea.
 */
export function EquiposDeOtroCelular({ codigo, equipos, nombreCreador, puedeLiberar, enCurso, onLiberar, onTomar, hayEquipoSinCelular }: EquiposDeOtroCelularProps) {
  const [porLiberar, setPorLiberar] = useState<EquipoDelScorer | null>(null)
  const [porTomar, setPorTomar] = useState<EquipoDelScorer | null>(null)
  const { share } = useShare()
  // Juanjo, 26-nov: el link para el otro equipo quedaba escondido en el ícono de compartir.
  if (equipos.length === 0 && !hayEquipoSinCelular) return null

  return (
    <section aria-label="Equipos que anota otro celular" style={{ marginTop: '4px', padding: '10px 12px', borderRadius: '12px', border: '1px dashed var(--border-md)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {equipos.length > 0 && <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {equipos.map(e => (
          <li key={e.id} style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '15px', color: 'var(--text)' }}>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <span style={{ fontWeight: 600 }}>{e.nombre}</span>
              <span style={{ color: 'var(--text-2)' }}>
                {sinCelular(e) ? ' · nadie lo anota todavía' : ` · lo anota ${nombreDeQuienAnota(e, nombreCreador)}`}
              </span>
            </span>
            {puedeLiberar && sinCelular(e) ? (
              <button
                type="button"
                onClick={() => setPorTomar(e)}
                disabled={enCurso != null}
                style={{ flexShrink: 0, minHeight: '44px', minWidth: '44px', padding: '0 12px', border: 'none', background: 'transparent', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: '14px', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '3px', cursor: enCurso != null ? 'default' : 'pointer' }}
              >
                Anotarlo yo
              </button>
            ) : puedeLiberar && (
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
      </ul>}
      {hayEquipoSinCelular && (
        // Contorno dorado (`nav`), no sólido: el único dorado sólido de la pantalla es «Siguiente» (revisión Fable 27-nov).
        <Button
          variant="nav"
          fullWidth
          className="mt-1"
          onClick={() => { const enlace = enlacesDeRondaLibre(codigo, { conJugar: false, unCelularPorEquipo: true }).anotar; if (enlace) void share(enlace) }}
        >
          Enviar link para anotar
        </Button>
      )}
      {/* La tabla de todos los equipos vive en la pestaña «Leaderboard» de arriba (antes era un link a otra página). */}

      <ConfirmModal
        isOpen={porLiberar != null}
        variant="warning"
        title={porLiberar ? `¿Liberar ${porLiberar.nombre}?` : ''}
        description={porLiberar ? `Pasa a tu celular y ${nombreDeQuienAnota(porLiberar, nombreCreador)} ya no puede anotarlo. Lo que ya subió queda guardado.` : ''}
        confirmText="Liberar"
        onCancel={() => setPorLiberar(null)}
        onConfirm={() => {
          const e = porLiberar
          setPorLiberar(null)
          if (e) onLiberar(e.id, e.nombre)
        }}
      />

      <ConfirmModal
        isOpen={porTomar != null}
        variant="warning"
        title={porTomar ? `¿Anotar ${porTomar.nombre} desde este celular?` : ''}
        description="Úsalo solo si ese equipo no puede anotar. Si después abre su link, puede tomarlo igual."
        confirmText="Anotarlo yo"
        onCancel={() => setPorTomar(null)}
        onConfirm={() => {
          const e = porTomar
          setPorTomar(null)
          if (e) onTomar(e.id)
        }}
      />
    </section>
  )
}

/**
 * Equipo de la franja que nadie reclamó y sin golpes: no lo anota nadie todavía. Con golpes lo anota el creador (uno que
 * liberó). Antes, para quien no es el creador, uno así decía «lo anota {creador}» (revisión Fable 27-nov).
 */
function sinCelular(e: EquipoDelScorer): boolean {
  return e.anotador_user_id == null && !Object.values(e.scores ?? {}).some(v => v != null)
}
