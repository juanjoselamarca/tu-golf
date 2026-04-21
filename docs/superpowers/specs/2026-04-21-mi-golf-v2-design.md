# Spec: Mi Golf v2 — rediseño con jerarquía clara

**Fecha:** 2026-04-21
**Autor:** Claude (CTO) + Juanjo (PM)
**Estado:** Aprobado — listo para plan de implementación
**Ruta afectada:** `/dashboard` (bottom nav "Mi Golf")
**Supersedes:** `docs/superpowers/specs/2026-04-20-mi-golf-redesign-design.md`

---

## Contexto

La v1 del rediseño se shippeó el 2026-04-20 (`8be074e..098fa3f`). Juanjo la rechazó visualmente: "mucha información sin jerarquía y desordenada". Los tabs Competencia/Identidad SÍ funcionan conceptualmente — el problema es densidad, falta de jerarquía, y métricas inventadas o castigadoras.

Este spec describe la v2 que reemplaza completamente la v1 en producción.

## Principios rectores

1. **Solo data real.** Nada de "62% mejor que golfistas de tu nivel" o metas arbitrarias. Si no tenemos la data, el elemento no aparece.
2. **Una barra protagonista por sección.** No 5 medidores compitiendo. La sensación premium viene del silencio.
3. **Jerarquía visual honesta.** Lo más importante es lo más grande. Sin redundancias (no arc gauge + levels bar que dicen lo mismo).
4. **Sin castigo visual.** Solo verde para resaltar lo bueno. El resto permanece neutro. No hay rojo para scores regulares — aprender golf es frustrante de por sí.
5. **Minimalismo premium, no gamificación infantil.** Sin XP inventado, sin badges cheap, sin emojis chillones, sin confetti. Carta de membresía > videojuego.
6. **Todos los estados diseñados.** No asumir el mejor caso. Hero con 3 estados explícitos (en curso · próximo · sin actividad).

## Arquitectura de tabs

Se mantiene la sub-navegación aprobada en v1:

```
[ Competencia ]   Identidad •
─────────────
```

- Underline dorado bajo tab activo.
- Badge dot en Identidad cuando hay novedad (tendencia cambió, nivel nuevo, tAIger insight nuevo).
- **Default**: Competencia.
- Sin persistencia en localStorage — siempre arranca en Competencia.

---

## Pestaña 1 — Competencia

### Greeting

```
Hola, Juanjo                    HCP 10.5
```

- Nombre en Playfair Display 22px, peso 600, color `#1a1a1a`.
- A la derecha, etiqueta `HCP` en gris chico + valor del Índice Golfers+ en Playfair 14px dorado (`#c4992a`), peso 700.
- Tap en el HCP lleva a la pestaña Identidad.

### Hero contextual — 3 estados

Regla de prioridad:
```
ronda_activa > torneo_en_7_dias > sin_actividad
```

**Estado 1 — En juego** (cuando hay ronda activa):
- Fondo dorado pleno `#c4992a`, texto blanco.
- Label `EN JUEGO` (11px, spacing 0.12em, uppercase, opacidad 0.85).
- Título: nombre de la cancha (17px, peso 700).
- Sub: `Hoyo X de Y · Continuar →` (12px).
- A la derecha: score parcial grande `+2` en Playfair 32px, label `vs par` abajo.
- Tap → `/ronda-libre/[codigo]/score`.

**Estado 2 — Próximo compromiso** (torneo en próximos 7 días, sin ronda activa):
- Fondo blanco, borde completo dorado + borde izquierdo dorado 4px (acento lateral).
- Label `PRÓXIMO COMPROMISO` (dorado).
- Título: nombre del torneo.
- Sub: `cancha · Salida HH:MM am` (si la hora de salida está disponible; si no, solo cancha).
- A la derecha: countdown `3d` en Playfair dorado, label `restantes` abajo.
- Tap → `/torneo/[slug]`.

**Estado 3 — Sin actividad** (ni ronda ni torneo inminente):
- Fondo gris sobrio `#fafafa`, centrado.
- Texto `Sin torneos ni rondas en curso` (14px, peso 500).
- Sub `¿Querés jugar hoy?` (12px, gris).
- No CTA directo en el hero — las acciones están abajo. Pacífico, no mendigante.

**Usuario nuevo** (0 rondas, 0 torneos, 0 historial): el hero "Sin actividad" + las acciones abajo cumplen el rol de onboarding. Se elimina `EmptyStateOnboarding` dedicado de v1 (era redundante y ocupaba mucho espacio).

