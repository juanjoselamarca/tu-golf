# MODELOS — routing automático por tarea (vigente desde 25-sep-2026, reemplaza la versión del 13-jul)

> **REEMPLAZADA el 02-oct-2026** por la v2 (`docs/claude/modelos.md`). Se conserva como historia: es la versión que hizo que Fable consumiera ~38 % del cupo.

Juanjo NO toca `/model`. Claude elige el modelo correcto para cada pedazo de trabajo y lo
aplica solo. Principio rector: **el modelo se elige por el costo de equivocarse, no por el
tamaño de la tarea.** Una línea mal escrita en el cálculo de handicap es más grave que 500
líneas de docs mal formateadas.

### Los 4 modelos (sep-2026)

| Modelo | Fortaleza | Velocidad | Peso relativo* | Rol en Golfers+ |
|---|---|---|---|---|
| **Fable 5.1** | El más capaz. Razonamiento profundo, tareas largas, ve lo que otros no | Lento (turnos de varios minutos) | 2.5× Opus | Especialista: lo difícil y lo crítico |
| **Opus 5.5** | Muy capaz, rápido, buen criterio de UI/copy | Rápido | 1× (base) | Caballo de batalla: hilo principal |
| **Sonnet 5** | Bueno en lo acotado y verificable | Muy rápido | 0.5× | Tareas mecánicas con respuesta objetiva |
| **Haiku 4.5** | Leer/buscar/clasificar mucho volumen | Instantáneo | 0.25× | Exploración y triage, nunca escribe código productivo |

\*Peso = precio por token de la API (Fable $10/$50, Opus 5.5 $4/$20, Sonnet 5 $2/$10,
Haiku $1/$5 por millón in/out). En el plan Max no se paga por token, pero el peso es
proporcional a cuánto cupo semanal consume: Fable gasta el cupo ~2.5× más rápido que Opus.

### Cómo se aplica (mecánica)

- **Hilo principal = el modelo de la sesión (hoy Opus 5.5).** Solo cambia con `/model`
  (acción de Juanjo; Claude no puede cambiarlo solo). Casi nunca hace falta: lo que pide
  otro modelo se **delega**.
- **Trabajo delegado = subagente con modelo propio.** Vía `Agent` con el `subagent_type`
  del carril, o con el parámetro `model` (`fable` / `opus` / `sonnet` / `haiku`) para
  sobrescribir el modelo de cualquier agente (ej. `superpowers:code-reviewer` en Fable).
  Claude enruta sin pedir permiso.

### Tabla de routing

| Tarea | Modelo | Cómo |
|---|---|---|
| Día a día: features, fixes acotados, ejecutar planes | **Opus** | Hilo principal |
| UI/UX: implementar e iterar pantallas, componentes, copy | **Opus** | Hilo principal + pipeline de diseño (abajo) |
| Dirección de diseño de pantalla nueva o rediseño: flujo, jerarquía, variantes | **Fable** propone → Opus implementa | subagente con `model: "fable"` |
| Crítica visual y de UX con screenshots antes de mergear cualquier cambio de UI | **Fable** | subagente con `model: "fable"` |
| Refactor de archivo "sucio" >600 LOC, diseño cross-módulo, plan de sprint/ola | **Fable** | `refactor-arquitecto` |
| Bug que resistió 2 intentos en el hilo principal | **Fable** | `debug-profundo` |
| Lógica de golf nueva o cambiada en `src/golf/core`, handicap/WHS, net, stroke index, leaderboard, formatos | **Opus** escribe → **Fable** revisa | code-reviewer con `model: "fable"` |
| Code review PR >100 LOC (regla general) | **Opus** | `superpowers:code-reviewer` |
| Code review PR que toca **zona crítica** (ver abajo) | **Fable** | `superpowers:code-reviewer` con `model: "fable"` |
| Auditoría de seguridad, secrets, RLS/políticas Supabase | **Fable** | subagente con `model: "fable"` |
| Brainstorm de arquitectura / Cerebro V3 (diseño, no ejecución) | **Fable** | `refactor-arquitecto` |
| Renombres, seed data, docs, boilerplate 1:1, scripts triviales | **Sonnet** | `tarea-mecanica` |
| Búsqueda amplia en el código ("¿dónde se usa X?"), leer logs largos, resumir archivos | **Haiku** | `Explore` con `model: "haiku"` |
| Triage/clasificación (inbox, reportes) | **Haiku** | ya implementado en `/inbox` |

**Zona crítica** (review en Fable; si el autor fue Fable, revisa Opus con esfuerzo máximo — ver caso 5): `src/golf/core/`, `src/golf/formats/`,
cálculo de handicap/índice/net, scoring y leaderboard, paywall/pagos, auth (`src/proxy.ts`),
archivos protegidos, migraciones SQL a prod, cualquier `DELETE`/`UPDATE` masivo de datos
de usuarios, políticas RLS. **Y en diseño:** las pantallas que se usan en cancha
(scorer, leaderboard, inscripción, resultados) y el primer contacto del usuario
(home, onboarding, /planes).

