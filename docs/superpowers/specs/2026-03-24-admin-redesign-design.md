# Admin Redesign — Golfers+ Command Center

## Spec v1.0 — 2026-03-24

---

## 1. Visión

Transformar el admin de Golfers+ de un panel con placeholders estáticos a un **Command Center de clase mundial** inspirado en Vercel, Stripe, Linear y PostHog. El admin debe ser la herramienta definitiva para monitorear, analizar y operar toda la plataforma en tiempo real.

---

## 2. Arquitectura de Navegación

### Layout: Sidebar + Top Bar + Content

```
┌──────────────────────────────────────────────────┐
│  ⚡ LIVE STATUS BAR (usuarios activos, rondas)   │
├────────┬─────────────────────────────────────────┤
│        │                                         │
│  SIDE  │          CONTENT AREA                   │
│  BAR   │                                         │
│        │   Cards, charts, tables, feeds          │
│  Logo  │                                         │
│  Nav   │                                         │
│  Items │                                         │
│        │                                         │
│  User  │                                         │
│  Info   │                                         │
│        │                                         │
├────────┴─────────────────────────────────────────┤
│  (mobile: bottom nav como app principal)         │
└──────────────────────────────────────────────────┘
```

### 5 Secciones principales:

| # | Sección | Icono | Propósito |
|---|---------|-------|-----------|
| 1 | **Command Center** | `⚡` | Live dashboard — todo lo crítico en una pantalla |
| 2 | **Analytics** | `📊` | Crecimiento, retención, funnels, engagement |
| 3 | **Golf Ops** | `⛳` | Torneos, rondas, canchas, scores, tAIger |
| 4 | **Finanzas** | `💰` | Revenue, costos, proyecciones, break-even |
| 5 | **Sistema** | `🔧` | Health, config, logs, herramientas debug |

### Mobile: Sidebar colapsa a hamburger menu + bottom nav con las 5 secciones.

---

## 3. Sección 1: Command Center (Live Dashboard)

La pantalla más importante. Todo lo que necesitás saber en un vistazo.

### 3.1 Live Status Bar (Global, siempre visible)
- Punto verde/rojo: estado Supabase, Vercel, APIs
- Usuarios activos ahora (count real-time)
- Rondas en curso ahora
- Último deploy: commit + hace cuánto tiempo

### 3.2 KPI Cards (Row de 4-6 cards)
Cada card muestra:
- Valor actual (grande, gold)
- Delta vs período anterior (verde ↑ / rojo ↓)
- Sparkline mini (últimos 30 días)

**KPIs:**
1. Total usuarios registrados (delta 7d)
2. DAU (Daily Active Users)
3. Rondas completadas hoy
4. tAIger sesiones activas
5. Activation rate (registro → primera ronda)
6. Health score global (0-100)

### 3.3 Live Activity Feed
Feed en tiempo real tipo Vercel deploy logs:
```
12:34:05  🏌️ Juan P. registró score en hoyo 7 (Príncipe de Gales)
12:33:42  👤 María L. se registró en la plataforma
12:33:10  🏆 Torneo "Copa Marzo" — 8 jugadores activos
12:32:55  🐯 Pedro R. inició sesión con tAIger
12:32:01  ⚠️ ESPN API respondió lento (2.3s)
```

Implementación: polling cada 10s a analytics_events + join con profiles.

### 3.4 Activity Chart (últimos 30 días)
Gráfico de área apilada (Recharts):
- Línea 1: Rondas por día
- Línea 2: Usuarios activos por día
- Línea 3: Sesiones tAIger por día
Tooltip con detalle al hover.

### 3.5 Alertas y Problemas
Panel que muestra automáticamente:
- Servicios caídos o lentos
- Errores recurrentes (si los hay)
- Usuarios inactivos > 30 días (churn risk)
- Rondas abandonadas (started pero nunca cerradas)

---

## 4. Sección 2: Analytics

### 4.1 Métricas de Crecimiento
- Nuevos usuarios: 7d, 30d, 90d con gráfico de línea
- Curva de crecimiento acumulado
- Fuente de registro (si se trackea)

### 4.2 Funnel de Activación
Barra horizontal visual:
```
Registrado (100%) ─→ Primera ronda (60%) ─→ Tarjeta importada (30%) ─→ tAIger (15%) ─→ Pro (0%)
```
Cada paso clickeable para ver usuarios en ese stage.

