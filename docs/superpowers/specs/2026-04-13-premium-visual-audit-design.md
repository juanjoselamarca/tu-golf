# Golfers+ — Auditoría Visual & Copy Premium

**Fecha:** 13 abril 2026
**Objetivo:** Elevar Golfers+ al estándar de app de golf de primer nivel mundial.
**Filosofía:** "La app que sabe qué decir en cada momento" — contextual voice.
**Benchmark:** Garmin Golf, 18Birdies, Arccos Golf, Golfshot, TheGrint.
**Hallazgo clave:** Ninguna app de golf premium usa emojis. Todas usan iconos SVG + labels cortos.

---

## INVENTARIO DE PROBLEMAS

### Estado actual: 27 emojis en UI, copy genérico

Golfers+ usa emojis como iconos de navegación, decoradores de títulos, y marcadores de estado.
Esto la posiciona visualmente al nivel de una app consumer/casual, no de una herramienta deportiva premium.

---

## PROPUESTAS DE MEJORA

### 1. NAVEGACIÓN — De emojis a iconos SVG

**Problema:** Sidebar y bottom nav usan emojis (🏠📊📋🐯📥🟢⚡🏆✦) como iconos.
**Objetivo:** Aspecto premium consistente, como Garmin Golf o Arccos.
**Cambio:** Reemplazar todos los emojis por iconos de Lucide Icons (ya compatible con React/Next.js, estilo limpio y moderno).

| Actual | Nuevo ícono | Label actual | Label propuesto |
|--------|-------------|-------------|-----------------|
| 🟢 En Vivo | `<Radio />` | En Vivo | En Vivo |
| 📊 Mi CPI | `<TrendingUp />` | Mi CPI | Mi CPI |
| 📋 Mis rondas | `<ClipboardList />` | Mis rondas | Rondas |
| 🐯 tAIger+ | SVG custom tigre | tAIger+ | tAIger+ |
| 📥 Importar | `<Upload />` | Importar | Importar |
| ⚡ Golf Intelligence | `<Zap />` | Golf Intelligence | Intelligence |
| 🏠 Inicio | `<Home />` | Inicio | Inicio |
| 🏆 Leaderboard | `<Trophy />` | Leaderboard | Ranking |
| ✦ Ver Demo | `<Play />` | Ver Demo | Demo |

**Badges:** "LIVE" y "IA" se mantienen como badges de texto — son funcionales, no decorativos.

### 2. DASHBOARD — Copy contextual inteligente

**Problema:** Métricas usan emojis como ícono (🏆👥📅) y el copy es genérico.
**Objetivo:** Que el dashboard se sienta personalizado — la app te conoce.

| Actual | Propuesto |
|--------|-----------|
| 🏆 Torneos organizados: 3 | Icono SVG + "3 torneos organizados" |
| 👥 Jugadores inscritos: 12 | Icono SVG + "12 jugadores" |
| 📅 Último torneo: hace 5 días | Icono SVG + "Hace 5 días en Las Brisas" (nombre real de cancha) |
| "Tu primera ronda te espera" (genérico) | "Tu juego merece mejores datos" (premium, motivacional) |
| "Crea tu primer torneo" (genérico) | "Organiza tu primera competencia" (más elegante) |

**Empty states contextuales:**
- Sin rondas: *"Cuando juegues tu primera ronda, aquí verás cómo evolucionas."*
- Sin importaciones: *"Conecta tu Garmin o sube una foto para traer tu historial."*
- Sin coach: *"Con 3 rondas, tAIger+ podrá analizar tu juego."*

### 3. LANDING PAGE — De features a historia

**Problema:** Feature grid usa emojis (📱📊🤖🏆) y copy informativo genérico.
**Objetivo:** Que la landing cuente una historia, no una lista de features.

| Actual | Propuesto |
|--------|-----------|
| 📱 Live Scoring — "Registra score hoyo a hoyo desde tu celular" | Icono SVG + "Scoring en tiempo real" — *"Tu score, visible para todos. Al instante."* |
| 📊 Índice Dual — "Tu índice oficial + tu rendimiento real" | Icono SVG + "Tu índice, completo" — *"El handicap oficial más tu rendimiento real en cancha."* |
| 🤖 tAIger+ — "Coach IA que conoce tu juego" | Icono SVG tigre + "Tu coach personal" — *"Analiza tus patrones y te dice dónde están tus golpes."* |

