# Admin Redesign — Golfers+ Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 9-tab admin panel with a 5-section professional Command Center (sidebar navigation, live data, premium dark theme) inspired by Vercel/Stripe/Linear.

**Architecture:** Client-side React pages using `'use client'` with polling-based data refresh. New shared admin components in `src/components/admin/`. New API routes aggregate data from Supabase using the service-role client. Sidebar layout replaces the current horizontal tab bar.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS (inline styles for admin to match existing pattern), Recharts, Supabase (service-role client).

---

## File Structure

### Shared Components (`src/components/admin/`)
| File | Responsibility |
|------|---------------|
| `AdminSidebar.tsx` | Sidebar navigation (desktop expanded, tablet icons, mobile hidden + hamburger) |
| `AdminTopBar.tsx` | Global live status bar (services status dots, active users, live rounds, last update timestamp) |
| `AdminCard.tsx` | Reusable KPI card (icon, value, label, delta with arrow, optional sparkline via Recharts) |
| `AdminChart.tsx` | Themed Recharts wrapper (area/line/bar) with consistent colors, tooltip, responsive container |
| `AdminTable.tsx` | Paginated table with search, sort, row click handler, shimmer loading |
| `AdminBadge.tsx` | Status badge component (online/warning/error/neutral variants) |
| `LiveFeed.tsx` | Real-time activity feed with auto-scroll, timestamped entries, event type icons |
| `HealthGrid.tsx` | Service health cards grid (status dot, latency ms, name) |
| `FunnelChart.tsx` | Horizontal funnel visualization with animated bars and percentage labels |
| `ProjectionSlider.tsx` | Interactive dual-slider for revenue projections with live-updating chart |
| `admin-tokens.ts` | Shared design tokens (colors, fonts, styles) — single source of truth |

### Pages (`src/app/admin/`)
| File | Responsibility |
|------|---------------|
| `layout.tsx` | **REWRITE** — Sidebar + TopBar + content area, auth check, responsive |
| `page.tsx` | **REWRITE** — Command Center: KPIs, live feed, activity chart, alerts |
| `analytics/page.tsx` | **NEW** — Growth metrics, activation funnel, retention, engagement, geography |
| `golf-ops/page.tsx` | **NEW** — Tournaments, rounds, courses, users table, tAIger stats |
| `finanzas/page.tsx` | **NEW** — Revenue, costs, projections slider, unit economics |
| `sistema/page.tsx` | **REWRITE** — Health dashboard, DB stats, env vars, logs, config |

### API Routes (`src/app/api/admin/`)
| File | Responsibility |
|------|---------------|
| `live/route.ts` | **NEW** — Active users now, live rounds, latest events for feed |
| `analytics/route.ts` | **NEW** — Growth, funnel, retention cohort, engagement metrics |
| `golf-ops/route.ts` | **NEW** — Tournaments list, rounds stats, courses, tAIger summary |
| `finance/route.ts` | **NEW** — Table row counts as proxy for costs, projection data |
| `feed/route.ts` | **NEW** — Recent activity events with user names joined |
| `overview/route.ts` | **MODIFY** — Add sparkline data (daily counts for last 30d) |
| `health/route.ts` | **KEEP** — Already functional |
| `users/route.ts` | **KEEP** — Already functional |
| `activity/route.ts` | **KEEP** — Already functional |

### Files to Delete (replaced by new pages)
- `src/app/admin/usuarios/page.tsx` → absorbed into `golf-ops`
- `src/app/admin/crecimiento/page.tsx` → absorbed into `analytics`
- `src/app/admin/golf/page.tsx` → absorbed into `golf-ops`
- `src/app/admin/taiger/page.tsx` → absorbed into `golf-ops`
- `src/app/admin/monetizacion/page.tsx` → absorbed into `finanzas`
- `src/app/admin/geografia/page.tsx` → absorbed into `analytics`
- `src/app/admin/configuracion/page.tsx` → absorbed into `sistema`

---

## Task 1: Design Tokens + AdminCard + AdminBadge

**Files:**
- Create: `src/components/admin/admin-tokens.ts`
- Create: `src/components/admin/AdminCard.tsx`
- Create: `src/components/admin/AdminBadge.tsx`

- [ ] **Step 1: Create design tokens file**

```typescript
// src/components/admin/admin-tokens.ts
export const adminColors = {
  bg: '#050b14',
  bgDeep: '#070d18',
  card: '#0a1628',
  cardHover: '#0f2035',
  border: '#132540',
  gold: '#c4992a',
  goldDim: 'rgba(196,153,42,0.15)',
  ivory: '#edeae4',
  gray: '#94a8c0',
  grayDim: '#5a7494',
  green: '#22c55e',
  greenDim: 'rgba(34,197,94,0.15)',
  red: '#ef4444',
  redDim: 'rgba(239,68,68,0.15)',
  yellow: '#f59e0b',
  yellowDim: 'rgba(245,158,11,0.15)',
  blue: '#3b82f6',
  blueDim: 'rgba(59,130,246,0.15)',
}

export const adminFonts = {
  kpi: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '2rem',
    color: adminColors.gold,
    fontWeight: 700 as const,
    lineHeight: 1.1,
  },
  kpiSmall: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '1.5rem',
    color: adminColors.gold,
    fontWeight: 700 as const,
    lineHeight: 1.1,
  },
  sectionTitle: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '1.1rem',
    color: adminColors.ivory,
    fontWeight: 600 as const,
  },
  label: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.75rem',
    color: adminColors.gray,
    fontWeight: 500 as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  body: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.875rem',
    color: adminColors.ivory,
  },
  mono: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.8rem',
    color: adminColors.gray,
  },
}

export const adminCard = {
  background: adminColors.card,
  border: `1px solid ${adminColors.border}`,
  borderRadius: '12px',
  padding: '20px',
}
```

- [ ] **Step 2: Create AdminCard component**

