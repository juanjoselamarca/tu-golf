# GOLFERS+ — ARCHIVO MAESTRO DE DESARROLLO
## Documento único de referencia para Claude Code
### Versión 3.0 · 25 marzo 2026 · Auditado contra producción real

---

> **INSTRUCCIÓN CRÍTICA PARA CLAUDE CODE — LEER ANTES DE CUALQUIER COSA:**
>
> 1. Lee este archivo COMPLETO de principio a fin antes de tocar una sola línea de código.
> 2. Cuando ejecutes un sprint, completa las 3 capas de corrido sin interrupciones.
>    No pidas confirmación entre capas. Solo reporta al final cuando todo está terminado.
> 3. Antes de tocar cualquier archivo: GREP primero. Nunca adivines nombres de funciones,
>    componentes o variables. Siempre busca en el código real.
> 4. Si algo no está en este documento, busca el patrón más similar que ya exista en el
>    proyecto y sigue esa misma convención.
> 5. Al terminar cada sprint: npm run build + node scripts/update-docs.js + git push.
>    Solo entonces reportar el resultado al usuario.

---

# PARTE 1 — CONTEXTO DEL PROYECTO

## Qué es Golfers+ y a quién sirve

Golfers+ es una app web progresiva (PWA) de golf para el jugador amateur serio
de Chile y Latinoamérica. No es una app casual — es un sistema de performance
personal. El usuario típico tiene índice 8-20, juega 2-4 veces por mes, y quiere
entender por qué su juego no mejora a pesar de la práctica.

Los tres productos dentro de la app:
- **Live scoring de torneos:** el organizador crea un torneo, los jugadores marcan
  score hoyo a hoyo, el leaderboard es público en tiempo real.
- **Perfil de rendimiento con GWI™:** cada ronda alimenta el Golf Win Index.
  El jugador ve en qué área del juego pierde strokes reales.
- **tAIger+:** coach de IA con acceso a todos los datos del jugador. Combina
  psicología deportiva (Rotella, VISION54) con estadística (Broadie).
  Habla en español. Es el diferencial imposible de copiar.

**Producción:** https://golfersplus.vercel.app
**Repo local:** `C:\Users\Juan Jose Lamarca\OneDrive\Escritorio\Proyectos IA\tu-golf`
**Supabase project ID:** hoswfwhvcgqlqdmzpnce
**Abrir Claude Code:** `claude --dangerously-skip-permissions`

## Stack tecnológico
```
Frontend:   Next.js 14 (App Router) + TypeScript + Tailwind CSS
Backend:    Next.js API Routes (serverless en Vercel)
BD:         Supabase Postgres + RLS + Realtime
Auth:       Supabase Auth (OAuth Google + magic link)
IA:         Anthropic Claude API — claude-sonnet-4-20250514
Deploy:     Vercel (auto-deploy en push a main)
```

## Convenciones ABSOLUTAS — nunca violar
```
Producto:         Golfers+ (nunca "Tu Golf" ni "TuGolf")
Coach IA:         tAIger+ (con +, con I mayúscula, SIN artículo "el")
Campo handicap:   profiles.indice (NUNCA handicap, NUNCA handicap_index)
Campo rol:        profiles.role = 'player'|'organizer'|'admin'
                  (NUNCA .rol en español, NUNCA 'usuario', NUNCA 'organizador')
Status rondas:    SOLO 'in_progress'|'closed'|'official' (NUNCA 'completed')
Cancha columna:   courses.nombre (NUNCA name)
Hoyo columna:     course_holes.numero (NUNCA hole_number)
Arrays Supabase:  SIEMPRE (data ?? []).map() — NUNCA data.map() a secas
Mobile-first:     390px base, touch targets mínimo 44x44px
Idioma UI:        Español — nunca inglés en textos visibles al usuario
Formato fechas:   "24 mar 2026" (NUNCA "2026-03-24")
Scores en UI:     vs par: -2 · E · +1 (NUNCA gross absoluto como "78")
Yardajes:         en yardas (NUNCA metros)
Commits:          npm run build exitoso ANTES de hacer commit
Docs:             node scripts/update-docs.js al finalizar cada sprint
```

## Estructura de carpetas confirmada en producción
```
tu-golf/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Layout global (navbar, fonts, CSS vars)
│   │   ├── globals.css             # CSS variables del design system + keyframes
│   │   ├── leaderboard/            # Demo leaderboard con simulación en vivo
│   │   ├── demo/                   # Perfil público Carlos Méndez
│   │   ├── dashboard/
│   │   ├── perfil/                 # /perfil · /perfil/stats · /perfil/historial
│   │   ├── coach/                  # /coach · /sesion/nueva · /sesion/[id]
│   │   ├── ronda-libre/            # /ronda-libre/[codigo]/score
│   │   ├── torneo/[slug]/          # Leaderboard de torneo
│   │   ├── admin/                  # ✅ YA EXISTE: /admin · /admin/qa · /admin/sistema
│   │   ├── auth/callback/
│   │   └── api/
│   │       ├── demo/               # profile + players (públicas sin auth)
│   │       ├── game/               # POST scoring en vivo
│   │       ├── gwi/torneo/[slug]/
│   │       ├── taiger/             # chat · context · patterns
│   │       ├── push/               # subscribe · preferences
│   │       └── admin/health/       # ✅ YA EXISTE — falta proteger con auth
│   ├── components/
│   │   ├── Navbar.tsx              # ✅ YA EXISTE
│   │   ├── Footer.tsx              # ✅ YA EXISTE
│   │   ├── GWIDisplay.tsx          # ✅ YA EXISTE — gauge SVG animado
│   │   └── HoleColorBar.tsx        # ✅ YA EXISTE — barra colores por hoyo
│   ├── hooks/
│   │   └── useDemoSimulation.ts    # ✅ YA EXISTE
│   ├── lib/
│   │   ├── admin.ts                # ✅ isAdmin() helper
│   │   ├── scoring.ts              # ✅ Stableford + strokes recibidos
│   │   ├── demo-simulation.ts      # ✅ generateHoleScore()
│   │   └── supabase.ts             # ✅ tipos BD + clientes
│   └── utils/supabase/
│       ├── client.ts               # ✅ Browser client
│       └── server.ts               # ✅ Server client para API routes
├── supabase/migrations/
├── scripts/update-docs.js          # ✅ YA EXISTE — ejecutar al terminar sprints
├── middleware.ts                   # ✅ YA EXISTE — protege rutas con auth
└── next.config.js                  # ✅ YA EXISTE — incluye security headers
```

## Rutas del sistema
```
PÚBLICAS (sin login):
  /                    Homepage
  /leaderboard         Demo en vivo con simulación
  /demo                Perfil demo Carlos Méndez
  /ronda-libre/[cod]   Scoring por link compartido
  /torneo/[slug]       Leaderboard de torneo

PRIVADAS (requieren login):
  /dashboard
  /perfil · /perfil/stats · /perfil/historial
  /coach · /coach/sesion/nueva · /coach/sesion/[id]
  /ronda-libre (crear nueva)

ADMIN (requieren role='admin'):
  /admin               ✅ EXISTE
  /admin/qa            ✅ EXISTE
  /admin/sistema       ✅ EXISTE

APIs EXISTENTES:
  GET  /api/demo/profile
  GET  /api/demo/players
  GET  /api/admin/health       ← proteger con ADMIN_SECRET_KEY
  POST /api/game               ← scoring en vivo
  GET  /api/gwi/torneo/[slug]
  POST /api/taiger/chat
  GET  /api/taiger/context
  GET  /api/taiger/patterns
  GET  /api/push/preferences   ← existe, falta proteger con auth

APIs POR CREAR:
  GET  /api/en-vivo            ← 404 hoy (Sprint 4)
```

## Schema de base de datos — COMPLETO Y VERIFICADO

### Sistema de Rondas Libres (partidas casuales entre amigos)
```sql
rondas_libres (
  id UUID, codigo TEXT UNIQUE,
  course_name TEXT, course_id UUID,
  tees TEXT, holes INTEGER DEFAULT 18,
  fecha TIMESTAMPTZ,
  estado TEXT,  -- 'in_progress' | 'closed'
  modo_juego TEXT, hoyo_inicio INTEGER DEFAULT 1
)

ronda_libre_jugadores (
  id UUID,
  ronda_libre_id UUID REFERENCES rondas_libres(id),
  nombre TEXT, user_id UUID,
  scores JSONB  -- { "1": 4, "2": 5, ... "18": 4 }
)
```

### Sistema de Torneos (competición formal)
```sql
tournaments (
  id UUID, nombre TEXT,  -- ⚠️ NO 'name'
  slug TEXT UNIQUE, fecha DATE, cancha TEXT,
  formato TEXT,  -- 'stroke_play' | 'stableford'
  holes INTEGER DEFAULT 18,
  status TEXT,   -- 'draft' | 'active' | 'completed'
  created_by UUID REFERENCES profiles(id)
)

players (  -- inscripciones al torneo
  id UUID, tournament_id UUID, user_id UUID,
  nombre TEXT, indice DECIMAL(4,1),
  categoria TEXT, pais TEXT  -- ISO: 'CL' | 'AR'
)

rounds (
  id UUID, tournament_id UUID, numero INTEGER,
  status TEXT  -- ⚠️ SOLO: 'in_progress'|'closed'|'official'
               -- CHECK constraint en BD — NUNCA usar 'completed'
)

hole_scores (
  id UUID, round_id UUID, player_id UUID,
  hole_number INTEGER, gross_score INTEGER,
  par INTEGER, neto_score INTEGER,
  UNIQUE(round_id, player_id, hole_number)
)
```

### Sistema de Perfil y Estadísticas
```sql
profiles (
  id UUID PRIMARY KEY,  -- = auth.users.id
  name TEXT, email TEXT,
  indice DECIMAL(4,1),
  role TEXT DEFAULT 'player'  -- ⚠️ 'player'|'organizer'|'admin'
)

historical_rounds (  -- alimentan el GWI™ y CPI™
  id UUID, user_id UUID,
  course_name TEXT, played_at TIMESTAMPTZ,
  total_gross INTEGER, total_neto INTEGER,
  scores JSONB, holes_played INTEGER DEFAULT 18,
  metadata JSONB  -- { gir, putts, fairways }
)

courses (
  id UUID, nombre TEXT,  -- ⚠️ NO 'name'
  par_total INTEGER, yardaje_total INTEGER,
  slope INTEGER, rating DECIMAL(4,1)
)

course_holes (
  id UUID, course_id UUID,
  numero INTEGER,  -- ⚠️ NO 'hole_number'
  par INTEGER, stroke_index INTEGER,
  hdcp INTEGER, yardaje_negro INTEGER
)

taiger_sessions (
  id UUID, user_id UUID,
  session_type TEXT, messages JSONB
)
```

### UUIDs fijos de datos demo — NUNCA cambiar
```typescript
const CARLOS_MENDEZ_ID = '10000000-0000-0000-0000-000000000001'
const TOURNAMENT_ID    = '20000000-0000-0000-0000-000000000001'
const ROUND_ID         = '30000000-0000-0000-0000-000000000001'
const JUANJO_ID        = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
```

## Cómo ejecutar SQL (Claude Code tiene permiso total)
```bash
# Paso 1: verificar qué método funciona en este entorno
npx supabase --version

# Método 1 — CLI (preferido si está disponible)
npx supabase db push --project-ref hoswfwhvcgqlqdmzpnce

# Método 2 — via DB URL del .env
npx supabase db execute --project-ref hoswfwhvcgqlqdmzpnce \
  --db-url "$SUPABASE_DB_URL" -f supabase/migrations/NNN.sql

# Si ninguno funciona → reportar el error en el reporte final.
# Nunca pedir a Juanjo que ejecute SQL manualmente.
# Verificar variables disponibles: cat .env.local | grep SUPABASE
```

## Comandos esenciales
```bash
curl https://golfersplus.vercel.app/api/admin/health   # health check
npx tsc --noEmit                                    # TypeScript check
npm run build                                       # build completo
git add . && git commit -m "..." && git push        # deploy automático
node scripts/update-docs.js                         # actualizar docs del proyecto
```

---

# PARTE 2 — DESIGN SYSTEM OFICIAL
## Auditado de globals.css y DOM en producción el 25 marzo 2026

---

## 2.1 CSS VARIABLES — La fuente de verdad absoluta

**REGLA CRÍTICA:** Siempre usar estas CSS variables en lugar de valores hardcodeados.
Si existe una variable para algo, usarla. El código que hardcodea colores rompe
la consistencia visual del producto cuando se hace un cambio global.

```css
/* ── FONDOS ─────────────────────────────────────────────────── */
--bg:            #070d18    /* fondo principal — dark navy */
--bg-surface:    #0e1c2f    /* superficies secundarias */
--bg-deep:       #08120f    /* secciones profundas — tono verdoso oscuro */
--bg-deep-2:     #0d1b17
--bg-card:       #12231e    /* cards en zona de estadísticas */
--bg-card-2:     #173129
--bg-card-light: #0e1c2f    /* cards en dashboard y perfil */

/* ── TEXTO ──────────────────────────────────────────────────── */
--ivory:   #f3efe6          /* texto para títulos y display grande */
--text:    #edeae4          /* texto principal en modo oscuro */
--text-2:  #94a8c0          /* texto secundario y labels */
--text-3:  #5a6a7a          /* texto apagado, placeholders */
--sage:    #9fb4aa          /* texto con tono verde (stats) */

/* ── DORADO — DOS TONOS CON USOS DISTINTOS ─────────────────── */
--brand:        #c4992a     /* ← BOTONES y CTAs (acciones de marca) */
--brand-hover:  #a67d1e     /* hover de botones */
--brand-dark:   #070d18     /* texto sobre fondos dorados */
--brand-light:  #fdf6e3     /* fondos muy sutiles dorados */
--gold:         #c8a55a     /* ← DATOS y ACCENTS (GWI, stats, valores) */
--gold-soft:    rgba(200,165,90,.18)   /* fondos gold muy sutiles */

/* ── BORDES ─────────────────────────────────────────────────── */
--border:    rgba(196,153,42,.12)    /* borde estándar de cards */
--border-md: rgba(196,153,42,.20)    /* borde más visible */
--line:      rgba(200,165,90,.18)    /* divisores y separadores */

/* ── INPUTS ─────────────────────────────────────────────────── */
--input-bg:     hsla(0,0%,100%,.04)
--input-border: rgba(196,153,42,.2)
--input-focus:  #c4992a

/* ── SOMBRAS ─────────────────────────────────────────────────── */
--shadow-sm:   0 1px 3px rgba(0,0,0,.3)
--shadow-md:   0 4px 12px rgba(0,0,0,.4)
--shadow-lg:   0 8px 24px rgba(0,0,0,.5)
--shadow-card: 0 2px 8px rgba(0,0,0,.3)

/* ── SISTEMA DE SCORE ⚠️ NO CONVENCIONAL — NO CAMBIAR ────────── */
--eagle:  #3b82f6   /* AZUL — eagle (-2) y mejor */
--birdie: #ef4444   /* ROJO — birdie (-1, bajo par) */
--par:    #6b7280   /* GRIS — par (0) */
--bogey:  #c4992a   /* DORADO — bogey (+1) */
--double: #dc2626   /* ROJO OSCURO — doble bogey (+2) o peor */
```

