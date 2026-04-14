# Propuesta: Rediseño pestaña "Mi Golf" (Dashboard)

**Fecha:** 14 abril 2026
**Estado:** Pendiente de aprobación — NO implementar hasta que Juanjo apruebe.

---

## Estado actual (646 líneas, `src/app/dashboard/page.tsx`)

El dashboard tiene estas secciones en orden:

| # | Sección | Qué muestra | Problema |
|---|---------|-------------|----------|
| 1 | Saludo | "Hola [nombre]" | OK pero genérico |
| 2 | Ronda activa | Card con ronda en curso + link para seguir jugando | OK — alta prioridad, bien posicionado |
| 3 | Torneos activos del jugador | Cards de torneos donde está inscrito | OK pero mezclado con el resto |
| 4 | Next step nudge | Una sugerencia contextual ("Crea tu primera ronda", etc) | Bien como concepto, pero compite con las action cards |
| 5 | Progreso de índice | Barra de progreso del handicap index | Bueno pero sin contexto — no dice "mejoraste" ni "empeoraste" |
| 6 | Última ronda completada | Card con score + share | OK pero sin HoleBar ni contexto visual |
| 7 | Welcome empty state | Para usuarios nuevos — crear ronda, importar, tAIger | OK para onboarding |
| 8 | Action cards | "Ronda Libre" + "Organizar torneo" | Bien pero ocupan mucho espacio para usuarios recurrentes |
| 9 | Invitar amigos | CTA de invitación | Bajo engagement, muy abajo |
| 10 | Stats card | Stats básicas del jugador | Poco visibles, al fondo |
| 11 | Mis torneos (organizador) | Lista de torneos que organizó | OK para organizadores |
| 12 | Torneos jugados | Lista de torneos donde participó | OK |
| 13 | En Vivo widget | Widget de rondas activas en la plataforma | Invisible si no hay rondas |
| 14 | Mis rondas libres | Lista de rondas libres recientes | Redundante con historial |

## Problemas identificados

1. **Demasiadas secciones** (14) — el scroll es largo y no hay jerarquía clara
2. **Lo más importante NO está primero** — el índice/CPI está en el medio, debería ser protagonista
3. **Duplicación con historial** — "Última ronda" y "Mis rondas libres" repiten lo de `/perfil/historial`
4. **Action cards ocupan demasiado** — "Ronda Libre" y "Organizar torneo" son dos cards grandes que el usuario recurrente ya conoce
5. **Sin resumen de forma actual** — no hay indicador de "estás mejorando" o "tu tendencia"
6. **Sin acceso rápido a tAIger** — el coach está escondido en el onboarding

## Propuesta nueva

### Sección 1: Estado de forma — PROTAGONISTA
**Lo primero que el jugador ve al abrir la app.**
- Índice WHS grande y prominente (ej: "10.5")
- Tendencia: flecha arriba/abajo con "Mejoró 0.3 en el último mes"
- Última ronda: mini-card con score + HoleBar (una línea, tap abre historial)
- Si no tiene índice: CTA para completar perfil

### Sección 2: Acciones rápidas — fila compacta
**Lo que el jugador necesita hacer AHORA.**
- 3 botones en fila horizontal: "Nueva ronda" | "tAIger Coach" | "Importar"
- Compactos (iconos + label), no cards gigantes
- Si hay ronda activa: reemplazar "Nueva ronda" por "Continuar ronda" (destacado)

### Sección 3: Torneos — solo si hay
**Torneos relevantes del jugador.**
- Si está inscrito en un torneo activo: card prominente con countdown
- Si organizó torneos: lista compacta
- Si no tiene torneos: no mostrar nada (no placeholder vacío)

### Sección 4: Actividad reciente — feed compacto
**Últimas 3-5 rondas como cards con HoleBar.**
- Formato: Club + Score + HoleBar + fecha (una línea por ronda)
- Tap abre la tarjeta dedicada `/perfil/historial/[id]`
- Link "Ver todo" → `/perfil/historial`
- NO duplicar la ronda ya mostrada en Sección 1

### Sección 5: En Vivo — solo si hay
**Widget de rondas activas en la plataforma.**
- Solo visible si hay rondas en curso
- Compacto

### Eliminamos
- "Invitar amigos" (mover a settings o perfil)
- "Mis rondas libres" (redundante con historial)
- "Next step nudge" (reemplazado por las acciones rápidas contextuales)
- Welcome empty state gigante (reemplazado por el flujo natural de Sección 1 sin datos)

## Resultado esperado

De 14 secciones → **5 secciones** máximo, con jerarquía clara:
1. Tu forma actual (lo que importa)
2. Lo que podés hacer (acciones)
3. Tus compromisos (torneos)
4. Tu historial reciente (feed)
5. La comunidad (en vivo)

---

## Pendiente de aprobación

Esta propuesta NO se implementa hasta que Juanjo la apruebe.
Presentar para revisión y esperar feedback antes de escribir código.
