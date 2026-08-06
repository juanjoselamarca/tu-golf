'use client'

// src/components/FedegolfIndiceModal.tsx
//
// Modal "Tu índice oficial, explicado" — desglose de las ~20 tarjetas FedeGolf
// que componen el índice oficial del socio (card "Federación" de /perfil).
// Gemelo de IndiceBreakdownModal (que explica el Índice Golfers+): mismo
// bottom-sheet, mismo portal, misma familia visual.
//
// Datos EN VIVO desde /api/fedegolf/tarjetas: el flag `cuenta` (cuáles de las
// 20 entran al índice) lo resuelve fedegolf.cl, así el promedio queda cuadrado
// al decimal con el número oficial (spec: re-derivar del fetch, no de BD).

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Trophy } from '@/components/icons'
import type { FedegolfTarjeta } from '@/lib/fedegolf/types'
import { formulaEsExplicable, filasDelCalculo } from '@/lib/fedegolf/tarjetas'
import BreakdownRow, { BreakdownLista, BreakdownSeccion } from '@/components/indice/BreakdownRow'

interface TarjetasResponse {
  ok: boolean
  linked?: boolean
  tarjetas?: FedegolfTarjeta[]
  /** Promedio sin redondear — sólo para mostrar de dónde sale el truncado (9.36 → 9.3). */
  promedioCrudo?: number | null
  /** Promedio ya truncado con la convención FedeGolf: debe coincidir con el índice oficial. */
  indiceDerivado?: number | null
  /** Índice oficial del MISMO fetch que las tarjetas (no el guardado, que puede estar viejo). */
  indicePublicado?: number | null
  /** Cuántas tarjetas dice la fede haber usado — validación cruzada de nuestra selección. */
  tarjetasUtilizadas?: number | null
  diferencialesQueCuentan?: number[]
  slotsVentana?: number
  rondasQueCuentan?: number
  error?: string
}