---

## 2.2 SISTEMA DE SCORE — NO CONVENCIONAL A PROPÓSITO

**⚠️ ADVERTENCIA CRÍTICA PARA CLAUDE CODE:**
El golf tradicional usa verde=bajo par, rojo=sobre par.
Golfers+ usa un sistema DIFERENTE por decisión de diseño deliberada.
Esto NO es un error. NO lo corrijas. NO lo "arregles".
Si ves este sistema y crees que está mal, estás equivocado — está bien así.

```
RESULTADO    COLOR     CSS VAR    HEX       RAZÓN DEL COLOR
──────────────────────────────────────────────────────────
Eagle (-2):  AZUL      --eagle    #3b82f6   Frío, precisión técnica
Birdie (-1): ROJO      --birdie   #ef4444   Intensidad, emoción
Par (0):     GRIS      --par      #6b7280   Neutro, base
Bogey (+1):  DORADO    --bogey    #c4992a   Marca Golfers+, no negativo
Doble+ (+2): ROJO OSC  --double   #dc2626   Señal de alerta
```

**HoleColorBar** — componente YA EXISTE en src/components/HoleColorBar.tsx
NO reimplementar. Usa colores distintos (para la barra de mini-historial):
```
Eagle/Albatros: #93C5FD | Birdie: #FCA5A5 | Par: #86EFAC
Bogey: #FCD34D | Doble: #F87171 | Triple+: #DC2626 | Sin score: rgba(0,0,0,0.08)
```

**Indicadores de forma (shapes) para el scorecard:**
```
HIO:      círculo dorado relleno + doble outline
Albatros: círculo azul relleno + doble circle
Eagle:    doble círculo azul vacío
Birdie:   círculo rojo simple vacío
Par:      sin indicador visual
Bogey:    cuadrado dorado simple vacío
Doble:    doble cuadrado rojo vacío
Triple+:  cuadrado rojo oscuro relleno, número blanco
```

---

## 2.3 TIPOGRAFÍA — 4 FUENTES, CADA UNA CON SU ROL

El proyecto usa cuatro fuentes de Google Fonts. Cada una tiene un propósito
específico. Mezclarlas incorrectamente rompe la jerarquía visual del producto.

```
FUENTE 1: Playfair Display — var(--font-playfair)
  Pesos: 700 y 900
  Cuándo usar: títulos H1 de página, nombres de torneos, secciones hero
  Cuándo NO usar: botones, labels, párrafos, inputs
  Tamaños: H1 28-36px desktop / 22-26px mobile

FUENTE 2: DM Sans — var(--font-dm-sans) [DEFAULT del body]
  Pesos: 400 (normal), 500 (medium), 600 (semibold)
  Cuándo usar: TODA la UI — botones, labels, navegación, párrafos, inputs
  Es la fuente de todo lo que no es título ni dato numérico

FUENTE 3: DM Mono
  Pesos: 300, 400, 500
  Cuándo usar: etiquetas de métricas y datos codificados
               SIEMPRE en UPPERCASE + letter-spacing: 0.08em
               Ejemplos: "GWI™" · "CAT. A" · "PAR 72" · "HOYO 1" · "THRU H.6"
  Cuándo NO usar: párrafos, botones, labels normales

FUENTE 4: Cormorant Garamond
  Pesos: 300 (light), 400, 600
  Cuándo usar: SOLO para números grandes e impactantes
               Score en el gauge del GWI, hero stats del perfil, datos destacados
               La razón: crea impacto visual con sus serif elegantes
  Cuándo NO usar: cualquier otra cosa — párrafos, labels, botones
  Tamaños: GWI gauge 52px / hero stats 32px / data cards 22px

NUNCA usar: Inter (fue reemplazada) · Arial · Roboto · system-ui
```

---

## 2.4 COMPONENTES — ESPECIFICACIONES EXACTAS

### Botón primario (todas las acciones principales)
```css
background:    var(--brand)       /* #c4992a */
color:         var(--brand-dark)  /* #070d18 — oscuro sobre dorado */
border-radius: 10px
height:        44px               /* MÍNIMO OBLIGATORIO — estándar táctil iOS */
font-size:     13px
font-weight:   600
font-family:   var(--font-dm-sans)
padding:       12px 20px
transition:    background 0.15s ease
hover-bg:      var(--brand-hover) /* #a67d1e */
```

### Card oscura estándar (dashboard, perfil, menú)
```css
background:    var(--bg-card-light)  /* #0e1c2f */
border:        1px solid var(--border)
border-radius: 14px
padding:       20px
box-shadow:    var(--shadow-card)
```

### Card destacada (Ronda Libre — la más importante del dashboard)
```css
background:    var(--gold-soft)      /* rgba(200,165,90,.18) */
border:        1px solid var(--border-md)
border-radius: 14px
padding:       20px
```

### Card formulario (pantallas claras — Nueva Ronda, editar perfil)
```css
background:    rgb(249, 250, 251)
border:        1px solid rgb(229, 231, 235)
border-radius: 16px
padding:       16px
```

### Input (campos de texto y selección)
```css
background:    var(--input-bg)     /* hsla(0,0%,100%,.04) */
border:        1px solid var(--input-border)
color:         var(--text)
border-radius: 10px
padding:       10px 14px
font-size:     16px  /* CRÍTICO: menos de 16px hace zoom automático en iOS */
focus-border:  var(--input-focus)
```

### Bottom Bar de navegación
```css
position: fixed; bottom: 0; left: 0; right: 0
background: linear-gradient(to bottom, rgba(7,13,24,0.9), rgba(7,13,24,1))
padding-bottom: env(safe-area-inset-bottom, 0px)  /* OBLIGATORIO para iPhone X+ */
height: ~80px
```

### Badge LIVE (rondas activas)
```css
background: rgba(74,222,128,.15); color: #4ade80
border: 1px solid rgba(74,222,128,.3)
border-radius: 4px
font-size: 9px; font-weight: 700; letter-spacing: 0.08em
padding: 2px 6px
font-family: DM Mono, uppercase
```

### Badge IA / dorado (features premium)
```css
background: rgba(196,153,42,.15); color: var(--brand)
border: 1px solid rgba(196,153,42,.3)
border-radius: 4px
font-size: 9px; font-weight: 700
padding: 2px 6px
```

---

## 2.5 LOS DOS MODOS VISUALES

La app tiene dos contextos visuales diferentes. Elegir el incorrecto rompe la
coherencia del producto.

**MODO OSCURO — usar en todas las pantallas de información y social:**
```
Dashboard, Menú hamburguesa, Importar, Perfil, Estadísticas,
Leaderboard, tAIger+, Feed /en-vivo, Historial, Coach,
Score page de ronda activa.

Fondo página:  var(--bg) #070d18
Cards:         var(--bg-card-light) #0e1c2f
Texto:         var(--text) #edeae4
Texto 2°:      var(--text-2) #94a8c0
```

**MODO CLARO — usar en formularios donde el usuario toma acción:**
```
Nueva Ronda, Editar perfil, Configuración,
Pantalla de resultado de ronda finalizada.

Fondo página:  rgb(255,255,255) o rgb(243,244,246)
Cards:         rgb(249,250,251)
Bordes:        rgb(229,231,235)
Texto:         rgb(17,24,39)
```

---

## 2.6 ANIMACIONES DEL PROYECTO
```css
/* Estas animaciones ya están en globals.css — usar referencia, no redefinir */
@keyframes livePulse    { 50% { transform: scale(1.4); opacity: 0.6; } }
@keyframes scoreBounce  { 40% { transform: scale(1.1); } 100% { transform: scale(1); } }
@keyframes flashGreen   { 0% { background: rgba(0,230,118,0.15); } 100% { background: transparent; } }
@keyframes flashRed     { 0% { background: rgba(255,23,68,0.15); } 100% { background: transparent; } }
@keyframes slideInRight { from { opacity:0; transform:translateX(20px); } }
/* Duraciones: flash 600ms · bounce 300ms · pulse 2s infinite · slide 300ms */
```

---

## 2.7 ESPACIADO Y REGLAS MÓVILES
```
Padding lateral página:    16px
Gap entre secciones:       24px
Gap entre cards:           12px
Card border-radius (dark): 14px
Card border-radius (light): 16px
Botón border-radius:       10px
Padding inferior scroll:   80px (evitar que la bottom bar tape el contenido)
Font inputs:               16px MÍNIMO (zoom iOS se activa con menos)
Touch targets:             44x44px MÍNIMO (estándar táctil Apple)
Safe area iPhone:          env(safe-area-inset-bottom, 0px) en todo elemento fixed abajo
```

---

## 2.8 REGLAS DE DISEÑO QUE NUNCA SE VIOLAN
```
❌ NUNCA Cormorant Garamond en párrafos o labels
❌ NUNCA Inter — fue reemplazada por DM Sans
❌ NUNCA hardcodear colores cuando existe CSS variable equivalente
❌ NUNCA cambiar el sistema de colores de score (no convencional a propósito)
❌ NUNCA botones de menos de 44px de altura
❌ NUNCA inputs con font-size < 16px (provoca zoom automático en iOS)
❌ NUNCA omitir env(safe-area-inset-bottom) en elementos fixed abajo
❌ NUNCA escribir "Handicap" visible — el término correcto es "Índice"
❌ NUNCA escribir "el tAIger+" — el nombre va sin artículo
❌ NUNCA escribir "Golfers +" con espacio — es "Golfers+"
❌ NUNCA textos en inglés visibles al usuario
❌ NUNCA data.map() sin el (data ?? []) defensivo antes
❌ NUNCA scores como número absoluto en UI — siempre vs par (+1, E, -2)
❌ NUNCA yardajes en metros — siempre en yardas
❌ NUNCA fechas en formato "2026-03-24" — siempre "24 mar 2026"
```

---

# PARTE 3 — PROTOCOLO DE EJECUCIÓN

## Cómo ejecutar los sprints

**Claude Code ejecuta cada sprint de principio a fin sin interrupciones.**
No hace preguntas intermedias. No pide confirmación entre pasos.
Solo reporta el resultado completo cuando el sprint está terminado
y verificado en producción.

Cada sprint sigue internamente una estructura de 3 capas, pero eso
es lógica interna — no se pide permiso para avanzar entre capas.

```
CAPA 1 — MAPEO Y ESTRUCTURA
  Hacer todos los greps necesarios para entender el estado actual.
  Crear archivos vacíos con tipos. Verificar que el proyecto compila.
  Propósito: nunca tocar código sin saber primero qué existe.

CAPA 2 — DISEÑO Y UI
  Aplicar el design system completo.
  Usar datos mock para visualizar si los datos reales no están listos.
  Propósito: el diseño aprobado antes de conectar lógica.

CAPA 3 — FUNCIONALIDAD Y DATOS
  Conectar Supabase, lógica de negocio, SQL, Realtime.
  Ejecutar SQL directamente si corresponde.
  Propósito: todo funciona con datos reales.
```

## Proceso completo de un sprint
```bash
# Al inicio de cada sprint, ejecutar siempre:
git pull origin main
curl https://golfersplus.vercel.app/api/admin/health
git log --oneline -5
npx tsc --noEmit 2>&1 | tail -10

# Durante el sprint: grep antes de cada tarea
grep -rn "TÉRMINO" src/ --include="*.tsx" --include="*.ts"

# Al terminar el sprint:
npx tsc --noEmit        # 0 errores TypeScript
npm run build           # build exitoso
node scripts/update-docs.js
git add .
git commit -m "descripción clara del sprint"
git push origin main

# Solo entonces: reportar el resultado al usuario
```

## Reporte final de cada sprint

Al terminar, el reporte debe incluir:
1. **Qué se hizo** — en lenguaje simple, sin tecnicismos
2. **Qué archivos se crearon o modificaron**
3. **Cómo probar** — pasos exactos para verificar en el celular
4. **SQL ejecutado** — qué migraciones corrieron y resultado
5. **Tabla de verificación** — ✅ o ❌ por cada ítem de la lista al final del sprint
6. **Si algo quedó bloqueado** — razón exacta y qué decide Juanjo

---

# PARTE 4 — LOS 9 SPRINTS

**Orden de ejecución:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

---

## ════════════════════════════════════════════
## SPRINT 1 — Arreglos urgentes post-prueba en cancha
## ════════════════════════════════════════════

**Por qué este sprint existe:**
Golfers+ fue probada en condiciones reales de juego y aparecieron problemas
que afectan la experiencia core del producto. Un jugador en el hoyo 7 con
el sol en la cara necesita que la app funcione sin pensar. Estos arreglos
son el prerequisito de todo lo demás — construir encima de algo roto
solo multiplica los problemas.

**Qué resuelve:**
- El número del score se solapa visualmente con los botones (layout roto)
- No hay indicador "Thru H.6" que muestre cuántos hoyos van jugados
- El teclado del iPhone muestra letras en lugar de números al ingresar score
- Cuando alguien hace click en un link de ronda sin estar logueado,
  después del login vuelve al dashboard en lugar de a la ronda
- No existe la opción de empezar en un hoyo distinto al 1 (shotgun starts)

**Tiempo estimado:** 2-3 horas

---

