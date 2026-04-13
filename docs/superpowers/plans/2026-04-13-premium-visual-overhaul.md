# Premium Visual Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all 28 emojis across 13 files with Lucide React icons and apply the "Confianza tranquila" voice guide to elevate Golfers+ to premium standard.

**Architecture:** Install lucide-react, create an icon mapping module, replace emojis file by file following priority order. Create a custom tAIger+ SVG. Update copy per the 3-mode voice guide (Caddie/Clubhouse/Pro Shop). Each task is one file or one logical unit — commit after each.

**Tech Stack:** lucide-react (MIT, tree-shakeable), custom SVG for tAIger+, existing Tailwind + inline styles.

**Spec:** `docs/superpowers/specs/2026-04-13-premium-visual-audit-design.md`

---

## Task 1: Install lucide-react + create icon mapping

**Files:**
- Modify: `package.json`
- Create: `src/components/icons/index.tsx`

- [ ] **Step 1: Install lucide-react**

```bash
npm install lucide-react
```

- [ ] **Step 2: Create icon mapping module**

Create `src/components/icons/index.tsx`:

```tsx
/**
 * Golfers+ Icon System — Lucide React
 * Replaces all emoji usage in the app with consistent SVG icons.
 * Import from here, not directly from lucide-react.
 */
export {
  Home,
  Trophy,
  Radio,
  TrendingUp,
  ClipboardList,
  Upload,
  Zap,
  Play,
  Flag,
  Calendar,
  Users,
  BarChart3,
  Target,
  DollarSign,
  Wrench,
  RefreshCw,
  FileText,
  Bot,
  CheckCircle,
  Circle,
  Bell,
  Handshake,
  Sparkles,
  ChevronUp,
  ChevronDown,
  ArrowTrendingUp,
} from 'lucide-react'
```

- [ ] **Step 3: Create tAIger+ custom SVG icon**

Create `src/components/icons/TaigerIcon.tsx`:

```tsx
/**
 * tAIger+ brand icon — custom SVG tiger silhouette.
 * Minimal, geometric, premium. Matches Lucide stroke weight.
 */
export function TaigerIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Tiger face — geometric/minimal */}
      <path d="M4 4l3 4M20 4l-3 4" />
      <path d="M9 8a6 6 0 0 0-2 4c0 4 3 8 5 8s5-4 5-8a6 6 0 0 0-2-4" />
      <circle cx="10" cy="12" r="0.5" fill="currentColor" />
      <circle cx="14" cy="12" r="0.5" fill="currentColor" />
      <path d="M12 14v1.5" />
      <path d="M10.5 16.5c.5.5 2.5.5 3 0" />
      {/* Stripes */}
      <path d="M8.5 10l1.5 1M15.5 10l-1.5 1" />
    </svg>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/icons/
git commit -m "feat: instalar lucide-react + módulo de iconos + tAIger SVG custom"
```

---

## Task 2: Navbar — Replace 10 emojis with Lucide icons (P0)

**Files:**
- Modify: `src/components/Navbar.tsx`

The Navbar uses an `icon` string prop in menu item objects. Replace emoji strings with JSX elements.

- [ ] **Step 1: Add icon imports to Navbar**

At the top of `src/components/Navbar.tsx`, add:

```tsx
import { Home, Trophy, Radio, TrendingUp, ClipboardList, Upload, Zap, Play } from '@/components/icons'
import { TaigerIcon } from '@/components/icons/TaigerIcon'
```

- [ ] **Step 2: Change icon type from string to ReactNode**

The `menuBlocks` and `navItemsGuest` arrays use `icon: string`. Change the `icon` values from emoji strings to JSX elements. Update both the authenticated menu (~line 78-95) and guest nav (~line 99-104):

Authenticated menu items:
```tsx
{ href: '/en-vivo', icon: <Radio size={18} />, label: 'En Vivo', badge: 'LIVE' },
// ...
{ href: '/perfil/stats', icon: <TrendingUp size={18} />, label: 'Mi CPI' },
{ href: '/perfil/historial', icon: <ClipboardList size={18} />, label: 'Rondas' },
{ href: '/coach', icon: <TaigerIcon size={18} />, label: 'tAIger+', badge: 'AI' },
{ href: '/importar', icon: <Upload size={18} />, label: 'Importar' },
// ...
{ href: '/indices', icon: <Zap size={18} />, label: 'Intelligence' },
```

Guest nav items:
```tsx
{ href: '/', icon: <Home size={18} />, label: 'Inicio' },
{ href: '/leaderboard', icon: <Trophy size={18} />, label: 'Ranking' },
{ href: '/demo', icon: <Play size={18} />, label: 'Demo' },
{ href: '/indices', icon: <Zap size={18} />, label: 'Intelligence' },
```