### 4.3 Retención
- Tabla cohort (estilo Mixpanel): semana de registro vs actividad en semanas siguientes
- Retención D1, D7, D30

### 4.4 Engagement
- Distribución de rondas por usuario (histogram)
- Top 10 usuarios más activos
- Frecuencia de uso (rondas/semana promedio)

### 4.5 Geografía
- Tabla: País/Ciudad, # usuarios, # rondas
- Top canchas más usadas

---

## 5. Sección 3: Golf Operations

### 5.1 Torneos
- Lista de torneos: nombre, fecha, cancha, jugadores, estado
- Click para ver detalle: leaderboard, scores, estadísticas
- Filtros: activos, cerrados, todos

### 5.2 Rondas Libres
- Rondas en curso (live)
- Rondas completadas (con filtro de fecha)
- Rondas abandonadas (flag para review)

### 5.3 Canchas
- Tabla de canchas usadas
- # rondas por cancha
- Canchas sin stroke_index (GWI no disponible)

### 5.4 Usuarios
- Tabla paginada con búsqueda (mejorada del actual)
- Click para ver perfil completo: stats, rondas, handicap, tAIger, patrones
- Acciones: cambiar role, ver como usuario, enviar notificación

### 5.5 tAIger Dashboard
- Sesiones totales, por tipo
- Patrones detectados más comunes
- Costo API por sesión (estimado)
- Calidad de sesiones (mensajes promedio, follow-ups)

---

## 6. Sección 4: Finanzas

### 6.1 Revenue (cuando se active monetización)
- MRR, ARR, ARPU
- Gráfico de revenue mensual
- Usuarios Pro vs Free (pie chart)
- Proyección basada en growth rate

### 6.2 Costos Operativos
Tabla detallada con datos reales:
| Servicio | Plan | Costo/mes | Uso actual | Límite |
|----------|------|-----------|------------|--------|
| Supabase | Free | $0 | 244 rows | 500MB |
| Vercel | Free | $0 | ~1K deploys | 100GB |
| Claude API | Pay-per-use | ~$X | N llamadas | - |
| Push (VAPID) | Free | $0 | N subs | - |

### 6.3 Simulador de Proyecciones
- Slider: % conversión (1-20%)
- Slider: precio mensual ($5-$20)
- Output: MRR, ARR, break-even date
- Gráfico de proyección a 12 meses

### 6.4 Unit Economics
- CAC (Customer Acquisition Cost)
- LTV proyectado
- LTV/CAC ratio
- Payback period

---

## 7. Sección 5: Sistema

### 7.1 Health Dashboard
Grid de servicios con:
- Status (verde/amarillo/rojo)
- Latencia actual (ms)
- Uptime últimas 24h
- Último error (si hubo)

Servicios: Supabase, Vercel, ESPN API, Claude API, Push Service

### 7.2 Database Stats
- Conteo de filas por tabla (auto-refresh)
- Tamaño estimado de BD
- Queries más lentas (si hay logging)

### 7.3 Environment
- Variables de entorno: presentes/ausentes
- Versión de deploy actual (commit SHA)
- Branch deployado

### 7.4 Logs & Debug
- Últimos errores capturados
- Debug auth endpoint
- Test de servicios (botón para ping cada uno)

### 7.5 Configuración
- Nombre app, URL, stack
- Límites tAIger (sesiones/mes)
- Lista de admins
- Feature flags (futuro)

---

## 8. Diseño Visual

### Theme
Consistente con la app principal:
- **Background:** `#050b14` (deep navy)
- **Cards:** `#0a1628` con borde `#132540`
- **Accent:** `#c4992a` (gold) para valores importantes
- **Text primary:** `#edeae4` (ivory)
- **Text secondary:** `#94a8c0` (gray)
- **Success:** `#22c55e`
- **Warning:** `#f59e0b`
- **Error:** `#ef4444`

### Tipografía
- **KPI values:** Playfair Display, 2.5rem, gold
- **Section headers:** DM Sans, 600, 1.25rem
- **Body:** DM Sans, 400, 0.875rem
- **Mono (logs, debug):** DM Mono