**MAPEO INICIAL — ejecutar todo esto antes de tocar código:**
```bash
# Ver dónde está el layout de la score page y cómo está estructurado
grep -rn "position.*absolute\|flex.*column\|height.*dvh\|overflow.*hidden" \
  src/app/ronda-libre/ --include="*.tsx" | head -10

# Ver si el header de la score page ya tiene Thru y H.X
grep -rn "Thru\|thru\|H\.1\|H\.X\|hoyoActual\|hoyo.*header" \
  src/app/ronda-libre/ --include="*.tsx"

# Ver cómo funciona el auth redirect hoy
grep -rn "sanitizeNext\|next=\|callbackUrl\|redirectTo\|middleware" \
  src/middleware.ts src/app/auth/ src/app/login/ --include="*.tsx" --include="*.ts"

# Ver si existe el toggle de partida simultánea
grep -rn "partidaSimultanea\|simultan\|hoyo_inicio\|generarOrden" \
  src/app/ronda-libre/ --include="*.tsx" --include="*.ts"

# Ver si hoyo_inicio ya existe en la BD
grep -rn "hoyo_inicio" supabase/migrations/ --include="*.sql"

# Ver dónde y cómo se define el input de ingreso de score
grep -rn "inputMode\|type.*number\|handleScore\|setCurrentScore" \
  src/app/ronda-libre/ --include="*.tsx"
```

---

**TAREA 1 — Layout del scorecard: eliminar solapamientos**

El problema raíz es `position:absolute` en el bloque de score+botones,
que desacopla visualmente el número de los controles.
La solución es un layout flex puro sin absolutas.

```tsx
{/* Estructura correcta del scorecard — sin position:absolute */}
{/* Contenedor padre */}
<div style={{
  display: 'flex', flexDirection: 'column',
  height: '100dvh', overflow: 'hidden',
  background: 'var(--bg)',  /* #070d18 — scorecard siempre oscuro */
}}>
  {/* Header fijo */}
  <header style={{ flexShrink: 0 }}>...</header>

  {/* Barra de progreso (dots de hoyos) */}
  <div style={{ flexShrink: 0 }}>...</div>

  {/* Info del hoyo: Par, yardas, HDCP */}
  <div style={{ flexShrink: 0 }}>...</div>

  {/* Toggle Scorecard/Leaderboard (solo con >1 jugador) */}
  {players.length > 1 && <div style={{ flexShrink: 0 }}>...</div>}

  {/* ZONA CENTRAL — ocupa todo el espacio disponible */}
  <div style={{
    flex: 1, minHeight: 0,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    overflowY: 'auto',  /* scroll si el contenido no cabe */
    padding: '20px 20px 16px',
  }}>
    {/* Número del score — SIEMPRE blanco, fondo siempre oscuro */}
    <div style={{
      fontSize: '88px', fontWeight: 700, lineHeight: 1,
      color: currentScore !== null ? 'var(--ivory)' : 'rgba(255,255,255,0.2)',
      fontFamily: 'var(--font-dm-sans)',
      letterSpacing: '-3px', userSelect: 'none', cursor: 'pointer',
    }}>
      {currentScore ?? '—'}
    </div>

    <div style={{ height: '8px' }} />

    {/* Chip de resultado (ver Tarea 2) */}

    <div style={{ height: '20px' }} />

    {/* Botones + y − */}
    <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
      <button style={{
        width: '72px', height: '66px', borderRadius: '20px',
        fontSize: '30px', fontWeight: 300,
        background: 'rgba(255,255,255,0.07)',
        color: 'rgba(255,255,255,0.7)',
        border: '1px solid rgba(255,255,255,0.1)',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      }}>−</button>
      <button style={{
        width: '72px', height: '66px', borderRadius: '20px',
        fontSize: '30px', fontWeight: 600,
        background: 'var(--brand)',  /* #c4992a */
        color: 'var(--brand-dark)',  /* #070d18 */
        border: 'none', cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      }}>+</button>
    </div>

    {/* Feedback de guardado — altura fija para no mover el layout */}
    <div style={{ height: '28px', marginTop: '8px',
                  display: 'flex', alignItems: 'center' }}>
      {saveStatus === 'saving'  && <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.25)' }}>Guardando…</span>}
      {saveStatus === 'saved'   && <span style={{ fontSize:'11px', color:'#6EE7B7' }}>✓ Guardado</span>}
      {saveStatus === 'offline' && <span style={{ fontSize:'11px', color:' var(--bogey)' }}>⚠ Sin conexión — guardado local</span>}
      {saveStatus === 'error'   && <span style={{ fontSize:'11px', color:'var(--birdie)' }}>Error al guardar</span>}
    </div>
  </div>

  {/* Mini leaderboard — fijo abajo */}
  <div style={{ flexShrink: 0 }}>...</div>

  {/* Botón Siguiente / Finalizar */}
  <div style={{ flexShrink: 0, padding: '12px 16px',
                paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
    <button style={{
      width: '100%', height: '52px',
      background: allScored ? '#16A34A' : 'var(--brand)',
      color: 'var(--brand-dark)',
      borderRadius: '14px', fontSize: '16px', fontWeight: 700,
      border: 'none', cursor: 'pointer',
      transition: 'background 0.3s ease',
    }}>
      {isLastHole ? 'Finalizar ronda ✓' : 'Siguiente →'}
    </button>
  </div>
</div>
```

---

**TAREA 2 — Chip de resultado (Eagle/Birdie/Par/Bogey/etc)**

El chip debe aparecer inmediatamente debajo del número del score.
El bug actual es que el score llega como string en algunos casos.

```typescript
// Función getScoreIndicator — agregar en src/lib/golf-utils.ts o inline
// (buscar con grep si ya existe: grep -rn "getScoreIndicator\|scoreIndicator" src/)
export function getScoreIndicator(gross: number, par: number) {
  const diff = gross - par
  if (gross === 1)   return { label: 'HIO',      color: 'var(--brand)' }
  if (diff <= -3)    return { label: 'Albatros',  color: 'var(--eagle)' }
  if (diff === -2)   return { label: 'Eagle',     color: 'var(--eagle)' }
  if (diff === -1)   return { label: 'Birdie',    color: 'var(--birdie)' }
  if (diff === 0)    return { label: 'Par',       color: 'var(--par)' }
  if (diff === 1)    return { label: 'Bogey',     color: 'var(--bogey)' }
  if (diff === 2)    return { label: 'Doble',     color: 'var(--double)' }
  return             { label: `+${diff}`,         color: 'var(--double)' }
}

// En el JSX, normalizar el tipo antes de usar:
const scoreAsNumber = typeof currentScore === 'string'
  ? parseInt(currentScore, 10) : currentScore

{scoreAsNumber !== null && !isNaN(scoreAsNumber) && (() => {
  const { label, color } = getScoreIndicator(scoreAsNumber, holePar)
  return (
    <div style={{
      padding: '4px 16px', borderRadius: '20px',
      fontSize: '12px', fontWeight: 500, fontFamily: 'var(--font-dm-sans)',
      color,
      background: `${color}22`,  /* color con 13% opacidad */
      border: `1px solid ${color}44`,
    }}>{label}</div>
  )
})()}
```

---

**TAREA 3 — Header con H.X y Thru X/18**

```tsx
{/* En el header de la score page, esquina superior derecha */}
<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
  <span style={{
    fontSize: '12px', fontWeight: 600,
    fontFamily: 'DM Mono, monospace',
    color: 'var(--brand)',  /* #c4992a */
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  }}>
    H.{currentHole}
  </span>
  <span style={{
    fontSize: '10px', fontWeight: 400,
    fontFamily: 'DM Mono, monospace',
    color: 'var(--text-2)',  /* #94a8c0 */
    letterSpacing: '0.02em',
  }}>
    Thru {holesCompleted}/{totalHoles}
  </span>
</div>
```

---

**TAREA 4 — Input teclado numérico iOS**

```tsx
{/* Si hay un input visible para ingresar el score, agregar: */}
<input
  type="number"
  inputMode="decimal"
  pattern="[0-9]*"
  /* ... resto de props ... */
/>
{/* Si el score se ingresa con botones +/− (sin input visible),
    verificar que el div del número tiene: */}
<div
  onClick={openScoreEditor}
  style={{ cursor: 'pointer' }}
  /* Sin input = no hay problema de zoom */
/>
```

---

**TAREA 5 — Deep link post-auth**

```typescript
// En middleware.ts o en la lógica de redirect:
// Cuando el usuario sin auth intenta acceder a una ruta protegida,
// guardar la URL destino como parámetro:
redirect(`/login?next=${encodeURIComponent(pathname)}`)

// En la página de login, después del auth exitoso:
const searchParams = useSearchParams()
const next = searchParams.get('next') ?? '/dashboard'
// Validar que next es una URL relativa (seguridad):
const safeNext = next.startsWith('/') ? next : '/dashboard'
router.push(safeNext)
```

---

**TAREA 6 — Toggle partida simultánea en Nueva Ronda**

```tsx
{/* Si no existe, agregar en el formulario de nueva ronda */}
{/* Verificar primero: grep -rn "partidaSimultanea\|hoyo_inicio" src/app/ronda-libre/nueva/ */}

const [partidaSimultanea, setPartidaSimultanea] = useState(false)
const [hoyoInicio, setHoyoInicio] = useState(1)

{/* Checkbox/toggle */}
<div style={{
  display: 'flex', alignItems: 'center', gap: '12px',
  padding: '14px 16px',
  background: 'rgb(249,250,251)',
  border: '1px solid rgb(229,231,235)',
  borderRadius: '12px',
}}>
  <input
    type="checkbox"
    id="partida-simultanea"
    checked={partidaSimultanea}
    onChange={e => setPartidaSimultanea(e.target.checked)}
    style={{ width: '18px', height: '18px', accentColor: 'var(--brand)' }}
  />
  <div>
    <label htmlFor="partida-simultanea" style={{
      fontSize: '14px', fontWeight: 600, color: 'rgb(17,24,39)', cursor: 'pointer',
    }}>
      Partida simultánea
    </label>
    <p style={{ fontSize: '12px', color: 'rgb(107,114,128)', margin: 0 }}>
      Empieza en un hoyo distinto al 1
    </p>
  </div>
</div>

{/* Selector de hoyo de inicio — solo cuando está activado */}
{partidaSimultanea && (
  <div style={{ /* mismo estilo de card */ }}>
    <label style={{ /* label estilo */ }}>Hoyo de inicio</label>
    <select
      value={hoyoInicio}
      onChange={e => setHoyoInicio(Number(e.target.value))}
      style={{ fontSize: '16px' /* evitar zoom iOS */ }}
    >
      {Array.from({ length: 18 }, (_, i) => i + 1).map(n => (
        <option key={n} value={n}>Hoyo {n}</option>
      ))}
    </select>
  </div>
)}
```

**SQL para hoyo_inicio (ejecutar si la columna no existe):**
```sql
ALTER TABLE rondas_libres
  ADD COLUMN IF NOT EXISTS hoyo_inicio INTEGER DEFAULT 1;
```

**Función de orden de hoyos (agregar en scoring.ts):**
```typescript
// Si hoyo_inicio=7 y total=18, genera: [7,8,9,10,11,12,13,14,15,16,17,18,1,2,3,4,5,6]
export function generarOrdenHoyos(inicio: number, total: number): number[] {
  return Array.from({ length: total }, (_, i) => ((inicio - 1 + i) % total) + 1)
}
```

---

**AL TERMINAR — ejecutar en orden:**
```bash
npx tsc --noEmit
npm run build
node scripts/update-docs.js
git add .
git commit -m "fix: layout scorecard, chip resultado, header Thru/H.X, deep link, teclado decimal, partida simultánea"
git push origin main
```

**TABLA DE VERIFICACIÓN FINAL (incluir en el reporte):**
```
□ Score número visible sin solapamiento con botones (probar en 390px)
□ Chip "Eagle/Birdie/Par/Bogey" aparece debajo del número
□ Header muestra "H.7" y "Thru 6/18" en esquina derecha
□ Teclado numérico en iOS al interactuar con el score
□ Deep link: ir a /ronda-libre/XYZ/score sin login
  → login → vuelve a /ronda-libre/XYZ/score (no a /dashboard)
□ Toggle "Partida simultánea" visible en nueva ronda
□ Al activar toggle: selector de hoyo 1-18 aparece
□ TypeScript: 0 errores | Build: exitoso | Push: exitoso
```

---

## ════════════════════════════════════════════
## SPRINT 2 — Celebración + Share Card + Mini Leaderboard
## ════════════════════════════════════════════

**Por qué este sprint existe:**
El loop viral de Golfers+ depende de un momento: cuando el jugador
termina la ronda y quiere compartirlo. Hoy ese momento no existe —
la ronda simplemente "termina" sin ninguna señal de celebración.
Cada ronda terminada sin la share card es una oportunidad de
marketing perdida. Este sprint activa el mecanismo de crecimiento
orgánico más importante del producto.

**Qué resuelve:**
- Al terminar los 18 hoyos no pasa nada — ahora aparece una pantalla de celebración
- No hay forma de compartir el resultado por WhatsApp — ahora genera una imagen 1080x1920
- No se ve quién va ganando mientras se juega — ahora hay un mini leaderboard

**Tiempo estimado:** 3-4 horas

---

**MAPEO INICIAL:**
```bash
# Ver si ya existe algo de celebración
grep -rn "CelebracionRonda\|celebraci\|shareCard\|share-card\|MiniLeaderboard\|compartir.*resultado" \
  src/ --include="*.tsx" --include="*.ts"

# Ver cómo la score page detecta cuándo termina la ronda
grep -rn "closed\|finaliz\|todosCompletos\|allScored\|isLastHole\|handleFinish" \
  src/app/ronda-libre/ --include="*.tsx" --include="*.ts"

# Ver componentes existentes para no duplicar
ls src/components/

# Ver si hay canal de Realtime activo en la score page
grep -rn "channel\|postgres_changes\|subscribe\|realtime" \
  src/app/ronda-libre/ --include="*.tsx" --include="*.ts"
```

---

**TAREA 1 — Crear src/components/CelebracionRonda.tsx**

Overlay que aparece cuando todos los jugadores completan todos los hoyos.