**Pasos del proceso:**
- Actual: 🏆📱📊 con texto descriptivo
- Propuesto: Números elegantes (1, 2, 3) con copy directo:
  1. *"Crea la competencia"*
  2. *"Cada jugador marca en su celular"*
  3. *"Ranking en vivo para todos"*

### 4. SCORING EN CANCHA — Silencio inteligente

**Problema:** Algunos estados y mensajes durante el scoring son verbosos.
**Objetivo:** En cancha, la app es invisible. Mínimo texto, máxima eficiencia.

**Principios:**
- Números grandes, labels pequeños
- Cero texto motivacional durante scoring
- Feedback visual, no textual (color del score indica resultado)
- Único texto: errores críticos, y esos deben ser claros y breves

| Actual | Propuesto |
|--------|-----------|
| "No se pudo guardar el score. Intenta de nuevo." | "Error guardando. Reintentar." |
| "La ronda ya está finalizada. No se pueden registrar scores." | "Ronda finalizada" |
| "El torneo no está activo." | "Torneo inactivo" |

### 5. LEADERBOARD — Data pura, celebración sutil

**Problema:** Posiciones usan emojis (🏆🥈🥉) y feed de anuncios usa emojis.
**Objetivo:** Elegancia competitiva — la data habla sola.

| Actual | Propuesto |
|--------|-----------|
| 🏆 Posición 1 | Número gold bold en círculo dorado (sin emoji) |
| 🥈 Posición 2 | Número silver en círculo sutil |
| 🥉 Posición 3 | Número bronze en círculo sutil |
| 🏆 "Nuevo líder · C. Méndez" | Dot gold + "Nuevo líder — C. Méndez" |
| 🤝 Empate | Ícono SVG hands + "Empate" |

### 6. COACH tAIger+ — Experto cercano

**Problema:** El branding usa 🐯 emoji y el tono puede ser inconsistente.
**Objetivo:** tAIger+ se siente como un pro experimentado que te conoce.

| Actual | Propuesto |
|--------|-----------|
| 🐯 tAIger+ | Ícono SVG custom de tigre minimalista + "tAIger+" |
| Badge "IA" | Badge "AI" (más universal y premium) |
| Copy genérico onboarding | *"Cuéntame sobre tu juego. Necesito conocerte para ayudarte."* |
| Sesión de análisis | *"Revisé tu última ronda. Esto es lo que vi..."* (personalizado) |

### 7. IMPORT — Directa y confiable

**Problema:** Algunas instrucciones son largas y usan emojis decorativos.
**Objetivo:** Importar datos se siente rápido y confiable.

| Actual | Propuesto |
|--------|-----------|
| ⛳ Nombre de cancha | Ícono SVG flag + nombre |
| ✅ Validación exitosa | Checkmark SVG verde + "3 rondas detectadas" |
| Copy largo de instrucciones | Steps numerados, máximo 1 línea cada uno |

### 8. ADMIN — Profesional y funcional

**Problema:** Admin usa emojis pesados (🏆⛳🎯📊💰🔧👥🤖).
**Objetivo:** Dashboard admin se ve como herramienta de gestión profesional.

**Cambio:** Reemplazar todos los emojis por Lucide Icons monocromáticos. El admin no necesita calidez — necesita claridad y densidad de información.

### 9. ESTADOS VACÍOS — Momentos que importan

**Problema:** Empty states genéricos o inexistentes.
**Objetivo:** Cada empty state es una oportunidad de guiar al usuario.

| Pantalla | Copy propuesto |
|----------|---------------|
| Sin rondas | *"Tu historial empieza con la primera ronda."* |
| Sin stats | *"Con 3 rondas, aquí verás tu evolución."* |
| Sin torneos | *"Organiza tu primera competencia."* |
| Sin coach | *"tAIger+ necesita conocer tu juego. Juega 3 rondas."* |
| Leaderboard vacío | *"Cuando haya jugadores en cancha, aquí los verás."* |
| Error de conexión | *"Sin conexión. Tus datos se guardarán cuando vuelvas."* |

### 10. GUÍA DE VOZ — "Confianza tranquila"

**Principio diferenciador:** Cada palabra se gana su lugar. Si la interfaz
puede comunicar algo con color, tipografía o layout — no hace falta texto.
Lo que diferencia a Golfers+ no es lo que dice, sino lo que omite.

#### 3 Modos de voz