```typescript
// src/components/admin/AdminCard.tsx
'use client'
import { CSSProperties, ReactNode } from 'react'
import { adminColors, adminFonts, adminCard } from './admin-tokens'

interface AdminCardProps {
  icon?: string
  label: string
  value: string | number
  delta?: { value: number; label: string }
  loading?: boolean
  sparkline?: number[]  // last 30 days values for mini chart
  children?: ReactNode
  style?: CSSProperties
}

export function AdminCard({ icon, label, value, delta, loading, sparkline, children, style }: AdminCardProps) {
  return (
    <div style={{ ...adminCard, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0, ...style }}>
      {icon && <span style={{ fontSize: '20px' }}>{icon}</span>}
      {loading ? (
        <div style={{
          height: '32px', width: '80px', borderRadius: '8px',
          background: `linear-gradient(90deg, ${adminColors.border} 25%, ${adminColors.card} 50%, ${adminColors.border} 75%)`,
          backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
        }} />
      ) : (
        <span style={adminFonts.kpi}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
      )}
      <span style={adminFonts.label}>{label}</span>
      {delta && !loading && (
        <span style={{
          ...adminFonts.label, fontSize: '11px', textTransform: 'none' as const,
          color: delta.value >= 0 ? adminColors.green : adminColors.red,
          fontWeight: 600,
        }}>
          {delta.value >= 0 ? '\u25B2' : '\u25BC'} {Math.abs(delta.value)} {delta.label}
        </span>
      )}
      {sparkline && sparkline.length > 1 && !loading && (
        <svg viewBox={`0 0 ${sparkline.length - 1} 20`} width="100%" height="24"
          style={{ marginTop: '4px' }} preserveAspectRatio="none">
          <polyline
            fill="none" stroke={adminColors.gold} strokeWidth="1.5"
            points={sparkline.map((v, i) => {
              const max = Math.max(...sparkline)
              const min = Math.min(...sparkline)
              const range = max - min || 1
              const y = 20 - ((v - min) / range) * 18
              return `${i},${y}`
            }).join(' ')}
          />
        </svg>
      )}
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Create AdminBadge component**

```typescript
// src/components/admin/AdminBadge.tsx
'use client'
import { adminColors } from './admin-tokens'

type BadgeVariant = 'success' | 'warning' | 'error' | 'neutral' | 'gold'

const variantStyles: Record<BadgeVariant, { bg: string; color: string }> = {
  success: { bg: adminColors.greenDim, color: adminColors.green },
  warning: { bg: adminColors.yellowDim, color: adminColors.yellow },
  error: { bg: adminColors.redDim, color: adminColors.red },
  neutral: { bg: 'rgba(148,168,192,0.12)', color: adminColors.gray },
  gold: { bg: adminColors.goldDim, color: adminColors.gold },
}

export function AdminBadge({ text, variant = 'neutral', dot }: {
  text: string
  variant?: BadgeVariant
  dot?: boolean
}) {
  const s = variantStyles[variant]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      background: s.bg, color: s.color,
      fontSize: '11px', fontWeight: 600, padding: '3px 10px',
      borderRadius: '20px', whiteSpace: 'nowrap',
    }}>
      {dot && <span style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: s.color, flexShrink: 0,
      }} />}
      {text}
    </span>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to the new files.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/admin-tokens.ts src/components/admin/AdminCard.tsx src/components/admin/AdminBadge.tsx
git commit -m "feat(admin): tokens de diseno, AdminCard y AdminBadge — base del Command Center"
```

---

## Task 2: AdminSidebar + AdminTopBar

**Files:**
- Create: `src/components/admin/AdminSidebar.tsx`
- Create: `src/components/admin/AdminTopBar.tsx`

- [ ] **Step 1: Create AdminSidebar component**

The sidebar has 5 sections, shows icons + labels on desktop (>1024px), icons only on tablet (768-1024px), and is hidden on mobile (<768px) behind a hamburger toggle. Uses `usePathname()` to highlight the active route.

```typescript
// src/components/admin/AdminSidebar.tsx
'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { adminColors } from './admin-tokens'

const NAV_ITEMS = [
  { href: '/admin',          icon: '\u26A1', label: 'Command Center' },
  { href: '/admin/analytics', icon: '\uD83D\uDCCA', label: 'Analytics' },
  { href: '/admin/golf-ops',  icon: '\u26F3', label: 'Golf Ops' },
  { href: '/admin/finanzas',  icon: '\uD83D\uDCB0', label: 'Finanzas' },
  { href: '/admin/sistema',   icon: '\uD83D\uDD27', label: 'Sistema' },
]

export function AdminSidebar({ collapsed, onToggle }: {
  collapsed: boolean
  onToggle: () => void
}) {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  const width = collapsed ? '64px' : '220px'

  return (
    <aside style={{
      width, minWidth: width, height: '100vh', position: 'fixed', left: 0, top: 0,
      background: adminColors.bgDeep, borderRight: `1px solid ${adminColors.border}`,
      display: 'flex', flexDirection: 'column', zIndex: 50,
      transition: 'width 0.2s ease, min-width 0.2s ease',
      overflowX: 'hidden',
    }}>
      {/* Logo area */}
      <div style={{
        padding: collapsed ? '16px 12px' : '16px 20px',
        borderBottom: `1px solid ${adminColors.border}`,
        display: 'flex', alignItems: 'center', gap: '10px',
        minHeight: '56px',
      }}>
        <button onClick={onToggle} style={{
          background: 'none', border: 'none', color: adminColors.gray,
          cursor: 'pointer', fontSize: '18px', padding: '4px',
          display: 'flex', alignItems: 'center',
        }}>
          {collapsed ? '\u2630' : '\u2715'}
        </button>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontFamily: "'Playfair Display', serif", fontSize: '15px',
              color: adminColors.ivory, fontWeight: 700,
            }}>Golfers+</span>
            <span style={{
              background: adminColors.gold, color: adminColors.bgDeep,
              fontSize: '8px', fontWeight: 800, padding: '2px 6px',
              borderRadius: '4px', letterSpacing: '0.1em',
            }}>ADMIN</span>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {NAV_ITEMS.map(item => {
          const active = isActive(item.href)
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: collapsed ? '10px 16px' : '10px 12px',
              borderRadius: '8px', textDecoration: 'none',
              background: active ? adminColors.goldDim : 'transparent',
              color: active ? adminColors.gold : adminColors.gray,
              fontSize: '14px', fontWeight: active ? 600 : 400,
              transition: 'background 0.15s, color 0.15s',
              justifyContent: collapsed ? 'center' : 'flex-start',
              whiteSpace: 'nowrap', overflow: 'hidden',
            }}>
              <span style={{ fontSize: '18px', flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Back to dashboard link */}
      <div style={{
        padding: collapsed ? '16px 12px' : '16px 20px',
        borderTop: `1px solid ${adminColors.border}`,
      }}>
        <Link href="/dashboard" style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          color: adminColors.grayDim, fontSize: '13px', textDecoration: 'none',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
          <span>\u2190</span>
          {!collapsed && <span>Volver a la app</span>}
        </Link>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Create AdminTopBar component**

```typescript
// src/components/admin/AdminTopBar.tsx
'use client'
import { useEffect, useState } from 'react'
import { adminColors, adminFonts } from './admin-tokens'

interface LiveStatus {
  supabaseOk: boolean
  activeUsers: number
  liveRounds: number
  lastUpdate: string
}

export function AdminTopBar() {
  const [status, setStatus] = useState<LiveStatus>({
    supabaseOk: true, activeUsers: 0, liveRounds: 0, lastUpdate: '',
  })

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/admin/live')
        if (res.ok) {
          const data = await res.json()
          setStatus({
            supabaseOk: data.supabaseOk ?? true,
            activeUsers: data.activeUsers ?? 0,
            liveRounds: data.liveRounds ?? 0,
            lastUpdate: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          })
        }
      } catch { /* keep last state */ }
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 10_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{
      height: '40px', background: adminColors.bgDeep,
      borderBottom: `1px solid ${adminColors.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', gap: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Service status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: status.supabaseOk ? adminColors.green : adminColors.red,
            boxShadow: status.supabaseOk ? `0 0 6px ${adminColors.green}` : 'none',
          }} />
          <span style={{ ...adminFonts.mono, fontSize: '11px' }}>
            {status.supabaseOk ? 'Sistemas OK' : 'Error detectado'}
          </span>
        </div>

        {/* Active users */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ fontSize: '12px' }}>{'\uD83D\uDC64'}</span>
          <span style={{ ...adminFonts.mono, fontSize: '11px', color: adminColors.ivory }}>
            {status.activeUsers}
          </span>
          <span style={{ ...adminFonts.mono, fontSize: '11px' }}>activos</span>
        </div>

        {/* Live rounds */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ fontSize: '12px' }}>{'\u26F3'}</span>
          <span style={{ ...adminFonts.mono, fontSize: '11px', color: adminColors.ivory }}>
            {status.liveRounds}
          </span>
          <span style={{ ...adminFonts.mono, fontSize: '11px' }}>rondas en vivo</span>
        </div>
      </div>

      {/* Last update */}
      <span style={{ ...adminFonts.mono, fontSize: '10px', color: adminColors.grayDim }}>
        {status.lastUpdate && `Actualizado ${status.lastUpdate}`}
      </span>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/AdminSidebar.tsx src/components/admin/AdminTopBar.tsx