```tsx
'use client'
import { useState, useEffect } from 'react'

interface Props {
  ganador: { nombre: string; totalGross: number }
  parTotal: number
  cancha: string
  fecha: string
  totalJugadores: number
  onCompartir: () => Promise<void>
  onVerResultado: () => void
}

export default function CelebracionRonda({
  ganador, parTotal, cancha, fecha,
  totalJugadores, onCompartir, onVerResultado
}: Props) {
  const [compartiendo, setCompartiendo] = useState(false)
  const diff = ganador.totalGross - parTotal
  const diffStr = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : String(diff)
  const diffColor = diff <= -2 ? 'var(--eagle)' : diff === -1 ? 'var(--birdie)'
                  : diff === 0 ? 'var(--par)' : diff === 1 ? 'var(--bogey)' : 'var(--double)'

  const handleCompartir = async () => {
    setCompartiendo(true)
    try { await onCompartir() }
    finally { setCompartiendo(false) }
  }

  return (
    {/* MODO CLARO — pantalla de resultado siempre es clara */}
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgb(255,255,255)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px',
      animation: 'slideInRight 0.3s ease',
    }}>
      <div style={{ fontSize: '64px', marginBottom: '16px' }}>🏆</div>

      <p style={{
        fontFamily: 'var(--font-dm-sans)', fontSize: '13px',
        fontWeight: 600, color: 'var(--brand)',
        letterSpacing: '0.1em', textTransform: 'uppercase',
        marginBottom: '8px',
      }}>
        {totalJugadores > 1 ? 'Ganador' : '¡Ronda completada!'}
      </p>

      <h1 style={{
        fontFamily: 'var(--font-playfair)',
        fontSize: '28px', fontWeight: 700,
        color: 'rgb(17,24,39)',
        textAlign: 'center', marginBottom: '12px',
      }}>
        {ganador.nombre}
      </h1>

      <div style={{
        fontFamily: 'Cormorant Garamond, serif',
        fontSize: '64px', fontWeight: 300,
        color: diffColor, marginBottom: '8px',
      }}>
        {diffStr}
      </div>

      <p style={{
        fontFamily: 'var(--font-dm-sans)',
        fontSize: '13px', color: 'rgb(107,114,128)',
        marginBottom: '32px', textAlign: 'center',
      }}>
        {cancha} · {fecha}
      </p>

      <button
        onClick={handleCompartir}
        disabled={compartiendo}
        style={{
          width: '100%', height: '52px', marginBottom: '12px',
          background: compartiendo ? 'var(--brand-hover)' : 'var(--brand)',
          color: 'var(--brand-dark)', borderRadius: '12px',
          fontSize: '15px', fontWeight: 700,
          fontFamily: 'var(--font-dm-sans)',
          border: 'none', cursor: 'pointer',
        }}
      >
        {compartiendo ? 'Generando imagen...' : '📤 Compartir resultado'}
      </button>

      <button
        onClick={onVerResultado}
        style={{
          width: '100%', height: '48px',
          background: 'transparent',
          color: 'rgb(107,114,128)',
          border: '1px solid rgb(229,231,235)',
          borderRadius: '12px', fontSize: '14px',
          fontFamily: 'var(--font-dm-sans)', cursor: 'pointer',
        }}
      >
        Ver resultado completo →
      </button>
    </div>
  )
}
```

---

**TAREA 2 — Crear src/lib/share-card.ts**

Canvas API para generar imagen 1080x1920 (formato historia de WhatsApp/Instagram).

```typescript
export interface ShareCardParams {
  nombreGanador: string
  totalGross: number
  parTotal: number
  cancha: string
  fecha: string
  totalJugadores: number
  jugadores: Array<{ nombre: string; totalGross: number }>
}

export async function generarShareCard(params: ShareCardParams): Promise<Blob> {
  const { nombreGanador, totalGross, parTotal, cancha, fecha, jugadores } = params
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1920
  const ctx = canvas.getContext('2d')!

  const diff = totalGross - parTotal
  const diffStr = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : String(diff)

  // Sistema de colores del proyecto — mantener consistencia con la app
  const scoreColor = diff <= -2 ? '#3b82f6'   // var(--eagle)
                   : diff === -1 ? '#ef4444'  // var(--birdie)
                   : diff === 0  ? '#6b7280'  // var(--par)
                   : diff === 1  ? '#c4992a'  // var(--bogey)
                   : '#dc2626'                // var(--double)

  // Fondo oscuro premium
  ctx.fillStyle = '#070d18'  // var(--bg)
  ctx.fillRect(0, 0, 1080, 1920)

  // Línea dorada superior (brand accent)
  ctx.fillStyle = '#c4992a'  // var(--brand)
  ctx.fillRect(0, 0, 1080, 10)

  // "Golfers+" — branding
  ctx.fillStyle = '#c4992a'
  ctx.font = 'bold 52px "DM Sans", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Golfers+', 540, 180)

  // Cancha y fecha — pequeño, sobre el nombre
  ctx.fillStyle = '#94a8c0'  // var(--text-2)
  ctx.font = '38px "DM Sans", sans-serif'
  ctx.fillText(cancha, 540, 380)
  ctx.font = '32px "DM Sans", sans-serif'
  ctx.fillText(fecha, 540, 440)

  // Nombre del ganador
  ctx.fillStyle = '#f3efe6'  // var(--ivory)
  ctx.font = 'bold 76px "DM Sans", sans-serif'
  ctx.fillText(nombreGanador, 540, 580)

  // Score grande — el protagonista
  ctx.fillStyle = scoreColor
  ctx.font = '300 160px "DM Sans", sans-serif'
  ctx.fillText(diffStr, 540, 820)

  // Score gross pequeño debajo
  ctx.fillStyle = 'rgba(243,239,230,0.5)'
  ctx.font = '36px "DM Sans", sans-serif'
  ctx.fillText(`${totalGross} golpes`, 540, 920)

  // Línea divisoria
  ctx.strokeStyle = 'rgba(196,153,42,0.3)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(100, 1000); ctx.lineTo(980, 1000)
  ctx.stroke()

  // Leaderboard mini (hasta 4 jugadores)
  if (jugadores.length > 1) {
    const sorted = [...jugadores].sort((a, b) => a.totalGross - b.totalGross)
    sorted.slice(0, 4).forEach((j, i) => {
      const y = 1100 + (i * 90)
      const jdiff = j.totalGross - parTotal
      const jStr = jdiff === 0 ? 'E' : jdiff > 0 ? `+${jdiff}` : String(jdiff)
      ctx.fillStyle = i === 0 ? '#c4992a' : 'rgba(243,239,230,0.45)'
      ctx.font = i === 0 ? 'bold 40px "DM Sans", sans-serif' : '36px "DM Sans", sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`${i + 1}  ${j.nombre}`, 120, y)
      ctx.textAlign = 'right'
      ctx.fillText(jStr, 960, y)
    })
    ctx.textAlign = 'center'
  }

  // Línea dorada inferior
  ctx.fillStyle = '#c4992a'
  ctx.fillRect(0, 1910, 1080, 10)

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob!), 'image/png', 0.95)
  })
}

export async function compartirResultado(params: ShareCardParams): Promise<void> {
  const blob = await generarShareCard(params)
  const file = new File([blob], 'golfers-resultado.png', { type: 'image/png' })

  if (navigator.share && navigator.canShare({ files: [file] })) {
    await navigator.share({
      title: `Mi ronda en ${params.cancha}`,
      text: `Jugué ${params.cancha} — Golfers+`,
      files: [file],
    })
  } else {
    // Fallback: descargar directamente
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'golfers-resultado.png'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}
```

---

**TAREA 3 — Crear src/components/MiniLeaderboard.tsx**

Componente compacto en la score page que muestra posiciones en tiempo real.
Recibe datos por props — no hace fetching propio para no duplicar requests.

```tsx
'use client'

interface Jugador {
  id: string
  nombre: string
  totalGross: number
  holesCompleted: number
}

interface Props {
  jugadores: Jugador[]
  parTotal: number
  currentUserId?: string
}

export default function MiniLeaderboard({ jugadores, parTotal, currentUserId }: Props) {
  if (jugadores.length < 2) return null

  const sorted = [...jugadores]
    .filter(j => j.totalGross > 0)
    .sort((a, b) => a.totalGross - b.totalGross)

  return (
    <div style={{
      borderTop: '1px solid rgba(255,255,255,0.07)',
      padding: '8px 16px',
      display: 'flex', gap: '8px',
      overflowX: 'auto',
      scrollbarWidth: 'none',
    }}>
      {sorted.map((j, idx) => {
        const diff = j.totalGross - parTotal
        const diffStr = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : String(diff)
        const isCurrentUser = j.id === currentUserId
        const isLeader = idx === 0

        return (
          <div key={j.id} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: '2px', padding: '4px 10px', borderRadius: '8px', flexShrink: 0,
            background: isCurrentUser
              ? 'rgba(196,153,42,0.12)'
              : isLeader
              ? 'rgba(255,255,255,0.05)'
              : 'transparent',
            border: isCurrentUser
              ? '1px solid rgba(196,153,42,0.25)'
              : '1px solid transparent',
          }}>
            <span style={{
              fontSize: '9px', fontFamily: 'DM Mono, monospace',
              color: isLeader ? 'var(--gold)' : 'var(--text-3)',
              letterSpacing: '0.04em',
            }}>
              #{idx + 1}
            </span>
            <span style={{
              fontSize: '11px', fontFamily: 'var(--font-dm-sans)',
              fontWeight: isCurrentUser ? 600 : 400,
              color: isCurrentUser ? 'var(--ivory)' : 'var(--text-2)',
              maxWidth: '70px', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {j.nombre.split(' ')[0]}
            </span>
            <span style={{
              fontSize: '13px', fontWeight: 700,
              fontFamily: 'DM Mono, monospace',
              color: diff <= -2 ? 'var(--eagle)'
                   : diff === -1 ? 'var(--birdie)'
                   : diff === 0 ? 'var(--par)'
                   : diff === 1 ? 'var(--bogey)'
                   : 'var(--double)',
            }}>
              {diffStr}
            </span>
          </div>
        )
      })}
    </div>
  )
}
```

---

**TAREA 4 — Integrar en la score page**

```typescript
// En la score page, detectar cuando todos completaron:
const totalHoyos = ronda.holes ?? 18
const todosCompletos = jugadores.length > 0 && jugadores.every(j => {
  const scores = j.scores ?? {}
  return Object.values(scores)
    .filter(s => s != null && Number(s) > 0).length >= totalHoyos
})

// Mostrar CelebracionRonda cuando todosCompletos === true
// Al mismo tiempo, cerrar la ronda en Supabase:
if (todosCompletos && ronda.estado !== 'closed') {
  await supabase.from('rondas_libres')
    .update({ estado: 'closed' })
    .eq('id', ronda.id)
}

// Conectar el Realtime al MiniLeaderboard:
// Reusar canal existente si hay uno (grep primero)
// Si no hay: crear uno nuevo para ronda_libre_jugadores
```

---

**AL TERMINAR:**
```bash
npx tsc --noEmit
npm run build
node scripts/update-docs.js
git add .
git commit -m "feat: celebración de ronda, share card Canvas 1080x1920, mini leaderboard realtime"
git push origin main
```

**TABLA DE VERIFICACIÓN FINAL:**
```
□ Al completar 18 hoyos → pantalla de celebración aparece automáticamente
□ Nombre del ganador y score vs par visibles en la celebración
□ Botón "Compartir resultado" genera imagen y abre Web Share API en iOS
□ En desktop/Android sin Share API → imagen se descarga directamente
□ Imagen generada usa el sistema de colores del proyecto
  (Eagle=azul, Birdie=rojo, Par=gris, Bogey=dorado, Doble=rojo oscuro)
□ Mini leaderboard visible en score page con >1 jugador
□ Mini leaderboard se actualiza cuando otro jugador ingresa un score
□ TypeScript: 0 errores | Build: exitoso | Push: exitoso
```

---

## ════════════════════════════════════════════
## SPRINT 3 — Menú + Importar + Branding
## ════════════════════════════════════════════

**Por qué este sprint existe:**
El menú lateral es la primera impresión del producto después de la homepage.
Hoy tiene 4 ítems planos sin narrativa — se parece al menú de una app de
contabilidad, no al panel de control de un atleta serio.
La pantalla de importar es el momento más importante del onboarding — sin
historial importado, tAIger+ da análisis genéricos. Hoy no explica
nada de esto al usuario.
El branding tiene inconsistencias que bajan la percepción de calidad:
"Coach" en lugar de "tAIger+", "Handicap" en lugar de "Índice".

**Qué resuelve:**
- Menú plano sin narrativa → menú en 3 bloques que comunica visión de producto
- Importar sin contexto → importar con value prop y guía inteligente
- "Coach" en bottom bar → "tAIger+" con ícono correcto
- "Handicap" en perfil → "Índice" (el término correcto de la app)
- GWI mostrando "0" sin contexto → estado vacío con explicación

**Tiempo estimado:** 2-3 horas

---

**MAPEO INICIAL:**
```bash
# Ver el menú hamburguesa actual y la función de cierre
grep -rn "Leaderboard\|hamburger\|sidebar\|drawer\|setIsOpen\|setOpen\|closeMenu\|menuOpen" \
  src/app/layout.tsx src/components/ --include="*.tsx"

# Ver la bottom bar y el tab de Coach
grep -rn "bottom.*bar\|BottomBar\|Coach\|href.*coach\|tab.*nav" \
  src/app/layout.tsx src/components/ --include="*.tsx"

# Todas las ocurrencias de "Handicap" visibles al usuario
grep -rn '"Handicap"\|>Handicap<\|label.*Handicap\|Handicap.*:' \
  src/ --include="*.tsx" | grep -v "//\|interface\|type\|indice\|\.indice"

# Los handlers de upload existentes en importar — NO REIMPLEMENTAR
grep -rn "handleGarmin\|handlePhoto\|handleCSV\|handleFile\|onUpload\|wizard\|setStep" \
  src/app/importar/ --include="*.tsx" --include="*.ts"

# El GWI en estadísticas
grep -rn "GWI\|gwi\|wellness\|golf.*index" \
  src/app/perfil/stats/ --include="*.tsx" --include="*.ts"
```

---

**TAREA 1 — Menú hamburguesa en 3 bloques**

