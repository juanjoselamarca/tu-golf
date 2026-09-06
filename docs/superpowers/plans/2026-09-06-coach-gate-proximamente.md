# Coach Gate "Próximamente" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate el coach tAIger+ para que solo beta testers con `coach_access_enabled = true` vean el dashboard; el resto ve una pantalla premium "próximamente". Además, arreglar el fallback Gemini en Vercel para que beta testers puedan usar el coach degradado.

**Architecture:** Nuevo campo boolean `coach_access_enabled` en `profiles` (default false). Gate server-side en `page.tsx` + `layout.tsx` del coach. Componente `CoachGatePage` reutiliza `TaigerHero`. Sin cambios al gateway ni al Navbar.

**Tech Stack:** Next.js 14 server components, Supabase (SQL migration), TypeScript, Tailwind-free inline styles (patron coach existente).

**Spec:** `docs/superpowers/specs/2026-09-06-coach-gate-proximamente-design.md`

---

### Task 1: Migración SQL — agregar `coach_access_enabled` a profiles

**Files:**
- Create: `supabase/migrations/20260906_coach_access_enabled.sql`

- [ ] **Step 1: Crear archivo de migración**

```sql
-- supabase/migrations/20260906_coach_access_enabled.sql
-- Gate de acceso al coach tAIger+. Default false = pantalla "próximamente".
-- Beta testers se habilitan manualmente.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS coach_access_enabled boolean NOT NULL DEFAULT false;

-- Habilitar beta testers actuales
UPDATE profiles SET coach_access_enabled = true
WHERE id IN (
  '98c5cb7a-1c0b-4a64-a773-8bd013a92317',  -- Juanjo
  'a6e0df09-e259-4229-bdb0-f1cb0558e98b'   -- Nicolás Claro
);
```

- [ ] **Step 2: Ejecutar migración contra prod**

```bash
node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/20260906_coach_access_enabled.sql
```

Expected: sin errores. Si la columna ya existe, `IF NOT EXISTS` lo ignora.

- [ ] **Step 3: Verificar que la columna existe y los beta testers están habilitados**

```bash
node --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('profiles')
    .select('id, name, coach_access_enabled')
    .in('id', ['98c5cb7a-1c0b-4a64-a773-8bd013a92317', 'a6e0df09-e259-4229-bdb0-f1cb0558e98b']);
  data?.forEach(p => console.log(p.name, '| coach_access_enabled:', p.coach_access_enabled));
})();
"
```

Expected:
```
Juan José Lamarca | coach_access_enabled: true
Nicolás Claro | coach_access_enabled: true
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260906_coach_access_enabled.sql
git commit -m "feat(db): agregar coach_access_enabled a profiles para gate tAIger+"
```

---

### Task 2: Componente `CoachGatePage`

**Files:**
- Create: `src/app/coach/components/CoachGatePage.tsx`

- [ ] **Step 1: Crear el componente CoachGatePage**