- [ ] **Step 3: Update icon rendering in sidebar and bottom nav**

Find all places where `icon` is rendered as text (e.g., `<span>{item.icon}</span>`) and update to render as JSX (e.g., `{item.icon}` directly, since it's now a ReactNode). The icon type in the item interface changes from `string` to `React.ReactNode`.

- [ ] **Step 4: Change badge "IA" to "AI"**

Replace `badge: 'IA'` with `badge: 'AI'` on the tAIger+ menu item (more universal and premium per spec).

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit
npm run test
git add src/components/Navbar.tsx
git commit -m "refactor(navbar): emojis → Lucide icons en navegación + badge AI"
```

---

## Task 3: Landing page — Replace 6 emojis + update copy (P1)

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add icon imports**

```tsx
import { Smartphone, TrendingUp, Trophy } from '@/components/icons'
import { TaigerIcon } from '@/components/icons/TaigerIcon'
```

- [ ] **Step 2: Replace FEATURES array icons**

Replace emoji strings in the FEATURES constant (~lines 7-28):

```tsx
{ icon: <Smartphone size={24} />, title: 'Scoring en tiempo real', desc: 'Tu score, visible para todos. Al instante.' },
{ icon: <TrendingUp size={24} />, title: 'Tu indice, completo', desc: 'El handicap oficial mas tu rendimiento real en cancha.' },
{ icon: <TaigerIcon size={24} />, title: 'Tu coach personal', desc: 'Analiza tus patrones y te dice donde estan tus golpes.' },
```

- [ ] **Step 3: Replace STEPS array icons**

Replace emoji strings in the STEPS constant (~lines 32-46):

Use numbered steps (1, 2, 3) as styled spans instead of emojis. Or use Lucide icons:

```tsx
{ step: 1, title: 'Crea la competencia' },
{ step: 2, title: 'Cada jugador marca en su celular' },
{ step: 3, title: 'Ranking en vivo para todos' },
```

- [ ] **Step 4: Update icon rendering**

Anywhere the template renders `{feature.icon}` as text, update to render as JSX.

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit
npm run test
git add src/app/page.tsx
git commit -m "refactor(landing): emojis → Lucide icons + copy premium Confianza tranquila"
```

---

## Task 4: Dashboard — Replace 18 emojis + contextual copy (P1)

**Files:**
- Modify: `src/app/dashboard/page.tsx`

This file has the most emojis (18 lines). They fall into 3 patterns:

**Pattern A — Large decorative emojis (32-64px):** Replace with Lucide icons at the same size.
**Pattern B — Inline text emojis (⛳📅):** Replace with Lucide icons inline.
**Pattern C — AdminCard icon props:** Replace string with Lucide JSX.

- [ ] **Step 1: Add icon imports**

```tsx
import { Flag, Calendar, Trophy, Users, Upload, BarChart3, ClipboardList } from '@/components/icons'
import { PersonStanding } from 'lucide-react'
```

- [ ] **Step 2: Replace large decorative emojis**

Find all `<div style={{ fontSize: 'XXpx' }}>EMOJI</div>` patterns and replace with Lucide icons:

| Line (approx) | Current | Replacement |
|------|---------|-------------|
| 404 | `⛳` (48px) | `<Flag size={48} strokeWidth={1.5} />` |
| 420 | `🏌️` (32px) | `<PersonStanding size={32} strokeWidth={1.5} />` |
| 439 | `📥` (32px) | `<Upload size={32} strokeWidth={1.5} />` |
| 465 | `⛳` (32px) | `<Flag size={32} strokeWidth={1.5} />` |
| 475 | `🏆` (32px) | `<Trophy size={32} strokeWidth={1.5} />` |
| 495 | `📊` (24px) | `<BarChart3 size={24} strokeWidth={1.5} />` |
| 514 | `📋` (48px) | `<ClipboardList size={48} strokeWidth={1.5} />` |
| 551 | `🏌️` (48px) | `<PersonStanding size={48} strokeWidth={1.5} />` |
| 587 | `⛳` (48px) | `<Flag size={48} strokeWidth={1.5} />` |

- [ ] **Step 3: Replace inline text emojis**

Replace `⛳ {courseName}` with `<Flag size={14} className="inline" /> {courseName}`.
Replace `📅 {date}` with `<Calendar size={14} className="inline" /> {date}`.

These appear on lines ~239-240, ~533-534, ~566-567.

- [ ] **Step 4: Replace AdminCard icon props**

Lines ~628-630:
```tsx
{ label: 'Torneos organizados', value: totalTournaments ?? 0, icon: <Trophy size={20} /> },
{ label: 'Jugadores inscritos', value: totalPlayers ?? 0, icon: <Users size={20} /> },
{ label: 'Ultimo torneo', value: latestTournament?.name || '—', icon: <Calendar size={20} />, small: true },
```

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit
npm run test
git add src/app/dashboard/page.tsx
git commit -m "refactor(dashboard): 18 emojis → Lucide icons + copy contextual"
```

---

## Task 5: Leaderboard + Ronda Libre — Replace emojis (P2)

**Files:**
- Modify: `src/components/LeaderboardTable.tsx`
- Modify: `src/app/ronda-libre/[codigo]/page.tsx`

- [ ] **Step 1: LeaderboardTable — replace 2 emojis**

Line 68: Replace `🏆` in feed announcement with Lucide Trophy inline.
Line 285: Replace `⛳` with `<Flag size={17} />`.

- [ ] **Step 2: Ronda Libre page — replace 7 emojis**

| Line | Current | Replacement |
|------|---------|-------------|
| 36 | `✅` / `🔔` | `<CheckCircle size={20} />` / `<Bell size={20} />` |
| 205, 624 | `⛳` | `<Flag size={...} />` |
| 652 | `🏌️` | `<PersonStanding size={64} />` |
| 823 | `📋` | `<ClipboardList size={18} />` |
| 860, 964 | `🤝` / `🏆` | `<Handshake size={48} />` / `<Trophy size={48} />` |

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
npm run test
git add src/components/LeaderboardTable.tsx src/app/ronda-libre/[codigo]/page.tsx
git commit -m "refactor: emojis → Lucide en leaderboard + ronda libre"
```

---

## Task 6: Admin pages — Replace all emojis (P3)

**Files:**
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/admin/analytics/page.tsx`
- Modify: `src/app/admin/finanzas/page.tsx`
- Modify: `src/app/admin/golf-ops/page.tsx`

All admin pages use `<AdminCard icon="EMOJI" ...>`. Change the AdminCard `icon` prop type from `string` to `React.ReactNode` and pass Lucide components.

- [ ] **Step 1: Update AdminCard component if needed**

Find where AdminCard is defined. If `icon` is typed as `string`, change to `React.ReactNode` and update rendering from `<span>{icon}</span>` to `{icon}`.

- [ ] **Step 2: admin/page.tsx — replace 6 Unicode-encoded emojis**

Replace all `\uD83D...` sequences with Lucide icons:
```tsx
<AdminCard icon={<Users size={20} />} label="Total Usuarios" ... />
<AdminCard icon={<Sparkles size={20} />} label="Nuevos 7d" ... />
<AdminCard icon={<Flag size={20} />} label="Rondas Libres" ... />
<AdminCard icon={<TaigerIcon size={20} />} label="tAIger Sessions" ... />
<AdminCard icon={<Trophy size={20} />} label="Torneos" ... />
<AdminCard icon={<CheckCircle size={20} />} label="Health Score" ... />
```

- [ ] **Step 3: admin/analytics — replace 6 emojis**

```tsx
icon={<Users size={20} />}       // was 👥
icon={<ChevronUp size={20} />}   // was 📈
icon={<BarChart3 size={20} />}   // was 📊
icon={<ChevronDown size={20} />} // was 📉
icon={<PersonStanding size={20} />}  // was 🏌️
icon={<Target size={20} />}      // was 🎯
```

- [ ] **Step 4: admin/finanzas — replace 4 emojis**

```tsx
icon={<DollarSign size={20} />}  // was 💰
icon={<ChevronUp size={20} />}   // was 📈
icon={<Users size={20} />}       // was 👥
icon={<Wrench size={20} />}      // was 🔧
```

- [ ] **Step 5: admin/golf-ops — replace 8 emojis**

```tsx
icon={<Trophy size={20} />}      // was 🏆
icon={<Flag size={20} />}        // was ⛳
icon={<Radio size={20} />}       // was 🟢
icon={<CheckCircle size={20} />} // was ✅
icon={<FileText size={20} />}    // was 📝
icon={<RefreshCw size={20} />}   // was 🔄
icon={<Target size={20} />}      // was 🎯
icon={<TaigerIcon size={20} />}  // was 🤖
```

- [ ] **Step 6: Verify and commit**

```bash
npx tsc --noEmit
npm run test
git add src/app/admin/ src/components/admin/
git commit -m "refactor(admin): todos los emojis → Lucide icons en 4 dashboards"
```

---

## Task 7: Remaining files — Import, Coach, Indices, Feed (P3)

**Files:**
- Modify: `src/components/import/StepReview.tsx`
- Modify: `src/app/coach/onboarding/page.tsx`
- Modify: `src/app/indices/page.tsx`
- Modify: `src/app/api/admin/feed/route.ts`

- [ ] **Step 1: StepReview.tsx — replace 2 emojis**

Line 374: `✅` → `<CheckCircle size={12} className="text-green-500" />`
Line 397: `⛳` → `<Flag size={14} />`

- [ ] **Step 2: coach/onboarding — replace 3 emojis**

Line 21: `'⛳ Base de juego'` → `'Base de juego'` (remove emoji from badge text)
Line 168: `mentalEmoji = '⚡'` → use Lucide `<Zap />` or remove emoji variable
Line 382: `emoji: '⛳'` → use Lucide `<Flag />`

- [ ] **Step 3: indices/page.tsx — replace 1 emoji**

Line 188: `icon: '⛳'` → `icon: <Flag size={16} />`

- [ ] **Step 4: api/admin/feed/route.ts — replace 6 emojis**

This is a backend route that sends icon strings to the frontend. Replace with Lucide icon names (strings) that the frontend AdminFeed component renders:

```ts
ronda_creada: { icon: 'flag', type: 'round', template: '{name} creo una ronda libre' },
score_registrado: { icon: 'person-standing', type: 'score', template: '{name} registro score' },
torneo_creado: { icon: 'trophy', type: 'tournament', template: '{name} creo un torneo' },
tarjeta_historica_agregada: { icon: 'clipboard-list', type: 'score', template: '{name} agrego tarjeta historica' },
taiger_session_start: { icon: 'taiger', type: 'taiger', template: '{name} inicio sesion tAIger' },
ronda_finalizada: { icon: 'check-circle', type: 'round', template: '{name} finalizo su ronda' },
```

Then update the frontend feed renderer to map icon name strings to Lucide components.

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit
npm run test
git add src/components/import/ src/app/coach/ src/app/indices/ src/app/api/admin/feed/
git commit -m "refactor: emojis → Lucide en import, coach, indices y feed"
```

---

## Task 8: Voice guide + empty states copy (P4)

**Files:**
- Create: `src/lib/voice-guide.ts`
- Modify: Various empty state components as found

- [ ] **Step 1: Create voice guide constants**

Create `src/lib/voice-guide.ts`:

```ts
/**
 * Golfers+ Voice Guide — "Confianza tranquila"
 *
 * 3 modos: Caddie (cancha), Clubhouse (stats/social), Pro Shop (admin/errors)
 * Cada texto en la app debe pasar por esta referencia.
 */

export const EMPTY_STATES = {
  noRounds: 'Tu historial empieza con la primera ronda',
  noStats: 'Con 3 rondas, aqui veras tu evolucion',
  noTournaments: 'Organiza tu primera competencia',
  noCoach: 'tAIger+ necesita conocer tu juego. Juega 3 rondas',
  noLeaderboard: 'Cuando haya jugadores en cancha, aqui los veras',
  noConnection: 'Sin conexion. Tus datos se guardaran cuando vuelvas',
  noImports: 'Conecta tu Garmin o sube una foto para traer tu historial',
} as const

export const ERROR_MESSAGES = {
  saveFailed: 'Error guardando. Reintentar',
  roundFinalized: 'Ronda finalizada',
  tournamentInactive: 'Torneo inactivo',
  noPermission: 'Sin permisos',
  sessionExpired: 'Sesion expirada. Inicia sesion',
} as const
```

- [ ] **Step 2: Update empty states in dashboard**

Find empty state divs in `src/app/dashboard/page.tsx` and replace generic copy with constants from `EMPTY_STATES`.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
npm run test
git add src/lib/voice-guide.ts src/app/dashboard/
git commit -m "feat: guia de voz Confianza tranquila + empty states premium"
```

---

## Task 9: Final verification — zero emojis audit

**Files:** None (verification only)

- [ ] **Step 1: Grep for remaining emojis**

```bash
grep -rn '[🏠🏆✦⚡📊📋🐯📥🟢📱🤖⛳📅🏌️👥🆕💚📈📉🎯💰🔧📝🔄✅🔔🤝❤️🥈🥉]' src/ --include='*.tsx' --include='*.ts' | grep -v node_modules | grep -v __tests__
```

Expected: 0 results.

- [ ] **Step 2: Full test suite**

```bash
npx tsc --noEmit
npm run test
npm run build
```

All must pass.

- [ ] **Step 3: Commit any stragglers and push**

```bash
git push origin main
```

---

## Summary

| Task | Files | Emojis removed | Priority |
|------|-------|---------------|----------|
| 1 | Icons module + install | 0 (setup) | P0 |
| 2 | Navbar | 10 | P0 |
| 3 | Landing | 6 | P1 |
| 4 | Dashboard | 18 | P1 |
| 5 | Leaderboard + Ronda | 9 | P2 |
| 6 | Admin (4 pages) | 24 | P3 |
| 7 | Import + Coach + Indices + Feed | 12 | P3 |
| 8 | Voice guide + empty states | 0 (copy) | P4 |
| 9 | Final audit | 0 (verify) | P4 |
| **Total** | **13 files** | **79 emoji instances** | |
