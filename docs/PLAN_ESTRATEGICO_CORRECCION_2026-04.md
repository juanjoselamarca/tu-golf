# PLAN ESTRATÉGICO DE CORRECCIÓN Y MEJORAS — GOLFERS+

**Fecha:** 8 abril 2026
**Contexto:** Auditoría integral solicitada tras consultoría externa de apps y TI
**Destinatario:** CTO actual o futuro (humano o IA)
**Proyecto:** Golfers+ — github.com/juanjoselamarca/tu-golf
**Producción:** https://golfersplus.vercel.app
**Stack:** Next.js 14 · TypeScript · Supabase · Tailwind CSS · Vercel

---

## RESUMEN EJECUTIVO

Se realizó una auditoría profunda del repositorio, las 51 API routes, la arquitectura completa, la seguridad, y la organización en GitHub. Se encontraron **problemas graves** en 4 áreas principales:

| Área | Severidad | Estado actual |
|------|-----------|---------------|
| **Seguridad** | 🔴 CRÍTICO | Credenciales en git, endpoint SQL sin restricción, sin rate limiting |
| **GitHub & DevOps** | 🔴 CRÍTICO | Sin CI/CD, sin branches, archivos sueltos, .gitignore incompleto |
| **API & Backend** | 🟠 ALTO | Respuestas inconsistentes, validación débil, endpoint monolítico |
| **Arquitectura & Escalabilidad** | 🟠 ALTO | Componentes gigantes, 1.9% test coverage, sin estado global |

**Impacto en escalabilidad:** En el estado actual, la app funciona para <100 usuarios concurrentes. Para escalar a 10K+ usuarios (meta del proyecto), se requieren las correcciones de este plan.

---

## ÍNDICE

