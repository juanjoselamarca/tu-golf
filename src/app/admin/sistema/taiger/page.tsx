'use client'

/**
 * Cerebro de tAIger+ — vista del AGENTE.
 *
 * Auditoria de fallas y aciertos del coach: alucinaciones, tool usage,
 * cuándo evita comprometerse con un plan, métricas que no puede computar.
 * Interactivo: window selector, sparklines, drill-down panel, auto-refresh,
 * review supervisado de flagged events (D6).
 *
 * Spec: solicitud Juanjo 2026-05-05.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { adminColors, adminFonts, adminCard } from '@/components/admin/admin-tokens'

type Window = '24h' | '7d' | '30d' | '90d'

interface AgentHealth {
  window: Window
  window_hours: number
  bucket_size_hours: number
  generated_at: string
  timeseries: Array<{ label: string; hallu: number; tools: number; saveplan: number; shadowDetected: number }>
  totals: {
    events_in_window: number
    total_responses: number
    responses_with_tool_call: number
    response_with_tool_rate: number
    avg_tool_calls_per_response: number
  }
  hallucination: {
    total_checks: number
    flagged: number
    flagged_rate: number
    flagged_by_kind: Record<string, number>
    recent_flagged: RecentFlagged[]
    reviews: {
      total_reviewed: number
      false_positive: number
      real: number
      false_positive_rate: number | null
    }
  }
  tool_usage: {
    total_calls: number
    by_tool: Array<{
      tool_name: string
      ok: number
      fail: number
      total: number
      fail_rate: number
      avg_ms: number
    }>
  }
  plan_engagement: {
    save_plan_calls: number
    planes_superseded: number
    planes_resolved: number
    shadow_detections: number
    shadow_total_runs: number
    sessions_with_shadow: number
    sessions_with_save_plan: number
    divergent_sessions: number
    divergence_rate: number
  }
  metric_gaps: {
    unknown_outcomes: number
    total_outcomes: number
    unknown_rate: number
    unknown_by_metric: Record<string, number>
  }
}

interface RecentFlagged {
  id: number
  user_id: string
  created_at: string
  related_session_id: string | null
  warnings: Array<{ kind: string; evidence: string; context_snippet: string }>
  total_numbers_checked: number
  total_courses_checked: number
  response_length: number
  tool_calls_in_session: number
  review: 'false_positive' | 'real' | null
}

interface EventDetail {
  event: {
    id: number
    user_id: string
    type: string
    payload: Record<string, unknown>
    related_session_id: string | null
    created_at: string
  }
  session: {
    id: string | null
    message_count: number
    last_user_message: string | null
    last_assistant_message: string | null
  }
  nearby_tool_calls: Array<{ id: number; tool_name: string; ok: boolean; ms: number; created_at: string }>
  reviews: Array<{ id: number; verdict: string; notes: string | null; reviewed_at: string }>
}

const WINDOW_LABELS: Record<Window, string> = { '24h': '24 horas', '7d': '7 días', '30d': '30 días', '90d': '90 días' }

export default function CerebroAgentePage() {
  const [winSel, setWinSel] = useState<Window>('30d')
  const [data, setData] = useState<AgentHealth | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [drillEvent, setDrillEvent] = useState<EventDetail | null>(null)
  const [drillLoading, setDrillLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unreviewed' | 'unknown_number' | 'unknown_course'>('all')
  const fetchKey = useRef(0)

  function reloadData() {
    const k = ++fetchKey.current
    fetch(`/api/admin/taiger/agent-health?window=${winSel}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(d => { if (k === fetchKey.current) setData(d) })
      .catch(e => { if (k === fetchKey.current) setError(String(e)) })
  }

  useEffect(reloadData, [winSel])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(reloadData, 10000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, winSel])

  function openDrill(eventId: number) {
    setDrillLoading(true)
    setDrillEvent(null)
    fetch(`/api/admin/taiger/agent-health/event/${eventId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(d => setDrillEvent(d))
      .catch(e => setError(String(e)))
      .finally(() => setDrillLoading(false))
  }

  async function submitReview(eventId: number, verdict: 'false_positive' | 'real') {
    const r = await fetch('/api/admin/taiger/agent-health/review', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, verdict }),
    })
    if (!r.ok) {
      setError(`Review fallido: HTTP ${r.status}`)
      return
    }
    reloadData()
    if (drillEvent?.event.id === eventId) openDrill(eventId)
  }

  const filteredFlagged = useMemo(() => {
    if (!data) return []
    let out = data.hallucination.recent_flagged
    if (filter === 'unreviewed') out = out.filter(f => !f.review)
    if (filter === 'unknown_number') out = out.filter(f => f.warnings.some(w => w.kind === 'unknown_number'))
    if (filter === 'unknown_course') out = out.filter(f => f.warnings.some(w => w.kind === 'unknown_course'))
    return out
  }, [data, filter])

  if (error && !data) return <div style={pageStyle}>Error: {error}</div>
  if (!data) return <div style={pageStyle}>Cargando…</div>

  const pct = (x: number) => `${Math.round(x * 100)}%`
  const halluSparks = data.timeseries.map(b => b.hallu)
  const toolSparks = data.timeseries.map(b => b.tools)
  const planSparks = data.timeseries.map(b => b.saveplan)
  const respSparks = data.timeseries.map(b => b.tools + b.hallu)

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ ...adminFonts.sectionTitle, fontSize: '1.5rem', margin: 0 }}>
          Cerebro de tAIger+ — Auditoría del agente
        </h1>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['24h', '7d', '30d', '90d'] as const).map(w => (
            <button key={w} onClick={() => setWinSel(w)} style={winBtn(winSel === w)}>{WINDOW_LABELS[w]}</button>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12, fontSize: 12, color: adminColors.gray, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            Auto-refresh 10s
          </label>
          <button onClick={reloadData} style={refreshBtn}>↻</button>
        </div>
      </div>
      <div style={{ color: adminColors.gray, fontSize: 12, marginBottom: 20 }}>
        Generado {new Date(data.generated_at).toLocaleString('es-CL')} · Bucket {data.bucket_size_hours <= 1 ? '1 hora' : `${data.bucket_size_hours} hrs`}
      </div>

      {/* KPI grid con sparklines */}
      <div style={kpiGrid}>
        <KpiSpark label="Respuestas" value={data.totals.total_responses} series={respSparks} />
        <Kpi label="% con tool" value={pct(data.totals.response_with_tool_rate)} />
        <Kpi label="Tool calls/resp" value={data.totals.avg_tool_calls_per_response.toFixed(2)} />
        <KpiSpark
          label="Alucinaciones flagged"
          value={`${data.hallucination.flagged} (${pct(data.hallucination.flagged_rate)})`}
          accent={data.hallucination.flagged_rate > 0.05 ? 'red' : 'gold'}
          series={halluSparks}
        />
        <KpiSpark label="Save_plan" value={data.plan_engagement.save_plan_calls} accent="green" series={planSparks} />
        <Kpi
          label="Sesiones divergentes"
          value={`${data.plan_engagement.divergent_sessions} (${pct(data.plan_engagement.divergence_rate)})`}
          accent="yellow"
        />
        <KpiSpark label="Tool calls" value={data.tool_usage.total_calls} accent="gray" series={toolSparks} />
        <Kpi
          label="FP rate validador"
          value={data.hallucination.reviews.false_positive_rate != null
            ? pct(data.hallucination.reviews.false_positive_rate)
            : `— (${data.hallucination.reviews.total_reviewed} rev)`}
          accent={data.hallucination.reviews.false_positive_rate != null && data.hallucination.reviews.false_positive_rate < 0.05 ? 'green' : 'gray'}
        />
      </div>

      {/* Hallucinations */}
      <Section title="Alucinaciones detectadas (modo shadow)">
        <Sub>Cada flagged se revisa manualmente. Cuando false_positive_rate &lt; 5%, el validador se promueve a enforcement (degrada respuestas que mencionan datos no verificables).</Sub>

        <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
          <Stat label="Checks" value={data.hallucination.total_checks} />
          <Stat label="Flagged" value={data.hallucination.flagged} />
          <Stat label="Tasa flagged" value={pct(data.hallucination.flagged_rate)} />
          <Stat label="Revisados" value={data.hallucination.reviews.total_reviewed} />
          <Stat label="FP" value={data.hallucination.reviews.false_positive} />
          <Stat label="Real" value={data.hallucination.reviews.real} />
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
          {Object.entries(data.hallucination.flagged_by_kind).map(([kind, count]) => (
            <div key={kind} style={chipStyle}>{kind}: <strong style={{ color: adminColors.ivory }}>{count}</strong></div>
          ))}
          {Object.keys(data.hallucination.flagged_by_kind).length === 0 && (
            <div style={{ color: adminColors.gray, fontSize: 13, fontStyle: 'italic' }}>Sin flags por tipo todavía</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
          {(['all', 'unreviewed', 'unknown_number', 'unknown_course'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={filterBtn(filter === f)}>{f}</button>
          ))}
        </div>

        <h3 style={{ ...adminFonts.label, marginTop: 16, marginBottom: 8 }}>{filteredFlagged.length} flagged en vista — clic para drill-down</h3>
        {filteredFlagged.length === 0 ? <Empty>Sin alucinaciones que coincidan con el filtro</Empty> : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {filteredFlagged.map(f => (
              <li key={f.id} style={{
                padding: '10px 12px', borderBottom: `1px solid ${adminColors.border}`, fontSize: 13,
                cursor: 'pointer', background: drillEvent?.event.id === f.id ? adminColors.cardHover : 'transparent',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
              }} onClick={() => openDrill(f.id)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong>{new Date(f.created_at).toLocaleString('es-CL')}</strong>
                    <KindChips warnings={f.warnings} />
                    {f.review && <ReviewChip verdict={f.review} />}
                  </div>
                  <div style={{ color: adminColors.gray, fontSize: 12, marginTop: 4 }}>
                    {f.warnings.length} warning{f.warnings.length === 1 ? '' : 's'} · {f.response_length} chars · {f.tool_calls_in_session} tool calls
                  </div>
                </div>
                <Link href={`/admin/sistema/taiger/${f.user_id}`} style={navLink} onClick={e => e.stopPropagation()}>user →</Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Tool usage bar chart */}
      <Section title={`Tool usage (${data.tool_usage.total_calls} llamadas)`}>
        <Sub>Si el coach habla de datos sin tool call, sospecha alucinación. Si una tool falla mucho, hay bug.</Sub>
        {data.tool_usage.by_tool.length === 0 ? <Empty>Sin tool calls registradas</Empty> : (
          <ToolBarChart tools={data.tool_usage.by_tool} />
        )}
      </Section>

      {/* Plan engagement */}
      <Section title="Compromiso de planes (save_plan vs shadow extractor)">
        <Sub>Sesiones divergentes = el shadow detectó lenguaje de plan pero save_plan NO se llamó. El coach habló de plan en prosa sin comprometerse — eso debe bajar con el tiempo.</Sub>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginTop: 12 }}>
          <Stat label="save_plan" value={data.plan_engagement.save_plan_calls} />
          <Stat label="superseded" value={data.plan_engagement.planes_superseded} />
          <Stat label="resolved" value={data.plan_engagement.planes_resolved} />
          <Stat label="shadow runs" value={data.plan_engagement.shadow_total_runs} />
          <Stat label="shadow detected" value={data.plan_engagement.shadow_detections} />
          <Stat label="ses. save_plan" value={data.plan_engagement.sessions_with_save_plan} />
          <Stat label="ses. shadow only" value={Math.max(0, data.plan_engagement.sessions_with_shadow - data.plan_engagement.sessions_with_save_plan)} />
          <Stat label="divergencia" value={pct(data.plan_engagement.divergence_rate)} />
        </div>
      </Section>

      {/* Metric gaps */}
      <Section title="Métricas que el cerebro no puede computar">
        <Sub>compliance=&apos;unknown&apos;: el plan tenía métrica que requiere datos no rastreados (ej. putts por hoyo). Idealmente baja a 0%.</Sub>
        <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
          <Stat label="Outcomes unknown" value={data.metric_gaps.unknown_outcomes} />
          <Stat label="Total outcomes" value={data.metric_gaps.total_outcomes} />
          <Stat label="Tasa unknown" value={pct(data.metric_gaps.unknown_rate)} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          {Object.entries(data.metric_gaps.unknown_by_metric).map(([metric, count]) => (
            <div key={metric} style={chipStyle}>
              <code style={{ color: adminColors.gold }}>{metric}</code>: <strong style={{ color: adminColors.ivory }}>{count}</strong>
            </div>
          ))}
          {Object.keys(data.metric_gaps.unknown_by_metric).length === 0 && (
            <div style={{ color: adminColors.gray, fontSize: 13, fontStyle: 'italic' }}>Sin gaps detectados</div>
          )}
        </div>
      </Section>

      <div style={{ display: 'flex', gap: 12, marginTop: 24, fontSize: 13, flexWrap: 'wrap' }}>
        <Link href="/admin/sistema/taiger/dashboard" style={navLink}>→ Efectividad de planes</Link>
        <Link href="/admin/sistema/taiger/playground" style={navLink}>→ Playground sandbox</Link>
      </div>

      {/* Drill panel */}
      {(drillEvent || drillLoading) && (
        <DrillPanel
          loading={drillLoading}
          detail={drillEvent}
          onClose={() => { setDrillEvent(null); setDrillLoading(false) }}
          onReview={submitReview}
        />
      )}
    </div>
  )
}

// ---------- Drill panel ----------

function DrillPanel({ loading, detail, onClose, onReview }: {
  loading: boolean
  detail: EventDetail | null
  onClose: () => void
  onReview: (eventId: number, verdict: 'false_positive' | 'real') => void
}) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ ...adminFonts.sectionTitle, margin: 0 }}>Drill-down evento</h2>
          <button onClick={onClose} style={closeBtn}>×</button>
        </div>

        {loading && <div style={{ color: adminColors.gray }}>Cargando…</div>}
        {!loading && detail && (
          <>
            <div style={{ marginBottom: 16, fontSize: 12, color: adminColors.gray }}>
              {new Date(detail.event.created_at).toLocaleString('es-CL')} · userId{' '}
              <Link href={`/admin/sistema/taiger/${detail.event.user_id}`} style={navLink}>{detail.event.user_id.slice(0, 8)}…</Link>
              {' '}· session {detail.event.related_session_id?.slice(0, 8) ?? '—'}…
            </div>

            <h3 style={{ ...adminFonts.label, marginBottom: 6 }}>Mensaje del jugador</h3>
            <div style={msgUserStyle}>{detail.session.last_user_message ?? '—'}</div>

            <h3 style={{ ...adminFonts.label, marginBottom: 6, marginTop: 16 }}>Respuesta del coach</h3>
            <div style={msgAssistantStyle}>
              {detail.session.last_assistant_message
                ? <HighlightedResponse text={detail.session.last_assistant_message} warnings={(detail.event.payload?.warnings as Array<{ evidence: string }>) ?? []} />
                : <span style={{ color: adminColors.gray, fontStyle: 'italic' }}>—</span>}
            </div>

            <h3 style={{ ...adminFonts.label, marginBottom: 6, marginTop: 16 }}>Warnings detectados</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {((detail.event.payload?.warnings as Array<{ kind: string; evidence: string; context_snippet: string }>) ?? []).map((w, i) => (
                <li key={i} style={{ padding: 8, border: `1px solid ${adminColors.border}`, borderRadius: 6, marginBottom: 6, fontSize: 13 }}>
                  <div><strong style={{ color: adminColors.red }}>{w.kind}</strong> · evidence: <code>{w.evidence}</code></div>
                  <div style={{ color: adminColors.gray, fontSize: 12, marginTop: 4 }}>contexto: <em>&quot;{w.context_snippet}&quot;</em></div>
                </li>
              ))}
            </ul>

            <h3 style={{ ...adminFonts.label, marginBottom: 6, marginTop: 16 }}>Tool calls cercanos (±5 min)</h3>
            {detail.nearby_tool_calls.length === 0 ? (
              <div style={{ color: adminColors.gray, fontSize: 13, fontStyle: 'italic' }}>Ninguno — el coach respondió sin llamar tools</div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {detail.nearby_tool_calls.map(t => (
                  <li key={t.id} style={{ padding: '4px 0', fontSize: 12, color: adminColors.ivory }}>
                    <span style={{ color: t.ok ? adminColors.green : adminColors.red }}>●</span>{' '}
                    <code style={{ color: adminColors.gold }}>{t.tool_name}</code>{' '}
                    <span style={{ color: adminColors.gray }}>· {t.ms}ms · {new Date(t.created_at).toLocaleTimeString('es-CL')}</span>
                  </li>
                ))}
              </ul>
            )}

            <h3 style={{ ...adminFonts.label, marginBottom: 6, marginTop: 20 }}>Tu veredicto</h3>
            {detail.reviews.length > 0 && (
              <div style={{ background: adminColors.cardHover, padding: 8, borderRadius: 4, marginBottom: 8, fontSize: 12 }}>
                Último review: <strong>{detail.reviews[0].verdict}</strong> · {new Date(detail.reviews[0].reviewed_at).toLocaleString('es-CL')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onReview(detail.event.id, 'false_positive')} style={verdictBtn('fp')}>
                Falso positivo
              </button>
              <button onClick={() => onReview(detail.event.id, 'real')} style={verdictBtn('real')}>
                Alucinación real
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function HighlightedResponse({ text, warnings }: { text: string; warnings: Array<{ evidence: string }> }) {
  if (warnings.length === 0) return <>{text}</>
  let html = escapeHtml(text)
  for (const w of warnings) {
    if (!w.evidence) continue
    const re = new RegExp(`(${escapeRegex(w.evidence)})`, 'gi')
    html = html.replace(re, `<mark style="background:${adminColors.redDim};color:${adminColors.red};padding:1px 4px;border-radius:3px">$1</mark>`)
  }
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

function escapeHtml(s: string) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!)) }
function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

// ---------- KPIs + sparklines ----------

function Kpi({ label, value, accent = 'gold' }: { label: string; value: string | number; accent?: 'gold' | 'green' | 'yellow' | 'red' | 'gray' }) {
  const accentColor = accent === 'green' ? adminColors.green : accent === 'yellow' ? adminColors.yellow : accent === 'red' ? adminColors.red : accent === 'gray' ? adminColors.gray : adminColors.gold
  return (
    <div style={{ ...adminCard, padding: 14 }}>
      <div style={{ color: adminColors.gray, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, color: accentColor, fontFamily: "'Playfair Display', serif", fontWeight: 700, lineHeight: 1.1 }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  )
}

function KpiSpark({ label, value, series, accent = 'gold' }: { label: string; value: string | number; series: number[]; accent?: 'gold' | 'green' | 'yellow' | 'red' | 'gray' }) {
  const accentColor = accent === 'green' ? adminColors.green : accent === 'yellow' ? adminColors.yellow : accent === 'red' ? adminColors.red : accent === 'gray' ? adminColors.gray : adminColors.gold
  return (
    <div style={{ ...adminCard, padding: 14 }}>
      <div style={{ color: adminColors.gray, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, color: accentColor, fontFamily: "'Playfair Display', serif", fontWeight: 700, lineHeight: 1.1 }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <Sparkline data={series} color={accentColor} />
    </div>
  )
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 120, h = 28
  if (data.length < 2) return <svg width={w} height={h} style={{ marginTop: 4 }}><line x1={0} y1={h - 1} x2={w} y2={h - 1} stroke={adminColors.border} /></svg>
  const max = Math.max(1, ...data)
  const step = w / (data.length - 1)
  const pts = data.map((v, i) => `${i * step},${h - (v / max) * (h - 2) - 1}`).join(' ')
  const areaPts = `0,${h} ${pts} ${w},${h}`
  return (
    <svg width={w} height={h} style={{ marginTop: 4, display: 'block' }}>
      <polygon points={areaPts} fill={color} fillOpacity={0.15} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  )
}

// ---------- Tool bar chart ----------

function ToolBarChart({ tools }: { tools: Array<{ tool_name: string; ok: number; fail: number; total: number; fail_rate: number; avg_ms: number }> }) {
  const max = Math.max(1, ...tools.map(t => t.total))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
      {tools.map(t => (
        <div key={t.tool_name} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 110px', gap: 12, alignItems: 'center', fontSize: 12 }}>
          <code style={{ color: adminColors.gold }}>{t.tool_name}</code>
          <div style={{ position: 'relative', height: 18, background: adminColors.cardHover, borderRadius: 3 }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${(t.ok / max) * 100}%`,
              background: adminColors.green, borderRadius: '3px 0 0 3px',
            }} />
            {t.fail > 0 && (
              <div style={{
                position: 'absolute', left: `${(t.ok / max) * 100}%`, top: 0, bottom: 0,
                width: `${(t.fail / max) * 100}%`,
                background: adminColors.red,
              }} />
            )}
            <div style={{ position: 'absolute', right: 6, top: 1, fontSize: 11, color: adminColors.ivory, lineHeight: '16px' }}>
              {t.total} {t.fail > 0 ? `(${t.fail} fail)` : ''}
            </div>
          </div>
          <span style={{ color: adminColors.gray, fontSize: 11, textAlign: 'right' }}>{t.avg_ms}ms avg</span>
        </div>
      ))}
    </div>
  )
}

// ---------- Misc UI helpers ----------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ ...adminCard, marginBottom: 20, padding: 20 }}>
      <h2 style={{ ...adminFonts.sectionTitle, fontSize: '1rem', marginBottom: 8 }}>{title}</h2>
      {children}
    </section>
  )
}

function Sub({ children }: { children: React.ReactNode }) {
  return <div style={{ color: adminColors.gray, fontSize: 12, lineHeight: 1.5 }}>{children}</div>
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ minWidth: 100 }}>
      <div style={{ color: adminColors.gray, fontSize: 11, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, color: adminColors.ivory, fontWeight: 600, fontFamily: "'Playfair Display', serif" }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ color: adminColors.gray, fontSize: 13, fontStyle: 'italic', padding: 12 }}>{children}</div>
}

function KindChips({ warnings }: { warnings: Array<{ kind: string }> }) {
  const kinds = Array.from(new Set(warnings.map(w => w.kind)))
  return (
    <>
      {kinds.map(k => (
        <span key={k} style={{ ...kindChipStyle, color: k === 'unknown_number' ? adminColors.yellow : adminColors.red }}>{k}</span>
      ))}
    </>
  )
}

function ReviewChip({ verdict }: { verdict: 'false_positive' | 'real' }) {
  const isFP = verdict === 'false_positive'
  return <span style={{
    fontSize: 10, padding: '2px 6px', borderRadius: 3,
    background: isFP ? adminColors.greenDim : adminColors.redDim,
    color: isFP ? adminColors.green : adminColors.red,
    textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600,
  }}>{isFP ? 'FP' : 'real'}</span>
}

// ---------- Styles ----------

const pageStyle: React.CSSProperties = {
  padding: 24,
  background: adminColors.bg,
  color: adminColors.ivory,
  minHeight: '100vh',
  maxWidth: 1080,
  margin: '0 auto',
}

const kpiGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: 12,
  marginBottom: 20,
}

const navLink: React.CSSProperties = { color: adminColors.gold, textDecoration: 'none' }

const chipStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: `1px solid ${adminColors.border}`,
  borderRadius: 6,
  fontSize: 12,
  color: adminColors.gray,
}

const kindChipStyle: React.CSSProperties = {
  fontSize: 10, padding: '2px 6px', borderRadius: 3,
  background: adminColors.cardHover, textTransform: 'uppercase' as const,
  letterSpacing: '0.05em', fontWeight: 600,
}

function winBtn(active: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    fontSize: 12,
    border: `1px solid ${active ? adminColors.gold : adminColors.border}`,
    background: active ? adminColors.goldDim : 'transparent',
    color: active ? adminColors.gold : adminColors.gray,
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
  }
}

function filterBtn(active: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    fontSize: 11,
    border: `1px solid ${active ? adminColors.gold : adminColors.border}`,
    background: active ? adminColors.goldDim : 'transparent',
    color: active ? adminColors.gold : adminColors.gray,
    borderRadius: 3,
    cursor: 'pointer',
    fontFamily: 'monospace',
  }
}

const refreshBtn: React.CSSProperties = {
  padding: '6px 10px', fontSize: 12, border: `1px solid ${adminColors.border}`,
  background: 'transparent', color: adminColors.gray, borderRadius: 4, cursor: 'pointer',
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', justifyContent: 'flex-end', zIndex: 100,
}
const panelStyle: React.CSSProperties = {
  width: '100%', maxWidth: 560, height: '100%', overflow: 'auto',
  background: adminColors.bgDeep, borderLeft: `1px solid ${adminColors.border}`,
  padding: 24, color: adminColors.ivory,
}
const closeBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', fontSize: 28,
  color: adminColors.gray, cursor: 'pointer', lineHeight: 1, padding: 0,
}

const msgUserStyle: React.CSSProperties = {
  background: adminColors.cardHover, padding: 12, borderRadius: 6,
  fontSize: 13, whiteSpace: 'pre-wrap', color: adminColors.ivory,
}
const msgAssistantStyle: React.CSSProperties = {
  background: adminColors.card, padding: 12, borderRadius: 6,
  fontSize: 13, whiteSpace: 'pre-wrap', color: adminColors.ivory,
  border: `1px solid ${adminColors.border}`,
}

function verdictBtn(kind: 'fp' | 'real'): React.CSSProperties {
  const color = kind === 'fp' ? adminColors.green : adminColors.red
  const bg = kind === 'fp' ? adminColors.greenDim : adminColors.redDim
  return {
    flex: 1, padding: '10px 14px', fontSize: 13, fontWeight: 600,
    border: `1px solid ${color}`, background: bg, color, borderRadius: 6,
    cursor: 'pointer',
  }
}