### Acciones rápidas

3 píldoras horizontales, 44px altura, border-radius 22px:

1. **Nueva ronda** — fondo negro `#1a1a1a`, texto blanco, peso 700. Acción principal resaltada.
2. **Organizar torneo** — fondo blanco, borde gris, texto `#1a1a1a`, peso 600.
3. **Unirme con código** — mismo estilo que Organizar.

Sin emojis. Si agregamos íconos, estilo Lucide lineal (no solid).

### Torneos — lista con sub-labels por rol

Sección con label `TORNEOS` + link `Ver todos →` a `/perfil/historial` (que después Juanjo refinará si quiere crear una página dedicada).

Sub-labels (11px uppercase, letter-spacing 0.08em, color `#999`):

- **JUGANDO EN** — torneos donde estoy inscrito como jugador y están activos o próximos. Dato a la derecha: `Inscrito` + hora de salida (si disponible).
- **ORGANIZANDO** — torneos que yo organicé y están activos o próximos. Dato a la derecha: `N jugadores` + progreso (`Hoyo 12/18` si está en curso).
- **FINALIZADOS RECIENTES** — hasta 2 torneos cerrados recientemente (jugador u organizador). Dato a la derecha: resultado en dorado si lo tengo (`3°` en Playfair) + sub `de 42`; si no hay resultado, fecha relativa.

Cada sub-sección aparece solo si tiene contenido. Si las 3 están vacías, la sección entera desaparece.

Filas con borde inferior `#f2f2f2` delgado — estilo estado de cuenta.

### Últimas rondas

Label `ÚLTIMAS RONDAS` + link `Ver todas →` a `/rondas` (pestaña del bottom nav).

Feed de 3 rondas máximo, una-línea por ronda:
- Izquierda: nombre cancha + fecha contextual (`Hoy · Martes · Domingo pasado · Hace X días` según cercanía).
- Derecha: score total en Playfair (`82`) + línea secundaria.

**Coloración de la línea secundaria** (la regla de oro):
- Si es el mejor score del mes del usuario: `↑ Tu mejor del mes` en verde `#2d7a3e`, peso 700.
- Cualquier otro caso: `+X vs par` en gris neutro `#666`, peso 500. Sin rojo nunca.

### Comunidad

Una sola línea compacta al pie, fondo `#fafafa`, padding chico.

Mensaje con contexto cercano — priorizar:
1. Un socio del mismo club jugando ahora: `**Jorge P.** está jugando en Los Leones`.
2. Si no hay clubmates, un amigo conectado: `**Carolina M.** registró ronda en Sport Francés`.
3. Si no hay ni clubmates ni amigos, **no mostrar la sección** (mejor ausencia que placeholder "3 rondas en Chile").

Flecha dorada a la derecha, tap → widget expandido / página de actividad reciente (detalles de esa ruta fuera de alcance de este spec, dejar `/community` o similar stub por ahora).

---

## Pestaña 2 — Identidad

### Hero del índice

Centrado, bloque único:

- **Número grande del índice** en Playfair 72px, peso 700, color dorado, letter-spacing -0.02em.
- **Label** `ÍNDICE GOLFERS+` (11px uppercase, spacing 0.1em, gris).
- **Nombre del nivel** debajo en Playfair 20px peso 600 (`Intermedio`).
- **Distancia al próximo nivel** en gris chico (`2.5 golpes para pasar a Avanzado`).

Sin arc gauge, sin círculos decorativos. El número manda por su tamaño.

**Empty state** (sin índice):
- Número reemplazado por `—` (em dash grande en Playfair, gris).
- Nombre del nivel: `Sin calibrar`.
- Sub: `Jugá 3 rondas en canchas con slope/rating para desbloquear`.

### Barra de niveles

5 segmentos horizontales (`repeat(5, 1fr)`, gap 3px, altura 4px, border-radius 2px):

- Segmentos de niveles **pasados** en dorado pleno.
- Segmento del nivel **actual** con gradiente dorado `→` gris en el punto exacto de progreso dentro del nivel (%).
- Triángulo `▼` dorado encima del punto de progreso actual.
- Segmentos **futuros** en gris `#e8e8e8`.

Labels debajo (9px uppercase, 5 columnas):
```
Novato   Amateur   Intermedio   Avanzado   Scratch
```

El label del nivel actual en dorado bold, el resto en gris claro `#999`.

### Rangos oficiales de niveles