```tsx
{/* NUEVO MENÚ — reemplazar la lista actual de ítems */}
{/* Mantener el header existente con avatar + nombre + email */}

{/* Badge de nivel del usuario — agregar debajo del email */}
<div style={{
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  marginTop: '8px', padding: '4px 12px', borderRadius: '20px',
  background: 'var(--gold-soft)',
  border: '1px solid var(--border-md)',
}}>
  <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'var(--gold)' }} />
  <span style={{
    fontFamily: 'DM Mono, monospace', fontSize: '11px',
    color: 'var(--gold)', letterSpacing: '0.08em', textTransform: 'uppercase',
  }}>
    {nivelLabel}  {/* Cargar desde profiles.nivel — ver Tarea 3 */}
  </span>
</div>

<hr style={{ borderColor: 'rgba(255,255,255,0.06)', margin: '16px 0' }} />

{/* ── BLOQUE COMUNIDAD ───────────────── */}
<p style={{
  fontFamily: 'DM Mono, monospace', fontSize: '10px',
  color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em',
  textTransform: 'uppercase', margin: '0 4px 6px',
}}>Comunidad</p>

<MenuItem href="/en-vivo" icon="🟢" label="En Vivo" badge="LIVE" onClose={cerrarMenu} />
<MenuItem href="/leaderboard" icon="🏆" label="Leaderboard" onClose={cerrarMenu} />

<hr style={{ borderColor: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />

{/* ── BLOQUE MI JUEGO ────────────────── */}
<p style={{
  fontFamily: 'DM Mono, monospace', fontSize: '10px',
  color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em',
  textTransform: 'uppercase', margin: '0 4px 6px',
}}>Mi Juego</p>

<MenuItem href="/perfil/stats" icon="📊" label="Mi CPI™" onClose={cerrarMenu} />
<MenuItem href="/perfil/historial" icon="📋" label="Mis rondas" onClose={cerrarMenu} />
<MenuItem href="/coach" icon="🐯" label="tAIger+ Coach" badge="IA" onClose={cerrarMenu} />
<MenuItem href="/importar" icon="📥" label="Importar historial" onClose={cerrarMenu} />

<hr style={{ borderColor: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />

{/* ── BLOQUE CUENTA ──────────────────── */}
<p style={{
  fontFamily: 'DM Mono, monospace', fontSize: '10px',
  color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em',
  textTransform: 'uppercase', margin: '0 4px 6px',
}}>Cuenta</p>

{/* Solo visible para admins */}
{esAdmin && <MenuItem href="/admin" icon="⚙️" label="Administración" onClose={cerrarMenu} />}
{/* Mantener los botones existentes de Notificaciones y Cerrar sesión */}
```

```tsx
{/* Componente MenuItem — definir en el mismo archivo o como función local */}
function MenuItem({
  href, icon, label, badge, onClose
}: {
  href: string; icon: string; label: string; badge?: string; onClose: () => void
}) {
  return (
    <Link href={href} onClick={onClose} style={{ display: 'block', textDecoration: 'none' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 8px', borderRadius: '8px',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        <span style={{ fontSize: '18px', width: '24px', textAlign: 'center', flexShrink: 0 }}>
          {icon}
        </span>
        <span style={{
          flex: 1, fontSize: '14px', fontWeight: 500,
          fontFamily: 'var(--font-dm-sans)',
          color: 'var(--text)',
        }}>
          {label}
        </span>
        {badge && (
          <span style={{
            fontSize: '9px', fontWeight: 700,
            fontFamily: 'DM Mono, monospace',
            letterSpacing: '0.08em',
            padding: '2px 6px', borderRadius: '4px',
            background: badge === 'LIVE'
              ? 'rgba(74,222,128,0.15)' : 'rgba(196,153,42,0.15)',
            color: badge === 'LIVE' ? '#4ade80' : 'var(--brand)',
            border: badge === 'LIVE'
              ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(196,153,42,0.3)',
          }}>
            {badge}
          </span>
        )}
      </div>
    </Link>
  )
}
```

---

**TAREA 2 — Bottom bar: "Coach" → "tAIger+"**

```bash
grep -rn '"Coach"\|>Coach<\|label.*Coach\|tab.*Coach' \
  src/app/layout.tsx src/components/ --include="*.tsx"
```

Cambiar el label del tab y su ícono. El href="/coach" NO cambia.

---

**TAREA 3 — "Handicap" → "Índice" en perfil**

Solo cambiar strings visibles al usuario. No tocar variables TypeScript ni campos de BD.

Nivel del usuario en el menú:
```typescript
// Si profiles.nivel no existe, crear la columna:
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nivel INTEGER DEFAULT 1;

const [nivelLabel, setNivelLabel] = useState<string>('En Cancha')
useEffect(() => {
  if (!user) return
  supabase.from('profiles').select('nivel').eq('id', user.id).single()
    .then(({ data }) => {
      const labels: Record<number, string> = {
        1: 'Rookie', 2: 'En Cancha', 3: 'Jugador Activo', 4: 'Scratch+', 5: 'Golfer+'
      }
      setNivelLabel(labels[data?.nivel ?? 1] ?? 'En Cancha')
    })
}, [user?.id])
```

---

**TAREA 4 — Importar: rediseño con value prop y guía inteligente**

Los handlers de upload YA EXISTEN. Solo reorganizar la UI.
No reimplementar la lógica de Garmin, foto, ni CSV.

```tsx
'use client'
import { useState } from 'react'

type Metodo = 'garmin' | 'otro' | null

export default function ImportarPage() {
  const [metodo, setMetodo] = useState<Metodo>(null)

  return (
    <div style={{ padding: '24px 16px', paddingBottom: '80px' }}>
      {/* VALUE PROP — lo primero que ve el usuario */}
      <h1 style={{
        fontFamily: 'var(--font-playfair)',
        fontSize: '26px', fontWeight: 700,
        color: 'var(--ivory)', marginBottom: '10px',
      }}>
        Traer tu historial
      </h1>
      <p style={{
        fontFamily: 'var(--font-dm-sans)',
        fontSize: '14px', color: 'var(--text-2)', lineHeight: 1.6,
        marginBottom: '28px',
      }}>
        Tus rondas anteriores activan tu{' '}
        <span style={{ color: 'var(--gold)', fontWeight: 600 }}>CPI™</span>{' '}
        y le dan contexto real a{' '}
        <span style={{ color: 'var(--gold)', fontWeight: 600 }}>tAIger+</span>.
        Sin historial, el análisis es genérico.
      </p>

      {/* PREGUNTA DIAGNÓSTICA */}
      {metodo === null && (
        <div>
          <p style={{
            fontFamily: 'DM Mono, monospace', fontSize: '11px',
            color: 'var(--text-3)', letterSpacing: '0.1em',
            textTransform: 'uppercase', marginBottom: '12px',
          }}>
            ¿Con qué registrás tus rondas?
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            {[
              { id: 'garmin' as Metodo, icon: '⌚', label: 'Tengo Garmin' },
              { id: 'otro' as Metodo, icon: '📱', label: 'Otro / papel' },
            ].map(opt => (
              <button key={opt.id} onClick={() => setMetodo(opt.id)} style={{
                flex: 1, padding: '16px 12px',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border)',
                color: 'var(--ivory)', fontSize: '14px', fontWeight: 600,
                fontFamily: 'var(--font-dm-sans)',
                cursor: 'pointer',
              }}>
                <div style={{ fontSize: '28px', marginBottom: '6px' }}>{opt.icon}</div>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* FLUJO GARMIN */}
      {metodo === 'garmin' && (
        <div>
          <button onClick={() => setMetodo(null)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', fontSize: '13px',
            fontFamily: 'var(--font-dm-sans)', marginBottom: '20px', padding: 0,
          }}>
            ← Volver
          </button>

          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            borderRadius: '16px', padding: '20px', marginBottom: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '36px' }}>⌚</span>
              <div>
                <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ivory)', margin: 0 }}>
                  Garmin Golf
                </p>
                <p style={{
                  fontFamily: 'DM Mono, monospace', fontSize: '11px',
                  color: '#4ade80', margin: 0, letterSpacing: '0.04em',
                }}>
                  ~30 SEGUNDOS
                </p>
              </div>
            </div>

            {[
              'Abre la app Garmin Golf en tu teléfono',
              'Ve a Perfil → Actividad → Exportar',
              'Selecciona las rondas → Compartir archivo .FIT',
              'Sube el archivo aquí abajo',
            ].map((paso, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <div style={{
                  width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(196,153,42,0.15)',
                  border: '1px solid rgba(196,153,42,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'DM Mono, monospace', fontSize: '11px',
                  color: 'var(--brand)', fontWeight: 700,
                }}>
                  {i + 1}
                </div>
                <p style={{
                  fontSize: '13px', color: 'var(--text-2)',
                  fontFamily: 'var(--font-dm-sans)', margin: 0, lineHeight: 1.5,
                }}>
                  {paso}
                </p>
              </div>
            ))}

            {/* El área de upload existente de Garmin — mantener lógica */}
            {/* Buscar con grep y renderizar aquí el handler/componente existente */}
          </div>
        </div>
      )}

      {/* FLUJO OTRO */}
      {metodo === 'otro' && (
        <div>
          <button onClick={() => setMetodo(null)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', fontSize: '13px',
            fontFamily: 'var(--font-dm-sans)', marginBottom: '20px', padding: 0,
          }}>
            ← Volver
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Opción Foto */}
            <button
              onClick={() => { /* llamar al handler existente de foto */ }}
              style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                borderRadius: '16px', padding: '18px 16px', textAlign: 'left', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                <span style={{ fontSize: '28px' }}>📸</span>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ivory)', margin: 0 }}>
                    Foto de tarjeta
                  </p>
                  <p style={{
                    fontFamily: 'DM Mono, monospace', fontSize: '10px',
                    color: '#4ade80', margin: 0, letterSpacing: '0.04em',
                  }}>
                    ~15 SEG POR RONDA · MÁS FÁCIL
                  </p>
                </div>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-3)', margin: 0, lineHeight: 1.4 }}>
                Sacá una foto de la tarjeta física. La IA la transcribe sola.
              </p>
            </button>

            {/* Opción CSV */}
            <button
              onClick={() => { /* llamar al handler existente de CSV */ }}
              style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                borderRadius: '16px', padding: '18px 16px', textAlign: 'left', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                <span style={{ fontSize: '28px' }}>📊</span>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ivory)', margin: 0 }}>
                    CSV / Excel
                  </p>
                  <p style={{
                    fontFamily: 'DM Mono, monospace', fontSize: '10px',
                    color: 'var(--text-3)', margin: 0, letterSpacing: '0.04em',
                  }}>
                    18BIRDIES · GOLFGAMEBOOK · THEGRINT · ~1 MIN TOTAL
                  </p>
                </div>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-3)', margin: 0, lineHeight: 1.4 }}>
                Exportá desde tu app favorita y subí el archivo.
              </p>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

---

**TAREA 5 — GWI estado vacío en estadísticas**

```tsx
{/* Cuando GWI === 0 o null — NO mostrar el número "0" */}
{gwi === 0 || gwi === null ? (
  <div style={{ textAlign: 'center', padding: '32px 0' }}>
    <span style={{ fontSize: '40px' }}>📊</span>
    <p style={{
      fontFamily: 'var(--font-dm-sans)', fontSize: '15px',
      fontWeight: 600, color: 'var(--text-2)',
      margin: '12px 0 4px',
    }}>
      GWI se activa con 3+ rondas
    </p>
    <p style={{
      fontFamily: 'var(--font-dm-sans)', fontSize: '13px',
      color: 'var(--text-3)', margin: 0,
    }}>
      Jugá o importá para ver tu índice
    </p>
  </div>
) : (
  /* El componente actual del GWI — sin cambios */
  ...
)}
```

---

**AL TERMINAR:**
```bash
npx tsc --noEmit
npm run build
node scripts/update-docs.js
git add .
git commit -m "feat: menú 3 bloques + badge nivel, importar con guía, Coach→tAIger+, Handicap→Índice, GWI vacío"
git push origin main
```

**TABLA DE VERIFICACIÓN FINAL:**
```
□ Menú tiene 3 bloques: COMUNIDAD / MI JUEGO / CUENTA
□ Badge de nivel dorado visible en el header del menú
□ "🟢 En Vivo" con badge LIVE verde en el menú
□ "🐯 tAIger+ Coach" con badge IA dorado en el menú
□ "📥 Importar historial" (no solo "Importar")
□ Bottom bar dice "tAIger+" (no "Coach")
□ Perfil dice "Índice" en todas partes — nunca "Handicap"
□ Importar muestra "¿Con qué registrás tus rondas?"
□ Flujo Garmin: 4 steps numerados + "~30 SEG"
□ Flujo Otro: 2 opciones con tiempos en DM Mono
□ GWI = 0 muestra ícono + texto de contexto, no el número
□ TypeScript: 0 errores | Build: exitoso | Push: exitoso
```

---

## ════════════════════════════════════════════
## SPRINT 4 — Feed en vivo /en-vivo
## ════════════════════════════════════════════

**Por qué este sprint existe:**
Hoy Golfers+ es una app individual — cada jugador ve solo sus propias cosas.
Un jugador en el hoyo 12 no sabe que hay otras 4 partidas activas en ese
momento en el mismo club. Esta información existe en la base de datos
pero es invisible.
El feed en vivo convierte Golfers+ en una comunidad. Es el primer paso
hacia la red social del golf amateur en LatAm.
También es la primera pantalla pública — alguien puede ver el feed sin
registrarse, y si le gusta lo que ve, se registra.

**Qué crea:**
- /en-vivo: pantalla pública con todas las rondas activas en tiempo real
- /api/en-vivo: endpoint que alimenta el feed
- Widget "En Vivo Ahora" en el dashboard (invisible si no hay rondas activas)
- El ítem "🟢 En Vivo" del menú ya existe del Sprint 3 — este sprint hace que funcione

**Tiempo estimado:** 3-4 horas

---

**MAPEO INICIAL:**
```bash
# Confirmar que /en-vivo no existe todavía
curl -s -o /dev/null -w "%{http_code}" https://golfersplus.vercel.app/en-vivo

# Ver el patrón de cliente Supabase usado en las APIs existentes
grep -rn "createClient\|import.*supabase" \
  src/app/api/game/ src/app/api/gwi/ --include="*.ts" | head -5

# Ver si Realtime ya está habilitado para alguna tabla
grep -rn "postgres_changes\|realtime\|channel\|subscribe" \
  src/ --include="*.tsx" --include="*.ts" | head -10

# Ver la estructura del dashboard para saber dónde insertar el widget
grep -rn "Mis rondas\|rondas.*recientes\|MisRondas\|secciones" \
  src/app/dashboard/ --include="*.tsx"