git commit -m "feat(admin): AdminSidebar y AdminTopBar — navegacion lateral + barra de estado live"
```

---

## Task 3: AdminTable + AdminChart + LiveFeed + HealthGrid + FunnelChart + ProjectionSlider

**Files:**
- Create: `src/components/admin/AdminTable.tsx`
- Create: `src/components/admin/AdminChart.tsx`
- Create: `src/components/admin/LiveFeed.tsx`
- Create: `src/components/admin/HealthGrid.tsx`
- Create: `src/components/admin/FunnelChart.tsx`
- Create: `src/components/admin/ProjectionSlider.tsx`

- [ ] **Step 1: Create AdminTable component**

Paginated table with search input, column headers, clickable rows, shimmer loading. Props: `columns`, `data`, `loading`, `searchPlaceholder`, `onRowClick`, `pageSize`.

```typescript
// src/components/admin/AdminTable.tsx
'use client'
import { useState, useMemo } from 'react'
import { adminColors, adminFonts, adminCard } from './admin-tokens'

interface Column<T> {
  key: string
  label: string
  width?: string
  render?: (row: T) => React.ReactNode
}

interface AdminTableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  searchPlaceholder?: string
  searchKeys?: string[]
  onRowClick?: (row: T) => void
  pageSize?: number
}