```tsx
// src/app/coach/components/CoachGatePage.tsx
import Link from 'next/link'
import { TaigerHero } from '@/components/coach/TaigerHero'

/**
 * Pantalla "próximamente" para usuarios sin acceso al coach.
 * Se muestra en vez del dashboard cuando coach_access_enabled = false.
 * Server component — sin JS innecesario en el cliente.
 */
export function CoachGatePage() {
  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px 80px' }}>
      <TaigerHero subtitle="Tu coach de rendimiento con inteligencia artificial" />

      {/* Badge "En desarrollo" */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
        padding: '6px 14px',
        background: 'rgba(196,153,42,0.1)',
        border: '1px solid rgba(196,153,42,0.2)',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '1.5px',
        textTransform: 'uppercase' as const,
        color: 'var(--brand-on-bg)',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--brand-on-bg)',
          animation: 'gatePulse 2s ease-in-out infinite',
        }} />
        En desarrollo
      </div>

      {/* Copy principal */}
      <div style={{ marginTop: 28 }}>
        <h3 style={{
          fontFamily: '"Playfair Display", serif',
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--text)',
          lineHeight: 1.3,
          marginBottom: 16,
        }}>
          Tu coach de golf con inteligencia artificial
        </h3>
        <p style={{
          fontSize: 15,
          lineHeight: 1.65,
          color: 'var(--text-2)',
          marginBottom: 12,
        }}>
          Estamos construyendo algo especial: un coach que{' '}
          <span style={{ color: 'var(--brand-on-bg)', fontWeight: 500 }}>
            analiza tu juego real
          </span>
          , detecta patrones en tus rondas y te ayuda a bajar tu handicap
          con recomendaciones personalizadas.
        </p>
      </div>

      {/* Features preview */}
      <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <GateFeatureRow
          icon={<BarChartIcon />}
          title="Análisis de patrones"
          description="Detecta tendencias en tu juego que no ves a simple vista"
        />
        <GateFeatureRow
          icon={<ClockIcon />}
          title="Psicología deportiva"
          description="Mide tu costo mental y te ayuda a mantener la calma bajo presión"
        />
        <GateFeatureRow
          icon={<ChatIcon />}
          title="Conversación natural"
          description="Habla con tu coach como si fuera tu pro — entiende contexto y responde con criterio"
        />
      </div>

      {/* Divider */}
      <div style={{
        width: '100%', height: 1,
        background: 'rgba(196,153,42,0.1)',
        margin: '32px 0',
      }} />

      {/* CTA */}
      <div style={{ textAlign: 'center' }}>
        <p style={{
          fontSize: 13,
          color: 'var(--text-3)',
          marginBottom: 20,
        }}>
          tAIger+ estará disponible próximamente para todos los usuarios.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '14px 28px',
            borderRadius: 12,
            border: '1px solid rgba(196,153,42,0.25)',
            background: 'transparent',
            color: 'var(--brand-on-bg)',
            fontFamily: '"DM Sans", sans-serif',
            fontSize: 15,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Volver al inicio
        </Link>
      </div>

      {/* Keyframes para el dot pulsante */}
      <style>{`
        @keyframes gatePulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

/* ---------- Feature row sub-components ---------- */

function GateFeatureRow({ icon, title, description }: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: 'rgba(196,153,42,0.08)',
        border: '1px solid rgba(196,153,42,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        color: 'var(--brand-on-bg)',
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.4 }}>
          {description}
        </div>
      </div>
    </div>
  )
}

function BarChartIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M12 20V10M18 20V4M6 20v-4" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx={12} cy={12} r={10} />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
```

- [ ] **Step 2: Verificar que TypeScript compila**

```bash
npx tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/coach/components/CoachGatePage.tsx
git commit -m "feat(coach): componente CoachGatePage con pantalla próximamente premium"
```

---

### Task 3: Gate en `page.tsx` — condicional server-side

**Files:**
- Modify: `src/app/coach/page.tsx` (líneas 118-131)

- [ ] **Step 1: Agregar import de CoachGatePage al inicio del archivo**

Agregar al bloque de imports existente (después de línea 14, junto a los otros imports de coach):

```typescript
import { CoachGatePage } from './components/CoachGatePage'
```

- [ ] **Step 2: Agregar check de acceso después del auth check**

Después de la línea 121 (`if (!user) redirect('/login?next=/coach')`), agregar la query de gate:

```typescript
  // Gate: solo beta testers con acceso habilitado ven el dashboard.
  // El resto ve la pantalla "próximamente". Campo coach_access_enabled
  // en profiles — default false (nuevo usuario = sin acceso).
  const { data: accessRow } = await supabase
    .from('profiles')
    .select('coach_access_enabled')
    .eq('id', user.id)
    .maybeSingle()

  if (accessRow?.coach_access_enabled !== true) {
    return <CoachGatePage />
  }