```

**Habilitar Realtime (ejecutar SQL):**
```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'rondas_libres'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE rondas_libres; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ronda_libre_jugadores'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE ronda_libre_jugadores; END IF;
END $$;
```

---

**TAREA 1 — API /api/en-vivo/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
// Usar el mismo import que usan las otras APIs del proyecto (verificar con grep)

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const cancha = searchParams.get('cancha')

    let query = supabase
      .from('rondas_libres')
      .select(`
        id, codigo, course_name, tees, holes,
        fecha, estado, hoyo_inicio,
        ronda_libre_jugadores ( id, nombre, user_id, scores )
      `)
      .eq('estado', 'in_progress')
      .order('fecha', { ascending: false })
      .limit(50)

    if (cancha?.trim() && cancha.trim().length >= 2) {
      query = query.ilike('course_name', `%${cancha.trim()}%`)
    }

    const { data, error } = await query
    if (error) throw error

    const rondas = (data ?? []).map(ronda => {
      const jugadores = (ronda.ronda_libre_jugadores ?? []).map(j => {
        const scores = j.scores ?? {}
        const validos = Object.values(scores).filter(s => s != null && Number(s) > 0)
        return {
          id: j.id,
          nombre: j.nombre ?? 'Jugador',
          holesCompleted: validos.length,
          totalGross: validos.reduce((a, b) => a + Number(b), 0),
        }
      })

      return {
        id: ronda.id,
        codigo: ronda.codigo,
        course_name: ronda.course_name ?? 'Cancha',
        tees: ronda.tees,
        holes: ronda.holes ?? 18,
        fecha: ronda.fecha,
        hoyo_inicio: ronda.hoyo_inicio ?? 1,
        jugadores,
        maxHolesCompleted: jugadores.reduce((m, j) => Math.max(m, j.holesCompleted), 0),
        totalJugadores: jugadores.length,
      }
    })

    return NextResponse.json({
      rondas,
      total: rondas.length,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[/api/en-vivo]', err)
    return NextResponse.json({ error: 'Error al obtener rondas' }, { status: 500 })
  }
}
```

---

**TAREA 2 — Página /en-vivo/page.tsx**

```tsx
'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'

// [tipos: RondaEnVivo, JugadorEnVivo]
// [componente RondaCard con el diseño completo]
// [componente principal EnVivoPage]

// DISEÑO DE LA PÁGINA — modo OSCURO
// Header sticky: dot pulsante (#4ade80) + "En Vivo" (Playfair) + badge count + hora (DM Mono)
// RondaCard: card rgba(255,255,255,0.04) + borde var(--border) + radius 16px
//   - Cancha: DM Sans 15px 700 var(--ivory)
//   - Info: DM Mono 11px var(--text-3) "X jugadores · Y hoyos · Hace Zm"
//   - Badge "Thru H.X": var(--gold), background rgba(200,165,90,.18)
//   - Jugador #1: fondo var(--gold-soft)
//   - Score visible solo para usuarios registrados
//   - No registrados: badge "Ver →" var(--brand)
// Estado vacío: ⛳ + Playfair + DM Sans + botón brand
// CTA no registrados: card var(--gold-soft) + "Crear cuenta — es gratis →"

// FUNCIONALIDAD:
// - cargarFeed() + polling cada 20s con clearInterval en cleanup
// - Realtime: canal 'feed-global-en-vivo'
//   .on('postgres_changes', rondas_libres → cargarFeed())
//   .on('postgres_changes', ronda_libre_jugadores → cargarFeed())
//   .subscribe() + removeChannel en cleanup
// - Buscador con debounce 400ms (aparece con 3+ rondas)
// - Verificar sesión: supabase.auth.getSession() → setIsLoggedIn
```

---

**TAREA 3 — Widget EnVivoWidget.tsx para el dashboard**

```tsx
'use client'
// Máximo 3 tarjetas compactas
// return null si rondas.length === 0 — no afecta el layout del dashboard
// Header: dot pulse + "EN VIVO AHORA" (DM Mono uppercase) + "Ver todas →" (var(--gold))
// Cada tarjeta: clickeable → /ronda-libre/[codigo]/score
//   ⛳ + nombre cancha + "X jugadores · Líder: [nombre]" + badge Thru
//   background rgba(255,255,255,0.04), borde var(--border), radius 12px
// Polling cada 30s + clearInterval en cleanup
```

---

**TAREA 4 — Índices de rendimiento + integración en dashboard**

```sql
-- Índices para que el feed sea rápido con miles de rondas
CREATE INDEX IF NOT EXISTS idx_rondas_libres_estado_fecha
  ON rondas_libres(estado, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ronda_libre_jugadores_ronda_id
  ON ronda_libre_jugadores(ronda_libre_id);
```

Integrar EnVivoWidget en el dashboard:
```bash
# Ver dónde colocarlo en el dashboard
grep -rn "Mis rondas libres\|rondas.*recientes" src/app/dashboard/ --include="*.tsx"
# Agregar <EnVivoWidget /> ANTES de esa sección
```

---

**AL TERMINAR:**
```bash
npx tsc --noEmit
npm run build
node scripts/update-docs.js
git add .
git commit -m "feat: /en-vivo con Realtime + widget dashboard + API rondas activas + índices BD"
git push origin main
```

**TABLA DE VERIFICACIÓN FINAL:**
```
□ /en-vivo carga sin 404
□ Dot verde pulsante visible cuando hay rondas activas
□ Estado vacío muestra ⛳ + texto + botón "Nueva ronda →"
□ Usuario sin login: ve rondas pero no scores completos
□ Usuario con login: ve scores con colores del design system
□ Buscador aparece cuando hay 3+ rondas activas
□ Nueva ronda aparece sin recargar (Realtime funciona)
□ Widget "En Vivo Ahora" visible en dashboard cuando hay rondas
□ Widget invisible cuando no hay rondas (no rompe el layout)
□ "Ver todas →" del widget lleva a /en-vivo
□ Índices SQL creados correctamente
□ TypeScript: 0 errores | Build: exitoso | Push: exitoso
```

---

## ════════════════════════════════════════════
## SPRINT 5 — Seguridad
## ════════════════════════════════════════════

**Por qué este sprint existe:**
En la auditoría de producción del 25 marzo 2026 se encontraron 4 problemas
de seguridad activos. No son catastrófiços hoy con 21 usuarios, pero con
crecimiento se vuelven vulnerabilidades reales.
Lo más urgente: /api/admin/health responde sin autenticación y expone
toda la arquitectura interna (Supabase, Claude, Vercel, ESPN).
Es exactamente la información que un atacante busca antes de actuar.

**Qué cierra:**
- /api/admin/health expuesto públicamente → solo accesible con clave secreta
- /api/push/preferences accesible sin login → requiere sesión activa
- /api/en-vivo con CORS abierto a cualquier dominio → solo el dominio de la app
- Header X-XSS-Protection faltante → agregado en next.config

**Tiempo estimado:** 1-2 horas

---

**MAPEO INICIAL:**
```bash
# Confirmar vulnerabilidades activas
curl -s -o /dev/null -w "%{http_code}" https://golfersplus.vercel.app/api/admin/health

# Ver los archivos exactos a modificar
grep -rn "admin/health\|admin.*health" src/app/api/ --include="*.ts"
grep -rn "push/preferences" src/app/api/ --include="*.ts"
grep -rn "X-Frame\|X-Content\|X-XSS\|headers()" next.config.*

# Ver el patrón de auth que usan otras APIs ya protegidas
grep -rn "getUser\|getSession\|auth.*user" \
  src/app/api/ --include="*.ts" | grep -v "admin/health\|push/pref" | head -5
```

---

**IMPLEMENTACIÓN:**

```typescript
// T1 — /api/admin/health — agregar AL INICIO del handler GET, antes de cualquier lógica:
const authHeader = request.headers.get('x-admin-key')
const adminKey = process.env.ADMIN_SECRET_KEY
if (!adminKey || authHeader !== adminKey) {
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
}

// T2 — /api/push/preferences — usar el patrón de auth existente en el proyecto:
const supabase = createClient()  // usar el mismo createClient que las otras APIs
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 })

// T3 — next.config: agregar X-XSS-Protection a la sección headers() existente
{ key: 'X-XSS-Protection', value: '1; mode=block' }
// Si no existe sección headers() → crearla con este header + los básicos estándar

// T4 — /api/en-vivo (si Sprint 4 aplicado): cambiar CORS
const corsOrigin = process.env.NODE_ENV === 'production'
  ? 'https://golfersplus.vercel.app' : 'http://localhost:3000'
return NextResponse.json(data, { headers: { 'Access-Control-Allow-Origin': corsOrigin } })
```

**Variable de entorno:**
```bash
# Agregar en .env.local
ADMIN_SECRET_KEY=golfers-admin-2026

# Agregar en Vercel (para producción)
# Si vercel CLI disponible:
npx vercel env add ADMIN_SECRET_KEY production
# Si no: documentar en el reporte que Juanjo debe agregar en vercel.com → Settings → Env Vars
```

---

**AL TERMINAR:**
```bash
npx tsc --noEmit
npm run build
node scripts/update-docs.js
git add .
git commit -m "security: admin/health con auth key, push/preferences requiere login, XSS header, CORS restrictivo"
git push origin main
```

**TABLA DE VERIFICACIÓN FINAL:**
```
□ /api/admin/health sin header x-admin-key → 401
□ /api/admin/health con 'x-admin-key: golfers-admin-2026' → 200
□ /api/push/preferences sin sesión activa → 401
□ /api/push/preferences con sesión activa → 200
□ Header X-XSS-Protection presente en respuestas
□ App funciona normalmente para usuarios reales (sin regresiones)
□ TypeScript: 0 errores | Build: exitoso | Push: exitoso
```

---

## ════════════════════════════════════════════
## SPRINT 6 — Infraestructura
## ════════════════════════════════════════════

**Por qué este sprint existe:**
Hoy si la app falla a las 3am durante un torneo, nos enteramos cuando
un usuario enojado manda un WhatsApp. No hay ningún sistema automático
de alerta. Tampoco hay forma de saber cuántos usuarios entran, qué
pantallas visitan, o dónde abandonan el onboarding.
Además, el dashboard demora 2.3 segundos en cargar — el triple que
cualquier otra pantalla. Eso pasa porque las consultas a la base de
datos se hacen una por una en lugar de en paralelo.

**Qué instala:**
- Sentry: monitoreo de errores — llega email cuando algo falla
- PostHog: analytics de comportamiento — ver qué hacen los usuarios
- Dashboard más rápido: consultas en paralelo + caché de 30 segundos

**Tiempo estimado:** 2-3 horas

---

**MAPEO INICIAL:**
```bash
# Ver si ya están instalados
grep -rn "sentry\|posthog" package.json src/ --include="*.tsx" --include="*.ts"

# Ver las queries del dashboard para optimizar
grep -rn "await supabase\|supabase.*from" src/app/dashboard/ --include="*.tsx" --include="*.ts"
grep -rn "Promise.all" src/app/dashboard/ --include="*.tsx" --include="*.ts"
```

---

**IMPLEMENTACIÓN:**

```bash
# Instalar dependencias
npm install @sentry/nextjs
npm install posthog-js
```

```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs'
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
  beforeSend(event) {
    // Nunca enviar datos personales a Sentry
    if (event.user) { delete event.user.email; delete event.user.username }
    return event
  },
})

// sentry.server.config.ts — igual pero sin beforeSend

// next.config: envolver con withSentryConfig
// Ver documentación de @sentry/nextjs para la versión instalada
```

```tsx
// src/components/PostHogProvider.tsx
'use client'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect } from 'react'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com',
      autocapture: false,
      capture_pageview: true,
      capture_pageleave: true,
      respect_dnt: true,
      ip: false,  // no registrar IPs
    })
  }, [])
  return <PHProvider client={posthog}>{children}</PHProvider>
}
// Envolver el body del layout con <PostHogProvider>
```

```typescript
// src/app/dashboard/page.tsx — optimizar velocidad
export const revalidate = 30  // caché de 30 segundos

// Convertir queries secuenciales a paralelas:
// ANTES:
const torneos = await supabase.from('tournaments').select(...)
const rondas  = await supabase.from('rondas_libres').select(...)

// DESPUÉS:
const [
  { data: torneos },
  { data: rondas },
] = await Promise.all([
  supabase.from('tournaments').select(...).limit(3),
  supabase.from('rondas_libres').select(...).limit(5),
])
// Verificar que cada query tiene .limit() para no traer datos innecesarios
```

```bash
# Variables de entorno — agregar en .env.local:
NEXT_PUBLIC_SENTRY_DSN=        # Juanjo completa con cuenta en sentry.io
NEXT_PUBLIC_POSTHOG_KEY=       # Juanjo completa con cuenta en posthog.com
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

---

**AL TERMINAR:**
```bash
npx tsc --noEmit
npm run build
node scripts/update-docs.js
git add .
git commit -m "infra: Sentry error monitoring, PostHog analytics, dashboard performance optimización"
git push origin main
```

**TABLA DE VERIFICACIÓN FINAL:**
```
□ Build exitoso con @sentry/nextjs incluido
□ PostHogProvider en layout sin errores de consola
□ Dashboard carga más rápido (medir con DevTools Network → TTFB)
□ Queries del dashboard convertidas a Promise.all
□ sentry.client.config.ts y sentry.server.config.ts creados
□ Variables de entorno documentadas en .env.local
□ TypeScript: 0 errores | Build: exitoso | Push: exitoso
```

---

## ════════════════════════════════════════════
## SPRINT 7 — Legal
## ════════════════════════════════════════════

**Por qué este sprint existe:**
Golfers+ está a punto de empezar a cobrar. En Chile, operar un servicio
digital sin Términos y Condiciones ni Política de Privacidad publicados
no solo es una mala práctica — puede generar problemas legales con el
SERNAC (Servicio Nacional del Consumidor). La Ley 19.628 de Protección
de Datos Personales y la Ley 19.496 de Protección al Consumidor aplican
directamente a Golfers+ desde el momento en que recopila datos de usuarios.
Además, el derecho a retracto de 10 días hábiles para compras online
es obligatorio en Chile por el Art. 3° bis de la Ley 19.496.

**ROL ACTIVO PARA ESTE SPRINT:**
Actúas como abogado experto en derecho chileno, especializado en
Ley 19.628 (protección de datos), Ley 19.496 (protección al consumidor),
comercio electrónico y startups tecnológicas en Chile y LatAm.
Los documentos que redactes deben ser legalmente sólidos, en español
claro, y cumplir con la legislación chilena vigente.

**Qué crea:**
- /terminos: Términos y Condiciones (ley chilena)
- /privacidad: Política de Privacidad (Ley 19.628)
- /reembolsos: Política de Reembolsos (Ley 19.496 Art. 3° bis)
- Checkbox de aceptación en el formulario de registro
- Links legales en el footer de la app

**Tiempo estimado:** 2-3 horas

---

**MAPEO INICIAL:**
```bash
# Confirmar que las páginas no existen
curl -s -o /dev/null -w "%{http_code}" https://golfersplus.vercel.app/terminos
curl -s -o /dev/null -w "%{http_code}" https://golfersplus.vercel.app/privacidad

