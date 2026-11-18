// Tabla de estadísticas opcionales por hoyo (putts / fairway / GIR).
// Escribe en el documento del hoyo de la ronda ACTIVA vía `entry.editarStat` (sale a los 600 ms, junto con lo
// que se toque mientras tanto). Lo que se ve sale de `entry.vista`: no hay copia local de las stats.
//
// Pensada para 390 px y una mano: fairway y GIR son UN botón de 44×44 que rota "—" → "Sí" → "No" → "—" (antes
// eran tres botones por columna y la tabla se salía de la pantalla). Un guardado que falló se ve en una fila
// propia con texto ("No se guardó · toca para reintentar"), no sólo en un `title` que en el teléfono no se lee.
// El estado del hoyo es uno solo (golpe y stats viajan juntos): colapsar la tabla no borra la marca.

import { useRef, useState, type CSSProperties } from 'react'
import type { CourseHole } from '@/golf/leaderboard/types'
import type { UseScoreEntryReturn } from '../hooks/useScoreEntry'
import { rotuloEstado, textoMotivo } from './texto-guardado'

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

/** Un segundo toque del mismo botón antes de esto es un rebote del dedo (o del guante), no una intención. */
export const REBOTE_TOQUE_MS = 350
/** Rango válido de putts en un hoyo (el mismo que muestra el encabezado). */
const PUTTS_MAX = 6