Decisión CTO — estándar adaptado al golf recreacional chileno:

| Nivel | Rango de índice |
|-------|-----------------|
| Scratch | 0 – 3 |
| Avanzado | 3 – 10 |
| Intermedio | 10 – 18 |
| Amateur | 18 – 28 |
| Novato | 28+ |

El progreso dentro del nivel se calcula como porcentaje dentro de la banda (ej: índice 10.5 → Intermedio al (18 - 10.5) / (18 - 10) × 100% desde el borde inferior, o de la manera visual más intuitiva — el plan decide la fórmula exacta).

### Progresos — barras finas con %

Label `PROGRESOS` (10px uppercase, gris).

Solo 2 barras, ambas con metas REALES:

1. **Calibración del índice** — progreso `rondasConDiferencial / 3`. Ocultar cuando el índice ya esté calibrado.
2. **Desbloqueo tAIger+** — progreso `totalRounds / 5`. Ocultar cuando ya tenga 5+ rondas y haya usado tAIger al menos una vez.

**Ninguna barra de "torneos del año" ni XP ni metas inventadas.**

Si ambas barras están ocultas (usuario ya calibrado y con tAIger+ desbloqueado), la sección `PROGRESOS` entera desaparece.

Estilo:
- Altura barra: 3px.
- Background: `#e8e8e8`.
- Fill: dorado `#c4992a`.
- Label a la izquierda (13px), % a la derecha en Playfair 14px peso 700 dorado.

### Tu juego — 4 stats en lista sobria

Label `TU JUEGO` (mismo estilo que PROGRESOS).

4 filas con formato `key — value` (no grid, lista vertical):

| Key | Value |
|-----|-------|
| Mejor score | `76` + sub `+4 vs par` |
| Cancha favorita | `Sport Francés` + sub `· 12 veces` |
| Rondas jugadas | `47` |
| Promedio últimas 5 | `83.4` + sub `golpes` |

Borde inferior `#e8e8e8` entre filas. Última sin borde. Padding vertical 10px.

Los valores principales en `#1a1a1a` peso 600 (14px). Los subs en gris claro `#999` (12px).

**Empty state por fila** (si no hay data):
- Mejor score sin data: fila entera no aparece.
- Cancha favorita con 0 rondas: fila no aparece.
- Rondas jugadas siempre aparece (mínimo `0`).
- Promedio últimas 5 con <3 rondas: fila no aparece.

Si ninguna fila aparece, la sección entera desaparece.

### tAIger Coach — una línea

Card compacta al final de Identidad:
- Fondo `#fafafa`, padding 14px 16px, border-radius 10px, border-left 2px dorado.
- Label `TAIGER COACH` (9px dorado, uppercase).
- Texto de insight derivado de data real (13px peso 500, líneas 1.45). Máximo 2 líneas, el insight debe ser conciso.
- CTA `Pedir análisis →` (12px dorado peso 600).

Fuentes de texto en orden de prioridad (se elige la primera disponible):
1. Si tendencia del índice cambió en 30d: `Tu diferencial bajó 0.3 en los últimos 30 días.` (si mejoró) o `Tu diferencial subió 0.4 en los últimos 30 días.` (si empeoró).
2. Si falta poco para nivel siguiente: `Estás 2.5 golpes de pasar a Avanzado.`
3. Si usó tAIger: `Revisá los patrones detectados en tu juego reciente.`
4. Si no usó tAIger pero tiene data suficiente (≥5 rondas): `Tu coach con IA está listo para analizar tu juego.`
5. Fallback: `Registrá rondas para desbloquear insights personalizados.`

Si hay múltiples aplicables, se usa la primera por orden. El mensaje es determinístico por día (ya que la tendencia se recalcula a diario).

---

## Estilo visual

### Tokens

- **Fondo página**: `#ffffff`
- **Fondo soft**: `#fafafa`
- **Fondo oro hero**: `#c4992a` (pleno) · `#fef5e0` (soft/chips)
- **Border**: `#e8e8e8`
- **Border soft**: `#f2f2f2` (filas de listas)
- **Text primario**: `#1a1a1a`
- **Text secundario**: `#666`
- **Text terciario**: `#999`
- **Verde resalte**: `#2d7a3e` (solo para mejoras destacadas)

### Tipografía

- **Playfair Display** (serif): solo para números protagonistas — índice grande, scores en filas, resultados de torneo (`3°`), hero score (`+2`), % en barras.
- **Inter / sans-serif default**: todo lo demás.

