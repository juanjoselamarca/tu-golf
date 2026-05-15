# Sistema de Inbox · Agente 5B (Consumer local) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el consumer local del Sistema de Inbox: slash command `/inbox` + bootstrap hook que permite a Claude procesar autónomamente los reportes que el bot Telegram persiste en Supabase.

**Architecture:** 3 piezas: (1) Script Node `inbox-bootstrap.mjs` corre como hook `SessionStart` de Claude Code, consulta Supabase, cachea local, emite resumen como `system-reminder`. (2) Slash command markdown `.claude/commands/inbox.md` orquesta el flujo completo (triage → fix → deploy) usando herramientas existentes. (3) Scripts auxiliares para triage con Haiku 4.5 y descarga de fotos desde bucket.

**Tech Stack:** Node.js 24 LTS, Vitest 4, @anthropic-ai/sdk ^0.79.0, @supabase/supabase-js ^2 (todo ya en package.json). Reusa `scripts/run-sql.mjs`, `scripts/setup-worktree.mjs`, skills `design-shotgun`/`frontend-design`/`design-review`/`browse`.

**Spec:** `docs/superpowers/specs/2026-05-15-inbox-5b-consumer-design.md` (commit `40e7439`).

**Branch:** `feat/inbox-5b-consumer-claude` en worktree `.claude/worktrees/inbox-5b-consumer/`.

---

## File Structure

**Create:**

| Path | Responsibility |
|---|---|
| `scripts/inbox-bootstrap.mjs` | Query pending reports + cache + emit summary. Run as SessionStart hook. |
| `scripts/inbox-triage.mjs` | CLI helper: lee 1 reporte (texto+caption+foto) y devuelve `{tipo, confidence, razon}` usando Haiku 4.5. |
| `scripts/inbox-download.mjs` | CLI helper: descarga 1 foto del bucket via signed URL. |
| `scripts/inbox-bootstrap.test.mjs` | Tests vitest. |
| `scripts/inbox-triage.test.mjs` | Tests vitest. |
| `.claude/commands/inbox.md` | Slash command prompt con checklist obligatoria. |
| `docs/design-decisions/_template.md` | Template para anotar decisiones visuales. |
| `docs/design-benchmarks/README.md` | Índice de benchmarks. |
| `docs/design-benchmarks/{scorer,leaderboard,profile,coach,widget-pga}/.gitkeep` | Estructura de subdirectorios. |

**Modify:**

| Path | Cambio |
|---|---|
| `.claude/settings.json` | Agregar hook `SessionStart` que corre `inbox-bootstrap.mjs`. |
| `.gitignore` | Agregar `.claude/inbox-cache/`, `.claude/inbox-pending.json`. |
| `CLAUDE.md` | Sección "Sistema de Inbox" con routing del `/inbox`. |
| `docs/INBOX_ARCHITECTURE.md` | Agregar sección sobre 5B consumer. |

---

## Tasks

### Task 1: Setup tests scaffolding del bootstrap

**Files:**
- Create: `scripts/inbox-bootstrap.test.mjs`

- [ ] **Step 1: Crear test file vacío con imports y describe block**

```javascript
// scripts/inbox-bootstrap.test.mjs
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CACHE_PATH = '.claude/inbox-pending.json';

describe('inbox-bootstrap', () => {
  beforeEach(() => {
    if (fs.existsSync(CACHE_PATH)) fs.unlinkSync(CACHE_PATH);
  });
  afterEach(() => {
    if (fs.existsSync(CACHE_PATH)) fs.unlinkSync(CACHE_PATH);
  });
  // Tests go here
});
```

- [ ] **Step 2: Verificar que vitest puede correrlo (esperado: 0 tests pasan, archivo válido)**

Run: `cd "C:/Users/juanj/OneDrive/Escritorio/Proyectos IA/tu-golf" && npx vitest run scripts/inbox-bootstrap.test.mjs`
Expected: `Test Files 1 passed` con `Tests 0 passed` (file válido sin tests todavía).

- [ ] **Step 3: Commit**

```bash
git add scripts/inbox-bootstrap.test.mjs
git commit -m "test(inbox-5b): scaffold tests para bootstrap script"
```

---

### Task 2: Test "emite summary con count + 1 línea por reporte"

**Files:**
- Modify: `scripts/inbox-bootstrap.test.mjs`

- [ ] **Step 1: Agregar test que verifica formato de output con mock de query**

Dentro del `describe`:

```javascript
it('emite resumen con count y 1 línea truncada por reporte', async () => {
  const mockQuery = vi.fn().mockResolvedValue([
    { id: '1', recibido_en: '2026-05-15T10:00:00Z', texto: 'scorer cuelga hoyo 14', caption: null, status: 'nuevo' },
    { id: '2', recibido_en: '2026-05-15T11:00:00Z', texto: null, caption: 'widget pga light mode no se ven nombres aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa muy largo', status: 'nuevo' },
  ]);
  const { buildSummary } = await import('./inbox-bootstrap.mjs');
  const out = buildSummary(await mockQuery());
  expect(out).toContain('2 pendiente');
  expect(out).toContain('scorer cuelga hoyo 14');
  expect(out).toMatch(/widget pga light mode no se ven nombres.{0,30}\.\.\./);
  expect(out.split('\n').length).toBeLessThanOrEqual(6); // header + 2 + footer máx
});
```

- [ ] **Step 2: Run test (esperado: FAIL — buildSummary no existe)**

Run: `npx vitest run scripts/inbox-bootstrap.test.mjs`
Expected: `FAIL` con `Cannot find module './inbox-bootstrap.mjs'` o `buildSummary is not exported`.

- [ ] **Step 3: Implementar `buildSummary` mínimo en `scripts/inbox-bootstrap.mjs`**