# Ver el formulario de registro
grep -rn "register\|registro\|sign.*up\|SignUp\|createAccount\|email.*password" \
  src/app/ --include="*.tsx" | grep -v ".next" | head -10

# Ver el footer
grep -rn "footer\|Footer\|2026 Golfers\|Latinoamérica\|Diseñado" \
  src/ --include="*.tsx" | grep -v ".next"
```

---

**DISEÑO COMÚN DE LAS 3 PÁGINAS:**

```css
/* Modo OSCURO — coherente con el resto del producto */
background:  var(--bg)              /* #070d18 */
max-width:   680px, centrado
padding:     24px 16px 80px

/* Tipografía: */
H1:    Playfair Display, 28px, 700, var(--ivory)
Fecha: DM Mono, 11px, var(--text-3), uppercase, letter-spacing 0.08em
H2:    DM Sans, 17px, 600, var(--gold)
Body:  DM Sans, 14px, 400, var(--text), line-height 1.7
Links: var(--brand), underline
Separadores: border-top 1px solid var(--line), margin 24px 0
```

---

**TAREA 1 — /terminos/page.tsx**

Términos y Condiciones. Incluir OBLIGATORIAMENTE:
1. **Identificación del titular:** Golfers+ operado por Juan José Lamarca, Santiago, Chile
2. **Objeto del servicio:** plataforma digital de golf — scoring, GWI™, tAIger+
3. **Condiciones de uso:** uso permitido para mayores de 13 años; prohibido uso comercial sin autorización
4. **Cuenta de usuario:** el usuario es responsable de la confidencialidad de sus credenciales
5. **Análisis con inteligencia artificial (CRÍTICO):**
   "tAIger+ proporciona análisis deportivos ORIENTATIVOS basados en estadísticas de golf.
   No constituye asesoramiento deportivo profesional. Golfers+ no se responsabiliza
   de decisiones tomadas basadas en el análisis de tAIger+."
6. **Propiedad intelectual:** el software, diseño, marcas "Golfers+", "tAIger+" y "CPI™"
   son propiedad de Golfers+. El usuario conserva los derechos sobre sus propios datos de juego.
7. **Limitación de responsabilidad:** los scores son ingresados por usuarios —
   Golfers+ no verifica su exactitud; sin garantía de disponibilidad continua del servicio.
8. **Modificación de términos:** aviso de 30 días de anticipación por email
9. **Ley aplicable:** ley chilena; tribunales ordinarios de justicia de Santiago de Chile

---

**TAREA 2 — /privacidad/page.tsx**

Política de Privacidad conforme a Ley 19.628 de Chile:
1. **Responsable del tratamiento:** Juan José Lamarca / Golfers+ — [email]
2. **Datos que recopilamos y para qué:**
   - Nombre y email: identificación y comunicaciones del servicio
   - Scores de golf, rondas, canchas, índice de handicap: para el servicio principal
   - Datos de uso de la app (pantallas visitadas, acciones): para mejorar el servicio
   - NO se recopilan: datos de pago, ubicación GPS, datos de salud
3. **Base legal:** consentimiento explícito del usuario al registrarse (Art. 4 Ley 19.628)
4. **Con quién compartimos:**
   - Supabase Inc. (EEUU): base de datos, bajo cláusulas contractuales
   - Vercel Inc. (EEUU): hosting, bajo cláusulas contractuales
   - Anthropic PBC (EEUU): análisis de IA con datos de juego anonimizados
   - **NO vendemos datos a terceros ni a anunciantes**
5. **Transferencia internacional:** EEUU bajo garantías contractuales estándar
6. **Retención:** mientras la cuenta esté activa; 30 días hábiles tras solicitud de eliminación
7. **Derechos del usuario (Art. 12 Ley 19.628):**
   Derecho de acceso, rectificación y cancelación de datos.
   Ejercer enviando email a [contacto] con asunto "DATOS PERSONALES"
8. **Cookies:** solo cookies técnicas necesarias para el funcionamiento. Sin publicidad.
9. **Reclamos:** ante el SERNAC (sernac.cl) o los Tribunales de Justicia de Chile

---

**TAREA 3 — /reembolsos/page.tsx**

Política de Reembolsos conforme a Ley 19.496, Art. 3° bis:
1. **Servicio gratuito actual:** no aplican reembolsos
2. **Planes de pago (cuando se activen):**
   - Derecho a retracto: 10 días hábiles desde la contratación (Art. 3° bis Ley 19.496)
   - Solicitar por email a [contacto] con asunto "REEMBOLSO"
   - Procesamiento: 5-10 días hábiles; reembolso por el mismo medio de pago
3. **Exclusiones:** períodos ya consumidos; análisis de tAIger+ ya generados y entregados
4. **Fallas técnicas imputables a Golfers+:** reembolso completo dentro de 30 días

---

**TAREA 4 — Checkbox en registro + links en footer**

```tsx
{/* ANTES del botón de envío en el formulario de registro */}
<div style={{ display:'flex', alignItems:'flex-start', gap:'10px', margin:'16px 0' }}>
  <input
    type="checkbox" id="acepta-terminos" required
    style={{ marginTop:'3px', flexShrink:0, width:'18px', height:'18px',
             accentColor:'var(--brand)', cursor:'pointer' }}
  />
  <label htmlFor="acepta-terminos" style={{
    fontSize:'13px', fontFamily:'var(--font-dm-sans)',
    color:'rgba(0,0,0,0.65)', lineHeight:1.5, cursor:'pointer',
  }}>
    He leído y acepto los{' '}
    <a href="/terminos" target="_blank" rel="noopener"
      style={{ color:'var(--brand)', textDecoration:'underline' }}>
      Términos y Condiciones
    </a>{' '}y la{' '}
    <a href="/privacidad" target="_blank" rel="noopener"
      style={{ color:'var(--brand)', textDecoration:'underline' }}>
      Política de Privacidad
    </a>
  </label>
</div>
{/* El campo required impide enviar sin marcar */}
{/* Si el form usa React Hook Form → adaptar con validate() */}

{/* En el footer existente, agregar: */}
{/* DM Sans 11px var(--text-3) · sin subrayado · hover: underline */}
{/* · Términos · Privacidad · Reembolsos */}
```

---

**AL TERMINAR:**
```bash
npx tsc --noEmit
npm run build
node scripts/update-docs.js
git add .
git commit -m "legal: términos, privacidad, reembolsos (Ley 19.628 y 19.496 Chile), checkbox registro"
git push origin main
```

**TABLA DE VERIFICACIÓN FINAL:**
```
□ /terminos carga sin 404, diseño oscuro con Playfair Display
□ /privacidad carga, menciona Ley 19.628 y SERNAC como autoridad
□ /reembolsos carga, menciona Art. 3° bis Ley 19.496 y 10 días hábiles
□ Checkbox en registro bloquea el envío si no está marcado
□ Links a /terminos y /privacidad abren en pestaña nueva
□ Footer tiene "· Términos · Privacidad · Reembolsos"
□ TypeScript: 0 errores | Build: exitoso | Push: exitoso
```

---

## ════════════════════════════════════════════
## SPRINT 8 — Plan de trabajo nocturno autónomo
## ════════════════════════════════════════════

**Por qué este sprint existe:**
Claude Code está disponible con el doble de cuota de tokens entre las 12am
y las 5am. Ese tiempo se puede aprovechar para tareas de construcción de
largo plazo que no requieren decisiones de producto — pantallas nuevas,
componentes aislados, lógica matemática.
Este sprint no agrega features — crea la infraestructura operativa
(documentos, comandos y reglas) para que las noches de trabajo autónomo
sean seguras y productivas.

**Qué crea:**
- `.claude/commands/health.md`: comando `/health` para diagnóstico rápido
- `docs/TRABAJO_NOCTURNO.md`: manual de operación nocturna
- `docs/WRAPPER_NOCTURNO.md`: el prompt que va al inicio de cada sesión nocturna
- `docs/CALENDARIO_NOCHES.md`: las primeras 5 noches planificadas

**Tiempo estimado:** 1 hora

---

**IMPLEMENTACIÓN:**

```bash
mkdir -p .claude/commands
mkdir -p docs
```

**`.claude/commands/health.md`** — al escribir `/health` en Claude Code ejecuta:
```markdown
Ejecutar diagnóstico completo de Golfers+:

1. curl https://golfersplus.vercel.app/api/admin/health -H "x-admin-key: golfers-admin-2026"
2. git log --oneline -3
3. npx tsc --noEmit 2>&1 | tail -5
4. Verificar que las rutas críticas responden:
   - curl -s -o /dev/null -w "%{http_code}" https://golfersplus.vercel.app/dashboard
   - curl -s -o /dev/null -w "%{http_code}" https://golfersplus.vercel.app/api/en-vivo

Reportar en formato:
  ✅/❌ Producción responde: [status]
  ✅/❌ TypeScript: [0 errores / N errores]
  ✅/❌ Último commit: [mensaje]
  ✅/❌ Dashboard: [status code]
  ✅/❌ API en-vivo: [status code]

  LISTO PARA TRABAJAR / REVISAR ANTES DE CONTINUAR
```

**`docs/TRABAJO_NOCTURNO.md`**:
```markdown
# Manual de trabajo nocturno — Golfers+

## La regla de oro
Claude Code trabaja siempre en una rama separada (copia de trabajo).
Nunca toca main directamente.
Al despertar, Juanjo revisa en 10 minutos y decide publicar o descartar.
Peor escenario: cerrar la rama sin daño.

## Tareas seguras para la noche (Categoría A) ✅
- Crear pantallas completamente nuevas
- Crear componentes nuevos sin modificar existentes
- Cambios de texto y labels
- Nuevas APIs que no modifican las existentes
- Correcciones de estilo en pantallas específicas
- Documentación y comentarios de código

## Tareas PROHIBIDAS de noche (Categoría B) ❌
- Cambios al sistema de login o autenticación
- Cambios al middleware.ts (afecta todas las rutas)
- Cambios al layout principal del app
- Cambios a la score page en vivo (la más crítica)
- Eliminar archivos existentes
- Modificar variables de entorno en producción

## Checklist de Juanjo antes de dormir (5 minutos)
□ La app funciona correctamente en producción ahora mismo
□ El prompt de la tarea está listo y revisado
□ El wrapper de MODO NOCTURNO está pegado al inicio del prompt
□ La tarea es Categoría A (no toca arquitectura central)

## Checklist de Juanjo al despertar (10 minutos)
□ Leer el reporte que dejó Claude Code
□ Abrir el PR en GitHub y ver qué archivos se tocaron
□ Abrir la URL de preview automática de Vercel para ese PR
□ Probar en el celular
□ Si está bien → Merge → va al aire automáticamente
□ Si no está bien → Close PR → sin daño en producción
```

**`docs/WRAPPER_NOCTURNO.md`** — copiar esto al inicio de cada prompt nocturno:
```markdown
MODO NOCTURNO — EJECUCIÓN AUTÓNOMA SIN SUPERVISIÓN

Lee el archivo GOLFERS_PLUS_MAESTRO.md completo antes de empezar.

REGLAS ABSOLUTAS (no negociables):

1. RAMA SEPARADA — antes de cualquier cambio:
   git checkout main && git pull origin main
   git checkout -b sprint/[nombre-tarea]-$(date +%Y%m%d)

2. SOLO TOCA LO PEDIDO — si necesitas modificar algo fuera del scope,
   PARA y escribe en el reporte: "BLOQUEADO: necesita [decisión/archivo]".
   Continúa con las otras tareas.

3. TYPESCRIPT SIEMPRE — npx tsc --noEmit después de cada tarea.
   Si hay errores, corrígelos antes de continuar. Nunca ignorarlos.

4. BUILD GATE — npm run build antes del commit final.
   Si falla, describe el error en el reporte. No hagas push de código roto.

5. SIN DECISIONES DE PRODUCTO — si algo es ambiguo (texto, color, flujo):
   Elegir la opción más similar a lo que ya existe en la app.
   Dejar comentario: // TODO: Juanjo decide esto

6. REPORTE FINAL obligatorio en docs/REPORTE_NOCHE_[FECHA].md:
   - Qué se hizo (en lenguaje simple, sin tecnicismos)
   - Qué archivos se crearon o modificaron
   - Cómo probar cada cosa en el celular
   - Qué quedó bloqueado y por qué
   - Si hubo algo inesperado

7. SOLO PUSH A RAMA — nunca merge a main.
   El merge lo hace Juanjo después de revisar.

[AQUÍ VA EL PROMPT DE LA TAREA ESPECÍFICA]
```

**`docs/CALENDARIO_NOCHES.md`**:
```markdown
# Calendario de las primeras 5 noches

## Noche 1 — Historial expandible
Componente: RondaDetalle.tsx
Tarea: al tocar una ronda en /perfil/historial, se expande mostrando
el scorecard completo con colores usando HoleColorBar (ya existe).
Riesgo: bajo — componente nuevo, no toca nada existente.
Duración estimada: 2-3 horas

## Noche 2 — Sistema de niveles (motor invisible)
Tarea: migración SQL con función recalcular_nivel(), trigger automático
en historical_rounds, columnas nivel/nivel_expires_at en profiles.
Riesgo: medio — toca BD pero solo agrega cosas nuevas.
Duración estimada: 3-4 horas

## Noche 3 — Sistema de niveles (lo que se ve)
Prerequisito: Noche 2 mergeada y aprobada por Juanjo.
Tarea: barra de progreso en dashboard, badge de nivel en menú,
aviso cuando el nivel está próximo a bajar.
Riesgo: bajo — componentes nuevos.
Duración estimada: 2-3 horas

## Noche 4 — Modo organizador en cancha
Tarea: /organizador/[slug]/live — pantalla nueva para que el organizador
vea todos los grupos jugando en tiempo real el día del torneo.
Riesgo: bajo — ruta completamente nueva.
Duración estimada: 3 horas

