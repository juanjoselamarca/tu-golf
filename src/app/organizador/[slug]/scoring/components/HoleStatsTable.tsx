// Tabla de estadísticas opcionales por hoyo (putts / fairway / GIR).
// Persiste contra la ronda ACTIVA vía `entry.saveHoleStat`. Se monta con `key` de la ronda: lo pendiente y lo
// fallido de una tarjeta no pasa a la de otro jugador.
//
// Pensada para 390 px y una mano: fairway y GIR son UN botón de 44×44 que rota "—" → "Sí" → "No" → "—" (antes
// eran tres botones por columna y la tabla se salía de la pantalla). Un guardado que falló se ve en una fila
// propia con texto ("No se guardó · toca para reintentar"), no sólo en un `title` que en el teléfono no se lee.

import { useRef, useState, type CSSProperties } from 'react'
import type { CourseHole } from '@/golf/leaderboard/types'
import type { HoleStatPatch, UseScoreEntryReturn } from '../hooks/useScoreEntry'

interface HoleStatsTableProps {
  courseHoles: CourseHole[]
  entry: UseScoreEntryReturn
}

/** Siguiente valor del botón de fairway / GIR: sin dato → Sí → No → sin dato. */
export function siguienteTriEstado(v: boolean | null | undefined): boolean | null {
  if (v == null) return true
  return v ? false : null
}

const TEXTO_TRI = (v: boolean | null | undefined) => (v === true ? 'Sí' : v === false ? 'No' : '—')

function estiloTri(v: boolean | null | undefined, fallo: boolean, disabled: boolean): CSSProperties {
  return {
    width: '44px', height: '44px', fontSize: '14px', fontWeight: 600, borderRadius: '6px', padding: 0,
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: v === true ? 'rgba(22,163,74,0.25)' : v === false ? 'rgba(220,38,38,0.2)' : 'transparent',
    border: fallo ? '2px solid var(--error-border)' : `1px solid ${v === true ? '#16a34a' : v === false ? 'var(--double)' : 'var(--surface-border)'}`,
    color: v == null ? 'var(--text-2)' : 'var(--text)',
  }
}

const celda: CSSProperties = { textAlign: 'center', padding: '4px 2px' }