```

Esto va ANTES del `Promise.all` de queries del dashboard (línea 124). Si el usuario no tiene acceso, cortocircuita sin ejecutar las 6 queries pesadas.

- [ ] **Step 3: Verificar que TypeScript compila**

```bash
npx tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/coach/page.tsx
git commit -m "feat(coach): gate server-side en page.tsx — próximamente si no tiene acceso"
```

---

### Task 4: Gate en `layout.tsx` — proteger sub-rutas

**Files:**
- Modify: `src/app/coach/layout.tsx`

Las sub-rutas `/coach/sesion/*` y `/coach/progreso` deben redirigir a `/coach` si el usuario no tiene acceso. El gate se hace en `layout.tsx` para cubrir todas las sub-rutas de una sola vez.

- [ ] **Step 1: Convertir layout a server component con auth check**

Reemplazar el contenido completo de `src/app/coach/layout.tsx` con:

```typescript
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
import { CoachShell } from './CoachShell'

export const metadata: Metadata = {
  title: 'tAIger+ Coach IA — Golfers+',
  description: 'Coach de golf con inteligencia artificial y psicologia deportiva. Analiza tu juego y recibe recomendaciones personalizadas.',
  openGraph: {
    title: 'tAIger+ Coach IA — Golfers+',
    description: 'Coach de golf con IA y psicologia deportiva personalizada.',
    siteName: 'Golfers+',
    locale: 'es_CL',
    type: 'website',
  },
}

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  // Sub-rutas del coach (/coach/sesion/*, /coach/progreso) deben redirigir
  // a /coach si el usuario no tiene acceso — ahí ve la pantalla gate.
  // /coach misma NO redirige (tiene su propio gate inline en page.tsx).
  const headerList = await headers()
  const pathname = headerList.get('x-pathname') ?? headerList.get('x-invoke-path') ?? ''
  const isCoachRoot = pathname === '/coach' || pathname === ''

  if (!isCoachRoot) {
    const supabase = await createClient()
    const user = await getPageUser(supabase)
    if (!user) redirect('/login?next=/coach')

    const { data: accessRow } = await supabase
      .from('profiles')
      .select('coach_access_enabled')
      .eq('id', user.id)
      .maybeSingle()

    if (accessRow?.coach_access_enabled !== true) {
      redirect('/coach')
    }
  }

  return <CoachShell>{children}</CoachShell>
}
```

**Nota sobre `x-pathname`:** Next.js no expone el pathname directamente en layouts. Si el header `x-pathname` no está disponible (depende de si el middleware lo setea), hay una alternativa más robusta — ver Step 2.

- [ ] **Step 2: Verificar si el middleware expone el pathname**

Buscar en `src/middleware.ts` si setea `x-pathname`:

```bash
grep -n 'x-pathname\|x-invoke-path\|pathname' src/middleware.ts
```

Si NO lo setea, usar una alternativa: mover el gate de sub-rutas a los archivos individuales. Crear un helper reutilizable:

```typescript
// src/app/coach/lib/checkCoachAccess.ts
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'

/**
 * Verifica acceso al coach. Redirige a /coach (pantalla gate) si no tiene.
 * Usar en sub-rutas del coach (sesión, progreso) como primer paso.
 */
export async function checkCoachAccess(): Promise<void> {
  const supabase = await createClient()
  const user = await getPageUser(supabase)
  if (!user) redirect('/login?next=/coach')

  const { data: accessRow } = await supabase
    .from('profiles')
    .select('coach_access_enabled')
    .eq('id', user.id)
    .maybeSingle()

  if (accessRow?.coach_access_enabled !== true) {
    redirect('/coach')
  }
}
```

Luego agregar al inicio de cada sub-ruta page.tsx:

- `src/app/coach/sesion/[id]/page.tsx`: agregar `await checkCoachAccess()` como primera línea del componente async
- `src/app/coach/sesion/nueva/page.tsx` (si existe): ídem
- `src/app/coach/progreso/page.tsx`: ídem

**Decisión:** si `x-pathname` está disponible, usar el enfoque de layout (menos repetición). Si no, usar el helper (más explícito, sin dependencia de headers internos). Ambos son correctos.

- [ ] **Step 3: Verificar que TypeScript compila**

```bash
npx tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/coach/layout.tsx src/app/coach/lib/checkCoachAccess.ts
git commit -m "feat(coach): proteger sub-rutas — redirige a gate si no tiene acceso"
```

---

### Task 5: Verificar `GEMINI_API_KEY` en Vercel

**Files:** Ninguno (operación infra).

- [ ] **Step 1: Verificar si la key existe en Vercel**

Usar la API REST de Vercel (no la CLI, que tiene bug en Windows):

```bash
node --env-file=.env.local -e "
const projectId = 'prj_jb9iJB9pDVOicuv4pV9D3IqTheMK';
const teamId = 'team_GgasSxd8sEmfPOnVeE5uQFAt';