```javascript
// scripts/inbox-bootstrap.mjs
const TRUNC = 60;

export function buildSummary(rows) {
  if (!rows || rows.length === 0) return '';
  const lines = [`📥 ${rows.length} pendiente${rows.length === 1 ? '' : 's'} en inbox:`];
  for (const r of rows.slice(0, 10)) {
    const content = (r.texto ?? r.caption ?? '(sin texto)').replace(/\s+/g, ' ');
    const truncated = content.length > TRUNC ? content.slice(0, TRUNC) + '...' : content;
    lines.push(`  • ${truncated}`);
  }
  if (rows.length > 10) lines.push(`  (... y ${rows.length - 10} más)`);
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test (esperado: PASS)**

Run: `npx vitest run scripts/inbox-bootstrap.test.mjs`
Expected: `Tests 1 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/inbox-bootstrap.mjs scripts/inbox-bootstrap.test.mjs
git commit -m "feat(inbox-5b): buildSummary del bootstrap con truncado a 60 chars"
```

---

### Task 3: Test "inbox vacío → output vacío"

**Files:**
- Modify: `scripts/inbox-bootstrap.test.mjs`

- [ ] **Step 1: Agregar test**

```javascript
it('inbox vacío produce output vacío (silencio total)', async () => {
  const { buildSummary } = await import('./inbox-bootstrap.mjs');
  expect(buildSummary([])).toBe('');
  expect(buildSummary(null)).toBe('');
  expect(buildSummary(undefined)).toBe('');
});
```

- [ ] **Step 2: Run test (esperado: PASS — ya cubierto por implementación previa)**

Run: `npx vitest run scripts/inbox-bootstrap.test.mjs`
Expected: `Tests 2 passed`.

- [ ] **Step 3: Commit**

```bash
git add scripts/inbox-bootstrap.test.mjs
git commit -m "test(inbox-5b): cubre caso inbox vacío"
```

---

### Task 4: Test "cache TTL 5 min funciona"

**Files:**
- Modify: `scripts/inbox-bootstrap.test.mjs`
- Modify: `scripts/inbox-bootstrap.mjs`

- [ ] **Step 1: Agregar tests del cache**

```javascript
it('readCache devuelve null si no existe', async () => {
  const { readCache } = await import('./inbox-bootstrap.mjs');
  expect(readCache()).toBeNull();
});

it('readCache devuelve data si <5 min de antigüedad', async () => {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify({
    ts: Date.now() - 60_000, // 1 min ago
    rows: [{ id: '1', texto: 'cached', status: 'nuevo' }],
  }));
  const { readCache } = await import('./inbox-bootstrap.mjs');
  const result = readCache();
  expect(result).not.toBeNull();
  expect(result.rows[0].texto).toBe('cached');
});

it('readCache devuelve null si >5 min de antigüedad', async () => {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify({
    ts: Date.now() - 6 * 60_000, // 6 min ago
    rows: [{ id: '1', texto: 'old', status: 'nuevo' }],
  }));
  const { readCache } = await import('./inbox-bootstrap.mjs');
  expect(readCache()).toBeNull();
});

it('writeCache persiste rows con timestamp', async () => {
  const { writeCache } = await import('./inbox-bootstrap.mjs');
  writeCache([{ id: '1', texto: 'fresh', status: 'nuevo' }]);
  const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  expect(raw.rows).toHaveLength(1);
  expect(raw.ts).toBeGreaterThan(Date.now() - 1000);
});
```

- [ ] **Step 2: Run tests (esperado: FAIL — readCache/writeCache no existen)**

Run: `npx vitest run scripts/inbox-bootstrap.test.mjs`
Expected: errors sobre `readCache is not a function`.

- [ ] **Step 3: Agregar `readCache` y `writeCache` en `scripts/inbox-bootstrap.mjs`**

Agregar al archivo:

```javascript
import fs from 'node:fs';

const CACHE_PATH = '.claude/inbox-pending.json';
const CACHE_TTL_MS = 5 * 60 * 1000;

