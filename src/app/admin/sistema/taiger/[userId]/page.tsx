'use client'

/**
 * Admin Brain — vista cruda del cerebro de tAIger+ por usuario.
 *
 * Funcional, no estetico todavia. Sirve para que Juanjo entienda en
 * tiempo real qué piensa el coach sobre un jugador real.
 *
 * Spec: docs/superpowers/plans/2026-05-05-cerebro-v2.md §6.2
 */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { adminColors, adminFonts, adminCard } from '@/components/admin/admin-tokens'

interface BrainResponse {
  profile: { id: string; name: string; indice: number | null; nivel: number | null; created_at: string } | null
  patterns: Array<{
    id: string
    pattern_type: string
    confidence: number
    data_points: number
    status: string
    metadata: Record<string, unknown>
    created_at: string
  }>
  active_plan: ActivePlan | null
  past_plans: ActivePlan[]
  plan_outcomes: Array<{
    id: string
    plan_id: string
    played_at: string
    metric_value: number
    delta_vs_baseline: number | null
    target_reached: boolean
    compliance: string
  }>
  events: Array<{
    id: number
    type: string
    payload: Record<string, unknown>
    related_plan_id: string | null
    related_session_id: string | null
    created_at: string
  }>
  session: {
    id: string
    created_at: string
    updated_at: string
    next_focus: string | null
    message_count: number
    messages: Array<{ role: string; content: string }>
  } | null
  tokens_last_30_days: { input: number; output: number; total: number }
}

interface ActivePlan {
  id: string
  pattern_id: string
  hypothesis: string
  rule: string
  metric: string
  target_value: number
  target_op: string
  baseline_value: number | null
  duration_days: number
  status: string
  resolution_reason: string | null
  created_at: string
  resolved_at: string | null
}