// Buscar VERCEL_TOKEN en .env.local — puede no existir
const token = process.env.VERCEL_ACCESS_TOKEN || process.env.VERCEL_TOKEN;
if (!token) {
  console.log('⚠️  No hay VERCEL token en .env.local.');
  console.log('Juanjo debe verificar manualmente en https://vercel.com/juanjoselamarca/tu-golf/settings/environment-variables');
  console.log('Buscar: GEMINI_API_KEY — debe estar en Production y Preview');
  console.log('Valor local:', process.env.GEMINI_API_KEY?.substring(0,15) + '...');
  process.exit(0);
}

fetch('https://api.vercel.com/v9/projects/' + projectId + '/env?teamId=' + teamId, {
  headers: { Authorization: 'Bearer ' + token }
})
.then(r => r.json())
.then(data => {
  const envs = data.envs || [];
  const gemini = envs.find(e => e.key === 'GEMINI_API_KEY');
  if (gemini) {
    console.log('✅ GEMINI_API_KEY existe en Vercel | target:', gemini.target?.join(','));
  } else {
    console.log('❌ GEMINI_API_KEY NO está en Vercel');
    console.log('Agregar manualmente o vía API (ver Step 2)');
  }
});
"
```

- [ ] **Step 2: Si falta, agregar la key**

**Opción A — Juanjo la agrega vía dashboard de Vercel:**
1. Ir a https://vercel.com → proyecto tu-golf → Settings → Environment Variables
2. Agregar `GEMINI_API_KEY` con el valor de `.env.local`
3. Target: Production + Preview
4. Guardar → Redeploy

**Opción B — Vía API REST (si hay VERCEL token):**

```bash
node --env-file=.env.local -e "
const projectId = 'prj_jb9iJB9pDVOicuv4pV9D3IqTheMK';
const teamId = 'team_GgasSxd8sEmfPOnVeE5uQFAt';
const token = process.env.VERCEL_ACCESS_TOKEN || process.env.VERCEL_TOKEN;
const value = process.env.GEMINI_API_KEY;

fetch('https://api.vercel.com/v10/projects/' + projectId + '/env?teamId=' + teamId, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    key: 'GEMINI_API_KEY',
    value: value,
    target: ['production', 'preview'],
    type: 'encrypted',
  }),
})
.then(r => r.json())
.then(data => {
  if (data.created) console.log('✅ GEMINI_API_KEY agregada a Vercel');
  else console.log('Resultado:', JSON.stringify(data, null, 2));
});
"
```

**IMPORTANTE:** No usar `vercel env add` por stdin — tiene bug en Windows que guarda valor vacío (ver `reference_vercel_env_add_windows_bug.md`).

- [ ] **Step 3: Verificar que el fallback funciona en local**

```bash
node --env-file=.env.local -e "
const { GoogleGenerativeAI } = require('@google/generative-ai');
const key = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(key);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: { maxOutputTokens: 50, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
});
(async () => {
  const result = await model.generateContent('Responde en una línea: qué es un birdie en golf');
  console.log('✅ Gemini OK:', result.response.text());
})().catch(e => console.log('❌ Gemini FAILED:', e.message?.substring(0, 200)));
"
```

Expected: respuesta coherente sobre birdie.

---

### Task 6: Build, test y push

**Files:** Ninguno nuevo.

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 2: Tests**

```bash
npm run test
```

Expected: todos pasan (el gate es server-side, no afecta tests unitarios existentes).

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: build exitoso.

- [ ] **Step 4: Verificar el flujo localmente**

Iniciar dev server y verificar ambos estados:

```bash
npm run dev
```

1. Abrir http://localhost:3000/coach logueado como Juanjo → debe ver el dashboard normal
2. (Si es posible testear con otro usuario sin `coach_access_enabled`) → debe ver la pantalla gate

- [ ] **Step 5: Push y crear PR**

```bash
git push origin HEAD
```

Crear PR con título: `feat(coach): gate "próximamente" + fix fallback Gemini`

- [ ] **Step 6: Verificar deploy en preview**

Esperar que Vercel deploy termine. Abrir la preview URL → `/coach`:
- Sin acceso → pantalla gate premium
- Con acceso → dashboard normal (degradado a Gemini si Anthropic sigue caído)