export function readCache() {
  if (!fs.existsSync(CACHE_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    if (Date.now() - raw.ts > CACHE_TTL_MS) return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeCache(rows) {
  fs.mkdirSync('.claude', { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify({ ts: Date.now(), rows }, null, 2));
}
```

- [ ] **Step 4: Run tests (esperado: PASS)**

Run: `npx vitest run scripts/inbox-bootstrap.test.mjs`
Expected: `Tests 6 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/inbox-bootstrap.mjs scripts/inbox-bootstrap.test.mjs
git commit -m "feat(inbox-5b): cache local con TTL 5 min para reducir queries"
```

---

### Task 5: Función main que orquesta cache → query Supabase → output

**Files:**
- Modify: `scripts/inbox-bootstrap.mjs`

- [ ] **Step 1: Agregar `main` async function (sin tests — es orquestación I/O)**

Agregar al final del archivo:

```javascript
import { createClient } from '@supabase/supabase-js';

async function queryPending() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing');
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from('inbox_reports')
    .select('id, recibido_en, texto, caption, status')
    .in('status', ['nuevo', 'triaged'])
    .order('recibido_en', { ascending: true })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

async function main() {
  const TIMEOUT_MS = 2000;
  // 1) Cache hit
  const cached = readCache();
  if (cached) {
    const summary = buildSummary(cached.rows);
    if (summary) process.stdout.write(summary + '\n');
    return;
  }
  // 2) Query with timeout
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; }, TIMEOUT_MS);
  try {
    const rows = await Promise.race([
      queryPending(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
    ]);
    clearTimeout(timer);
    writeCache(rows);
    const summary = buildSummary(rows);
    if (summary) process.stdout.write(summary + '\n');
  } catch (err) {
    if (timedOut || err.message === 'timeout') {
      process.stdout.write('(inbox check timed out)\n');
    } else {
      process.stdout.write(`(inbox check error: ${err.message})\n`);
    }
    process.exit(0); // No bloquear sesión
  }
}

const isMain = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
  || process.argv[1]?.endsWith('inbox-bootstrap.mjs');
if (isMain) main();
```

- [ ] **Step 2: Smoke test manual contra BD real**

Run: `cd "C:/Users/juanj/OneDrive/Escritorio/Proyectos IA/tu-golf" && rm -f .claude/inbox-pending.json && node --env-file=.env.local .claude/worktrees/inbox-5b-consumer/scripts/inbox-bootstrap.mjs`
Expected: output con "📥 1 pendiente en inbox:" + 1 línea con el reporte del widget PGA (o "" si BD vacía).

- [ ] **Step 3: Verificar que cache se escribió**

Run: `cat .claude/inbox-pending.json | head -2`
Expected: JSON con `ts` y `rows`.

- [ ] **Step 4: Re-correr para confirmar cache hit (debe ser instantáneo)**

Run: `time node --env-file=.env.local .claude/worktrees/inbox-5b-consumer/scripts/inbox-bootstrap.mjs`
Expected: <100ms (vs ~1500ms del primer run sin cache).

- [ ] **Step 5: Commit**

```bash
git add scripts/inbox-bootstrap.mjs
git commit -m "feat(inbox-5b): main orquesta cache + query + timeout 2s + emit summary"
```

---

### Task 6: .gitignore para inbox-cache + inbox-pending

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Verificar contenido actual**

Run: `grep -E "inbox|\.claude" .gitignore`
Expected: probable que `.claude/` global no esté ignorado (verificar).

- [ ] **Step 2: Agregar las 2 líneas si no están**

Editar `.gitignore` al final:

```
# Sistema de Inbox 5B
.claude/inbox-cache/
.claude/inbox-pending.json
```

- [ ] **Step 3: Verificar `git status` no muestra inbox-pending.json como untracked**

Run: `git status --ignored .claude/`
Expected: `.claude/inbox-pending.json` aparece bajo "Ignored files".

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore(inbox-5b): ignore cache local del bootstrap"
```

---

### Task 7: Hook SessionStart en .claude/settings.json

**Files:**
- Modify: `.claude/settings.json` (o crear si no existe)

- [ ] **Step 1: Leer settings actual**

Run: `cat .claude/settings.json 2>/dev/null || echo "{}"`
Documentá el contenido actual para preservarlo.

- [ ] **Step 2: Agregar hook SessionStart preservando el resto**

Usar Node para mergear programáticamente y evitar sobrescribir hooks existentes:

```bash
node -e "
const fs = require('fs');
const path = '.claude/settings.json';
const cfg = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : {};
cfg.hooks = cfg.hooks || {};
cfg.hooks.SessionStart = cfg.hooks.SessionStart || [];
const newEntry = {
  matcher: '*',
  hooks: [{
    type: 'command',
    command: 'node --env-file=.env.local scripts/inbox-bootstrap.mjs',
    timeout: 3000
  }]
};
const already = cfg.hooks.SessionStart.some(e =>
  (e.hooks || []).some(h => (h.command || '').includes('inbox-bootstrap.mjs'))
);
if (!already) cfg.hooks.SessionStart.push(newEntry);
fs.writeFileSync(path, JSON.stringify(cfg, null, 2));
console.log('settings.json actualizado, already_present:', already);
"
```

Idempotente: si ya estaba el hook → no duplica.

- [ ] **Step 3: Verificar JSON válido**

Run: `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json', 'utf8')); console.log('OK')"`
Expected: `OK`.

- [ ] **Step 4: Smoke test del hook (manual)**

Cerrá la sesión actual de Claude Code y abrí una nueva. En la nueva sesión deberías ver al inicio un `system-reminder` con "📥 1 pendiente en inbox: • [resumen]".

Si no aparece: revisar `cat .claude/settings.json` y `node --env-file=.env.local scripts/inbox-bootstrap.mjs` manual para reproducir.

- [ ] **Step 5: Commit**

```bash
git add .claude/settings.json
git commit -m "feat(inbox-5b): hook SessionStart que avisa pendientes del inbox"
```

---

### Task 8: Tests del script de triage con mocks de Anthropic SDK

**Files:**
- Create: `scripts/inbox-triage.test.mjs`

- [ ] **Step 1: Escribir tests del parser de output Haiku**

```javascript
// scripts/inbox-triage.test.mjs
import { describe, it, expect } from 'vitest';
import { parseTriageOutput } from './inbox-triage.mjs';

describe('parseTriageOutput', () => {
  it('parsea JSON válido con todos los campos', () => {
    const raw = '{"tipo":"tecnico-trivial","confidence":0.92,"razon":"contraste WCAG"}';
    const r = parseTriageOutput(raw);
    expect(r.tipo).toBe('tecnico-trivial');
    expect(r.confidence).toBe(0.92);
    expect(r.razon).toBe('contraste WCAG');
  });

  it('parsea JSON envuelto en code fences ```json', () => {
    const raw = '```json\n{"tipo":"visual","confidence":0.75,"razon":"diseño"}\n```';
    const r = parseTriageOutput(raw);
    expect(r.tipo).toBe('visual');
  });

  it('parsea JSON con texto extra antes/después', () => {
    const raw = 'Análisis:\n{"tipo":"producto","confidence":0.6,"razon":"requiere decisión"}\nFin.';
    const r = parseTriageOutput(raw);
    expect(r.tipo).toBe('producto');
  });

  it('throw si JSON inválido', () => {
    expect(() => parseTriageOutput('not json')).toThrow();
  });

  it('throw si tipo fuera de enum', () => {
    expect(() => parseTriageOutput('{"tipo":"xxx","confidence":0.9,"razon":"a"}')).toThrow(/tipo inválido/);
  });

  it('clamp confidence a [0,1]', () => {
    expect(parseTriageOutput('{"tipo":"visual","confidence":1.5,"razon":"a"}').confidence).toBe(1);
    expect(parseTriageOutput('{"tipo":"visual","confidence":-0.5,"razon":"a"}').confidence).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests (esperado: FAIL — parseTriageOutput no existe)**

Run: `npx vitest run scripts/inbox-triage.test.mjs`
Expected: `Cannot find module ./inbox-triage.mjs`.

- [ ] **Step 3: Implementar `parseTriageOutput` mínimo en `scripts/inbox-triage.mjs`**

```javascript
// scripts/inbox-triage.mjs
const TIPOS_VALIDOS = ['tecnico-trivial', 'tecnico-complejo', 'visual', 'producto', 'ambiguo'];

export function parseTriageOutput(raw) {
  // Strip code fences si vienen
  let cleaned = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1');
  // Extraer primer {...} balanceado
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('triage: no JSON found in output');
  const obj = JSON.parse(match[0]);
  if (!TIPOS_VALIDOS.includes(obj.tipo)) {
    throw new Error(`triage: tipo inválido "${obj.tipo}"`);
  }
  return {
    tipo: obj.tipo,
    confidence: Math.max(0, Math.min(1, Number(obj.confidence) || 0)),
    razon: String(obj.razon ?? ''),
  };
}
```

- [ ] **Step 4: Run tests (esperado: PASS)**

Run: `npx vitest run scripts/inbox-triage.test.mjs`
Expected: `Tests 6 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/inbox-triage.mjs scripts/inbox-triage.test.mjs
git commit -m "feat(inbox-5b): parseTriageOutput tolerante a code fences y validación de enum"
```

---

### Task 9: CLI de triage con Anthropic SDK (Haiku 4.5)

**Files:**
- Modify: `scripts/inbox-triage.mjs`

- [ ] **Step 1: Agregar función `triage` que llama a Haiku 4.5 con multimodal**

Agregar al archivo:

```javascript
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';

const SYSTEM_PROMPT = `Sos un triage agent para reportes de bugs de Golfers+.
Clasificás cada reporte en una de 5 categorías:
- "tecnico-trivial": bug claro y reproducible, fix de 1-2 archivos (typos, off-by-one, NaN guards, contraste WCAG, tokens hardcoded).
- "tecnico-complejo": bug que requiere refactor multi-archivo o decisiones de arquitectura.
- "visual": problema de diseño/UX donde puede haber varias soluciones legítimas (rediseño de widget, jerarquía visual, qué muestra empty state).
- "producto": decisión de producto pura (qué muestra una pantalla, copy, comportamiento de feature).
- "ambiguo": no podés decidir entre 2+ categorías con confianza.

Respondés SIEMPRE con JSON: {"tipo": "...", "confidence": 0.0-1.0, "razon": "1 línea explicativa"}.
Confidence refleja certeza de la clasificación. Si dudas entre 2 → bajá confidence y elegí "ambiguo".`;

export async function triage({ texto, caption, photoPath }) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const content = [];
  const userText = `Texto del reporte: ${texto ?? '(vacío)'}\nCaption: ${caption ?? '(vacío)'}\n\nClasificá este reporte.`;
  content.push({ type: 'text', text: userText });
  if (photoPath && fs.existsSync(photoPath)) {
    const b64 = fs.readFileSync(photoPath).toString('base64');
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
    });
  }
  const resp = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  });
  const raw = resp.content.find((c) => c.type === 'text')?.text ?? '';
  return parseTriageOutput(raw);
}

async function cli() {
  const [, , textoFlag, captionFlag, photoFlag] = process.argv;
  // Args: --texto="..." --caption="..." --photo=path
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const m = a.match(/^--([^=]+)=(.*)$/);
      return m ? [m[1], m[2]] : [a, true];
    }),
  );
  const result = await triage({
    texto: args.texto || null,
    caption: args.caption || null,
    photoPath: args.photo || null,
  });
  process.stdout.write(JSON.stringify(result) + '\n');
}

const isMain = process.argv[1]?.endsWith('inbox-triage.mjs');
if (isMain) cli().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 2: Smoke test contra reporte real del widget PGA**

Run:
```bash
cd "C:/Users/juanj/OneDrive/Escritorio/Proyectos IA/tu-golf" && \
node --env-file=.env.local .claude/worktrees/inbox-5b-consumer/scripts/inbox-triage.mjs \
  --caption="Error en el widget pga en light mode, no se ven nombres" \
  --photo=.claude/inbox-cache/foto-test.jpg
```

Expected: JSON tipo `{"tipo":"tecnico-trivial","confidence":0.85+,"razon":"falta contraste..."}`. El `tipo` debería ser `tecnico-trivial` o `visual` (ambos defendibles). Si es `producto` o `ambiguo` → revisar prompt.

- [ ] **Step 3: Commit**

```bash
git add scripts/inbox-triage.mjs
git commit -m "feat(inbox-5b): triage CLI con Haiku 4.5 multimodal (texto+caption+foto)"
```

---

### Task 10: Script auxiliar de descarga de fotos

**Files:**
- Create: `scripts/inbox-download.mjs`

- [ ] **Step 1: Crear script que descarga 1 foto via signed URL**

```javascript
// scripts/inbox-download.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const m = a.match(/^--([^=]+)=(.*)$/);
      return m ? [m[1], m[2]] : [a, true];
    }),
  );
  const storagePath = args.path;
  const outFile = args.out;
  if (!storagePath || !outFile) {
    console.error('Uso: --path=reports/2026/05/abc.jpg --out=.claude/inbox-cache/abc.jpg');
    process.exit(1);
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const { data, error } = await supabase.storage
    .from('inbox-photos')
    .createSignedUrl(storagePath, 3600);
  if (error) { console.error('signed url error:', error.message); process.exit(1); }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await new Promise((resolve, reject) => {
    https.get(data.signedUrl, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const f = fs.createWriteStream(outFile);
      res.pipe(f);
      f.on('finish', () => f.close(resolve));
      f.on('error', reject);
    }).on('error', reject);
  });
  console.log(`saved: ${outFile} (${fs.statSync(outFile).size} bytes)`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 2: Smoke test manual**

Run:
```bash
cd "C:/Users/juanj/OneDrive/Escritorio/Proyectos IA/tu-golf" && \
rm -f .claude/inbox-cache/smoke.jpg && \
node --env-file=.env.local .claude/worktrees/inbox-5b-consumer/scripts/inbox-download.mjs \
  --path=reports/2026/05/5a3a527c-d377-4fb4-861c-7b1e698d9245.jpg \
  --out=.claude/inbox-cache/smoke.jpg
```

Expected: `saved: .claude/inbox-cache/smoke.jpg (~50800 bytes)`.

- [ ] **Step 3: Commit**

```bash
git add scripts/inbox-download.mjs
git commit -m "feat(inbox-5b): script de descarga de fotos via signed URL del bucket"
```

---

### Task 11: Slash command /inbox (prompt principal)

**Files:**
- Create: `.claude/commands/inbox.md`

- [ ] **Step 1: Escribir el prompt completo con checklist obligatoria**

```markdown
---
description: Procesar reportes pendientes del bot Telegram (Sistema de Inbox 5B)
---

Sos Claude actuando como CTO. Procesás autónomamente los reportes pendientes del bot
`@Golfers_App_Bot` siguiendo esta checklist EXACTA. No improvises.

**Si el primer argumento es `reopen <uuid>`** → ejecutá la rama de reapertura del final
de este doc y salí. Si no, seguí el flujo principal.

## Flujo principal

### PASO 1 — Snapshot de pendientes

Ejecutá:
\`\`\`bash
cd "C:/Users/juanj/OneDrive/Escritorio/Proyectos IA/tu-golf" && \
node --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
(async () => {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await s.from('inbox_reports')
    .select('*').in('status', ['nuevo','triaged'])
    .order('recibido_en', { ascending: true }).limit(20);
  console.log(JSON.stringify(data ?? [], null, 2));
})();
"
\`\`\`

Guardá el JSON resultante. Si está vacío → respondé "Inbox vacío." y terminá.

### PASO 2 — Descargar fotos

Para cada reporte con \`fotos_paths\` no vacío:
\`\`\`bash
node --env-file=.env.local .claude/worktrees/inbox-5b-consumer/scripts/inbox-download.mjs \
  --path=<fotos_paths[0]> \
  --out=.claude/inbox-cache/<report-id>.jpg
\`\`\`

### PASO 3 — Triage de cada reporte

Para cada reporte:
\`\`\`bash
node --env-file=.env.local .claude/worktrees/inbox-5b-consumer/scripts/inbox-triage.mjs \
  --texto="<texto>" --caption="<caption>" --photo=.claude/inbox-cache/<report-id>.jpg
\`\`\`

El output es JSON: \`{tipo, confidence, razon}\`. Guardá la clasificación de cada uno.

### PASO 4 — Confirmar ambiguos (si los hay)

Si algún reporte tiene \`confidence < 0.85\` o \`tipo === "ambiguo"\`:
1. Presentá al user con AskUserQuestion: lista de items dudosos + propuesta de clasificación.
2. Esperá su respuesta antes de continuar.

### PASO 5 — Priorización

Si hay más de 5 reportes con tipo \`tecnico-*\`:
1. Presentá la lista al user con AskUserQuestion: cuáles fixear en esta corrida (max 5).
2. Esperá respuesta.

### PASO 6 — Marker idempotencia

Para cada reporte que va a procesarse en esta corrida:
\`\`\`bash
node --env-file=.env.local scripts/run-sql.mjs - <<SQL
UPDATE inbox_reports SET status='en_progreso' WHERE id='<uuid>';
SQL
\`\`\`

### PASO 7 — Bucketing técnicos (paralelo vs secuencial)

Para los \`tecnico-*\`:
- Si el reporte menciona keywords identificables (e.g. "scorer", "coach", "leaderboard"), mapeá a directorios src/ con \`Grep\` rápido.
- Si los archivos esperados son disjuntos entre 2+ reportes → paralelizables (max 3 concurrentes con Task tool, subagent_type=general-purpose).
- Si overlap o ambigüedad de archivos → secuencial.

### PASO 8 — Ejecutar técnicos

Para cada técnico (o cada grupo paralelo), seguí EXACTAMENTE este sub-flujo:

1. \`node scripts/setup-worktree.mjs inbox-<slug-corto> feat\`
2. \`cd .claude/worktrees/inbox-<slug-corto>\`
3. Hacé fix mínimo (1-N archivos según diagnóstico)
4. Si hay tests cubriendo la zona → agregá test que reproduce el bug ANTES del fix
5. \`npx tsc --noEmit\` (debe pasar)
6. \`npm run build\` (debe pasar)
7. \`npx next lint --dir src\` (sin warnings nuevos del archivo tocado)
8. \`graphify update .\` desde el repo principal
9. Commit + push + \`gh pr create\` + \`gh pr merge --squash --admin\`
10. Poll Vercel API hasta \`state===READY\` con el sha del merge
11. **SMOKE POST-DEPLOY** (mitigación crítica):
    - Si el bug era en endpoint API → curl al endpoint, esperar 200/comportamiento normal
    - Si era en página → skill \`browse\` a la URL relacionada, verificar ausencia de console.error
    - Si smoke falla → \`git revert <merge-commit>\` + push + \`UPDATE status='error', notas='post-deploy smoke failed: <razon>'\`
12. \`UPDATE inbox_reports SET status='resuelto', rama_fix='<branch>', enlace_auditoria='<PR_URL>', procesado_en=now() WHERE id='<uuid>'\`
13. Cleanup: \`git worktree remove .claude/worktrees/inbox-<slug-corto> --force\` y \`git branch -D <branch>\`

### PASO 9 — Ejecutar visuales (pipeline 4 capas)

Para cada reporte \`visual\`:

1. **Constitution check**: leé \`DESIGN.md\` (sección relevante).
2. **Benchmarks**: si \`docs/design-benchmarks/<categoria>/\` existe, leé el README.
3. **Variantes**: invocá skill \`design-shotgun\` para generar 3-4 alternativas.
4. **Evaluación objetiva** (criterios todos cumplidos = ganador):
   - Cumple DESIGN.md (paleta, tipo, spacing, touch ≥44px)
   - WCAG AA contraste (calculá manual si no hay tool: \`(L1+0.05)/(L2+0.05) ≥ 4.5\` para texto normal)
   - Consistency con componentes shared
   - Mobile-first
5. Si **UNA variante** gana en TODOS los criterios → avanzá con ella.
6. Si **2+ empatadas** → \`AskUserQuestion\` con preview de las 2 finalistas. Esperá 1 click.
7. Skill \`frontend-design\` implementa la elegida.
8. Skill \`design-review\` auto post-cambio (visual QA + fix iterativo).
9. Sub-flujo técnico desde PASO 8.5 (tsc → build → lint → graphify → commit → PR → merge → deploy → smoke).
10. **Decision log**: copiá \`docs/design-decisions/_template.md\` a \`docs/design-decisions/<YYYY-MM-DD>-<slug>.md\` y llenálo.
11. UPDATE en BD (mismo que técnico).

### PASO 10 — Decisiones de producto pendientes

Para cada reporte \`producto\` o \`ambiguo\` que no se resolvió:
- \`UPDATE status='triaged', notas='<razon>'\`
- Listalos en el resumen final como decisiones esperando tu input.

### PASO 11 — Resumen final

Imprimí (en español):
\`\`\`
✓ Técnicos cerrados: N (PRs #X, #Y, #Z)
✓ Visuales cerrados: M (PRs #A, #B)
⚠ Decisiones pendientes: K (listadas arriba)
❌ Errores de deploy auto-reverted: E (IDs)
\`\`\`

Después: \`rm -rf .claude/inbox-cache/*\` para limpiar fotos descargadas.

---

## Rama de reapertura

Si el comando es \`/inbox reopen <uuid>\`:

\`\`\`bash
node --env-file=.env.local scripts/run-sql.mjs - <<SQL
UPDATE inbox_reports
SET status='nuevo',
    rama_fix=NULL,
    enlace_auditoria=NULL,
    procesado_en=NULL,
    notas=COALESCE(notas,'') || ' [reopened ' || now()::date || ']'
WHERE id='<uuid>';
SQL
\`\`\`

Respondé: \`✓ Reabierto. Aparecerá en próximo bootstrap.\`

---

## Restricciones

- NUNCA borrar reportes (sólo UPDATE status).
- NUNCA commitear .env.local.
- NUNCA mergear sin smoke post-deploy verde.
- NUNCA seguir si confidence promedio del triage < 0.7 (parar y consultar).
- Cap absoluto: 5 fixes técnicos + 2 visuales por corrida.
```

- [ ] **Step 2: Validar que el archivo existe y es legible por Claude Code**

Run: `wc -l .claude/commands/inbox.md`
Expected: ~150 líneas.

- [ ] **Step 3: Commit**

```bash
git add .claude/commands/inbox.md
git commit -m "feat(inbox-5b): slash command /inbox con checklist obligatoria de 11 pasos"
```

---

### Task 12: Decision log template

**Files:**
- Create: `docs/design-decisions/_template.md`

- [ ] **Step 1: Crear template**

```markdown
# [SLUG-DEL-CAMBIO] — Decisión de diseño

**Fecha:** YYYY-MM-DD
**Reporte origen:** `inbox_reports.id` = `<uuid>`
**PR:** #<n> (`<url>`)

## Problema (1 línea)

[Qué pasaba antes que generó el reporte.]

## Variantes consideradas

### Variante A — [nombre corto]
[Breve descripción. Si hay screenshot/render, link.]

### Variante B — [nombre corto]
[Idem.]

### Variante C — [nombre corto]
[Idem.]

## Criterios de evaluación

| Criterio | A | B | C |
|---|---|---|---|
| DESIGN.md (paleta, tipo, spacing) | ✅/❌ | ✅/❌ | ✅/❌ |
| WCAG AA contraste | ✅/❌ | ✅/❌ | ✅/❌ |
| Consistency components shared | ✅/❌ | ✅/❌ | ✅/❌ |
| Mobile-first | ✅/❌ | ✅/❌ | ✅/❌ |
| Premium / no AI-slop | ✅/❌ | ✅/❌ | ✅/❌ |

## Elegida

**Variante [X].**

## Razón objetiva (no estética)

[Por qué gana en los criterios. Si fue empate técnico, qué decidió Juanjo y por qué.]

## Lecciones / patrón reutilizable

[Si emergió un patrón que conviene aplicar en futuros casos similares, documentarlo acá.]
```

- [ ] **Step 2: Commit**

```bash
git add docs/design-decisions/_template.md
git commit -m "feat(inbox-5b): template para decision log de cambios visuales"
```

---

### Task 13: Estructura de benchmarks visuales

**Files:**
- Create: `docs/design-benchmarks/README.md`
- Create: `docs/design-benchmarks/{scorer,leaderboard,profile,coach,widget-pga}/.gitkeep`

- [ ] **Step 1: Crear README con índice**

```markdown
# Benchmarks visuales — Golfers+

Referencias visuales de competidores categorizadas por feature. Antes de tomar decisiones
de diseño en una categoría, leé los screenshots de ese subdirectorio.

## Categorías

| Categoría | Competidores capturados | Archivo |
|---|---|---|
| `scorer/` | Garmin Golf, Arccos, GolfShot, 18Birdies | (pendiente) |
| `leaderboard/` | Augusta App, PGA Tour Live, ESPN | (pendiente) |
| `profile/` | MyScorecard, Strava, Garmin Connect | (pendiente) |
| `coach/` | Whoop, Apple Health, Garmin Coach | (pendiente) |
| `widget-pga/` | PGA Tour app, ESPN scoreboard widgets | (pendiente) |

## Cómo capturar

Usar skill `browse` con anti-bot stealth. Convención de naming:
`<competidor>-<feature>-<viewport>.png` (ej. `garmin-scorer-mobile.png`).

Resolución: 1080×1920 para mobile (matchea iPhone 14 Pro), 1440×900 para desktop.

## Cuándo actualizar

- Cuando un competidor rediseña significativamente.
- Cuando agregamos una feature nueva sin precedente local.
- Cada 6 meses como mantenimiento.

## Reglas de uso

- **NO copiar pixel-by-pixel.** Inspirarse, identificar patrones que funcionan, aplicarlos con nuestro twist (minimalista premium deportivo).
- **NO usar benchmarks viejos** sin verificar que el competidor no haya cambiado.
- **Si un competidor lo hace mal, no lo replicamos.** Los benchmarks NO son verdad absoluta.
```

- [ ] **Step 2: Crear `.gitkeep` en cada subdirectorio**

Run:
```bash
cd "C:/Users/juanj/OneDrive/Escritorio/Proyectos IA/tu-golf/.claude/worktrees/inbox-5b-consumer" && \
mkdir -p docs/design-benchmarks/scorer \
         docs/design-benchmarks/leaderboard \
         docs/design-benchmarks/profile \
         docs/design-benchmarks/coach \
         docs/design-benchmarks/widget-pga && \
touch docs/design-benchmarks/scorer/.gitkeep \
      docs/design-benchmarks/leaderboard/.gitkeep \
      docs/design-benchmarks/profile/.gitkeep \
      docs/design-benchmarks/coach/.gitkeep \
      docs/design-benchmarks/widget-pga/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add docs/design-benchmarks/
git commit -m "feat(inbox-5b): estructura inicial de benchmarks visuales por categoría"
```

**Nota**: la captura real de screenshots con skill `browse` se posterga hasta el primer bug visual real que requiera benchmark de su categoría. No bloquea el merge del 5B — el pipeline visual usa DESIGN.md y design-shotgun sin benchmarks si no existen aún. Esta postergación está alineada con YAGNI y reduce trabajo especulativo.

---

### Task 14: CLAUDE.md update con sección /inbox

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Agregar sección antes de "## CONTACTO" (al final)**

Buscar `## CONTACTO` en CLAUDE.md y agregar antes:

```markdown
## Sistema de Inbox — bot Telegram → CTO fixea

App tiene canal directo de feedback: bot `@Golfers_App_Bot` recibe foto/texto, persiste en `inbox_reports` (Supabase) + bucket `inbox-photos`.

**Bootstrap**: al iniciar sesión, hook `SessionStart` corre `scripts/inbox-bootstrap.mjs` que emite un `system-reminder` con conteo + resumen 1-línea de pendientes. Silencioso si vacío.

**Procesamiento**: el slash command `/inbox` ejecuta el flujo completo (triage → fix → tests → PR → merge → smoke post-deploy). Autonomía total para bugs técnicos. Sólo pregunta a Juanjo si: clasificación ambigua, empate visual sin ganador objetivo, decisión de producto.

**Comandos**:
- `/inbox` — procesar todo lo pendiente.
- `/inbox reopen <uuid>` — reabrir reporte cerrado por error.

**Doc:** `docs/INBOX_ARCHITECTURE.md` (arquitectura), `docs/superpowers/specs/2026-05-15-inbox-5b-consumer-design.md` (spec del consumer).
```

- [ ] **Step 2: Verificar markdown válido**

Run: `head -40 CLAUDE.md && echo "..." && tail -30 CLAUDE.md`
Expected: la sección nueva aparece antes de `## CONTACTO`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): agregar sección Sistema de Inbox con routing del /inbox"
```

---

### Task 15: INBOX_ARCHITECTURE.md update con sección 5B

**Files:**
- Modify: `docs/INBOX_ARCHITECTURE.md`

- [ ] **Step 1: Agregar sección "Consumer local (5B)" antes de "## Hallazgos colaterales"**

Buscar `## Hallazgos colaterales` y agregar antes:

