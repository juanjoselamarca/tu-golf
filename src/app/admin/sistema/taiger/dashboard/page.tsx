'use client'

/**
 * Effectiveness Dashboard — KPIs del cerebro tAIger+.
 *
 * Spec: docs/superpowers/plans/2026-05-05-cerebro-v2.md §7.1
 */

import { useEffect, useState } from 'react'
import { adminColors, adminFonts, adminCard } from '@/components/admin/admin-tokens'

interface KPIs {
  total_plans: number
  active_plans: number
  resolved_plans: number
  expired_plans: number
  superseded_plans: number
  cancelled_plans: number
  resolved_by_target_rate: number | null
  adherence_distribution: { full: number; partial: number; none: number; unknown: number }
  avg_days_to_resolution: number | null
  per_pattern: Array<{
    pattern_id: string
    total_plans: number
    resolved_count: number
    target_reached_count: number
    target_reached_rate: number
    avg_days_to_resolution: number | null
  }>
  total_outcomes: number
  total_users_with_plan: number
  generated_at: string
}

export default function EffectivenessDashboard() {
  const [data, setData] = useState<KPIs | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/taiger/effectiveness', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setData)
      .catch(e => setError(String(e)))
  }, [])

  if (error) return <div style={pageStyle}>Error: {error}</div>
  if (!data) return <div style={pageStyle}>Cargando…</div>

  const adhTotal = Object.values(data.adherence_distribution).reduce((a, b) => a + b, 0)
  const adhPct = (n: number) => adhTotal > 0 ? Math.round(n / adhTotal * 100) : 0

  return (
    <div style={pageStyle}>
      <h1 style={{ ...adminFonts.sectionTitle, fontSize: '1.5rem', marginBottom: 8 }}>
        Cerebro tAIger+ — Efectividad
      </h1>
      <div style={{ color: adminColors.gray, fontSize: 12, marginBottom: 20 }}>
        Generado {new Date(data.generated_at).toLocaleString('es-CL')}
      </div>

      <div style={kpiGrid}>
        <KpiCard label="Usuarios con plan" value={data.total_users_with_plan} />
        <KpiCard label="Total planes" value={data.total_plans} />
        <KpiCard label="Activos" value={data.active_plans} accent="green" />
        <KpiCard label="Resueltos" value={data.resolved_plans} accent="gold" />
        <KpiCard label="Expirados" value={data.expired_plans} accent="yellow" />
        <KpiCard label="Reemplazados" value={data.superseded_plans} accent="gray" />
      </div>

      <Section title="Resolución por target alcanzado">
        <div style={{ fontSize: 28, color: adminColors.gold, fontFamily: "'Playfair Display', serif", fontWeight: 700 }}>
          {data.resolved_by_target_rate != null
            ? `${Math.round(data.resolved_by_target_rate * 100)}%`
            : '—'}
        </div>
        <div style={{ color: adminColors.gray, fontSize: 13 }}>
          De los planes resueltos, este % fue por target_reached_3_consecutive (vs cancelled/expired/etc).
        </div>
      </Section>

      <Section title={`Distribución de adherence (n=${adhTotal} outcomes)`}>
        <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
          <Adh label="full" count={data.adherence_distribution.full} pct={adhPct(data.adherence_distribution.full)} color={adminColors.green} />
          <Adh label="partial" count={data.adherence_distribution.partial} pct={adhPct(data.adherence_distribution.partial)} color={adminColors.yellow} />
          <Adh label="none" count={data.adherence_distribution.none} pct={adhPct(data.adherence_distribution.none)} color={adminColors.red} />
          <Adh label="unknown" count={data.adherence_distribution.unknown} pct={adhPct(data.adherence_distribution.unknown)} color={adminColors.gray} />
        </div>
      </Section>

      <Section title="Tiempo medio a resolución">
        <div style={{ fontSize: 28, color: adminColors.gold, fontFamily: "'Playfair Display', serif", fontWeight: 700 }}>
          {data.avg_days_to_resolution != null
            ? `${data.avg_days_to_resolution.toFixed(1)} días`
            : '—'}
        </div>
      </Section>

      <Section title={`Por patrón (${data.per_pattern.length} patrones)`}>
        {data.per_pattern.length === 0 ? (
          <div style={{ color: adminColors.gray, fontSize: 13, fontStyle: 'italic' }}>Sin datos aún</div>
        ) : (
          <table style={tableStyle}>
            <thead><tr>
              <Th>Patrón</Th><Th>Planes</Th><Th>Resueltos</Th><Th>Por target</Th><Th>Tasa target</Th><Th>Días medios</Th>
            </tr></thead>
            <tbody>
              {data.per_pattern.map(p => (
                <tr key={p.pattern_id}>
                  <Td>{p.pattern_id}</Td>
                  <Td>{p.total_plans}</Td>
                  <Td>{p.resolved_count}</Td>
                  <Td>{p.target_reached_count}</Td>
                  <Td>{p.resolved_count > 0 ? `${Math.round(p.target_reached_rate * 100)}%` : '—'}</Td>
                  <Td>{p.avg_days_to_resolution != null ? p.avg_days_to_resolution.toFixed(1) : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
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

const kpiGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: 12,
  marginBottom: 20,
}

function KpiCard({ label, value, accent = 'gold' }: { label: string; value: number; accent?: 'gold' | 'green' | 'yellow' | 'gray' | 'red' }) {
  const accentColor = accent === 'green' ? adminColors.green : accent === 'yellow' ? adminColors.yellow : accent === 'gray' ? adminColors.gray : accent === 'red' ? adminColors.red : adminColors.gold
  return (
    <div style={{ ...adminCard, padding: 16 }}>
      <div style={{ color: adminColors.gray, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, color: accentColor, fontFamily: "'Playfair Display', serif", fontWeight: 700, lineHeight: 1 }}>
        {value.toLocaleString()}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ ...adminCard, marginBottom: 20, padding: 20 }}>
      <h2 style={{ ...adminFonts.sectionTitle, fontSize: '1rem', marginBottom: 12 }}>{title}</h2>
      {children}
    </section>
  )
}

function Adh({ label, count, pct, color }: { label: string; count: number; pct: number; color: string }) {
  return (
    <div style={{ flex: 1, padding: 12, border: `1px solid ${adminColors.border}`, borderRadius: 6 }}>
      <div style={{ color: adminColors.gray, fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 700 }}>{pct}%</div>
      <div style={{ color: adminColors.gray, fontSize: 11 }}>n={count}</div>
    </div>
  )
}

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${adminColors.border}`, color: adminColors.gray, fontWeight: 500 }}>{children}</th>
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '6px 8px', borderBottom: `1px solid ${adminColors.border}`, color: adminColors.ivory }}>{children}</td>
}