1. [Fase 0 — Emergencia de seguridad](#fase-0--emergencia-de-seguridad-día-1)
2. [Fase 1 — Orden en GitHub](#fase-1--orden-en-github-semana-1)
3. [Fase 2 — API robusta](#fase-2--api-robusta-semanas-2-3)
4. [Fase 3 — Arquitectura escalable](#fase-3--arquitectura-escalable-semanas-3-4)
5. [Fase 4 — Testing & calidad](#fase-4--testing--calidad-semana-5)
6. [Fase 5 — Monitoreo & observabilidad](#fase-5--monitoreo--observabilidad-semana-6)
7. [Fase 6 — Optimización de rendimiento](#fase-6--optimización-de-rendimiento-semanas-7-8)
8. [Checklist de verificación](#checklist-de-verificación-final)
9. [Guía para el CTO entrante](#guía-para-el-cto-entrante)

---

## FASE 0 — EMERGENCIA DE SEGURIDAD (Día 1)

> ⚠️ **NO hacer nada más hasta completar esta fase.**
> Hay credenciales de producción expuestas en el historial de git.

### 0.1 — Remover `.env.vercel` del repositorio

**Problema:** El archivo `.env.vercel` está trackeado en git y contiene:
- `ANTHROPIC_API_KEY` (clave de API de Claude)
- `SUPABASE_SERVICE_ROLE_KEY` (acceso total a la base de datos)
- `VAPID_PRIVATE_KEY` (push notifications)
- Tokens de Vercel OIDC

**Riesgo:** Cualquier persona con acceso al repo (o a un fork) tiene las llaves de producción.

**Solución:**
```bash
# 1. Agregar a .gitignore
echo ".env.vercel" >> .gitignore

# 2. Remover del tracking (sin borrar el archivo local)
git rm --cached .env.vercel

# 3. Limpiar del historial de git
# OPCIÓN A (si el repo es privado y no hay forks):
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .env.vercel' \
  --prune-empty --tag-name-filter cat -- --all

# OPCIÓN B (más moderna, recomendada):
# Instalar git-filter-repo: pip install git-filter-repo
git filter-repo --invert-paths --path .env.vercel

# 4. Force push (ÚNICA vez justificada)
git push origin main --force

# 5. ROTAR TODAS LAS CREDENCIALES:
#    - Supabase: Dashboard > Settings > API > Regenerar service_role key
#    - Anthropic: console.anthropic.com > API Keys > Revocar y crear nueva
#    - VAPID: Generar nuevo par de llaves
#    - Actualizar en Vercel Dashboard > Settings > Environment Variables
```

**Verificación:** `git log --all --full-history -- .env.vercel` no debe retornar resultados.

### 0.2 — Asegurar endpoint SQL admin

**Problema:** `src/app/api/admin/actions/sql/route.ts` ejecuta SQL arbitrario via `exec_sql()` con `SECURITY DEFINER`. Si una cuenta admin se compromete, la base de datos entera queda expuesta.

**Riesgo:** SQL injection, privilege escalation, data exfiltration.

**Solución (elegir una):**

| Opción | Seguridad | Usabilidad | Recomendada |
|--------|-----------|------------|-------------|
| A. Eliminar el endpoint | 🟢 Máxima | 🔴 Pierdes herramienta admin | Para producción |
| B. Whitelist de queries | 🟡 Alta | 🟡 Limitada | Para desarrollo |
| C. Read-only + audit log | 🟡 Alta | 🟢 Útil para debug | Compromiso ideal |

**Implementación recomendada (Opción C):**
```typescript
// Solo permitir SELECT (nunca INSERT/UPDATE/DELETE/DROP/ALTER)
const FORBIDDEN_PATTERNS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i;

export async function POST(req: Request) {
  // ... auth check ...
  const { query } = await req.json();
  
  if (FORBIDDEN_PATTERNS.test(query)) {
    return NextResponse.json({ error: 'Solo consultas SELECT permitidas' }, { status: 403 });
  }
  
  // Timeout de 5 segundos para evitar queries costosos
  const { data, error } = await supabase.rpc('exec_sql_readonly', { query });
  
  // Log completo para auditoría
  await logAdminAction('sql_query', { query, admin_id: user.id, timestamp: new Date() });
  
  return NextResponse.json({ data });
}
```

### 0.3 — Completar `.gitignore`

**Problema:** Faltan patrones críticos.

**Agregar:**
```gitignore
# Credenciales que nunca deben estar en git
.env.vercel
.env.production
.env.*.local

# Build artifacts
tsconfig.tsbuildinfo

# Logs de desarrollo
*.log
.codex-next-dev.*

# IDE
.vscode/
.idea/

# OS
Thumbs.db
```

**También remover del tracking:**
```bash
git rm --cached tsconfig.tsbuildinfo  # 391KB de build artifact
```

---

## FASE 1 — ORDEN EN GITHUB (Semana 1)

### 1.1 — Implementar CI/CD con GitHub Actions

**Problema:** No existe `.github/workflows/`. Toda la validación depende de hooks locales que pueden fallar o no existir en otra máquina. Un nuevo desarrollador puede pushear código roto directamente a producción.

**Impacto en escalabilidad:** Sin CI/CD, cada nuevo contribuidor es un riesgo. Imposible escalar el equipo.

**Crear:** `.github/workflows/ci.yml`
```yaml
name: CI — Golfers+

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    name: TypeScript + Lint + Tests + Build
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      
      - run: npm ci
      
      - name: TypeScript — 0 errores
        run: npx tsc --noEmit
      
      - name: ESLint — 0 warnings
        run: npm run lint:strict
      
      - name: Tests — todos pasan
        run: npm run test
      
      - name: Build — exitoso
        run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
```

**Crear:** `.github/workflows/security.yml`
```yaml
name: Security Scan

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'  # Lunes 6AM UTC

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm audit --audit-level=high
      
  secrets-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: trufflesecurity/trufflehog@main
        with:
          extra_args: --only-verified
```

**Proteger branch main:**
- GitHub > Settings > Branches > Add rule para `main`
- Require: status checks to pass (CI quality)
- Require: pull request reviews (cuando haya equipo)

### 1.2 — Estrategia de branching

**Problema actual:** Todo va directo a `main`. Un bug en un commit llega instantáneamente a producción via Vercel.

**Solución — GitHub Flow simplificado:**
```
main (producción — siempre estable)
  └── feat/nombre-corto    ← desarrollo
  └── fix/descripcion-bug  ← correcciones
  └── hotfix/urgente       ← producción en llamas
```

**Reglas:**
1. `main` = producción. Siempre deployable.
2. Features y fixes van en branches cortas (1-3 días máximo).
3. Merge a main solo via PR con CI verde.
4. Hotfixes pueden ir directo a main (pero deben pasar CI).

**Para IA/Claude Code:** Crear branch al inicio de cada sprint:
```bash
git checkout -b feat/sprint-XX-descripcion
# ... trabajar ...
git push -u origin feat/sprint-XX-descripcion
gh pr create --title "Sprint XX: descripción" --body "..."
# Merge cuando CI pase
```

### 1.3 — Limpieza del repositorio

**Problema:** Archivos sueltos en la raíz que no pertenecen ahí.

| Archivo | Acción | Destino |
|---------|--------|---------|
| `ADMIN_SUPABASE.sql` | Mover | `src/sql/admin/` |
| `ADMIN_SUPABASE_V2.sql` | Mover | `src/sql/admin/` |
| `SPRINT9_SUPABASE.sql` | Mover | `src/sql/sprints/` |
| `SPRINT9B_SUPABASE.sql` | Mover | `src/sql/sprints/` |
| `EJECUTAR_EN_SUPABASE.sql` | Mover | `src/sql/pending/` |
| `Ejemplos fotos Garmin Golf/` | Mover | `docs/references/garmin-screenshots/` |
| `GOLFERS_PLUS_MAESTRO.md` (112KB) | Mover | `docs/legacy/` |
| `.codex-next-dev.*.log` | Eliminar | N/A (agregar a .gitignore) |
| `AGENTS.md` | Eliminar o unificar | Contenido duplica CLAUDE.md |
| `tsconfig.tsbuildinfo` | Untrack | Solo en .gitignore |

### 1.4 — Unificar documentación de agentes

**Problema:** `AGENTS.md` y `CLAUDE.md` coexisten con contenido casi idéntico pero discrepancias (ej: "CTO: Codex" vs "CTO: Claude").

**Solución:**
- `CLAUDE.md` = fuente de verdad (ya establecido en el proyecto)
- `AGENTS.md` = eliminar o convertir en referencia mínima que apunte a CLAUDE.md
- Cualquier agente IA debe leer CLAUDE.md como instrucciones primarias

---

## FASE 2 — API ROBUSTA (Semanas 2-3)

### 2.1 — Estandarizar formato de respuestas

**Problema:** Las 51 API routes usan al menos 5 formatos diferentes de respuesta:
```typescript
// Algunas retornan: { error: 'message' }
// Otras: { success: true, data: {...} }
// Otras: { users: [], total, page }
// Otras: { services: {}, tables: {} }
// Otras: arrays directos
```

**Impacto:** Un frontend no puede manejar errores de forma genérica. Cada fetch necesita lógica custom. Imposible crear un SDK o abrir la API a terceros.

**Solución — Formato estándar:**
```typescript
// src/lib/api-response.ts

interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;          // Código máquina: 'AUTH_REQUIRED', 'SCORE_INVALID', etc.
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

// Helpers
export function apiOk<T>(data: T, meta?: ApiResponse['meta']): NextResponse {
  return NextResponse.json({ ok: true, data, meta });
}

export function apiError(error: string, status: number, code?: string): NextResponse {
  return NextResponse.json({ ok: false, error, code }, { status });
}

// Uso en cada route:
export async function GET() {
  const { data, error } = await supabase.from('users').select('*');
  if (error) return apiError('Error cargando usuarios', 500, 'DB_ERROR');
  return apiOk(data, { total: data.length });
}
```

**Plan de migración:**
1. Crear `src/lib/api-response.ts` con los helpers
2. Migrar routes por prioridad: admin → import → game → taiger → rest
3. Actualizar fetches en el frontend gradualmente
4. Mantener backward compatibility durante la transición

### 2.2 — Descomponer `/api/game` (endpoint monolítico)

**Problema:** `src/app/api/game/route.ts` es un POST de 450+ líneas que maneja 5 acciones diferentes: `upsert_score`, `finalize_round`, `start_next_round`, `cancel_tournament`, `withdraw_player`.

**Riesgo:** Un bug en cualquier acción puede afectar todas las demás. Imposible de testear, monitorear, o limitar individualmente.

**Solución — Separar en rutas RESTful:**
```
ANTES:
  POST /api/game  { action: 'upsert_score', ... }
  POST /api/game  { action: 'finalize_round', ... }
  POST /api/game  { action: 'cancel_tournament', ... }

DESPUÉS:
  PATCH /api/tournaments/[id]/scores       ← upsert_score
  POST  /api/tournaments/[id]/finalize     ← finalize_round
  POST  /api/tournaments/[id]/next-round   ← start_next_round
  POST  /api/tournaments/[id]/cancel       ← cancel_tournament
  POST  /api/tournaments/[id]/withdraw     ← withdraw_player
```

**Migración:**
1. Crear las nuevas rutas
2. Mover la lógica correspondiente
3. Mantener `/api/game` como proxy temporal (redirige a las nuevas rutas)
4. Actualizar el frontend
5. Eliminar `/api/game` cuando no tenga tráfico

### 2.3 — Implementar rate limiting

**Problema:** De 51 routes, solo 2 tienen rate limiting (tAIger chat). Las demás son ilimitadas.

**Riesgo:** Un atacante o un bug en el frontend puede:
- Agotar la cuota de Supabase (500K req/mes en free tier)
- Consumir créditos de Claude API ($$$)
- Saturar la importación de archivos
- Hacer denial-of-service a otros usuarios

**Solución — Middleware de rate limiting:**
```typescript
// src/lib/rate-limit.ts
// Usar Supabase como store (o Vercel KV si se necesita más velocidad)

interface RateLimitConfig {
  windowMs: number;      // Ventana de tiempo
  max: number;           // Requests máximos por ventana
  keyGenerator: (req: Request) => string;  // IP, user_id, etc.
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  '/api/import/*':       { windowMs: 3600_000, max: 20,  key: 'user_id' },
  '/api/taiger/*':       { windowMs: 86400_000, max: 50, key: 'user_id' },
  '/api/admin/actions/*':{ windowMs: 60_000,   max: 5,   key: 'user_id' },
  '/api/push/send':      { windowMs: 60_000,   max: 10,  key: 'user_id' },
  'default':             { windowMs: 60_000,   max: 100, key: 'ip' },
};
```

**Implementación por fases:**
1. **Inmediato:** Rate limit en rutas de IA (Claude, Gemini) — proteger costos
2. **Semana 2:** Rate limit en importación y admin actions — proteger recursos
3. **Semana 3:** Rate limit global por IP — proteger infraestructura

### 2.4 — Validación de input robusta

**Problema detectado en:**
- `/api/taiger/chat` — sin validación de largo de mensaje (un usuario podría enviar 1MB de texto)
- `/api/gwi/ronda-libre` — solo valida `cancha.length >= 2`
- `/api/rounds/import` — sin validación de rango de scores

**Solución — Schema validation con Zod:**
```typescript
// Ejemplo para /api/taiger/chat
import { z } from 'zod';

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  sessionId: z.string().uuid().optional(),
  context: z.object({
    roundId: z.string().uuid().optional(),
  }).optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Input inválido', 400, 'VALIDATION_ERROR');
  }
  // ... usar parsed.data (tipado automático)
}
```

**Nota:** Zod ya es estándar en el ecosistema Next.js y se integra con TypeScript. Agregarlo como dependencia: `npm install zod`.

### 2.5 — Corregir N+1 queries

**Problemas específicos encontrados:**

| Archivo | Líneas | Problema | Fix |
|---------|--------|----------|-----|
| `api/import/confirm/route.ts` | ~256-283 | Loop con `UPDATE` individual por cada round de Garmin | Batch upsert con `.upsert()` array |
| `api/historial/stats/route.ts` | — | Procesa rounds secuencialmente para stats | Agregar query con `GROUP BY` en Supabase |
| `api/taiger/context/route.ts` | — | 5 queries paralelas (ok), pero podrían ser 2-3 con JOINs | Optimizar con `.select('*, profiles(*)')` |

### 2.6 — Valores hardcodeados → env vars

| Valor | Ubicación | Variable recomendada |
|-------|-----------|---------------------|
| WhatsApp `wa.me/56912345678` | `api/taiger/chat` | `NEXT_PUBLIC_WHATSAPP_URL` |
| Email `juanjoselamarca@gmail.com` | `api/push/send` (VAPID) | `VAPID_CONTACT_EMAIL` |
| Rate limit `3 sessions/month` | `api/taiger/chat` | `TAIGER_FREE_MONTHLY_LIMIT` |

---

## FASE 3 — ARQUITECTURA ESCALABLE (Semanas 3-4)

### 3.1 — Descomponer componentes gigantes

**Problema:** 3 componentes superan las 700 líneas. Son imposibles de mantener, testear, o reutilizar.

| Componente | Líneas | Responsabilidades mezcladas |
|------------|--------|---------------------------|
| `ImportGuide.tsx` | 1,077 | Layout + selector + instrucciones + CSS keyframes |
| `LeaderboardTable.tsx` | 827 | Tabla + GWI + toasts + audio + datos hardcoded |
| `Navbar.tsx` | 712 | Nav + sidebar + avatar + notificaciones + theme + auth |

**Plan de descomposición (ejemplo Navbar):**
```
ANTES: Navbar.tsx (712 líneas)
DESPUÉS:
  Navbar.tsx           (~100 líneas) — Layout y composición
  NavSidebar.tsx       (~150 líneas) — Menú lateral mobile
  NavUserMenu.tsx      (~100 líneas) — Avatar + dropdown
  NavNotifications.tsx (~100 líneas) — Hub de notificaciones
  useNavAuth.ts        (~80 líneas)  — Hook de autenticación
  nav-constants.ts     (~50 líneas)  — Links, colores, config
```

**⚠️ PROTOCOLO ESPECIAL:** Navbar es un archivo protegido (causó caída de producción el 25-mar-2026). La descomposición debe:
1. Hacerse en un branch separado
2. Ser gradual (mover una pieza a la vez)
3. Tener tests canario pasando después de cada paso
4. NO cambiar el comportamiento — solo estructura

### 3.2 — Unificar clientes de Supabase

**Problema:** 3 patrones diferentes de creación de cliente:
```
src/lib/supabase.ts           → createBrowserClient (browser)
src/lib/supabaseAdmin.ts      → createClient con service_role (server admin)
src/utils/supabase/server.ts  → createServerClient con cookies (server user)
```

**Riesgo:** Confusión sobre cuál usar. Un desarrollador nuevo podría usar el admin client donde debería usar el de usuario, bypaseando RLS.

**Solución:**
```typescript
// src/lib/supabase/index.ts — Barrel export con nombres claros
export { createBrowserClient } from './browser'   // Para componentes client-side
export { createServerClient } from './server'      // Para API routes (respeta RLS)
export { createAdminClient } from './admin'        // Solo para operaciones de sistema
```

Documentar en cada archivo cuándo usarlo y cuándo NO.

### 3.3 — Estado global (cuando crezca el equipo)

**Estado actual:** 80 archivos con `useState` distribuido. Sin Redux/Zustand/Jotai.

**Evaluación:** Para el tamaño actual de la app, el estado distribuido es aceptable. Supabase Auth maneja el estado de sesión. No hay estado compartido complejo entre páginas.

**Cuándo implementar estado global:**
- Cuando se agregue carrito de compras / suscripciones
- Cuando haya >3 componentes que necesiten el mismo dato en tiempo real
- Cuando el estado de un torneo en vivo necesite sincronizarse entre tabs

**Recomendación para ese momento:** Zustand (2KB, zero boilerplate, compatible con Next.js server components).

### 3.4 — Eliminar 42 usos de `any`

**Distribución actual:**
| Archivo | Cantidad | Prioridad |
|---------|----------|-----------|
| `admin/golf-ops/page.tsx` | 18 | 🟠 Alta — dashboard admin con datos no tipados |
| `lib/share-card.ts` | 4 | 🟡 Media — canvas API |
| `api/import/garmin-zip/route.ts` | 3 | 🟠 Alta — parsing de datos externos |
| `api/pga-live/route.ts` | 3 | 🟡 Media — API externa ESPN |
| `utils/logger.ts` | 3 | 🟡 Media — error logging |
| Otros (5 archivos) | 11 | 🟢 Baja |

**Objetivo:** 0 usos de `any`. Reemplazar con tipos específicos o `unknown` + type guards.

---

## FASE 4 — TESTING & CALIDAD (Semana 5)

### 4.1 — Estado actual: 1.9% coverage

```
5 archivos de test / 264 archivos fuente = 1.9%

Lo que SÍ está testeado:
  ✅ Scoring algorithms (scoring.test.ts)
  ✅ Countback rules (countback.test.ts)
  ✅ System stability canaries (canary-stability.test.ts)
  ✅ Auth helpers (auth-helpers.test.ts)
  ✅ Admin functions (admin.test.ts)

Lo que NO está testeado (riesgo):
  ❌ 51 API routes (CERO tests)
  ❌ Import workflows (flujo crítico de usuario)
  ❌ GWI/CPI calculations (matemáticas complejas)
  ❌ Pattern detection (coach IA)
  ❌ Course matching (fuzzy matching)
  ❌ Garmin parsing (datos externos)
  ❌ Todos los componentes React
```

### 4.2 — Plan de testing por prioridad

**Tier 1 — Crítico para producción (meta: 2 semanas)**
| Qué testear | Por qué | Tipo de test |
|-------------|---------|--------------|
| API routes de scoring | Error aquí = torneo roto | Integration (contra BD real) |
| Import Garmin ZIP | Datos externos impredecibles | Unit + edge cases |
| GWI/CPI cálculos | Matemáticas complejas, Poisson/Normal | Unit con fixtures |
| Course matching | Fuzzy match puede dar falsos positivos | Unit con nombres reales |

**Tier 2 — Importante para confiabilidad (meta: 1 mes)**
| Qué testear | Por qué | Tipo de test |
|-------------|---------|--------------|
| API routes de admin | Proteger operaciones destructivas | Integration |
| tAIger context/patterns | Datos incorrectos → coaching malo | Unit |
| Import CSV | Segundo flujo más usado | Integration |
| Push notifications | Usuarios no reciben notificaciones | Integration mock |

**Tier 3 — Buenas prácticas (ongoing)**
| Qué testear | Por qué | Tipo de test |
|-------------|---------|--------------|
| Componentes React | Prevenir regresiones UI | Component (Vitest + Testing Library) |
| Middleware auth | Seguridad de acceso | Unit |
| Error logger | Monitoreo funciona | Unit |

### 4.3 — Estructura de tests recomendada

```
src/__tests__/
  unit/
    golf/
      scoring.test.ts        ← existente
      countback.test.ts      ← existente
      gwi.test.ts            ← NUEVO
      cpi.test.ts            ← NUEVO
      course-matching.test.ts ← NUEVO
    import/
      garmin-parser.test.ts  ← NUEVO
      csv-parser.test.ts     ← NUEVO
  integration/
    api/
      game.test.ts           ← NUEVO (contra BD real)
      import-confirm.test.ts ← NUEVO
      admin-actions.test.ts  ← NUEVO
    auth/
      middleware.test.ts     ← NUEVO
  canary/
    canary-stability.test.ts ← existente (no mover)
```

### 4.4 — Meta de coverage

| Plazo | Coverage target | Tests totales |
|-------|----------------|---------------|
| Actual | 1.9% (41 tests) | 5 archivos |
| 1 mes | 15% (~120 tests) | 15 archivos |
| 3 meses | 40% (~300 tests) | 30 archivos |
| 6 meses | 60%+ | 50+ archivos |

**Regla para nuevos PRs:** Todo código nuevo debe venir con tests. No se mergea sin test que cubra el happy path + al menos 1 edge case.

---

## FASE 5 — MONITOREO & OBSERVABILIDAD (Semana 6)

### 5.1 — Estado actual

| Herramienta | Estado | Cobertura |
|-------------|--------|-----------|
| Sentry | ✅ Instalado | Errores de runtime en producción |
| PostHog | ✅ Instalado | Analytics de uso |
| Health Check | ✅ Implementado | `/api/admin/health-check` |
| Logs estructurados | ❌ No existe | — |
| APM (performance) | ❌ No existe | — |
| Alertas automáticas | ❌ No existe | — |

### 5.2 — Mejoras recomendadas

**Request IDs para trazabilidad:**
```typescript
// En middleware.ts o como wrapper de API routes
const requestId = crypto.randomUUID();
// Pasar en headers, incluir en logs, retornar en respuestas de error
// Permite rastrear un request desde el frontend hasta la BD
```

**Logging estructurado:**
```typescript
// src/lib/logger.ts
function log(level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    requestId: getCurrentRequestId(),
    ...data,
  };
  console.log(JSON.stringify(entry));  // Vercel captura stdout como logs
  if (level === 'error') Sentry.captureMessage(event, { extra: data });
}
```

**Alertas en Sentry:**
- Error rate > 5% en 5 minutos → Notificación inmediata
- Nuevo error en API route → Notificación
- Health check falla → Notificación crítica

### 5.3 — Dashboard de métricas clave

Para un CTO (humano o IA), estas son las métricas que importan:

| Métrica | Fuente | Target |
|---------|--------|--------|
| Uptime | Health check cron | 99.9% |
| Error rate | Sentry | <0.1% |
| API latency p95 | Vercel Analytics | <2s |
| Build time | GitHub Actions | <3min |
| Test pass rate | GitHub Actions | 100% |
| Active users/day | PostHog | Creciendo |
| tAIger sessions/day | Supabase | Creciendo |

---

## FASE 6 — OPTIMIZACIÓN DE RENDIMIENTO (Semanas 7-8)

### 6.1 — Code splitting

**Problema:** Componentes grandes se cargan en el bundle inicial.

**Solución:**
```typescript
// Componentes pesados que no se necesitan en first paint
const ImportGuide = dynamic(() => import('@/components/import/ImportGuide'), {
  loading: () => <LoadingSkeleton />
});

const LeaderboardTable = dynamic(() => import('@/components/LeaderboardTable'), {
  loading: () => <LoadingSkeleton />
});

// Recharts ya usa dynamic import (bien) — verificar que otros charts también
```

### 6.2 — Optimización de imágenes

**Problema:** `HeroSection.tsx` usa `<img>` raw con `eslint-disable @next/next/no-img-element`.

**Solución:** Migrar a `next/image` con `priority` para LCP:
```typescript
import Image from 'next/image';
<Image src={heroUrl} alt="Golf course" fill priority sizes="100vw" />
```

### 6.3 — Caching strategy

Para cuando la app escale:

| Dato | TTL | Estrategia |
|------|-----|-----------|
| Lista de canchas | 24h | ISR (revalidate) |
| Leaderboard activo | 30s | SWR en cliente |
| Perfil de usuario | 5min | Cache en memoria |
| PGA live data | 60s | Stale-while-revalidate |
| Stats históricas | 1h | Server-side cache |

### 6.4 — Paginación en endpoints de lista

**Endpoints sin paginación detectados:**
- `/api/admin/rondas-libres` — carga TODAS las rondas
- `/api/admin/users` — tiene paginación ✅
- `/api/historial/stats` — carga TODOS los rounds del usuario

**Implementar cursor-based pagination:**
```typescript
// ?cursor=<last_id>&limit=20
const { data } = await supabase
  .from('rondas_libres')
  .select('*')
  .order('created_at', { ascending: false })
  .gt('id', cursor || '00000000-0000-0000-0000-000000000000')
  .limit(limit);
```

---

## CHECKLIST DE VERIFICACIÓN FINAL

Antes de considerar cada fase como completa:

### Fase 0 ✅ Seguridad
- [ ] `.env.vercel` removido del historial de git
- [ ] Todas las credenciales rotadas
- [ ] Endpoint SQL asegurado o eliminado
- [ ] `.gitignore` actualizado y verificado

### Fase 1 ✅ GitHub
- [ ] GitHub Actions CI ejecutándose en cada push
- [ ] Branch protection activado en main
- [ ] Archivos sueltos organizados en sus carpetas
- [ ] AGENTS.md resuelto (eliminar o unificar)
- [ ] `tsconfig.tsbuildinfo` fuera del tracking

### Fase 2 ✅ API
- [ ] `apiOk()` / `apiError()` usados en todas las routes
- [ ] `/api/game` descompuesto en rutas individuales
- [ ] Rate limiting activo en rutas de IA e importación
- [ ] Zod validation en inputs de usuario
- [ ] N+1 queries corregidos
- [ ] Valores hardcodeados movidos a env vars

### Fase 3 ✅ Arquitectura
- [ ] Navbar descompuesto (<200 líneas el archivo principal)
- [ ] ImportGuide descompuesto
- [ ] LeaderboardTable descompuesto
- [ ] Clientes Supabase unificados en barrel export
- [ ] 0 usos de `any` en el codebase

### Fase 4 ✅ Testing
- [ ] Tests para API routes de scoring
- [ ] Tests para Garmin import
- [ ] Tests para GWI/CPI
- [ ] Coverage >15%
- [ ] Regla "no PR sin tests" establecida

### Fase 5 ✅ Monitoreo
- [ ] Request IDs en todas las API routes
- [ ] Logging estructurado implementado
- [ ] Alertas de Sentry configuradas
- [ ] Health check monitoreado con cron

### Fase 6 ✅ Performance
- [ ] Dynamic imports para componentes pesados
- [ ] `next/image` en lugar de `<img>`
- [ ] Paginación en endpoints de lista
- [ ] Caching strategy documentada

---

## GUÍA PARA EL CTO ENTRANTE

### Contexto del proyecto

**Golfers+** es una app de golf operativa usada en torneos reales en Chile. La prioridad #1 es **estabilidad** — si falla durante un torneo, los usuarios no vuelven. Los golfistas son una comunidad pequeña donde la reputación se propaga rápido.

### Lo que funciona bien (no romper)

1. **Motor de golf** (`src/golf/`) — Arquitectura limpia, bien separada, testeada. Es el corazón de la app.
2. **Gobernanza** (`CLAUDE.md`) — Protocolo estricto de archivos protegidos, pre-push checks, health checks. Seguirlo al pie de la letra.
3. **Calidad de código** — 0 errores TypeScript, 0 warnings de lint, 41 tests pasando. No degradar.
4. **Infraestructura** — Vercel + Supabase + Sentry + PostHog. Stack probado y escalable.

### Lo que necesita atención urgente

1. **Seguridad** — Credenciales en git (Fase 0). Resolver antes de cualquier otra cosa.
2. **CI/CD** — Sin GitHub Actions, la calidad depende de disciplina humana. Automatizar.
3. **Testing** — 1.9% coverage es insuficiente para una app de producción. Subir a 15%+ ASAP.
4. **API consistency** — 5 formatos de respuesta diferentes hacen imposible crear un SDK o abrir la API.

### Herramientas de IA disponibles

El proyecto fue construido por Claude (Anthropic) como CTO técnico. Las herramientas configuradas:

| Herramienta | Uso |
|-------------|-----|
| **Claude Code** (CLI/Desktop/IDE) | Desarrollo, debugging, code review, refactoring |
| **CLAUDE.md** | Instrucciones que Claude lee al inicio de cada sesión |
| **Health Check** (`/api/admin/health-check`) | Diagnóstico automático del sistema |
| **GitHub MCP** | Claude puede leer/escribir en GitHub directamente |

### Cómo delegar trabajo a IA

1. **Leer CLAUDE.md** primero — tiene las reglas que la IA sigue
2. **Ser específico** — "Migrar `/api/game` a rutas RESTful separadas" > "Arreglar la API"
3. **Una fase a la vez** — No pedir Fase 0 + 1 + 2 juntas
4. **Verificar** — Después de cada cambio: `npx tsc --noEmit && npm run test && npm run build`
5. **Health check** — Después de cada deploy: `GET /api/admin/health-check`

### Orden de ejecución recomendado

```
DÍA 1:     Fase 0 completa (seguridad — no negociable)
SEMANA 1:  Fase 1 (GitHub + CI/CD)
SEMANA 2-3: Fase 2 (API) + Fase 4 Tier 1 (tests críticos) en paralelo
SEMANA 3-4: Fase 3 (arquitectura) — requiere tests de Fase 4
SEMANA 5:  Fase 4 Tier 2 (más tests)
SEMANA 6:  Fase 5 (monitoreo)
SEMANA 7-8: Fase 6 (performance)
ONGOING:   Fase 4 Tier 3 (tests de componentes)
```

### Contacto

- **PM:** Juan José Lamarca (juanjoselamarca@gmail.com)
- **Producción:** https://golfersplus.vercel.app
- **Repo:** github.com/juanjoselamarca/tu-golf

---

*Documento generado el 8 de abril 2026 tras auditoría integral del proyecto.*
*Basado en análisis de: 264 archivos TypeScript, 51 API routes, 325 commits, 34 documentos.*
