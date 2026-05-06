'use client'

/**
 * Cerebro de tAIger+ — vista del AGENTE (no por usuario).
 *
 * Auditoría de fallas y aciertos del coach: alucinaciones, tool usage,
 * cuándo evita comprometerse con un plan, métricas que no puede computar.
 *
 * Spec: solicitud Juanjo 2026-05-05.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adminColors, adminFonts, adminCard } from '@/components/admin/admin-tokens'

interface AgentHealth {
  window_days: number
  generated_at: string
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
    recent_flagged: Array<{
      id: number
      user_id: string
      created_at: string
      related_session_id: string | null
      warnings: Array<{ kind: string; evidence: string; context_snippet: string }>
      total_numbers_checked: number
      total_courses_checked: number
      response_length: number
      tool_calls_in_session: number
    }>
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

export default function CerebroAgentePage() {
  const [data, setData] = useState<AgentHealth | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/admin/taiger/agent-health', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setData)
      .catch(e => setError(String(e)))
  }, [])

  if (error) return <div style={pageStyle}>Error: {error}</div>
  if (!data) return <div style={pageStyle}>Cargando…</div>

  const pct = (x: number) => `${Math.round(x * 100)}%`

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ ...adminFonts.sectionTitle, fontSize: '1.5rem', margin: 0 }}>
          Cerebro de tAIger+ — Auditoría del agente
        </h1>
        <div style={{ color: adminColors.gray, fontSize: 12 }}>
          Últimos {data.window_days} días · {new Date(data.generated_at).toLocaleString('es-CL')}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, fontSize: 13 }}>
        <Link href="/admin/sistema/taiger/dashboard" style={navLink}>→ Efectividad de planes</Link>
        <span style={{ color: adminColors.gray }}>·</span>
        <span style={{ color: adminColors.gray }}>Drill por usuario: copiar userId desde un evento abajo</span>
      </div>

      {/* HEALTH GRID */}
      <div style={kpiGrid}>
        <Kpi label="Respuestas analizadas" value={data.totals.total_responses} />
        <Kpi
          label="Respuestas con tool"
          value={`${data.totals.responses_with_tool_call} (${pct(data.totals.response_with_tool_rate)})`}
        />
        <Kpi label="Tool calls / respuesta" value={data.totals.avg_tool_calls_per_response.toFixed(2)} />
        <Kpi
          label="Alucinaciones flagged"
          value={`${data.hallucination.flagged} (${pct(data.hallucination.flagged_rate)})`}
          accent={data.hallucination.flagged_rate > 0.05 ? 'red' : 'gold'}
        />
        <Kpi label="Save_plan llamadas" value={data.plan_engagement.save_plan_calls} accent="green" />
        <Kpi
          label="Sesiones divergentes"
          value={`${data.plan_engagement.divergent_sessions} (${pct(data.plan_engagement.divergence_rate)})`}
          accent="yellow"
        />
      </div>

      {/* HALLUCINATIONS */}
      <Section title="Alucinaciones detectadas (modo shadow)">
        <Sub>Validador post-respuesta. Ahora solo logea — no degrada respuesta. Promueve a enforcement cuando false_positive_rate &lt; 5%.</Sub>
        <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
          <Stat label="Checks corridos" value={data.hallucination.total_checks} />
          <Stat label="Flagged" value={data.hallucination.flagged} />
          <Stat label="Tasa flagged" value={pct(data.hallucination.flagged_rate)} />
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
          {Object.entries(data.hallucination.flagged_by_kind).map(([kind, count]) => (
            <div key={kind} style={chipStyle}>{kind}: <strong style={{ color: adminColors.ivory }}>{count}</strong></div>
          ))}
          {Object.keys(data.hallucination.flagged_by_kind).length === 0 && (
            <div style={{ color: adminColors.gray, fontSize: 13, fontStyle: 'italic' }}>Sin flags por tipo todavía</div>
          )}
        </div>

        <h3 style={{ ...adminFonts.label, marginTop: 20, marginBottom: 8 }}>Últimos 20 flagged — revisión manual (clic para expandir)</h3>
        {data.hallucination.recent_flagged.length === 0 ? (
          <Empty>Sin alucinaciones flagged todavía</Empty>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {data.hallucination.recent_flagged.map(f => (
              <li key={f.id} style={{ padding: '8px 0', borderBottom: `1px solid ${adminColors.border}`, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
                     onClick={() => setExpanded(expanded === f.id ? null : f.id)}>
                  <div>
                    <strong>{new Date(f.created_at).toLocaleString('es-CL')}</strong>{' '}
                    · {f.warnings.length} warning{f.warnings.length === 1 ? '' : 's'}{' '}
                    · response {f.response_length} chars · {f.tool_calls_in_session} tool calls
                  </div>
                  <Link href={`/admin/sistema/taiger/${f.user_id}`} style={navLink} onClick={e => e.stopPropagation()}>
                    user →
                  </Link>
                </div>
                {expanded === f.id && (
                  <pre style={{
                    background: adminColors.cardHover, padding: 8, marginTop: 4, borderRadius: 4,
                    fontSize: 11, overflow: 'auto', color: adminColors.ivory,
                  }}>{JSON.stringify(f.warnings, null, 2)}</pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* TOOL USAGE */}
      <Section title={`Tool usage (${data.tool_usage.total_calls} llamadas totales)`}>
        <Sub>El coach pidió más datos antes de responder. Una respuesta sin tool ante un mensaje de datos = sospechoso.</Sub>
        {data.tool_usage.by_tool.length === 0 ? <Empty>Sin tool calls registradas</Empty> : (
          <table style={tableStyle}>
            <thead><tr><Th>Tool</Th><Th>Total</Th><Th>OK</Th><Th>Fail</Th><Th>Tasa fail</Th><Th>Avg ms</Th></tr></thead>
            <tbody>
              {data.tool_usage.by_tool.map(t => (
                <tr key={t.tool_name}>
                  <Td><code style={{ fontSize: 12, color: adminColors.gold }}>{t.tool_name}</code></Td>
                  <Td>{t.total}</Td>
                  <Td>{t.ok}</Td>
                  <Td style={{ color: t.fail > 0 ? adminColors.red : adminColors.ivory }}>{t.fail}</Td>
                  <Td>{pct(t.fail_rate)}</Td>
                  <Td>{t.avg_ms}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* PLAN ENGAGEMENT */}
      <Section title="Compromiso de planes (save_plan vs shadow extractor)">
        <Sub>El coach debe llamar save_plan cuando recomienda. Si el shadow extractor detecta lenguaje de plan pero save_plan NO se llamó en esa sesión, el coach habló de plan en prosa sin comprometerse.</Sub>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginTop: 12 }}>
          <Stat label="Save_plan llamadas" value={data.plan_engagement.save_plan_calls} />
          <Stat label="Planes superseded" value={data.plan_engagement.planes_superseded} />
          <Stat label="Planes resolved" value={data.plan_engagement.planes_resolved} />
          <Stat label="Shadow runs" value={data.plan_engagement.shadow_total_runs} />
          <Stat label="Shadow detected" value={data.plan_engagement.shadow_detections} />
          <Stat label="Sesiones save_plan" value={data.plan_engagement.sessions_with_save_plan} />
          <Stat label="Sesiones shadow only" value={data.plan_engagement.sessions_with_shadow - data.plan_engagement.sessions_with_save_plan} />
          <Stat label="Divergencia" value={pct(data.plan_engagement.divergence_rate)} />
        </div>
      </Section>

      {/* METRIC GAPS */}
      <Section title="Métricas que el cerebro no puede computar">
        <Sub>Si un plan usa una métrica que requiere datos no rastreados (putts por hoyo, short game), el outcome sale como compliance=&apos;unknown&apos;. Idealmente esto baja a 0%.</Sub>
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
    </div>
  )
}

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

const navLink: React.CSSProperties = {
  color: adminColors.gold,
  textDecoration: 'none',
}

const chipStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: `1px solid ${adminColors.border}`,
  borderRadius: 6,
  fontSize: 12,
  color: adminColors.gray,
}

function Kpi({ label, value, accent = 'gold' }: { label: string; value: string | number; accent?: 'gold' | 'green' | 'yellow' | 'red' | 'gray' }) {
  const accentColor = accent === 'green' ? adminColors.green
    : accent === 'yellow' ? adminColors.yellow
    : accent === 'red' ? adminColors.red
    : accent === 'gray' ? adminColors.gray
    : adminColors.gold
  return (
    <div style={{ ...adminCard, padding: 16 }}>
      <div style={{ color: adminColors.gray, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, color: accentColor, fontFamily: "'Playfair Display', serif", fontWeight: 700, lineHeight: 1.1 }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ ...adminCard, marginBottom: 20, padding: 20 }}>
      <h2 style={{ ...adminFonts.sectionTitle, fontSize: '1rem', marginBottom: 8 }}>{title}</h2>
      {children}
    </section>
  )
}

function Sub({ children }: { children: React.ReactNode }) {
  return <div style={{ color: adminColors.gray, fontSize: 12 }}>{children}</div>
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ minWidth: 100 }}>
      <div style={{ color: adminColors.gray, fontSize: 11, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, color: adminColors.ivory, fontWeight: 600, fontFamily: "'Playfair Display', serif" }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ color: adminColors.gray, fontSize: 13, fontStyle: 'italic' }}>{children}</div>
}

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${adminColors.border}`, color: adminColors.gray, fontWeight: 500 }}>{children}</th>
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '6px 8px', borderBottom: `1px solid ${adminColors.border}`, color: adminColors.ivory, ...style }}>{children}</td>
}