export function HoleStatsTable({ courseHoles, entry }: HoleStatsTableProps) {
  const { holes, vista, editarStat, reintentarGuardado, selectedRound } = entry
  /** Putts a la vista al entrar al campo. Salir sin cambiarlos no guarda: con la carga lenta o fallida el campo
   *  está vacío aunque la base tenga putts, y un toque al pasar los borraba (mandaba null). */
  const puttsAlEnfocar = useRef<number | null>(null)
  /** Lo que se está escribiendo en el campo enfocado. Vive acá hasta salir del campo: una recarga de la tarjeta no
   *  se lleva lo tecleado. */
  const [borrador, setBorrador] = useState<{ hoyo: number; texto: string } | null>(null)
  /** Hoyo y texto de putts fuera de rango: se avisa y no se guarda (antes se borraba en silencio). */
  const [puttsInvalidos, setPuttsInvalidos] = useState<{ hoyo: number; texto: string } | null>(null)
  /** Último toque de cada botón de fairway / GIR (`hoyo:stat`), para descartar rebotes. */
  const ultimoToque = useRef(new Map<string, number>())

  const salirDePutts = (h: number) => {
    const texto = (borrador?.hoyo === h ? borrador.texto : String(vista[h]?.putts ?? '')).trim()
    setBorrador(null)
    const n = Number(texto)
    if (texto !== '' && (!Number.isInteger(n) || n < 0 || n > PUTTS_MAX)) {
      // Fuera de rango: queda lo que había y se dice por qué.
      setPuttsInvalidos({ hoyo: h, texto })
      return
    }
    if (puttsInvalidos?.hoyo === h) setPuttsInvalidos(null)
    const putts = texto === '' ? null : n
    // Salir sin cambiar el valor no envía nada (un hoyo pendiente ya se reintenta solo).
    if (putts === puttsAlEnfocar.current) return
    editarStat(h, { putts })
  }

  /** Toque del botón de fairway / GIR: ignora rebotes, rota el valor y lo envía cuando dejan de tocar. */
  const rotar = (h: number, stat: 'fairway_hit' | 'gir') => {
    const clave = `${h}:${stat}`
    const ahora = Date.now()
    if (ahora - (ultimoToque.current.get(clave) ?? -Infinity) < REBOTE_TOQUE_MS) return
    ultimoToque.current.set(clave, ahora)
    editarStat(h, { [stat]: siguienteTriEstado(vista[h]?.[stat]) })
  }

  return (
    <div style={{ padding: '0 12px 20px', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
            {['Hoyo', 'Gross', 'Putts (0-6)', 'Fairway', 'GIR'].map((h) => (
              <th key={h} style={{ color: 'var(--text-2)', fontWeight: 600, fontSize: '12px', letterSpacing: '0.05em', padding: '6px 2px', textAlign: 'center' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {holes.map((h) => {
            const v = vista[h]
            const gross = v?.gross ?? null
            const disabled = gross == null
            const par = courseHoles.find((ch) => ch.numero === h)?.par ?? 4
            const isFairwayApplicable = par >= 4
            // Sin confirmar o rechazado: se marca acá también, con texto (la grilla de arriba dice lo mismo).
            const fallo = v != null && (v.estado === 'sin_confirmar' || v.estado === 'rechazado')
            const invalido = puttsInvalidos?.hoyo === h ? puttsInvalidos.texto : null

            return [
              <tr key={h} style={{ borderBottom: fallo || invalido != null ? 'none' : '1px solid var(--surface-soft)', opacity: disabled ? 0.4 : 1 }}>
                <td style={{ ...celda, color: 'var(--text-2)', fontSize: '12px', whiteSpace: 'nowrap' }}>H{h} P{par}</td>
                <td style={{ ...celda, color: 'var(--text)', fontWeight: 600 }}>{gross ?? '—'}</td>

                <td style={celda}>
                  <input
                    type="number" min={0} max={6} inputMode="numeric"
                    disabled={disabled}
                    value={borrador?.hoyo === h ? borrador.texto : (v?.putts ?? '')}
                    onChange={(e) => setBorrador({ hoyo: h, texto: e.target.value })}
                    onFocus={() => {
                      puttsAlEnfocar.current = v?.putts ?? null
                      setBorrador({ hoyo: h, texto: String(v?.putts ?? '') })
                    }}
                    onBlur={() => { if (!disabled) salirDePutts(h) }}
                    aria-label={`Putts del hoyo ${h}`}
                    aria-invalid={fallo || invalido != null || undefined}
                    style={{ width: '48px', minHeight: '44px', background: 'var(--bg)', border: fallo || invalido != null ? '2px solid var(--error-border)' : '1px solid var(--surface-border)', borderRadius: '6px', color: 'var(--text)', textAlign: 'center', fontSize: '16px', padding: '4px', outline: 'none', appearance: 'textfield' as const, cursor: disabled ? 'not-allowed' : 'text' }}
                    placeholder="—"
                  />
                </td>

                <td style={celda}>
                  {isFairwayApplicable ? (
                    <button type="button" disabled={disabled}
                      aria-label={`Fairway del hoyo ${h}: ${TEXTO_TRI(v?.fairway_hit)}`}
                      onClick={() => rotar(h, 'fairway_hit')}
                      style={estiloTri(v?.fairway_hit, fallo, disabled)}>
                      {TEXTO_TRI(v?.fairway_hit)}
                    </button>
                  ) : (
                    <span style={{ color: 'var(--text-2)', fontSize: '12px' }}>N/A</span>
                  )}
                </td>

                <td style={celda}>
                  <button type="button" disabled={disabled}
                    aria-label={`GIR del hoyo ${h}: ${TEXTO_TRI(v?.gir)}`}
                    onClick={() => rotar(h, 'gir')}
                    style={estiloTri(v?.gir, fallo, disabled)}>
                    {TEXTO_TRI(v?.gir)}
                  </button>
                </td>
              </tr>,
              invalido != null && (
                <tr key={`${h}-invalido`} style={{ borderBottom: fallo ? 'none' : '1px solid var(--surface-soft)' }}>
                  <td colSpan={5} role="alert" style={{ padding: '0 2px 6px', color: 'var(--error-fg)', fontSize: '13px', fontWeight: 600, textAlign: 'center' }}>
                    Hoyo {h}: «{invalido}» no es válido. Putts entre 0 y {PUTTS_MAX}; no se guardó.
                  </td>
                </tr>
              ),
              fallo && (
                <tr key={`${h}-fallo`} style={{ borderBottom: '1px solid var(--surface-soft)' }}>
                  <td colSpan={5} style={{ padding: '0 2px 6px' }}>
                    {/* Reenvía el hoyo completo (golpe y stats), también un rechazo: el organizador lo pide. */}
                    <button type="button" onClick={() => reintentarGuardado(selectedRound?.id)}
                      style={{ width: '100%', minHeight: '44px', borderRadius: '6px', border: '1px solid var(--error-border)', background: 'var(--error-bg)', color: 'var(--error-fg)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                      Hoyo {h}: {rotuloEstado(v.estado)?.toLowerCase()}{v.estado === 'rechazado' ? ` (${textoMotivo(v.motivo)})` : ''} · toca para reintentar
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