### Casos especiales (mandan sobre la tabla)

1. **Torneo inminente / bug P0 en cancha → velocidad primero.** Todo en Opus en el hilo
   principal; Fable es muy lento para un incendio. Excepción: si Opus falla 2 veces, entra
   `debug-profundo` igual — un fix lento es mejor que un fix equivocado.
2. **Escalar, nunca bajar después de un error.** Si un modelo falla una tarea, el
   reintento sube un escalón (Haiku → Sonnet → Opus → Fable). Nunca se reintenta con uno
   más chico "para ir más rápido".
3. **Si la tarea delegada a Sonnet/Haiku encuentra criterio de golf, producto o
   arquitectura, se detiene y la devuelve.** Los modelos chicos no improvisan decisiones.
4. **Sonnet y Haiku nunca escriben** lógica de golf, código de zona crítica, copy de cara
   al usuario ni SQL contra prod. Haiku solo lee.
5. **Segunda opinión con modelo distinto — el autor nunca se revisa a sí mismo.** Lo que
   escribió Opus lo revisa Fable; lo que escribió Fable (`refactor-arquitecto`,
   `debug-profundo`) lo revisa Opus con esfuerzo máximo. Un revisor del mismo modelo
   comparte los mismos puntos ciegos. Esto manda sobre "zona crítica → Fable".
6. **Cupo agotado.** Si Fable no responde por límite de uso, se sigue en Opus con
   esfuerzo máximo y se avisa a Juanjo en una línea. Nunca se frena el trabajo por eso.
7. **UI/UX = calidad crítica, no cosmética.** Golfers+ vende a golfistas exigentes; una
   pantalla fea o confusa se nota igual que un bug. Opus implementa (itera rápido), pero
   el diseño nunca se aprueba con la mirada del mismo modelo que lo hizo: Fable critica.
   Sonnet y Haiku nunca tocan UI ni copy.
8. **Sesión entera en Fable** (ej. brainstorm largo 100% interactivo que no se puede
   delegar): Claude avisa "Sugiero `/model` → Fable porque <razón>" y espera. Raro.

### Pipeline de diseño y UX (peso reforzado desde 25-sep-2026)

Aplica a **todo cambio visible para el usuario**, proporcional al tamaño:

| Tamaño del cambio | Qué se exige |
|---|---|
| Tweak (un color, un espaciado, un texto) | Screenshot antes/después a 390px, claro y oscuro. Contraste WCAG AA verificado |
| Componente o pantalla modificada | Lo anterior + crítica de Fable con screenshots + `design-review` |
| Pantalla nueva o rediseño | `design-shotgun` (3-4 variantes) → Fable elige y justifica dirección → Opus implementa con `frontend-design` → crítica de Fable → `design-review` → decision log en `docs/design-decisions/` |

**Qué evalúa la crítica de Fable** (estándares de la industria, no gusto personal):

1. **Uso real en cancha:** una mano, con guante, sol directo, apuro entre hoyos. Touch
   targets según `DESIGN.md` (≥44px, no se negocia), acción principal al alcance del pulgar, texto legible sin zoom,
   nada que dependa de hover.
2. **Heurísticas de usabilidad de Nielsen** (las 10 reglas estándar de UX): el usuario
   siempre sabe qué está pasando, puede deshacer, no tiene que recordar cosas entre
   pantallas, los errores se previenen antes de explicarse.
3. **Accesibilidad WCAG 2.2 AA:** contraste medido (con alpha compositado), foco visible,
   etiquetas en campos, no transmitir información solo con color.
4. **Leyes de UX:** pocas opciones por pantalla (Hick), objetivos grandes y cerca (Fitts),
   patrones que el usuario ya conoce de otras apps (Jakob), una acción principal clara.
5. **Estados completos:** cargando, vacío, error, sin conexión, datos largos (nombres de
   30 letras, 4 jugadores, 27 hoyos). La pantalla linda solo con datos perfectos no pasa.
6. **Consistencia con `DESIGN.md`** y los componentes existentes. Premium y minimalista,
   sin "AI slop" (gradientes genéricos, emojis, tarjetas iguales en fila).
7. **Benchmark:** a la altura de The Grint, V-Par y Garmin Golf en la misma tarea.

La crítica devuelve veredicto **APROBADO / CAMBIOS** con hallazgos concretos y screenshot.
Con CAMBIOS no se mergea hasta corregir y volver a pasar.

### Qué NO cubre esta sección

El modelo que usa **la app en producción** (coach tAIger+, import por foto, triage del
inbox) se decide en su propio código y presupuesto (`ai_usage`, gate beta del coach). Esta
tabla es solo para el trabajo de desarrollo de Claude Code. Cambiar el modelo de la app es
una decisión aparte con eval (ver `reference_plataforma_model_agnostic`).

### Mantenimiento

Cuando salga un modelo nuevo, Claude actualiza esta tabla y los `model:` de
`.claude/agents/*.md` en la misma sesión en que lo detecta (vigilancia tecnológica CTO),
sin esperar a que Juanjo lo pida.