### Responsive

- Max-width 640px centrado.
- Tabs sticky top.
- Mobile-first. Desktop se ve igual que mobile centrado.

### NO usar

- Emojis chillones (🏆, 🎉, 🔥)
- Rojo para scores regulares
- Confetti, animaciones bouncy
- Gradientes saturados
- Arc gauges, radar charts (sin data real)
- XP, badges inventados, "puntos Golfers"
- Placeholder sections vacíos ("3 rondas en Chile")

---

## Datos requeridos

### Ya disponibles

- `tournaments` (como organizador)
- `players` → `tournaments` (como jugador)
- `rondas_libres`
- `historical_rounds` (con `diferencial`)
- `profiles` (`indice_golfers`, `indice`)
- `taiger_sessions`

### Nuevos cálculos

1. **Nivel del usuario** — función `getNivel(indice)` retorna `{ nombre, rango, progresoEnNivel }`. Determinístico, sin BD.
2. **Distancia al próximo nivel** — derivada de `getNivel()`: `golpesHasta = umbralSuperior - indice`.
3. **Tendencia del índice 30d** — ya existe en `src/lib/mi-golf/tendencia.ts`. Reutilizar.
4. **Stats (promedio, mejor, cancha favorita)** — ya existe en `src/lib/mi-golf/stats.ts`. Reutilizar.
5. **Mejor del mes** — nuevo: `getBestScoreOfMonth(historico)` → booleano por ronda. Para marcar con `↑ Tu mejor del mes` en verde.
6. **tAIger text del día** — función `getTaigerLine(inputs)` que elige una frase por prioridad.
7. **Comunidad cercana** — nueva query: clubmates del usuario con ronda activa `< 30 min` o amigos recientes. Si nada retorna, no render.

### Nuevas queries

- `profiles` con `club_id` del usuario (si existe el concepto de club en el schema — verificar en implementación).
- `rondas_libres` where `estado = 'en_curso'` AND `creador_id IN (clubmates)` limit 1 — para la sección de comunidad.

Si el schema no tiene noción de "clubmates", fallback: usuarios recientes que jugaron la misma cancha que el usuario actual.

---

## Swap limpio v1 → v2 (estrategia de implementación)

**Reemplazo completo, no paralelo.** Los archivos que ya viven en:
- `src/components/mi-golf/CompetenciaTab.tsx`
- `src/components/mi-golf/IdentidadTab.tsx`
- `src/components/mi-golf/EmptyStateOnboarding.tsx`
- `src/components/mi-golf/MiGolfTabs.tsx`
- `src/app/dashboard/page.tsx`

Se reescriben en su lugar. Sin `-v2` en los nombres. Sin feature flags. El deploy a main cambia la pantalla de una vez.

**Archivos de lógica que se reutilizan (sin cambio):**
- `src/lib/mi-golf/tendencia.ts` + test
- `src/lib/mi-golf/stats.ts` + test

**Archivo nuevo de lógica:**
- `src/lib/mi-golf/niveles.ts` — `getNivel()` + tests

**Archivo que se elimina:**
- `src/lib/mi-golf/insights.ts` + test — sustituido por lógica más simple inline en el page (`getTaigerLine()`). O se reescribe con menor complejidad. El plan decide.

**Tests que se actualizan:**
- `MiGolfTabs.test.tsx` — mantener si el API del componente no cambia.
- Los tests de `tendencia.ts` y `stats.ts` siguen pasando.

---

## Criterios de éxito

1. Greeting con HCP a la vista en Competencia.
2. Los 3 estados del hero renderizan correctamente según data (verificable con data de prueba).
3. No aparece rojo en scores regulares. Solo verde en "mejor del mes".
4. Sin emojis en el código nuevo.
5. Barra de niveles muestra la posición correcta según índice del usuario.
6. Progresos solo aparecen si las metas aún no están cumplidas.
7. Secciones vacías desaparecen (no placeholders).
8. Tests ≥ 1019 siguen pasando.
9. tsc y build clean.
10. `/dashboard` marcado como dinámico en build.

## Fuera de alcance (explícito)

- Radar chart de dimensiones del juego (driver, putting, etc.)
- Sistema de logros / badges
- Leaderboards comunitarios
- Comparativas contra promedio poblacional
- Página dedicada `/perfil/torneos`
- Export de stats a PDF
- Widgets iOS/Android
- Persistencia de tab activo en localStorage

Estos quedan para iteraciones futuras cuando haya data o justificación.