| Modo | Cuándo | Personalidad | Ejemplo |
|------|--------|-------------|---------|
| **Caddie** | Scoring, en vivo, datos en cancha | Invisible, preciso, cero palabras de más | "T3 — a 1 del líder" |
| **Clubhouse** | Dashboard, stats, post-ronda, coach, social | Cálido, personalizado, conoce tu juego | "5 de 14 fairways en Las Brisas" |
| **Pro Shop** | Settings, errores, admin, onboarding, import | Claro, directo, respetuoso | "3 rondas detectadas. Confirmar" |

#### Guardrails (NUNCA hacer)

- Nunca "!" en errores o estados vacíos
- Nunca "ups", "oops", "oh no" — condescendiente
- Nunca diminutivos ("rondita", "tornecito")
- Nunca celebrar en exceso — un par no es "increíble"
- Nunca explicar lo que el golfista ya sabe
- Nunca "tú" explícito cuando se puede omitir — "Tu score" → "Score"
- Nunca emojis en la UI

#### Tabla de lookup por componente

| Componente | Modo | Bien | Mal |
|------------|------|------|-----|
| Nav label | Caddie | "Rondas" | "Ver mis rondas" |
| Empty state | Clubhouse | "Tu historial empieza con la primera ronda" | "No hay nada aquí todavía" |
| Error guardando | Pro Shop | "Error guardando. Reintentar" | "Ups! No pudimos guardar tu score" |
| Post-birdie | Caddie | (solo color azul, sin texto) | "Birdie! Gran tiro!" |
| Stat personal | Clubhouse | "5 de 14 fairways — tu promedio es 7" | "Tus estadísticas de fairway hit" |
| CTA primario | Pro Shop | "Crear ronda" | "Crea tu primera ronda ahora!" |
| Coach tip | Clubhouse | "Tu approach de 80-120y pierde 0.8 golpes" | "Deberías mejorar tu juego corto" |
| Posición | Caddie | "T3 — a 1 del líder" | "Estás en tercer lugar!" |
| Onboarding | Pro Shop | "Tu juego merece mejores datos" | "La MEJOR app de golf!" |
| Score result | Caddie | Número en color (azul birdie, gold bogey) | Label de texto "Birdie!" |

#### Reglas de estilo

1. Español LatAm neutro. Spanglish golf natural (birdie, fairway, score, handicap)
2. Números > palabras ("5 rondas" no "cinco rondas")
3. Max 8 palabras en nav labels, max 15 en descripciones
4. Verbos en infinitivo para CTAs: "Crear", "Importar", "Ver"
5. Sin punto en labels/títulos. Punto solo en párrafos
6. Cero emojis en toda la UI

---

## SISTEMA DE ICONOS PROPUESTO

**Librería:** Lucide React (https://lucide.dev)
- Peso visual consistente (1.5-2px stroke)
- 1000+ iconos disponibles
- Tree-shakeable (solo importas lo que usas)
- MIT license
- Ya compatible con Next.js/React

**Ícono custom:** tAIger+ requiere un SVG custom de tigre minimalista.
Se diseñará como parte de la identidad de marca.

**Tamaños estándar:**
- Navegación: 20px
- Cards/badges: 16px
- Inline text: 14px
- Headers: 24px

---

## PRIORIDAD DE IMPLEMENTACIÓN

| Prioridad | Cambio | Impacto | Esfuerzo |
|-----------|--------|---------|----------|
| P0 | Emojis → Lucide en Navbar/sidebar | Cambio más visible para TODOS los usuarios | Medio |
| P0 | Emojis → Lucide en bottom nav mobile | Mobile es 80%+ del uso | Medio |
| P1 | Landing page copy + iconos | Primera impresión de nuevos usuarios | Medio |
| P1 | Dashboard copy contextual | Retención, personalización | Medio |
| P2 | Leaderboard posiciones + feed | Experiencia competitiva | Bajo |
| P2 | Empty states copy | Onboarding, reducir abandono | Bajo |
| P3 | Admin iconos | Solo admin ve esto | Bajo |
| P3 | Error messages minimización | UX en cancha | Bajo |
| P4 | tAIger+ ícono SVG custom | Branding | Alto (diseño) |
| P4 | Guía de voz documentada | Consistencia largo plazo | Bajo |

---

## MÉTRICAS DE ÉXITO

- **Percepción:** La app se siente "profesional" y "elegante" en feedback cualitativo
- **Consistencia:** 0 emojis en UI (medible con grep)
- **Diferenciación:** Usuarios mencionan "se siente distinta" vs otras apps de golf
- **Retención:** Empty states guían mejor → menos abandono en primeros 7 días