export function AdminTable<T extends Record<string, unknown>>({
  columns, data, loading, searchPlaceholder, searchKeys, onRowClick, pageSize = 15,
}: AdminTableProps<T>) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    if (!search || !searchKeys?.length) return data
    const q = search.toLowerCase()
    return data.filter(row =>
      searchKeys.some(k => String(row[k] ?? '').toLowerCase().includes(q))
    )
  }, [data, search, searchKeys])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safeP = Math.min(page, totalPages)
  const paged = filtered.slice((safeP - 1) * pageSize, safeP * pageSize)

  const gridCols = columns.map(c => c.width || '1fr').join(' ')

  return (
    <div style={adminCard}>
      {/* Search */}
      {searchPlaceholder && (
        <div style={{ marginBottom: '16px' }}>
          <input type="text" placeholder={searchPlaceholder} value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            style={{
              background: adminColors.bg, border: `1px solid ${adminColors.border}`,
              borderRadius: '8px', padding: '8px 14px', color: adminColors.ivory,
              fontSize: '13px', outline: 'none', width: '100%', maxWidth: '360px',
              fontFamily: "'DM Sans', sans-serif",
            }}
          />
        </div>
      )}

      {/* Header */}
      <div style={{
        display: 'grid', gridTemplateColumns: gridCols, padding: '8px 0',
        borderBottom: `1px solid ${adminColors.border}`, gap: '8px',
      }}>
        {columns.map(c => (
          <span key={c.key} style={{ ...adminFonts.label, fontSize: '11px' }}>{c.label}</span>
        ))}
      </div>

      {/* Body */}
      {loading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: gridCols, padding: '12px 0',
            borderBottom: `1px solid ${adminColors.border}`, gap: '8px',
          }}>
            {columns.map((_, j) => (
              <div key={j} style={{
                height: '14px', borderRadius: '4px', width: '70%',
                background: `linear-gradient(90deg, ${adminColors.border} 25%, ${adminColors.card} 50%, ${adminColors.border} 75%)`,
                backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
              }} />
            ))}
          </div>
        ))
      ) : paged.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: adminColors.gray, fontSize: '13px' }}>
          Sin resultados
        </div>
      ) : (
        paged.map((row, i) => (
          <div key={i} onClick={() => onRowClick?.(row)} style={{
            display: 'grid', gridTemplateColumns: gridCols, padding: '10px 0',
            borderBottom: `1px solid ${adminColors.border}`, gap: '8px',
            cursor: onRowClick ? 'pointer' : 'default',
            transition: 'background 0.15s', alignItems: 'center',
          }}
            onMouseEnter={e => { if (onRowClick) e.currentTarget.style.background = adminColors.cardHover }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            {columns.map(c => (
              <span key={c.key} style={{
                ...adminFonts.body, whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {c.render ? c.render(row) : String(row[c.key] ?? '-')}
              </span>
            ))}
          </div>
        ))
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          gap: '12px', marginTop: '16px',
        }}>
          <button disabled={safeP <= 1} onClick={() => setPage(p => p - 1)} style={{
            background: adminColors.bg, border: `1px solid ${adminColors.border}`,
            borderRadius: '6px', padding: '6px 14px', color: safeP <= 1 ? adminColors.grayDim : adminColors.ivory,
            cursor: safeP <= 1 ? 'not-allowed' : 'pointer', fontSize: '12px',
          }}>{'\u2190'}</button>
          <span style={{ ...adminFonts.mono, fontSize: '11px' }}>{safeP} / {totalPages}</span>
          <button disabled={safeP >= totalPages} onClick={() => setPage(p => p + 1)} style={{
            background: adminColors.bg, border: `1px solid ${adminColors.border}`,
            borderRadius: '6px', padding: '6px 14px', color: safeP >= totalPages ? adminColors.grayDim : adminColors.ivory,
            cursor: safeP >= totalPages ? 'not-allowed' : 'pointer', fontSize: '12px',
          }}>{'\u2192'}</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create AdminChart component**

Dynamic import of Recharts. Supports `type: 'area' | 'line' | 'bar'`. Props: `data`, `dataKeys` (array of `{key, color, name}`), `xAxisKey`, `height`.

```typescript
// src/components/admin/AdminChart.tsx
'use client'
import dynamic from 'next/dynamic'
import { adminColors, adminFonts, adminCard } from './admin-tokens'

const AreaChart = dynamic(() => import('recharts').then(m => m.AreaChart), { ssr: false })
const Area = dynamic(() => import('recharts').then(m => m.Area), { ssr: false })
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })

interface DataKey {
  key: string
  color: string
  name: string
}

interface AdminChartProps {
  title?: string
  data: Record<string, unknown>[]
  dataKeys: DataKey[]
  xAxisKey: string
  height?: number
  type?: 'area' | 'bar'
  emptyMessage?: string
}

export function AdminChart({
  title, data, dataKeys, xAxisKey, height = 280, type = 'area', emptyMessage = 'Sin datos',
}: AdminChartProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{ ...adminCard, height, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {title && <span style={{ ...adminFonts.label, marginBottom: '12px' }}>{title}</span>}
        <span style={{ color: adminColors.grayDim, fontSize: '13px' }}>{emptyMessage}</span>
      </div>
    )
  }

  const tooltipStyle = {
    background: adminColors.card, border: `1px solid ${adminColors.border}`,
    borderRadius: '8px', color: adminColors.ivory, fontSize: '12px',
  }

  const Chart = type === 'bar' ? BarChart : AreaChart

  return (
    <div style={{ ...adminCard, padding: '16px' }}>
      {title && <span style={{ ...adminFonts.label, display: 'block', marginBottom: '12px' }}>{title}</span>}
      <ResponsiveContainer width="100%" height={height}>
        <Chart data={data}>
          <XAxis dataKey={xAxisKey} stroke={adminColors.grayDim} tick={{ fontSize: 10, fill: adminColors.gray }} />
          <YAxis stroke={adminColors.grayDim} tick={{ fontSize: 10, fill: adminColors.gray }} width={35} />
          <Tooltip contentStyle={tooltipStyle} />
          {dataKeys.map(dk =>
            type === 'bar' ? (
              <Bar key={dk.key} dataKey={dk.key} fill={dk.color} name={dk.name} radius={[4, 4, 0, 0]} />
            ) : (
              <Area key={dk.key} type="monotone" dataKey={dk.key} stroke={dk.color}
                fill={dk.color} fillOpacity={0.1} strokeWidth={2} name={dk.name} />
            )
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 3: Create LiveFeed component**

Shows timestamped events with icons, auto-refreshes via polling.

```typescript
// src/components/admin/LiveFeed.tsx
'use client'
import { useEffect, useState, useRef } from 'react'
import { adminColors, adminFonts, adminCard } from './admin-tokens'

interface FeedEvent {
  id: string
  time: string
  icon: string
  message: string
  type: 'score' | 'register' | 'tournament' | 'taiger' | 'system' | 'round'
}

const typeColors: Record<string, string> = {
  score: adminColors.green,
  register: adminColors.blue,
  tournament: adminColors.gold,
  taiger: '#f97316',
  system: adminColors.yellow,
  round: adminColors.green,
}

export function LiveFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchFeed = async () => {
      try {
        const res = await fetch('/api/admin/feed')
        if (res.ok) {
          const data = await res.json()
          setEvents(data.events ?? [])
        }
      } catch { /* keep last state */ }
      finally { setLoading(false) }
    }
    fetchFeed()
    const interval = setInterval(fetchFeed, 10_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{ ...adminCard, padding: '16px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={adminFonts.label}>ACTIVIDAD EN VIVO</span>
        <span style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: adminColors.green, animation: 'pulse 2s infinite',
        }} />
      </div>
      <div ref={containerRef} style={{
        flex: 1, minHeight: '200px', maxHeight: '400px', overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: '2px',
      }}>
        {loading ? (
          <div style={{ color: adminColors.grayDim, fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>
            Cargando feed...
          </div>
        ) : events.length === 0 ? (
          <div style={{ color: adminColors.grayDim, fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>
            Sin actividad reciente
          </div>
        ) : (
          events.map(e => (
            <div key={e.id} style={{
              display: 'flex', gap: '10px', padding: '6px 8px',
              borderRadius: '6px', alignItems: 'flex-start',
              fontSize: '12px',
            }}>
              <span style={{ ...adminFonts.mono, fontSize: '10px', color: adminColors.grayDim, flexShrink: 0, marginTop: '2px' }}>
                {e.time}
              </span>
              <span style={{ fontSize: '14px', flexShrink: 0 }}>{e.icon}</span>
              <span style={{
                color: adminColors.ivory, fontSize: '12px', lineHeight: 1.4,
                borderLeft: `2px solid ${typeColors[e.type] || adminColors.gray}`,
                paddingLeft: '8px',
              }}>
                {e.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create HealthGrid component**

```typescript
// src/components/admin/HealthGrid.tsx
'use client'
import { adminColors, adminFonts, adminCard } from './admin-tokens'

interface ServiceHealth {
  name: string
  ok: boolean
  ms: number
  status?: string
}

export function HealthGrid({ services, loading }: { services: ServiceHealth[]; loading?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
      {loading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ ...adminCard, height: '80px', opacity: 0.5 }} />
        ))
      ) : (
        services.map(svc => {
          const isOk = svc.ok && svc.status !== 'not_configured'
          const isNotConfigured = svc.status === 'not_configured'
          const dotColor = isNotConfigured ? adminColors.grayDim : isOk ? adminColors.green : adminColors.red

          return (
            <div key={svc.name} style={{ ...adminCard, padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{
                  width: '8px', height: '8px', borderRadius: '50%', background: dotColor,
                  boxShadow: isOk ? `0 0 6px ${dotColor}` : 'none', flexShrink: 0,
                }} />
                <span style={{ color: adminColors.ivory, fontSize: '13px', fontWeight: 600 }}>{svc.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ ...adminFonts.mono, fontSize: '11px', color: dotColor }}>
                  {isNotConfigured ? 'No config' : isOk ? 'Operativo' : 'Error'}
                </span>
                {svc.ms > 0 && (
                  <span style={{ ...adminFonts.mono, fontSize: '10px' }}>{svc.ms}ms</span>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
```

- [ ] **Step 5: Create FunnelChart component**

```typescript
// src/components/admin/FunnelChart.tsx
'use client'
import { adminColors, adminFonts } from './admin-tokens'

interface FunnelStep {
  label: string
  value: number
  total: number
}

export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {steps.map((step, i) => {
        const pct = step.total > 0 ? (step.value / step.total) * 100 : 0
        return (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ ...adminFonts.body, fontSize: '13px' }}>{step.label}</span>
              <span style={{ ...adminFonts.mono, fontSize: '12px', color: adminColors.gold }}>
                {step.value} ({pct.toFixed(0)}%)
              </span>
            </div>
            <div style={{
              height: '8px', borderRadius: '4px', background: adminColors.bg, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: '4px', width: `${pct}%`,
                background: `linear-gradient(90deg, ${adminColors.gold}, ${adminColors.gold}dd)`,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 6: Create ProjectionSlider component**

```typescript
// src/components/admin/ProjectionSlider.tsx
'use client'
import { useState } from 'react'
import { adminColors, adminFonts, adminCard } from './admin-tokens'

interface ProjectionSliderProps {
  totalUsers: number
}

export function ProjectionSlider({ totalUsers }: ProjectionSliderProps) {
  const [conversionPct, setConversionPct] = useState(5)
  const [price, setPrice] = useState(10)

  const proUsers = Math.round(totalUsers * conversionPct / 100)
  const mrr = proUsers * price
  const arr = mrr * 12

  // Costs estimate (all free tier for now)
  const supabaseCost = 0
  const vercelCost = 0
  const claudeCost = Math.round(proUsers * 0.5) // ~$0.50 per pro user/month estimate
  const totalCost = supabaseCost + vercelCost + claudeCost
  const profit = mrr - totalCost

  return (
    <div style={{ ...adminCard }}>
      <span style={{ ...adminFonts.label, display: 'block', marginBottom: '16px' }}>SIMULADOR DE PROYECCIONES</span>

      {/* Conversion slider */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ ...adminFonts.body, fontSize: '13px' }}>Conversion rate</span>
          <span style={{ ...adminFonts.kpiSmall, fontSize: '1.1rem' }}>{conversionPct}%</span>
        </div>
        <input type="range" min={1} max={20} value={conversionPct}
          onChange={e => setConversionPct(+e.target.value)}
          style={{ width: '100%', accentColor: adminColors.gold }}
        />
      </div>

      {/* Price slider */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ ...adminFonts.body, fontSize: '13px' }}>Precio mensual</span>
          <span style={{ ...adminFonts.kpiSmall, fontSize: '1.1rem' }}>${price}</span>
        </div>
        <input type="range" min={5} max={20} value={price}
          onChange={e => setPrice(+e.target.value)}
          style={{ width: '100%', accentColor: adminColors.gold }}
        />
      </div>

      {/* Results */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px',
        padding: '16px', background: adminColors.bg, borderRadius: '8px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...adminFonts.kpiSmall }}>${mrr.toLocaleString()}</div>
          <div style={adminFonts.label}>MRR</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...adminFonts.kpiSmall }}>${arr.toLocaleString()}</div>
          <div style={adminFonts.label}>ARR</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...adminFonts.kpiSmall, color: profit >= 0 ? adminColors.green : adminColors.red }}>
            ${profit.toLocaleString()}
          </div>
          <div style={adminFonts.label}>PROFIT/MES</div>
        </div>
      </div>

      <div style={{ marginTop: '12px', ...adminFonts.mono, fontSize: '10px', textAlign: 'center' }}>
        {proUsers} usuarios Pro de {totalUsers} totales | Costos est. ${totalCost}/mes
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/AdminTable.tsx src/components/admin/AdminChart.tsx src/components/admin/LiveFeed.tsx src/components/admin/HealthGrid.tsx src/components/admin/FunnelChart.tsx src/components/admin/ProjectionSlider.tsx
git commit -m "feat(admin): 6 componentes UI — tabla, chart, feed, health, funnel, proyecciones"
```

---

## Task 4: New API Routes (live, feed, analytics, golf-ops, finance)

**Files:**
- Create: `src/app/api/admin/live/route.ts`
- Create: `src/app/api/admin/feed/route.ts`
- Create: `src/app/api/admin/analytics/route.ts`
- Create: `src/app/api/admin/golf-ops/route.ts`
- Create: `src/app/api/admin/finance/route.ts`
- Modify: `src/app/api/admin/overview/route.ts`

- [ ] **Step 1: Create `/api/admin/live` route**

Returns: active users (last 15min in analytics_events), live rounds (rondas_libres where estado='en_curso'), supabase ping.

```typescript
// src/app/api/admin/live/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const admin = createAdminClient()
  const fifteenMinAgo = new Date(Date.now() - 15 * 60_000).toISOString()

  const [activeUsersRes, liveRoundsRes, supabasePing] = await Promise.all([
    admin.from('analytics_events')
      .select('user_id')
      .gte('created_at', fifteenMinAgo)
      .not('user_id', 'is', null),
    admin.from('rondas_libres')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'en_curso'),
    admin.from('profiles').select('id').limit(1).then(r => ({ ok: !r.error }))
      .catch(() => ({ ok: false })),
  ])

  // Count unique users
  const uniqueUsers = new Set((activeUsersRes.data ?? []).map((e: { user_id: string }) => e.user_id))

  return NextResponse.json({
    activeUsers: uniqueUsers.size,
    liveRounds: liveRoundsRes.count ?? 0,
    supabaseOk: supabasePing.ok,
    timestamp: new Date().toISOString(),
  })
}
```

- [ ] **Step 2: Create `/api/admin/feed` route**

Returns last 50 analytics events with user names joined.

```typescript
// src/app/api/admin/feed/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'

const EVENT_CONFIG: Record<string, { icon: string; type: string; template: string }> = {
  ronda_creada: { icon: '\u26F3', type: 'round', template: '{name} cre\u00F3 una ronda libre' },
  score_registrado: { icon: '\uD83C\uDFCC\uFE0F', type: 'score', template: '{name} registr\u00F3 score' },
  torneo_creado: { icon: '\uD83C\uDFC6', type: 'tournament', template: '{name} cre\u00F3 un torneo' },
  tarjeta_historica_agregada: { icon: '\uD83D\uDCCB', type: 'score', template: '{name} agreg\u00F3 tarjeta hist\u00F3rica' },
  taiger_session_start: { icon: '\uD83D\uDC2F', type: 'taiger', template: '{name} inici\u00F3 sesi\u00F3n tAIger' },
  user_registered: { icon: '\uD83D\uDC64', type: 'register', template: '{name} se registr\u00F3 en la plataforma' },
  ronda_finalizada: { icon: '\u2705', type: 'round', template: '{name} finaliz\u00F3 su ronda' },
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const admin = createAdminClient()

  const { data: rawEvents } = await admin.from('analytics_events')
    .select('id, event_type, created_at, user_id, metadata')
    .order('created_at', { ascending: false })
    .limit(50)

  if (!rawEvents?.length) return NextResponse.json({ events: [] })

  // Get unique user IDs to fetch names
  const userIds = [...new Set(rawEvents.filter(e => e.user_id).map(e => e.user_id))]
  const { data: profiles } = userIds.length > 0
    ? await admin.from('profiles').select('id, name').in('id', userIds)
    : { data: [] }

  const nameMap = new Map((profiles ?? []).map(p => [p.id, p.name || 'Usuario']))

  const events = rawEvents.map(e => {
    const config = EVENT_CONFIG[e.event_type] || { icon: '\u2139\uFE0F', type: 'system', template: e.event_type }
    const name = e.user_id ? (nameMap.get(e.user_id) || 'Usuario') : 'Sistema'
    const time = new Date(e.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

    return {
      id: e.id,
      time,
      icon: config.icon,
      type: config.type,
      message: config.template.replace('{name}', name),
    }
  })

  return NextResponse.json({ events })
}
```

- [ ] **Step 3: Create `/api/admin/analytics` route**

Returns: growth data (new users per day last 30d), funnel counts, retention D1/D7/D30, engagement stats.

```typescript
// src/app/api/admin/analytics/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const admin = createAdminClient()
  const now = Date.now()
  const d7 = new Date(now - 7 * 86400000).toISOString()
  const d30 = new Date(now - 30 * 86400000).toISOString()
  const d90 = new Date(now - 90 * 86400000).toISOString()

  // Parallel queries
  const [
    totalUsers, new7d, new30d, new90d,
    allProfiles, usersWithRounds, usersWithHistorical,
    usersWithTaiger, roundsPerUser, topUsers,
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', d7),
    admin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', d30),
    admin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', d90),
    // For funnel: fetch all user IDs to cross-reference
    admin.from('profiles').select('id, created_at').order('created_at', { ascending: false }),
    // Users who have at least one ronda libre (as jugador)
    admin.from('ronda_libre_jugadores').select('user_id').not('user_id', 'is', null),
    admin.from('historical_rounds').select('user_id').not('user_id', 'is', null),
    admin.from('taiger_sessions').select('user_id'),
    // Rounds per user for engagement
    admin.from('ronda_libre_jugadores').select('user_id, id').not('user_id', 'is', null),
    // Top users by activity (analytics_events)
    admin.from('analytics_events').select('user_id').not('user_id', 'is', null).gte('created_at', d30),
  ])

  const total = totalUsers.count ?? 0

  // Funnel
  const uniqueRoundUsers = new Set((usersWithRounds.data ?? []).map((r: { user_id: string }) => r.user_id)).size
  const uniqueHistoricalUsers = new Set((usersWithHistorical.data ?? []).map((r: { user_id: string }) => r.user_id)).size
  const uniqueTaigerUsers = new Set((usersWithTaiger.data ?? []).map((r: { user_id: string }) => r.user_id)).size

  // Growth by day (last 30 days)
  const profilesByDay: Record<string, number> = {}
  for (const p of (allProfiles.data ?? [])) {
    const day = p.created_at.split('T')[0]
    profilesByDay[day] = (profilesByDay[day] || 0) + 1
  }
  const growth = Object.entries(profilesByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([date, count]) => ({ date: date.slice(5), count }))

  // Engagement: rounds per user distribution
  const roundsByUser: Record<string, number> = {}
  for (const r of (roundsPerUser.data ?? [])) {
    if (r.user_id) roundsByUser[r.user_id] = (roundsByUser[r.user_id] || 0) + 1
  }
  const roundCounts = Object.values(roundsByUser)
  const avgRoundsPerUser = roundCounts.length > 0 ? roundCounts.reduce((a, b) => a + b, 0) / roundCounts.length : 0

  // Top active users (by event count in last 30 days)
  const eventsByUser: Record<string, number> = {}
  for (const e of (topUsers.data ?? [])) {
    if (e.user_id) eventsByUser[e.user_id] = (eventsByUser[e.user_id] || 0) + 1
  }
  const topUserIds = Object.entries(eventsByUser)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([uid, count]) => ({ userId: uid, events: count }))

  // Fetch names for top users
  const topIds = topUserIds.map(u => u.userId)
  const { data: topProfiles } = topIds.length > 0
    ? await admin.from('profiles').select('id, name, email').in('id', topIds)
    : { data: [] }
  const nameMap = new Map((topProfiles ?? []).map(p => [p.id, p.name || p.email || 'Usuario']))

  return NextResponse.json({
    growth: {
      total,
      new7d: new7d.count ?? 0,
      new30d: new30d.count ?? 0,
      new90d: new90d.count ?? 0,
      byDay: growth,
    },
    funnel: {
      registered: total,
      firstRound: uniqueRoundUsers,
      historicalCard: uniqueHistoricalUsers,
      taiger: uniqueTaigerUsers,
      pro: 0,
    },
    engagement: {
      avgRoundsPerUser: Math.round(avgRoundsPerUser * 10) / 10,
      totalRoundsPlayed: roundCounts.reduce((a, b) => a + b, 0),
      topUsers: topUserIds.map(u => ({
        ...u,
        name: nameMap.get(u.userId) || 'Usuario',
      })),
    },
  })
}
```

- [ ] **Step 4: Create `/api/admin/golf-ops` route**

```typescript
// src/app/api/admin/golf-ops/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const admin = createAdminClient()
  const d30 = new Date(Date.now() - 30 * 86400000).toISOString()

  const [
    tournaments, tournamentsList,
    rondasLibres, rondasEnCurso, rondasFinalizadas,
    totalRounds, totalHoleScores,
    taigerSessions, taigerSessionsList, patterns,
    courses,
  ] = await Promise.all([
    admin.from('tournaments').select('*', { count: 'exact', head: true }),
    admin.from('tournaments').select('id, name, slug, status, created_at, hole_count').order('created_at', { ascending: false }).limit(20),
    admin.from('rondas_libres').select('*', { count: 'exact', head: true }),
    admin.from('rondas_libres').select('*', { count: 'exact', head: true }).eq('estado', 'en_curso'),
    admin.from('rondas_libres').select('*', { count: 'exact', head: true }).eq('estado', 'finalizada'),
    admin.from('rounds').select('*', { count: 'exact', head: true }),
    admin.from('hole_scores').select('*', { count: 'exact', head: true }),
    admin.from('taiger_sessions').select('*', { count: 'exact', head: true }),
    admin.from('taiger_sessions').select('id, session_type, created_at, user_id').order('created_at', { ascending: false }).limit(20),
    admin.from('player_patterns').select('pattern_type, status'),
    admin.from('courses').select('id, nombre, ciudad, pais'),
  ])

  // Pattern distribution
  const patternDist: Record<string, number> = {}
  for (const p of (patterns.data ?? [])) {
    patternDist[p.pattern_type] = (patternDist[p.pattern_type] || 0) + 1
  }

  // tAIger session type distribution
  const sessionTypes: Record<string, number> = {}
  for (const s of (taigerSessionsList.data ?? [])) {
    sessionTypes[s.session_type] = (sessionTypes[s.session_type] || 0) + 1
  }

  return NextResponse.json({
    tournaments: {
      total: tournaments.count ?? 0,
      list: tournamentsList.data ?? [],
    },
    rondasLibres: {
      total: rondasLibres.count ?? 0,
      enCurso: rondasEnCurso.count ?? 0,
      finalizadas: rondasFinalizadas.count ?? 0,
    },
    scoring: {
      totalRounds: totalRounds.count ?? 0,
      totalHoleScores: totalHoleScores.count ?? 0,
    },
    taiger: {
      totalSessions: taigerSessions.count ?? 0,
      sessionTypes,
      recentSessions: taigerSessionsList.data ?? [],
      patternDistribution: patternDist,
    },
    courses: {
      total: (courses.data ?? []).length,
      list: courses.data ?? [],
    },
  })
}
```

- [ ] **Step 5: Create `/api/admin/finance` route**

```typescript
// src/app/api/admin/finance/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const admin = createAdminClient()

  const [
    totalUsers, taigerSessions, pushSubs,
    profiles, tournaments, rounds, holeScores,
    historical, rondasLibres, analyticsEvents,
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('taiger_sessions').select('*', { count: 'exact', head: true }),
    admin.from('push_subscriptions').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('tournaments').select('*', { count: 'exact', head: true }),
    admin.from('rounds').select('*', { count: 'exact', head: true }),
    admin.from('hole_scores').select('*', { count: 'exact', head: true }),
    admin.from('historical_rounds').select('*', { count: 'exact', head: true }),
    admin.from('rondas_libres').select('*', { count: 'exact', head: true }),
    admin.from('analytics_events').select('*', { count: 'exact', head: true }),
  ])

  // Estimate costs based on usage
  const taigerCalls = taigerSessions.count ?? 0
  const estimatedClaudeCost = Math.round(taigerCalls * 0.02 * 100) / 100 // ~$0.02 per session

  return NextResponse.json({
    totalUsers: totalUsers.count ?? 0,
    proUsers: 0, // Not yet launched
    mrr: 0,
    arr: 0,
    costs: {
      supabase: { plan: 'Free', cost: 0, usage: `${(profiles.count ?? 0) + (rounds.count ?? 0) + (holeScores.count ?? 0)} rows`, limit: '500MB / 50K rows' },
      vercel: { plan: 'Hobby', cost: 0, usage: 'Serverless', limit: '100GB bandwidth' },
      claude: { plan: 'Pay-per-use', cost: estimatedClaudeCost, usage: `${taigerCalls} sesiones`, limit: 'N/A' },
      push: { plan: 'VAPID (free)', cost: 0, usage: `${pushSubs.count ?? 0} suscripciones`, limit: 'N/A' },
    },
    dbStats: {
      profiles: profiles.count ?? 0,
      tournaments: tournaments.count ?? 0,
      rounds: rounds.count ?? 0,
      hole_scores: holeScores.count ?? 0,
      historical_rounds: historical.count ?? 0,
      rondas_libres: rondasLibres.count ?? 0,
      analytics_events: analyticsEvents.count ?? 0,
    },
  })
}
```

- [ ] **Step 6: Update `/api/admin/overview` to include sparkline data**

Add daily user counts for last 30 days to enable sparklines on KPI cards.

Modify: `src/app/api/admin/overview/route.ts` — After existing queries, add a query for profiles grouped by day (last 30d) and return as `sparklines.newUsersDaily: number[]`.

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 8: Commit**

```bash
git add src/app/api/admin/live/ src/app/api/admin/feed/ src/app/api/admin/analytics/ src/app/api/admin/golf-ops/ src/app/api/admin/finance/ src/app/api/admin/overview/route.ts
git commit -m "feat(admin): 5 API routes nuevas + overview mejorado — datos reales para Command Center"
```

---

## Task 5: New Admin Layout (Sidebar + TopBar + Content)

**Files:**
- Rewrite: `src/app/admin/layout.tsx`

- [ ] **Step 1: Rewrite admin layout**

Replace horizontal tab bar with sidebar layout. Keep the auth check logic. Add AdminSidebar + AdminTopBar. Handle responsive: sidebar collapsed on tablet, hidden on mobile with hamburger + mobile bottom nav.

The layout must:
1. Keep the existing auth check (`profiles.role === 'admin'`)
2. Render AdminSidebar (left)
3. Render AdminTopBar (top of content area)
4. Render `{children}` in a scrollable content area
5. Add CSS animations (@keyframes shimmer, pulse, slideIn) as a `<style>` tag
6. On mobile (<768px): hide sidebar, show bottom navigation with 5 icons
7. Use state for sidebar collapsed/expanded, default: expanded on desktop

- [ ] **Step 2: Verify builds correctly**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/layout.tsx
git commit -m "feat(admin): layout sidebar + topbar — reemplaza tabs horizontales"
```

---

## Task 6: Command Center Page (page.tsx)

**Files:**
- Rewrite: `src/app/admin/page.tsx`

- [ ] **Step 1: Rewrite the Command Center page**

This is the main admin page. It uses:
- `AdminCard` (6 KPI cards in a responsive grid)
- `AdminChart` (activity chart, area type, last 30 days)
- `LiveFeed` (real-time activity)
- `HealthGrid` (service status)
- Alert panel (abandoned rounds, inactive users, service issues)

Data sources:
- `/api/admin/overview` for KPIs (with sparkline data)
- `/api/admin/health` for services
- Activity chart comes from `/api/admin/activity`
- LiveFeed handles its own data fetching

Polling:
- Overview: every 30s
- Health: every 30s
- Activity: every 60s

Layout:
```
[KPI] [KPI] [KPI] [KPI] [KPI] [KPI]     <- responsive grid
[────── Activity Chart ──────]            <- full width
[── Live Feed ──] [── Health + Alerts ──] <- 2 columns
```

- [ ] **Step 2: Verify builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(admin): Command Center — KPIs live, activity chart, feed, health grid"
```

---

## Task 7: Analytics Page

**Files:**
- Create: `src/app/admin/analytics/page.tsx`

- [ ] **Step 1: Create the Analytics page**

Uses:
- `AdminCard` for growth KPIs (new 7d, 30d, 90d, activation rate)
- `AdminChart` (bar chart for new users by day)
- `FunnelChart` (activation funnel: Registered → First round → Historical → tAIger → Pro)
- `AdminTable` for top 10 most active users
- Engagement stats section

Data source: `/api/admin/analytics`
Polling: every 60s

Layout:
```
[KPI] [KPI] [KPI] [KPI]                  <- growth metrics
[──── New Users Chart (bar) ────]         <- full width
[── Funnel ──] [── Top Users Table ──]    <- 2 columns
[── Engagement Stats ──]                  <- full width
```

- [ ] **Step 2: Verify builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/analytics/page.tsx
git commit -m "feat(admin): Analytics — crecimiento, funnel, engagement, top usuarios"
```

---

## Task 8: Golf Operations Page

**Files:**
- Create: `src/app/admin/golf-ops/page.tsx`

- [ ] **Step 1: Create the Golf Operations page**

Uses:
- `AdminCard` for golf KPIs (tournaments, rounds, courses, tAIger sessions)
- `AdminTable` for tournaments list
- `AdminTable` for users (reuses `/api/admin/users` endpoint)
- `AdminBadge` for tournament/round status
- tAIger section with session type distribution

Data sources:
- `/api/admin/golf-ops` for golf data
- `/api/admin/users` for user table

The page has tabs within it (Tournaments | Rounds | Users | tAIger) using local state, NOT sub-routes. Each tab shows relevant AdminCard KPIs at top and an AdminTable below.

- [ ] **Step 2: Verify builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/golf-ops/page.tsx
git commit -m "feat(admin): Golf Ops — torneos, rondas, usuarios, tAIger dashboard"
```

---

## Task 9: Finanzas Page

**Files:**
- Create: `src/app/admin/finanzas/page.tsx`

- [ ] **Step 1: Create the Finanzas page**

Uses:
- `AdminCard` for finance KPIs (MRR, ARR, total users, costs)
- `AdminTable` for cost breakdown (service, plan, cost, usage, limit)
- `ProjectionSlider` for revenue simulation
- Database stats section (row counts per table)

Data source: `/api/admin/finance`
Polling: none (manual refresh button)

Layout:
```
[KPI] [KPI] [KPI] [KPI]
[── Costs Table ──] [── Projection Slider ──]
[──── DB Stats Grid ────]
```

- [ ] **Step 2: Verify builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/finanzas/page.tsx
git commit -m "feat(admin): Finanzas — costos, proyecciones, unit economics, DB stats"
```

---

## Task 10: Sistema Page (Rewrite)

**Files:**
- Rewrite: `src/app/admin/sistema/page.tsx`

- [ ] **Step 1: Rewrite the Sistema page**

Consolidates old sistema + configuracion pages. Uses:
- `HealthGrid` for service health (with real ping data)
- `AdminCard` for DB table row counts
- Environment variables check (present/absent)
- Configuration info (app name, URLs, limits)
- Debug section with test buttons (ping each service)

Data source: `/api/admin/health`
Polling: every 30s

Layout:
```
[──── Health Grid ────]
[── DB Stats ──] [── Environment ──]
[── Configuration ──] [── Debug Tools ──]
```

- [ ] **Step 2: Verify builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/sistema/page.tsx
git commit -m "feat(admin): Sistema — health, DB stats, env vars, config, debug tools"
```

---

## Task 11: Delete Old Pages + Final Build Verification

**Files:**
- Delete: `src/app/admin/usuarios/page.tsx`
- Delete: `src/app/admin/crecimiento/page.tsx`
- Delete: `src/app/admin/golf/page.tsx`
- Delete: `src/app/admin/taiger/page.tsx`
- Delete: `src/app/admin/monetizacion/page.tsx`
- Delete: `src/app/admin/geografia/page.tsx`
- Delete: `src/app/admin/configuracion/page.tsx`

- [ ] **Step 1: Delete old admin pages**

```bash
rm src/app/admin/usuarios/page.tsx
rm src/app/admin/crecimiento/page.tsx
rm src/app/admin/golf/page.tsx
rm src/app/admin/taiger/page.tsx
rm src/app/admin/monetizacion/page.tsx
rm src/app/admin/geografia/page.tsx
rm src/app/admin/configuracion/page.tsx
```

Also remove the empty directories if they exist.

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Run full build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(admin): elimina 7 paginas antiguas reemplazadas por Command Center"
```

---

## Task 12: Documentation Update

**Files:**
- Modify: `docs/SPRINT_LOG.md`
- Modify: `docs/ESTADO_ACTUAL.md`

- [ ] **Step 1: Update SPRINT_LOG.md**

Add new entry at top of file for the admin redesign sprint.

- [ ] **Step 2: Update ESTADO_ACTUAL.md**

Update the admin section to reflect the new 5-section structure.

- [ ] **Step 3: Run update-docs script if it exists**

Run: `node scripts/update-docs.js` (if exists)

- [ ] **Step 4: Final commit with docs**

```bash
git add docs/
git commit -m "docs: sprint admin redesign — Command Center, Analytics, Golf Ops, Finanzas, Sistema"
```

- [ ] **Step 5: Push to remote**

```bash
git push origin main
```