## Noche 5 — Share card del torneo
Tarea: activar el botón "Compartir" en /torneo/[slug] con imagen Canvas
1080x1920. Extensión directa de share-card.ts del Sprint 2.
Riesgo: bajo.
Duración estimada: 1-2 horas
```

---

**AL TERMINAR:**
```bash
npm run build
node scripts/update-docs.js
git add .
git commit -m "docs: slash command /health, manual nocturno, wrapper, calendario 5 noches"
git push origin main
```

**TABLA DE VERIFICACIÓN FINAL:**
```
□ .claude/commands/health.md existe y tiene instrucciones claras
□ docs/TRABAJO_NOCTURNO.md con categorías A y B definidas
□ docs/WRAPPER_NOCTURNO.md con el wrapper listo para copiar
□ docs/CALENDARIO_NOCHES.md con las 5 noches planificadas
□ Build: exitoso | Push: exitoso
```

---

## ════════════════════════════════════════════
## SPRINT 9 — Escalabilidad
## ════════════════════════════════════════════

**Por qué este sprint existe:**
Con 21 usuarios actuales, la app funciona bien. Con 200 usuarios, algunos
problemas se vuelven molestos. Con 500 usuarios, algunos se vuelven críticos.
Con 1.000 usuarios, algunos rompen el negocio.
Este sprint resuelve los 5 problemas estructurales antes de que cada uno
se vuelva una crisis. El costo de resolverlos ahora es 10x menor que
resolverlos con carga real.

**Los 5 problemas que resuelve:**
1. **Sin plan B en la cancha:** si el servidor falla mientras se juega, los scores se pierden
2. **Sin sistema de permisos:** no existe diferencia entre usuario normal, organizador y admin
3. **Sin visibilidad del sistema:** el panel de admin no muestra la salud real del sistema
4. **BD no preparada para volumen:** sin índices optimizados para 50k+ rondas
5. **Sin documentación:** todo el conocimiento del sistema vive en conversaciones

**⚠️ ADVERTENCIA:** /admin, /admin/qa y /admin/sistema YA EXISTEN.
Este sprint los EXTIENDE — no los crea desde cero.
Hacer grep antes de cada tarea de admin.

**Tiempo estimado:** 4-5 horas

---

**MAPEO INICIAL:**
```bash
# Ver la arquitectura del admin existente
ls src/app/admin/
grep -rn "isAdmin\|role.*admin\|admin.*role\|profiles.*role" \
  src/lib/admin.ts src/app/admin/ --include="*.tsx" --include="*.ts"

# Ver cómo se guarda el score actualmente
grep -rn "upsert\|update.*scores\|scores.*update" \
  src/app/ronda-libre/ --include="*.tsx" --include="*.ts" | head -10

# Ver si profiles.role ya existe con los valores correctos
grep -rn "\.role\b\|role.*player\|role.*organizer\|role.*admin" \
  src/ --include="*.tsx" --include="*.ts" | head -10

# Ver índices actuales en la BD
# SQL: SELECT indexname, tablename FROM pg_indexes WHERE schemaname='public' ORDER BY tablename;

# Ver si docs/ existe
ls docs/ 2>/dev/null || echo "directorio docs no existe aún"
```

---

**TAREA 1 — Modo offline para scores (src/hooks/useScoreSync.ts)**

```typescript
'use client'
import { useCallback, useEffect } from 'react'

const STORAGE_PREFIX = 'golfers_score_'
const DIAS_PARA_LIMPIAR = 7

export function useScoreSync(codigoRonda: string, jugadorId: string) {
  const key = `${STORAGE_PREFIX}${codigoRonda}_${jugadorId}`

  const guardarLocal = useCallback((scores: Record<string, number>) => {
    try {
      localStorage.setItem(key, JSON.stringify({
        scores, timestamp: Date.now(), sincronizado: false, codigoRonda, jugadorId,
      }))
    } catch {
      // Falla silenciosamente en modo privado — no es bloqueante
    }
  }, [key, codigoRonda, jugadorId])

  const marcarSincronizado = useCallback(() => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return
      localStorage.setItem(key, JSON.stringify({ ...JSON.parse(raw), sincronizado: true }))
    } catch { /* silencioso */ }
  }, [key])

  const obtenerLocal = useCallback((): Record<string, number> | null => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw).scores : null
    } catch { return null }
  }, [key])

  // Limpiar entradas antiguas ya sincronizadas
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return
      const data = JSON.parse(raw)
      const diasTranscurridos = (Date.now() - data.timestamp) / (1000 * 60 * 60 * 24)
      if (data.sincronizado && diasTranscurridos > DIAS_PARA_LIMPIAR) {
        localStorage.removeItem(key)
      }
    } catch { /* silencioso */ }
  }, [key])

  return { guardarLocal, marcarSincronizado, obtenerLocal }
}
```

**Integrar en la score page** (buscar la función de guardado con grep):
```typescript
// En la función que guarda el score de cada hoyo:
const { guardarLocal, marcarSincronizado } = useScoreSync(codigo, jugadorId)

// ANTES del await al servidor:
guardarLocal(nuevosScores)  // ← siempre funciona, incluso sin internet

// Después del await:
try {
  await supabase.from('ronda_libre_jugadores').update({ scores: nuevosScores })...
  marcarSincronizado()  // ← confirmar que llegó al servidor
} catch (err) {
  // Score ya está guardado localmente
  // NO mostrar error al usuario — el score no se perdió
  console.warn('[offline] Score guardado localmente, sincronizará al reconectar')
  // Mostrar indicador sutil: saveStatus = 'offline'
}
```

---

**TAREA 2 — Sistema de roles (src/hooks/usePermisos.ts + SQL)**

```sql
-- Verificar si ya existe con los valores correctos ANTES de ejecutar
-- Si profiles.role no existe o tiene valores distintos a 'player'|'organizer'|'admin':
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role TEXT
  CHECK (role IN ('player', 'organizer', 'admin'))
  DEFAULT 'player' NOT NULL;

UPDATE profiles SET role = 'player' WHERE role IS NULL;

-- Asignar admin al founder
UPDATE profiles SET role = 'admin'
  WHERE email = 'juanjoselamarca@gmail.com';

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
```

```typescript
// src/hooks/usePermisos.ts
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'

type Role = 'player' | 'organizer' | 'admin'

interface Permisos {
  rol: Role
  esAdmin: boolean
  esOrganizador: boolean
  puedeVerAdmin: boolean
  cargando: boolean
}

const DEFAULTS: Permisos = {
  rol: 'player', esAdmin: false, esOrganizador: false,
  puedeVerAdmin: false, cargando: true,
}

export function usePermisos(): Permisos {
  const [permisos, setPermisos] = useState<Permisos>(DEFAULTS)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setPermisos({ ...DEFAULTS, cargando: false }); return }

      supabase.from('profiles').select('role')
        .eq('id', user.id).single()
        .then(({ data }) => {
          const rol = (data?.role ?? 'player') as Role
          setPermisos({
            rol,
            esAdmin: rol === 'admin',
            esOrganizador: rol === 'organizer' || rol === 'admin',
            puedeVerAdmin: rol === 'admin',
            cargando: false,
          })
        })
    })
  }, [])

  return permisos
}
```

---

**TAREA 3 — Métricas en el /admin existente**

```bash
# Ver la estructura actual del admin antes de tocar nada
cat src/app/admin/page.tsx
```

Agregar sección de métricas en tiempo real al admin existente.
NO reemplazar lo que ya funciona — agregar una sección nueva.

```tsx
// Usar Promise.all para no bloquear la carga:
const [
  { count: usuarios },
  { count: rondasActivas },
  { count: rondasHoy },
] = await Promise.all([
  supabase.from('profiles').select('*', { count: 'exact', head: true }),
  supabase.from('rondas_libres').select('*', { count: 'exact', head: true })
    .eq('estado', 'in_progress'),
  supabase.from('rondas_libres').select('*', { count: 'exact', head: true })
    .gte('fecha', new Date().toISOString().split('T')[0]),
])

// DISEÑO de las cards de métricas (modo OSCURO):
// background: var(--bg-card-light), border: var(--border), radius 14px
// Ícono emoji (24px) arriba
// Número: Cormorant Garamond 28px var(--gold)
// Label: DM Mono 11px uppercase var(--text-3)
// Grid 2x2, gap 12px
```

---

**TAREA 4 — Índices de base de datos**

```sql
-- Índices críticos para escalar a 50k+ rondas
-- Todos son IF NOT EXISTS — seguros de re-ejecutar

-- Historial por usuario (pantalla /perfil/historial)
CREATE INDEX IF NOT EXISTS idx_historical_rounds_user_played
  ON historical_rounds(user_id, played_at DESC);

-- Jugadores de ronda libre por usuario (dashboard)
CREATE INDEX IF NOT EXISTS idx_ronda_libre_jugadores_user_id
  ON ronda_libre_jugadores(user_id);

-- Rondas por fecha descendente (listados recientes)
CREATE INDEX IF NOT EXISTS idx_rondas_libres_fecha_desc
  ON rondas_libres(fecha DESC);

-- Login por email
CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON profiles(email);

-- Hole scores por ronda y jugador (leaderboard de torneo)
CREATE INDEX IF NOT EXISTS idx_hole_scores_round_player
  ON hole_scores(round_id, player_id);

-- Jugadores inscritos en torneo
CREATE INDEX IF NOT EXISTS idx_players_tournament
  ON players(tournament_id);

-- Torneos por organizador
CREATE INDEX IF NOT EXISTS idx_tournaments_organizer
  ON tournaments(created_by, fecha DESC);
```

---

**TAREA 5 — docs/ARQUITECTURA.md**

Redactar en lenguaje claro — no solo para desarrolladores. Incluir:

1. **Qué es Golfers+** (en 3 líneas, sin tecnicismos)
2. **Stack tecnológico** — explicar por qué cada herramienta, no solo qué es
3. **Los dos sistemas de rondas:**
   - Rondas Libres (rondas_libres + ronda_libre_jugadores) → casual entre amigos
   - Torneos (tournaments + players + rounds + hole_scores) → competición formal
4. **historical_rounds** → qué alimenta (GWI™ y CPI™)
5. **Flujos principales** — paso a paso:
   - Nueva ronda libre: desde el botón hasta el score guardado
   - Torneo en vivo: desde crear hasta el leaderboard
   - tAIger+: desde iniciar sesión hasta recibir análisis
6. **Reglas de negocio que nunca se rompen**
   (todas las rondas son públicas, el bogey es dorado no rojo, etc.)
7. **Variables de entorno necesarias** (solo nombres, nunca valores)
8. **Decisiones técnicas importantes y su razón**

---

**AL TERMINAR:**
```bash
npx tsc --noEmit
npm run build
node scripts/update-docs.js
git add .
git commit -m "scale: offline scores, roles player/organizer/admin, métricas admin, índices BD, arquitectura"
git push origin main
```

**TABLA DE VERIFICACIÓN FINAL:**
```
□ useScoreSync: score se guarda en localStorage ANTES de enviar al servidor
□ Si servidor falla durante un hoyo → score NO se pierde, indicador "offline" aparece
□ /admin sigue funcionando correctamente (no se rompió al agregar métricas)
□ Panel de métricas muestra datos reales: usuarios, rondas activas, rondas hoy
□ SQL de roles ejecutado: profiles.role existe con 'player'|'organizer'|'admin'
□ juanjoselamarca@gmail.com tiene role='admin' en la BD
□ usePermisos devuelve esAdmin=true para el email del founder
□ Índices creados (verificar: SELECT indexname FROM pg_indexes WHERE schemaname='public')
□ docs/ARQUITECTURA.md existe, claro, y cubre los 8 puntos
□ TypeScript: 0 errores | Build: exitoso | Push: exitoso
```

---

# PARTE 5 — CHECKLIST MAESTRO DE CALIDAD

Antes de considerar cualquier sprint completado, verificar TODOS estos puntos:

```
TIPOGRAFÍA — 4 fuentes, cada una en su lugar:
□ Títulos H1 de página: Playfair Display (var(--font-playfair))
□ UI general (botones, labels, body): DM Sans (var(--font-dm-sans))
□ Métricas y códigos: DM Mono, UPPERCASE, letter-spacing 0.08em
□ Números grandes impactantes: Cormorant Garamond
□ NUNCA Inter, Arial, ni otra fuente no documentada

COLORES — usar CSS variables siempre:
□ Botones CTA: var(--brand) #c4992a
□ Datos y accents: var(--gold) #c8a55a
□ Fondo dark: var(--bg) #070d18
□ Cards dark: var(--bg-card-light) #0e1c2f
□ Texto principal: var(--text) #edeae4
□ Texto secundario: var(--text-2) #94a8c0
□ Bordes: var(--border) · var(--border-md)

SISTEMA DE SCORE — no convencional, no cambiar:
□ Eagle: var(--eagle) #3b82f6 AZUL
□ Birdie: var(--birdie) #ef4444 ROJO
□ Par: var(--par) #6b7280 GRIS
□ Bogey: var(--bogey) #c4992a DORADO
□ Doble+: var(--double) #dc2626 ROJO OSCURO

UX MOBILE — Golfers+ es una app de celular:
□ Touch targets: mínimo 44x44px
□ Inputs: font-size 16px mínimo (zoom iOS)
□ env(safe-area-inset-bottom, 0px) en todo elemento fixed abajo
□ padding-bottom 80px en contenido scrolleable
□ Probado a 390px de ancho

CÓDIGO:
□ npx tsc --noEmit → 0 errores
□ (data ?? []).map() en todos los arrays de Supabase
□ 'use client' en componentes con hooks o Realtime
□ Textos en español, nunca inglés visible al usuario
□ "Índice" · "tAIger+" · "Golfers+" — nomenclatura correcta

BASE DE DATOS:
□ profiles.role (no .rol): 'player'|'organizer'|'admin'
□ courses.nombre (no name) · course_holes.numero (no hole_number)
□ rondas_libres.estado: 'in_progress'|'closed' (nunca 'completed')

FLUJO FINAL:
□ npm run build → exitoso
□ node scripts/update-docs.js → ejecutado
□ git push origin main → enviado
□ Reporte completo preparado para Juanjo
```

---

# PARTE 6 — ORDEN DE EJECUCIÓN RECOMENDADO

```
SEMANA 1 (urgente — afecta la experiencia en cancha hoy):
  Sprint 1 → Sprint 2 → Sprint 3 → Sprint 4

SEMANA 2 (fundaciones de seguridad e infraestructura):
  Sprint 5 → Sprint 6

SEMANA 3 (legal y operaciones nocturnas):
  Sprint 7 → Sprint 8

SEMANA 4+ (escalar con confianza):
  Sprint 9

PARALELO A TODO — verificar en inapi.cl (20 minutos, gratis):
  Disponibilidad de "Golfers+" y "tAIger+" en categorías 41 y 42
```

---

*Versión 3.0 · 25 marzo 2026*
*Auditado contra producción real, globals.css, y documentos de contexto del proyecto.*
*Correcciones v3: sistema de score no convencional verificado, 4 fuentes documentadas,*
*colores exactos de CSS variables, profiles.role con valores en inglés,*
*/admin YA EXISTE — no crear, extender. SQL ejecutable por Claude Code directamente.*