### Componentes reutilizables a crear:
1. `AdminCard` — Card base con header, valor, delta, sparkline
2. `AdminChart` — Wrapper Recharts con theme consistente
3. `AdminTable` — Tabla paginada con búsqueda y sort
4. `AdminBadge` — Status badges (online, offline, warning)
5. `AdminSidebar` — Navegación lateral responsive
6. `AdminTopBar` — Status bar global con indicadores live
7. `LiveFeed` — Feed de actividad en tiempo real
8. `HealthGrid` — Grid de servicios con status
9. `FunnelChart` — Visualización de funnel horizontal
10. `ProjectionSlider` — Simulador interactivo de proyecciones

---

## 9. API Endpoints necesarios

### Nuevos:
- `GET /api/admin/live` — Datos real-time (usuarios activos, rondas en curso)
- `GET /api/admin/analytics` — Métricas de crecimiento, retención, funnel
- `GET /api/admin/golf-ops` — Torneos, rondas, canchas consolidado
- `GET /api/admin/finance` — Costos, revenue, proyecciones
- `GET /api/admin/feed` — Activity feed (últimos N eventos con detalle)

### Mejorar existentes:
- `GET /api/admin/overview` — Agregar sparkline data, deltas
- `GET /api/admin/health` — Agregar uptime history, latencia promedio
- `GET /api/admin/users` — Agregar stats por usuario, filtros avanzados

---

## 10. Datos en Tiempo Real

### Estrategia: Polling inteligente
- **Command Center:** Poll cada 10s (feed, KPIs live)
- **Analytics:** Poll cada 60s (métricas calculadas)
- **Health:** Poll cada 30s (servicios)
- **Finanzas:** Estático (refresh manual)

No usamos Supabase Realtime para admin (overhead innecesario para 1-2 admin users). Polling es suficiente y más simple.

---

## 11. Responsive

### Desktop (>1024px)
- Sidebar expandida (240px)
- Content area con grid de cards

### Tablet (768-1024px)
- Sidebar colapsada (iconos only, 64px)
- Content full width

### Mobile (<768px)
- Sidebar oculta → hamburger menu
- Bottom nav con 5 iconos
- Cards stack vertical
- Charts scroll horizontal

---

## 12. Implementación — Archivos a crear/modificar

### Nuevos:
```
src/app/admin/layout.tsx            — REWRITE: sidebar layout
src/app/admin/page.tsx              — REWRITE: Command Center
src/app/admin/analytics/page.tsx    — NEW: Analytics dashboard
src/app/admin/golf-ops/page.tsx     — NEW: Golf Operations
src/app/admin/finanzas/page.tsx     — NEW: Finanzas dashboard
src/app/admin/sistema/page.tsx      — REWRITE: Sistema + Config fusionados
src/components/admin/               — NEW: directorio componentes admin
  AdminCard.tsx
  AdminChart.tsx
  AdminTable.tsx
  AdminBadge.tsx
  AdminSidebar.tsx
  AdminTopBar.tsx
  LiveFeed.tsx
  HealthGrid.tsx
  FunnelChart.tsx
  ProjectionSlider.tsx
src/app/api/admin/live/route.ts     — NEW
src/app/api/admin/analytics/route.ts — NEW
src/app/api/admin/golf-ops/route.ts  — NEW
src/app/api/admin/finance/route.ts   — NEW
src/app/api/admin/feed/route.ts      — NEW
```

### Eliminar (reemplazados):
```
src/app/admin/usuarios/page.tsx      — Movido a golf-ops
src/app/admin/crecimiento/page.tsx   — Movido a analytics
src/app/admin/golf/page.tsx          — Movido a golf-ops
src/app/admin/taiger/page.tsx        — Movido a golf-ops
src/app/admin/monetizacion/page.tsx  — Movido a finanzas
src/app/admin/geografia/page.tsx     — Movido a analytics
src/app/admin/configuracion/page.tsx — Movido a sistema
```

---

## 13. Criterios de Éxito

1. Todos los datos son dinámicos (0 placeholders, 0 hardcoded)
2. Polling funciona correctamente con indicador de última actualización
3. Build pasa sin errores (tsc + next build)
4. Mobile responsive completo
5. Navegación fluida entre secciones
6. Datos consistentes con la BD real
7. Look & feel de clase mundial (Stripe/Vercel level)