```markdown
## Consumer local (Agente 5B)

Slash command `/inbox` + hook `SessionStart` permiten procesamiento autónomo de los reportes desde Claude Code local.

### Componentes

- `scripts/inbox-bootstrap.mjs` — hook que avisa pendientes al inicio de sesión.
- `scripts/inbox-triage.mjs` — clasificación con Haiku 4.5 (multimodal).
- `scripts/inbox-download.mjs` — descarga de fotos via signed URL.
- `.claude/commands/inbox.md` — prompt operativo del slash command.

### Pipeline técnico (por reporte)

worktree → fix → tsc → build → lint → graphify → commit → push → PR → merge → deploy → smoke post-deploy → UPDATE BD.

### Pipeline visual (por reporte)

DESIGN.md check → benchmarks consultados → design-shotgun (3-4 variantes) → eval objetiva → frontend-design implementa → design-review auto → pipeline técnico → decision log en `docs/design-decisions/`.

### Cuándo pregunta a Juanjo

- Clasificación con confidence < 0.85 → pregunta puntual.
- >5 técnicos en una corrida → pregunta cuáles priorizar.
- Empate visual sin ganador objetivo → pregunta con preview de 2 finalistas.
- Decisión de producto pura → pregunta o queda en `status='triaged'`.

### Cap de costos

Triage con Haiku 4.5 (~$0.001 c/u) + fix con Opus 4.7 (~$1-7 c/u). Cap 5 fixes/corrida. Estimación ~$15-25 USD/día en uso realista.

### Smoke post-deploy

Después de merge + deploy READY, probe HTTP al endpoint/URL relacionado al fix. Si falla → `git revert` + push automático + `status='error'`. Garantiza CERO FALLOS aún con auto-merge.
```