export function HoleStatsTable({ courseHoles, entry }: HoleStatsTableProps) {
  const {
    holes, currentScores, holePutts, setHolePutts, holeFairway, setHoleFairway,
    holeGir, setHoleGir, saveHoleStat,
  } = entry
  /** Putts a la vista al entrar al campo. Salir sin cambiarlos no guarda: con la carga lenta o fallida el campo
   *  está vacío aunque la base tenga putts, y un toque al pasar los borraba (mandaba null). */
  const puttsAlEnfocar = useRef<number | null>(null)
  /** Lo que se está escribiendo en el campo enfocado. Vive acá y no en `holePutts`: la recarga de la tarjeta (que
   *  sigue a cada golpe) reemplaza `holePutts` con la base y se llevaba lo tecleado antes de salir del campo. */
  const [borrador, setBorrador] = useState<{ hoyo: number; texto: string } | null>(null)
  /** Último envío de cada hoyo: sólo su resultado decide si el hoyo queda marcado como fallido. */
  const ultimoEnvio = useRef(new Map<number, number>())
  const contador = useRef(0)
  /** Hoyos cuyo último envío de stats no quedó guardado. Lo enviado sigue "tocado" en `useScoreEntry` y viaja de
   *  nuevo con el reintento (o con el próximo golpe del hoyo). */
  const [fallidos, setFallidos] = useState<ReadonlySet<number>>(new Set())

  const guardar = async (h: number, patch: HoleStatPatch) => {
    const id = ++contador.current
    ultimoEnvio.current.set(h, id)
    const ok = await saveHoleStat(h, patch)
    if (ultimoEnvio.current.get(h) !== id) return
    setFallidos((prev) => {
      if (prev.has(h) === !ok) return prev
      const next = new Set(prev)
      if (ok) next.delete(h)
      else next.add(h)
      return next
    })
  }

  const salirDePutts = (h: number) => {
    const texto = borrador?.hoyo === h ? borrador.texto : String(holePutts[h] ?? '')
    setBorrador(null)
    const n = parseInt(texto)
    const putts = isNaN(n) || n < 0 || n > 6 ? null : n
    setHolePutts((prev) => ({ ...prev, [h]: putts }))
    // Sin cambios no se envía, salvo que el hoyo tenga un guardado fallido: salir del campo lo reintenta.
    if (putts === puttsAlEnfocar.current && !fallidos.has(h)) return
    void guardar(h, { putts })
  }

  return (
    <div style={{ padding: '0 12px 20px', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
            {['Hoyo', 'Gross', 'Putts', 'Fairway', 'GIR'].map((h) => (
              <th key={h} style={{ color: 'var(--text-2)', fontWeight: 600, fontSize: '12px', letterSpacing: '0.05em', padding: '6px 2px', textAlign: 'center' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {holes.map((h) => {
            const gross = currentScores[h]
            const disabled = gross == null
            const par = courseHoles.find((ch) => ch.numero === h)?.par ?? 4
            const isFairwayApplicable = par >= 4
            const fallo = fallidos.has(h)

            return [
              <tr key={h} style={{ borderBottom: fallo ? 'none' : '1px solid var(--surface-soft)', opacity: disabled ? 0.4 : 1 }}>
                <td style={{ ...celda, color: 'var(--text-2)', fontSize: '12px', whiteSpace: 'nowrap' }}>H{h} P{par}</td>
                <td style={{ ...celda, color: 'var(--text)', fontWeight: 600 }}>{gross ?? '—'}</td>

                <td style={celda}>
                  <input
                    type="number" min={0} max={6} inputMode="numeric"
                    disabled={disabled}
                    value={borrador?.hoyo === h ? borrador.texto : (holePutts[h] ?? '')}
                    onChange={(e) => setBorrador({ hoyo: h, texto: e.target.value })}
                    onFocus={() => {
                      puttsAlEnfocar.current = holePutts[h] ?? null
                      setBorrador({ hoyo: h, texto: String(holePutts[h] ?? '') })
                    }}
                    onBlur={() => { if (!disabled) salirDePutts(h) }}
                    aria-label={`Putts del hoyo ${h}`}
                    aria-invalid={fallo || undefined}
                    style={{ width: '48px', minHeight: '44px', background: 'var(--bg)', border: fallo ? '2px solid var(--error-border)' : '1px solid var(--surface-border)', borderRadius: '6px', color: 'var(--text)', textAlign: 'center', fontSize: '16px', padding: '4px', outline: 'none', appearance: 'textfield' as const, cursor: disabled ? 'not-allowed' : 'text' }}
                    placeholder="—"
                  />
                </td>

                <td style={celda}>
                  {isFairwayApplicable ? (
                    <button type="button" disabled={disabled}
                      aria-label={`Fairway del hoyo ${h}: ${TEXTO_TRI(holeFairway[h])}`}
                      onClick={() => {
                        const v = siguienteTriEstado(holeFairway[h])
                        setHoleFairway((prev) => ({ ...prev, [h]: v }))
                        void guardar(h, { fairway_hit: v })
                      }}
                      style={estiloTri(holeFairway[h], fallo, disabled)}>
                      {TEXTO_TRI(holeFairway[h])}
                    </button>
                  ) : (
                    <span style={{ color: 'var(--text-2)', fontSize: '12px' }}>N/A</span>
                  )}
                </td>

                <td style={celda}>
                  <button type="button" disabled={disabled}
                    aria-label={`GIR del hoyo ${h}: ${TEXTO_TRI(holeGir[h])}`}
                    onClick={() => {
                      const v = siguienteTriEstado(holeGir[h])
                      setHoleGir((prev) => ({ ...prev, [h]: v }))
                      void guardar(h, { gir: v })
                    }}
                    style={estiloTri(holeGir[h], fallo, disabled)}>
                    {TEXTO_TRI(holeGir[h])}
                  </button>
                </td>
              </tr>,
              fallo && (
                <tr key={`${h}-fallo`} style={{ borderBottom: '1px solid var(--surface-soft)' }}>
                  <td colSpan={5} style={{ padding: '0 2px 6px' }}>
                    {/* Reenvía lo tocado del hoyo (putts, fairway y GIR que no quedaron guardados). */}
                    <button type="button" onClick={() => void guardar(h, {})}
                      style={{ width: '100%', minHeight: '44px', borderRadius: '6px', border: '1px solid var(--error-border)', background: 'var(--error-bg)', color: 'var(--error-fg)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                      Hoyo {h}: no se guardó · toca para reintentar
                    </button>
                  </td>
                </tr>
              ),
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}
