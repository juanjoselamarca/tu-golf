'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ArrowDownRight, ArrowUpRight, ArrowRight } from '@/components/icons'
import { formatOverUnder } from '@/golf/core/rules'
import type { RondaNormalizada } from '@/golf/stats/rondas-normalizadas'
import { ErrorState } from '@/components/ui/ErrorState'
import { useStatsDerived, type RangeKey } from '../hooks/useStatsDerived'
import { C, cardStyle } from './tokens'
import { ProGate } from '@/components/billing/ProGate'
import { UpsellCard } from '@/components/billing/UpsellCard'
import { UpsellCardSkeleton } from '@/components/billing/UpsellCardSkeleton'

/**
 * recharts lazy: el chart se baja en un chunk aparte DESPUÉS del primer
 * pintado (ssr:false — recharts necesita medidas del viewport).
 */
const ScoreVsParChart = dynamic(() => import('./StatsCharts').then((m) => m.ScoreVsParChart), { ssr: false })

interface Props {
  /** null = la lectura falló: estado de error con reintento, nunca "aún no tienes rondas". */
  rondas: RondaNormalizada[] | null
}

const RANGOS: { key: RangeKey; label: string }[] = [
  { key: '5', label: 'Últimas 5' },
  { key: '10', label: 'Últimas 10' },
  { key: '20', label: 'Últimas 20' },
  { key: 'all', label: 'Todas' },
]

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ── Piezas de layout (DESIGN.md §4 y §13: una familia, números tabulares en --text,
      oración en vez de mayúsculas, filas con divisor en vez de tarjetas) ── */

const divisor = `1px solid ${C.cardBorder}`

/** Fila dentro de una sección: título a la izquierda, contenido debajo, divisor arriba si no es la primera. */
function Fila({ primera, children }: { primera?: boolean; children: ReactNode }) {
  return <div style={{ paddingTop: primera ? 0 : 12, marginTop: primera ? 0 : 12, borderTop: primera ? 'none' : divisor }}>{children}</div>
}

function Seccion({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  return (
    <section style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
      <h2 style={{ color: C.ivory, fontSize: 18, fontWeight: 600, margin: nota ? '0 0 2px' : '0 0 12px' }}>{titulo}</h2>
      {nota && <p style={{ color: C.muted, fontSize: 13, margin: '0 0 12px' }}>{nota}</p>}
      {children}
    </section>
  )
}

function Cifra({ etiqueta, valor, detalle }: { etiqueta: string; valor: ReactNode; detalle?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ color: C.muted, fontSize: 13, fontWeight: 500, margin: '0 0 4px' }}>{etiqueta}</p>
      <p className="num" style={{ color: C.ivory, fontSize: 24, fontWeight: 600, lineHeight: 1.1, margin: 0 }}>{valor}</p>
      {detalle && <p style={{ color: C.muted, fontSize: 13, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detalle}</p>}
    </div>
  )
}