- [ ] **Step 2: Commit**

```bash
git add docs/INBOX_ARCHITECTURE.md
git commit -m "docs(inbox): documentar consumer 5B en arquitectura general"
```

---

### Task 16: Smoke test E2E completo

**Files:**
- Read-only

- [ ] **Step 1: Verificar estado actual de BD**

Run:
```bash
cd "C:/Users/juanj/OneDrive/Escritorio/Proyectos IA/tu-golf" && \
node --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
(async () => {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await s.from('inbox_reports').select('id, status, texto, caption').in('status',['nuevo','triaged']);
  console.log('pendientes:', data.length);
  console.log(JSON.stringify(data, null, 2));
})();
"
```

Expected: ver el reporte del widget PGA pendiente (status='nuevo').

- [ ] **Step 2: Smoke test del bootstrap (manual)**

Run: `rm -f .claude/inbox-pending.json && node --env-file=.env.local scripts/inbox-bootstrap.mjs`
Expected: output `📥 1 pendiente en inbox:\n  • Error en el widget pga en light mode...`.

- [ ] **Step 3: Smoke test del triage (manual)**

Run:
```bash
node --env-file=.env.local scripts/inbox-download.mjs \
  --path=reports/2026/05/5a3a527c-d377-4fb4-861c-7b1e698d9245.jpg \
  --out=.claude/inbox-cache/smoke.jpg && \
node --env-file=.env.local scripts/inbox-triage.mjs \
  --caption="Error en el widget pga en light mode, no se ven nombres" \
  --photo=.claude/inbox-cache/smoke.jpg
```