export default function AdminBrainPage() {
  const params = useParams() as { userId: string }
  const [data, setData] = useState<BrainResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedEvent, setExpandedEvent] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/admin/taiger/brain/${params.userId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setData)
      .catch(e => setError(String(e)))
  }, [params.userId])

  if (error) return <div style={pageStyle}>Error: {error}</div>
  if (!data) return <div style={pageStyle}>Cargando…</div>

  return (
    <div style={pageStyle}>
      <h1 style={{ ...adminFonts.sectionTitle, fontSize: '1.5rem', marginBottom: 24 }}>
        Cerebro de tAIger+ — {data.profile?.name ?? params.userId}
      </h1>

      <Section title="Resumen">
        <KV k="userId" v={params.userId} />
        <KV k="Indice" v={data.profile?.indice?.toString() ?? '—'} />
        <KV k="Nivel" v={data.profile?.nivel?.toString() ?? '—'} />
        <KV k="Sesion creada" v={data.session?.created_at ?? '—'} />
        <KV k="Mensajes acumulados" v={data.session?.message_count?.toString() ?? '0'} />
        <KV k="Tokens 30d" v={`${data.tokens_last_30_days.input.toLocaleString()} in / ${data.tokens_last_30_days.output.toLocaleString()} out`} />
      </Section>

      <Section title="Plan activo del cerebro">
        {data.active_plan ? <PlanCard plan={data.active_plan} /> : <Empty>Sin plan activo. El coach no ha asignado nada todavia.</Empty>}
      </Section>

      <Section title="Patrones detectados">
        {data.patterns.length === 0 ? <Empty>Sin patrones aun</Empty> : (
          <table style={tableStyle}>
            <thead><tr><Th>Patron</Th><Th>Confianza</Th><Th>Data points</Th><Th>Status</Th><Th>Detectado</Th></tr></thead>
            <tbody>
              {data.patterns.map(p => (
                <tr key={p.id}>
                  <Td>{p.pattern_type}</Td>
                  <Td>{Math.round(p.confidence * 100)}%</Td>
                  <Td>{p.data_points}</Td>
                  <Td>{p.status}</Td>
                  <Td>{new Date(p.created_at).toLocaleDateString('es-CL')}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Historial de planes">
        {data.past_plans.length === 0 ? <Empty>Sin planes previos</Empty> : (
          <table style={tableStyle}>
            <thead><tr><Th>Patron</Th><Th>Status</Th><Th>Resuelto por</Th><Th>Inicio</Th><Th>Fin</Th></tr></thead>
            <tbody>
              {data.past_plans.map(p => (
                <tr key={p.id}>
                  <Td>{p.pattern_id}</Td>
                  <Td>{p.status}</Td>
                  <Td>{p.resolution_reason ?? '—'}</Td>
                  <Td>{new Date(p.created_at).toLocaleDateString('es-CL')}</Td>
                  <Td>{p.resolved_at ? new Date(p.resolved_at).toLocaleDateString('es-CL') : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Outcomes (ultimos 20)">
        {data.plan_outcomes.length === 0 ? <Empty>Sin outcomes registrados</Empty> : (
          <table style={tableStyle}>
            <thead><tr><Th>Fecha</Th><Th>Métrica</Th><Th>Δ baseline</Th><Th>Target?</Th><Th>Compliance</Th></tr></thead>
            <tbody>
              {data.plan_outcomes.map(o => (
                <tr key={o.id}>
                  <Td>{new Date(o.played_at).toLocaleDateString('es-CL')}</Td>
                  <Td>{Number.isFinite(o.metric_value) ? o.metric_value.toFixed(2) : '—'}</Td>
                  <Td>{o.delta_vs_baseline != null ? (o.delta_vs_baseline >= 0 ? '+' : '') + o.delta_vs_baseline.toFixed(2) : '—'}</Td>
                  <Td>{o.target_reached ? '✓' : '✗'}</Td>
                  <Td>{o.compliance}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`Timeline coach_events (${data.events.length})`}>
        {data.events.length === 0 ? <Empty>Sin eventos</Empty> : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {data.events.map(e => (
              <li key={e.id} style={{ padding: '8px 0', borderBottom: `1px solid ${adminColors.border}`, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
                     onClick={() => setExpandedEvent(expandedEvent === e.id ? null : e.id)}>
                  <span><strong>{e.type}</strong> · {new Date(e.created_at).toLocaleString('es-CL')}</span>
                  <span style={{ color: adminColors.gray }}>{expandedEvent === e.id ? '▾' : '▸'}</span>
                </div>
                {expandedEvent === e.id && (
                  <pre style={{
                    background: adminColors.cardHover, padding: 8, marginTop: 4, borderRadius: 4,
                    fontSize: 11, overflow: 'auto', color: adminColors.ivory,
                  }}>{JSON.stringify(e.payload, null, 2)}</pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Conversación reciente (últimos 20)">
        {!data.session?.messages || data.session.messages.length === 0
          ? <Empty>Sin mensajes</Empty>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.session.messages.map((m, i) => (
                <div key={i} style={{
                  background: m.role === 'user' ? adminColors.cardHover : adminColors.card,
                  border: `1px solid ${adminColors.border}`,
                  padding: 10, borderRadius: 6, fontSize: 13,
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: adminColors.gray }}>
                    {m.role}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', color: adminColors.ivory }}>{m.content}</div>
                </div>
              ))}
            </div>
          )}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ ...adminCard, marginBottom: 20, padding: 20 }}>
      <h2 style={{ ...adminFonts.sectionTitle, fontSize: '1rem', marginBottom: 12 }}>{title}</h2>
      {children}
    </section>
  )
}

function PlanCard({ plan }: { plan: ActivePlan }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 13 }}>
      <KV k="Patron" v={plan.pattern_id} />
      <KV k="Status" v={plan.status} />
      <KV k="Metrica" v={`${plan.metric} ${plan.target_op} ${plan.target_value}`} />
      <KV k="Baseline" v={plan.baseline_value?.toString() ?? '—'} />
      <KV k="Duracion" v={`${plan.duration_days} dias desde ${new Date(plan.created_at).toLocaleDateString('es-CL')}`} />
      <KV k="Asignado" v={plan.created_at} />
      <div style={{ gridColumn: '1 / -1' }}>
        <KV k="Hipotesis" v={plan.hypothesis} />
        <KV k="Regla" v={plan.rule} />
      </div>
    </div>
  )
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <span style={{ color: adminColors.gray, marginRight: 8 }}>{k}:</span>
      <span style={{ color: adminColors.ivory }}>{v}</span>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ color: adminColors.gray, fontSize: 13, fontStyle: 'italic' }}>{children}</div>
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
}
function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${adminColors.border}`, color: adminColors.gray, fontWeight: 500 }}>{children}</th>
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '6px 8px', borderBottom: `1px solid ${adminColors.border}`, color: adminColors.ivory }}>{children}</td>
}