export function StatsView({ rondas: rondasOError }: Props) {
  const router = useRouter()
  const [range, setRange] = useState<RangeKey>('all')
  const allRounds = rondasOError ?? []
  const {
    hasRounds, cifras, fueraDePromedios, scoringCounts, scoringTotal, serie, nineHoleData, topRounds, trendData,
  } = useStatsDerived(allRounds, range)

  const mejor = cifras?.mejorRonda ?? null
  const volver = (
    <Link href="/perfil" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, color: C.muted, fontSize: 14, textDecoration: 'none' }}>
      ← Perfil
    </Link>
  )

  if (rondasOError === null) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', padding: '16px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          {volver}
          <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ErrorState message="No pudimos cargar tus estadísticas. Revisa tu conexión." onRetry={() => router.refresh()} />
          </div>
        </div>
      </div>
    )
  }

  const resumenGrafico = serie.length > 0 && cifras
    ? `Score vs par de ${serie.length} ronda${serie.length !== 1 ? 's' : ''} de ${cifras.bucket} hoyos: mejor ${formatOverUnder(Math.min(...serie.map(p => p.vsPar)))}, peor ${formatOverUnder(Math.max(...serie.map(p => p.vsPar)))}.`
    : ''

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: '16px', paddingBottom: 'calc(140px + env(safe-area-inset-bottom, 0px))' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        {volver}
        <h1 style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif', color: C.ivory, fontSize: 28, fontWeight: 600, margin: '4px 0 4px' }}>
          Mis estadísticas
        </h1>
        <p className="num" style={{ color: C.muted, fontSize: 14, margin: '0 0 16px' }}>
          {allRounds.length} ronda{allRounds.length !== 1 ? 's' : ''} registrada{allRounds.length !== 1 ? 's' : ''}
        </p>

        {/* ── Sin rondas ── */}
        {allRounds.length === 0 && (
          <section style={{ ...cardStyle, padding: '32px 16px', marginBottom: 16, textAlign: 'center' }}>
            <p style={{ color: C.ivory, fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>Aún no tienes rondas registradas</p>
            <p style={{ color: C.muted, fontSize: 14, margin: '0 auto 20px', maxWidth: 340, lineHeight: 1.5 }}>
              Juega o importa tus rondas y aquí verás tu score vs par, birdies y tendencia.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/ronda-libre/nueva" style={{
                display: 'inline-flex', alignItems: 'center', minHeight: 44, background: 'var(--brand)', color: 'var(--brand-dark)',
                fontWeight: 600, fontSize: 16, padding: '0 20px', borderRadius: 12, textDecoration: 'none',
              }}>
                Nueva ronda
              </Link>
              <Link href="/perfil/historial" style={{
                display: 'inline-flex', alignItems: 'center', minHeight: 44, color: 'var(--brand-on-bg)',
                fontWeight: 600, fontSize: 16, padding: '0 16px', textDecoration: 'none',
              }}>
                Importar historial
              </Link>
            </div>
          </section>
        )}

        {fueraDePromedios > 0 && (
          <p style={{ color: C.muted, fontSize: 14, margin: '-8px 0 16px', lineHeight: 1.5 }}>
            {fueraDePromedios === 1 ? '1 no entra' : `${fueraDePromedios} no entran`} a los promedios: de equipo, match play, incompletas o con un error de carga.
          </p>
        )}

        {allRounds.length > 0 && (
          <>
            {/* ── Rango: un control segmentado, una fila ── */}
            <div role="group" aria-label="Rondas a considerar" style={{
              display: 'flex', marginBottom: 16, border: divisor, borderRadius: 12, overflow: 'hidden',
            }}>
              {RANGOS.map((r, i) => {
                const activo = range === r.key
                return (
                  <button
                    key={r.key}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => setRange(r.key)}
                    style={{
                      flex: 1, minHeight: 44, border: 'none', borderLeft: i === 0 ? 'none' : divisor,
                      background: activo ? 'var(--surface-soft)' : 'transparent',
                      color: activo ? C.ivory : C.muted, fontSize: 13, fontWeight: activo ? 600 : 500, cursor: 'pointer', padding: '0 4px',
                    }}
                  >
                    {r.label}
                  </button>
                )
              })}
            </div>

            {/* ── Héroe + tres cifras ── */}
            <section style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
              <p style={{ color: C.muted, fontSize: 13, fontWeight: 500, margin: '0 0 4px' }}>
                Promedio vs par{cifras ? ` · ${cifras.bucket} hoyos · ${cifras.rondasEnPromedio} ronda${cifras.rondasEnPromedio !== 1 ? 's' : ''}` : ''}
              </p>
              <p className="num" style={{ color: C.ivory, fontSize: 40, fontWeight: 700, lineHeight: 1, margin: 0 }}>
                {cifras?.promedioVsPar != null ? formatOverUnder(cifras.promedioVsPar) : '—'}
              </p>
              <div style={{ display: 'flex', gap: 12, marginTop: 16, paddingTop: 16, borderTop: divisor }}>
                <Cifra
                  etiqueta="Mejor ronda"
                  valor={mejor ? <>{mejor.score} <span style={{ fontSize: 16, fontWeight: 500, color: C.muted }}>{formatOverUnder(mejor.vsPar)}</span></> : '—'}
                  detalle={mejor ? mejor.course : undefined}
                />
                <Cifra etiqueta="Birdies" valor={hasRounds ? scoringCounts.birdies : '—'} />
                <Cifra etiqueta="Eagles" valor={hasRounds ? scoringCounts.eagles : '—'} />
              </div>
            </section>

            {/* ── Un solo gráfico ── */}
            <Seccion titulo="Tu score vs par" nota={cifras ? `Rondas de ${cifras.bucket} hoyos` : undefined}>
              {serie.length > 0 ? (
                <div role="img" aria-label={resumenGrafico} style={{ height: 200 }}>
                  <ScoreVsParChart puntos={serie} />
                </div>
              ) : (
                <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>Todavía no hay rondas que cuenten para este gráfico.</p>
              )}
            </Seccion>
          </>
        )}

        {allRounds.length > 0 && (
          <ProGate
            feature="history-full"
            loadingFallback={<div style={{ marginBottom: 16 }}><UpsellCardSkeleton /></div>}
            fallback={
              <div style={{ marginBottom: 16 }}>
                <UpsellCard
                  feature="history-full"
                  title="Estadísticas avanzadas"
                  description="Tendencia, distribución por hoyo, ida vs vuelta y tus mejores rondas"
                />
              </div>
            }
          >
            {/* ── Cómo vienes: tendencia e ida/vuelta como filas de una sección (DESIGN.md §13) ── */}
            {(trendData || nineHoleData) && (
              <Seccion titulo="Cómo vienes">
                {trendData && (
                  <Fila primera>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span aria-hidden="true" style={{ color: C.ivory, display: 'flex' }}>
                        {trendData.improving ? <ArrowDownRight size={24} strokeWidth={1.75} /> : trendData.declining ? <ArrowUpRight size={24} strokeWidth={1.75} /> : <ArrowRight size={24} strokeWidth={1.75} />}
                      </span>
                      <div style={{ flex: 1 }}>
                        <p style={{ color: C.ivory, fontSize: 16, fontWeight: 600, margin: 0 }}>
                          {trendData.improving ? 'Mejorando' : trendData.declining ? 'Empeorando' : 'Estable'}{' '}
                          <span className="num" style={{ color: C.muted, fontWeight: 500 }}>
                            ({parseFloat(trendData.diff) > 0 ? '+' : ''}{trendData.diff} golpes)
                          </span>
                        </p>
                        <p className="num" style={{ color: C.muted, fontSize: 14, margin: '2px 0 0' }}>
                          Últimas 5: {trendData.avgLast} · anteriores {trendData.prevCount}: {trendData.avgPrev}
                        </p>
                      </div>
                    </div>
                  </Fila>
                )}
                {nineHoleData && (
                  <Fila primera={!trendData}>
                    <p style={{ color: C.muted, fontSize: 13, fontWeight: 500, margin: '0 0 8px' }}>
                      Ida vs vuelta · promedio en {nineHoleData.count} rondas de 18
                    </p>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <Cifra etiqueta="Ida (1–9)" valor={nineHoleData.front} />
                      <Cifra etiqueta="Vuelta (10–18)" valor={nineHoleData.back} />
                    </div>
                  </Fila>
                )}
              </Seccion>
            )}

            {/* ── Distribución: barras neutras; el resultado lo dice la etiqueta ── */}
            {hasRounds && scoringTotal > 0 && (
              <Seccion titulo="Resultado por hoyo">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Eagle o mejor', count: scoringCounts.eagles },
                    { label: 'Birdie', count: scoringCounts.birdies },
                    { label: 'Par', count: scoringCounts.pars },
                    { label: 'Bogey', count: scoringCounts.bogeys },
                    { label: 'Doble o peor', count: scoringCounts.doubles },
                  ].map(({ label, count }) => {
                    const pct = count / scoringTotal * 100
                    return (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ color: C.ivory, fontSize: 14, width: 104, flexShrink: 0 }}>{label}</span>
                        <div style={{ flex: 1, height: 8, background: 'var(--surface-soft)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%`, height: '100%', background: C.muted, borderRadius: 4 }} />
                        </div>
                        <span className="num" style={{ color: C.ivory, fontSize: 14, fontWeight: 600, width: 40, textAlign: 'right', flexShrink: 0 }}>{count}</span>
                        <span className="num" style={{ color: C.muted, fontSize: 13, width: 36, textAlign: 'right', flexShrink: 0 }}>{pct.toFixed(0)}%</span>
                      </div>
                    )
                  })}
                </div>
              </Seccion>
            )}

            {/* ── Mejores 5 ── */}
            <Seccion titulo={cifras ? `Tus mejores rondas · ${cifras.bucket} hoyos` : 'Tus mejores rondas'}>
              {topRounds.length > 0 ? (
                <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {topRounds.map((r, i) => (
                    <li key={r.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12, minHeight: 56,
                      borderTop: i === 0 ? 'none' : divisor,
                    }}>
                      <span className="num" style={{ color: C.muted, fontSize: 14, width: 16 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: C.ivory, fontSize: 16, fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.course_name}
                        </p>
                        <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>{fmtDate(r.played_at)}</p>
                      </div>
                      <span className="num" style={{ color: C.ivory, fontSize: 18, fontWeight: 600 }}>{r.total_gross}</span>
                      <span className="num" style={{ color: C.muted, fontSize: 14, width: 36, textAlign: 'right' }}>
                        {r.vsPar != null ? formatOverUnder(r.vsPar) : ''}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>Todavía no hay rondas completas para armar tu ranking.</p>
              )}
            </Seccion>
          </ProGate>
        )}
      </div>
    </div>
  )
}