Expected: JSON con clasificación coherente (`tecnico-trivial` o `visual` con `confidence ≥ 0.7`).

- [ ] **Step 4: NO ejecutar `/inbox` real todavía**

Razón: el smoke E2E completo (incluye merge + deploy real) lo hacemos después del PR del 5B, no durante el plan. Ese smoke se documenta en el reporte final de la implementación.

- [ ] **Step 5: Commit (vacío — solo marker)**

```bash
git commit --allow-empty -m "test(inbox-5b): smoke test de scripts auxiliares OK"
```

---

### Task 17: PR del 5B (sin ejecutar /inbox aún)

**Files:**
- Read-only (git operations)

- [ ] **Step 1: Verificar tests y build pasan**

Run desde el worktree:
```bash
cd "C:/Users/juanj/OneDrive/Escritorio/Proyectos IA/tu-golf/.claude/worktrees/inbox-5b-consumer" && \
npx vitest run scripts/ && \
npx tsc --noEmit && \
npm run build 2>&1 | tail -5
```

Expected: tests pasan (probablemente 9-10 tests entre los 2 archivos), tsc 0 errors, build success.

- [ ] **Step 2: Push branch**

Run: `git push -u origin feat/inbox-5b-consumer-claude`

Expected: pre-push hook pasa todas las verificaciones.