interface FedegolfIndiceModalProps {
  isOpen: boolean
  onClose: () => void
  /** Índice oficial (profiles.indice) — la verdad; el fetch confirma cómo se compone. */
  indiceOficial: number | null
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1] ?? ''} ${m[1]}`
}

/** "C.G. Los Leones / Los Leones (VARONES)" → "C.G. Los Leones". */
function nombreCancha(clubCancha: string): string {
  return (clubCancha.split('/')[0] ?? clubCancha).trim() || clubCancha
}

function metaLinea(t: FedegolfTarjeta): string {
  const partes: string[] = [fechaCorta(t.fechaJuego)]
  if (t.tee) partes.push(t.tee)
  if (Number.isFinite(t.courseRating) && Number.isFinite(t.slope)) partes.push(`${t.courseRating}/${t.slope}`)
  if (Number.isFinite(t.scoreGross)) partes.push(String(t.scoreGross))
  return partes.join(' · ')
}

export default function FedegolfIndiceModal({ isOpen, onClose, indiceOficial }: FedegolfIndiceModalProps) {
  const [data, setData] = useState<TarjetasResponse | null>(null)
  const [loading, setLoading] = useState(false)

  // Keyframes globales una sola vez (patrón portable de IndiceBreakdownModal).
  useEffect(() => {
    if (typeof document === 'undefined') return
    const id = 'fedegolf-indice-keyframes'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = `
      @keyframes fgIndiceOverlayIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes fgIndiceSheetIn { from { transform: translateY(100%); } to { transform: translateY(0); } }
    `
    document.head.appendChild(style)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    setData(null)
    ;(async () => {
      try {
        const res = await fetch('/api/fedegolf/tarjetas')
        const json = (await res.json()) as TarjetasResponse
        if (!cancelled) setData(json)
      } catch {
        if (!cancelled) setData({ ok: false, error: 'red' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen])

  if (!isOpen) return null
  if (typeof document === 'undefined') return null

  const tarjetas = data?.tarjetas ?? []
  const diffsCuentan = data?.diferencialesQueCuentan ?? []
  const promedioCrudo = data?.promedioCrudo ?? null
  const indiceDerivado = data?.indiceDerivado ?? null
  const tarjetasUtilizadas = data?.tarjetasUtilizadas ?? null
  // El oficial del mismo momento que las tarjetas (json.php de la fede).
  const oficialVivo = data?.indicePublicado ?? null
  // Orden a propósito: el número grande tiene que ser el mismo en el que termina
  // la fórmula. Si no hay oficial en vivo, manda el derivado (sale del mismo
  // fetch que los chips). `profiles.indice` queda de último recurso, y para
  // cuando llega a usarse ya no hay fórmula que contradecir.
  const hero = oficialVivo ?? indiceDerivado ?? indiceOficial
  const notLinked = data?.ok === false && data?.linked === false
  const failed = data?.ok === false && !notLinked
  // La decisión vive en `src/lib/fedegolf/tarjetas.ts` (pura y testeada): si el
  // derivado no cuadra con el oficial del mismo instante, o con el conteo que la
  // fede declara, no mostramos la fórmula — el número oficial manda, no una
  // derivación rota con chips que no suman al hero.
  const formulaCuadra = formulaEsExplicable({
    indiceDerivado,
    oficialDelMismoInstante: oficialVivo,
    tarjetasUtilizadas,
    diferencialesQueCuentan: diffsCuentan.length,
  })
  // Las líneas del cálculo (suma → ÷N → truncado). Pura y testeada: si la suma
  // que mostraríamos no reproduce el promedio del servidor, devuelve [] y el
  // modal se queda con el número oficial sin explicación inventada.
  const filasCalculo = formulaCuadra
    ? filasDelCalculo({ diferencialesQueCuentan: diffsCuentan, promedioCrudo, indice: hero })
    : []
  const hayCampeonato = tarjetas.some((t) => t.valeDoble)

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fedegolf-indice-title"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(7,13,24,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        animation: 'fgIndiceOverlayIn 200ms ease-out both',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          borderTopLeftRadius: '20px',
          borderTopRightRadius: '20px',
          padding: '20px 16px calc(24px + env(safe-area-inset-bottom, 0px))',
          maxWidth: '520px',
          width: '100%',
          maxHeight: '88vh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          animation: 'fgIndiceSheetIn 280ms cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2
            id="fedegolf-indice-title"
            style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', fontWeight: 700, color: 'var(--text)', margin: 0 }}
          >
            Tu índice oficial, explicado
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-2)',
              padding: '6px',
              minWidth: '36px',
              minHeight: '36px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {loading && (
          <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '13px', padding: '48px 0' }}>
            Leyendo tus tarjetas oficiales…
          </p>
        )}

        {!loading && notLinked && (
          <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '13px', padding: '32px 0', lineHeight: 1.6 }}>
            Vincula tu cuenta FedeGolf para ver cómo se compone tu índice oficial.
          </p>
        )}

        {!loading && failed && (
          <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '13px', padding: '32px 0', lineHeight: 1.6 }}>
            No pudimos leer tus tarjetas oficiales ahora.<br />
            Intenta de nuevo en un momento.
          </p>
        )}

        {!loading && data?.ok && (
          <>
            {/* Hero: el número oficial, y debajo la aritmética que lleva a él.
                Los N diferenciales NO se repiten acá en chips: ya están abajo en
                la lista, marcados. Mostrarlos dos veces era decir lo mismo dos
                veces en una pantalla (DESIGN.md P6). */}
            <div style={{ textAlign: 'center', padding: '2px 0 0' }}>
              <p
                style={{
                  fontSize: '10px',
                  fontWeight: 500,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--text-3)',
                  fontFamily: '"DM Mono", monospace',
                  margin: '0 0 8px',
                }}
              >
                Índice Federación
              </p>
              <p
                style={{
                  fontSize: '56px',
                  fontWeight: 600,
                  color: 'var(--brand-on-bg)',
                  fontFamily: '"Playfair Display", serif',
                  lineHeight: 1,
                  margin: 0,
                }}
              >
                {hero != null ? hero.toFixed(1) : '—'}
              </p>
              <p style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.55, maxWidth: '290px', margin: '12px auto 0' }}>
                {formulaCuadra ? (
                  <>El promedio de tus <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{diffsCuentan.length} mejores diferenciales</strong> de la ventana oficial FedeGolf.</>
                ) : (
                  <>Tu índice oficial de la Federación Chilena de Golf.</>
                )}
              </p>

              {filasCalculo.length > 0 && (
                <>
                  <div style={{ borderTop: '1px solid var(--border-md)', marginTop: '16px', paddingTop: '12px', textAlign: 'left' }}>
                    {filasCalculo.map((f) => (
                      <div
                        key={f.etiqueta}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          gap: '12px',
                          fontSize: '12.5px',
                          color: 'var(--text-2)',
                          padding: '3.5px 0',
                        }}
                      >
                        <span>{f.etiqueta}</span>
                        <span style={{ fontFamily: '"DM Mono", monospace', fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
                          {f.valor}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: '10px 0 0', lineHeight: 1.5, textAlign: 'left' }}>
                    La Federación trunca, no redondea.
                  </p>
                </>
              )}
            </div>

            <div style={{ height: '22px' }} />

            {/* Lista de rondas físicas (cronológica; las que cuentan, marcadas) */}
            {tarjetas.length > 0 && (
              <BreakdownSeccion
                rotulo={`Tu ventana · ${data.slotsVentana ?? tarjetas.length} diferenciales`}
                nota={hayCampeonato ? 'Una ronda de campeonato aporta 2.' : undefined}
              />
            )}
            <BreakdownLista>
              {tarjetas.map((t) => (
                <BreakdownRow
                  key={t.ticket}
                  titulo={nombreCancha(t.clubCancha)}
                  meta={metaLinea(t)}
                  valor={t.diferencial.toFixed(1)}
                  cuenta={t.cuenta}
                  marca={
                    t.valeDoble ? (
                      <span
                        aria-label="Ronda de campeonato: cuenta doble"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          flexShrink: 0,
                          fontFamily: '"DM Mono", monospace',
                          fontSize: '10px',
                          color: 'var(--brand-on-bg)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Trophy size={11} strokeWidth={1.9} />
                        ×2
                      </span>
                    ) : undefined
                  }
                />
              ))}
            </BreakdownLista>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
