// Tabla de estadísticas opcionales por hoyo (putts / fairway / GIR).
// Persiste contra la ronda ACTIVA vía `entry.saveHoleStat`.

import { useRef, useState } from 'react'
import type { CourseHole } from '@/golf/leaderboard/types'
import type { UseScoreEntryReturn } from '../hooks/useScoreEntry'

interface HoleStatsTableProps {
  courseHoles: CourseHole[]
  entry: UseScoreEntryReturn
}

const TRI_STATE: (boolean | null)[] = [true, false, null]

export function HoleStatsTable({ courseHoles, entry }: HoleStatsTableProps) {
  const {
    holes, currentScores, holePutts, setHolePutts, holeFairway, setHoleFairway,
    holeGir, setHoleGir, saveHoleStat,
  } = entry
  /** Putts a la vista al entrar al campo. Salir sin cambiarlos no guarda: con la carga lenta o fallida el campo
   *  está vacío aunque la base tenga putts, y un toque al pasar los borraba (mandaba null). */
  const puttsAlEnfocar = useRef<number | null>(null)
  /** Hoyo → putts enviados que todavía no quedaron guardados (fallaron o siguen viajando). Mientras el hoyo esté
   *  acá, salir del campo los reenvía aunque el valor no haya cambiado: si no, un guardado fallido quedaba en
   *  pantalla y nunca llegaba a la base. */
  const pendientesRef = useRef(new Map<number, number | null>())
  /** Los mismos hoyos, para marcarlos en pantalla cuando el envío falló. */
  const [fallidos, setFallidos] = useState<ReadonlySet<number>>(new Set())

  const guardarPutts = async (h: number) => {
    const putts = holePutts[h] ?? null
    if (putts === puttsAlEnfocar.current && !pendientesRef.current.has(h)) return
    pendientesRef.current.set(h, putts)
    const ok = await saveHoleStat(h, { putts })
    // Un envío más nuevo del mismo hoyo salió mientras tanto: el estado es de ese.
    if (pendientesRef.current.get(h) !== putts) return
    if (ok) pendientesRef.current.delete(h)
    setFallidos((prev) => {
      if (prev.has(h) === !ok) return prev
      const next = new Set(prev)
      if (ok) next.delete(h)
      else next.add(h)
      return next
    })
  }

  return (
    <div style={{ padding: '0 20px 20px', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '480px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
            {['Hoyo', 'Gross', 'Putts (0-6)', 'Fairway hit', 'GIR'].map((h) => (
              <th key={h} style={{ color: 'var(--text-2)', fontWeight: 600, fontSize: '12px', letterSpacing: '0.05em', padding: '6px 8px', textAlign: 'center' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {holes.map((h) => {
            const gross = currentScores[h]
            const disabled = gross == null
            const par = courseHoles.find((ch) => ch.numero === h)?.par ?? 4
            const isFairwayApplicable = par >= 4

            return (
              <tr key={h} style={{ borderBottom: '1px solid var(--surface-soft)', opacity: disabled ? 0.4 : 1 }}>
                <td style={{ textAlign: 'center', color: 'var(--text-2)', padding: '6px 8px', fontSize: '12px' }}>H{h} P{par}</td>
                <td style={{ textAlign: 'center', color: 'var(--text)', padding: '6px 8px', fontSize: '13px', fontWeight: 600 }}>{gross ?? '—'}</td>

                {/* Putts */}
                <td style={{ textAlign: 'center', padding: '4px 6px' }}>
                  <input
                    type="number" min={0} max={6} inputMode="numeric"
                    disabled={disabled}
                    value={holePutts[h] ?? ''}
                    onChange={(e) => {
                      const n = parseInt(e.target.value)
                      setHolePutts((prev) => ({ ...prev, [h]: isNaN(n) || n < 0 || n > 6 ? null : n }))
                    }}
                    onFocus={() => { puttsAlEnfocar.current = holePutts[h] ?? null }}
                    onBlur={() => { if (!disabled) void guardarPutts(h) }}
                    aria-label={`Putts del hoyo ${h}`}
                    aria-invalid={fallidos.has(h) || undefined}
                    title={fallidos.has(h) ? 'No se guardó. Toca y sal del campo para reintentar.' : undefined}
                    style={{ width: '48px', minHeight: '44px', background: 'var(--bg)', border: fallidos.has(h) ? '2px solid var(--double)' : '1px solid var(--surface-border)', borderRadius: '4px', color: 'var(--text)', textAlign: 'center', fontSize: '16px', padding: '4px', outline: 'none', appearance: 'textfield' as const, cursor: disabled ? 'not-allowed' : 'text' }}
                    placeholder="—"
                  />
                </td>

                {/* Fairway hit */}
                <td style={{ textAlign: 'center', padding: '4px 6px' }}>
                  {isFairwayApplicable ? (
                    <div style={{ display: 'inline-flex', gap: '4px' }}>
                      {TRI_STATE.map((v) => (
                        <button key={String(v)} type="button" disabled={disabled}
                          onClick={() => {
                            if (disabled) return
                            setHoleFairway((prev) => ({ ...prev, [h]: v }))
                            void saveHoleStat(h, { fairway_hit: v })
                          }}
                          style={{ padding: '3px 9px', minHeight: '44px', minWidth: '44px', fontSize: '13px', borderRadius: '4px', border: '1px solid', cursor: disabled ? 'not-allowed' : 'pointer',
                            background: holeFairway[h] === v ? (v === true ? 'rgba(22,163,74,0.25)' : v === false ? 'rgba(220,38,38,0.2)' : 'rgba(122,143,168,0.15)') : 'transparent',
                            borderColor: holeFairway[h] === v ? (v === true ? '#16a34a' : v === false ? 'var(--double)' : 'var(--text-2)') : 'var(--surface-border)',
                            color: holeFairway[h] === v ? 'var(--text)' : 'var(--text-2)',
                          }}>
                          {v === true ? 'Sí' : v === false ? 'No' : '—'}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-2)', fontSize: '12px' }}>N/A</span>
                  )}
                </td>

                {/* GIR */}
                <td style={{ textAlign: 'center', padding: '4px 6px' }}>
                  <div style={{ display: 'inline-flex', gap: '4px' }}>
                    {TRI_STATE.map((v) => (
                      <button key={String(v)} type="button" disabled={disabled}
                        onClick={() => {
                          if (disabled) return
                          setHoleGir((prev) => ({ ...prev, [h]: v }))
                          void saveHoleStat(h, { gir: v })
                        }}
                        style={{ padding: '3px 9px', minHeight: '44px', minWidth: '44px', fontSize: '13px', borderRadius: '4px', border: '1px solid', cursor: disabled ? 'not-allowed' : 'pointer',
                          background: holeGir[h] === v ? (v === true ? 'rgba(22,163,74,0.25)' : v === false ? 'rgba(220,38,38,0.2)' : 'rgba(122,143,168,0.15)') : 'transparent',
                          borderColor: holeGir[h] === v ? (v === true ? '#16a34a' : v === false ? 'var(--double)' : 'var(--text-2)') : 'var(--surface-border)',
                          color: holeGir[h] === v ? 'var(--text)' : 'var(--text-2)',
                        }}>
                        {v === true ? 'Sí' : v === false ? 'No' : '—'}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