- [ ] **Step 3: Crear PR**

```bash
gh pr create --base main --head feat/inbox-5b-consumer-claude --title "feat(inbox): consumer local 5B (slash command /inbox + bootstrap hook)" --body-file - <<'EOF'
## Summary

Implementa el consumer local del Sistema de Inbox: hace que los reportes que el bot Telegram persiste en Supabase se procesen autónomamente desde Claude Code.

## Componentes

- **`scripts/inbox-bootstrap.mjs`**: hook `SessionStart` que avisa pendientes al inicio.
- **`scripts/inbox-triage.mjs`**: clasificación con Haiku 4.5 multimodal.
- **`scripts/inbox-download.mjs`**: descarga de fotos via signed URL.
- **`.claude/commands/inbox.md`**: slash command con checklist de 11 pasos.
- **`docs/design-decisions/_template.md`** + **`docs/design-benchmarks/`**: guardrails visuales.

## Spec aprobado

`docs/superpowers/specs/2026-05-15-inbox-5b-consumer-design.md`

## Verificaciones

- ✅ Tests unitarios (bootstrap + triage) pasan
- ✅ `tsc --noEmit` limpio
- ✅ `npm run build` success
- ✅ Smoke manual de bootstrap + triage contra reporte real OK

## Test plan post-merge

- [ ] Cerrar sesión Claude y abrir nueva — verificar bootstrap aparece
- [ ] Mandar 1 bug fake al bot — verificar que llega a BD
- [ ] Ejecutar `/inbox` — verificar pipeline completo (triage → fix → PR → merge → smoke)
- [ ] Verificar decision log y benchmarks accesibles

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

- [ ] **Step 4: Merge inmediato (autonomía CTO)**

```bash
gh pr merge --squash --admin --subject "feat(inbox): consumer local 5B (slash command /inbox + bootstrap hook)"
```

- [ ] **Step 5: Volver a main y limpiar**

```bash
cd "C:/Users/juanj/OneDrive/Escritorio/Proyectos IA/tu-golf" && \
git checkout main && git pull origin main && \
git worktree remove .claude/worktrees/inbox-5b-consumer --force && \
git branch -D feat/inbox-5b-consumer-claude
```

- [ ] **Step 6: Smoke E2E final con bug real**

Pedirle a Juanjo: *"5B mergeado. Mandá 1 bug fake al bot y después ejecutá `/inbox` para validar end-to-end."*
