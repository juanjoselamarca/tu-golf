# USABILIDAD_TRACKING — Golfers+ (bitácora permanente)

> **Propósito:** Registro histórico de issues de usabilidad y funcionalidad detectados durante
> revisiones del producto. Se actualiza cada vez que se resuelve un issue o aparece uno nuevo.
> Pensado para durar años — cualquier persona del equipo puede retomarlo sin contexto previo.
>
> **Cómo agregar un issue nuevo:** insertar una fila en la tabla de la sección "Issues activos"
> y completar todos los campos. Al resolverlo, moverlo a "Historial de cambios".
>
> **Cómo verificar el estado real:** para cada issue, la columna "Evidencia" indica qué archivo
> o ruta revisar para confirmar que el fix sigue en pie.

---

## RESUMEN EJECUTIVO — Tanda de agosto 2026

Primera revisión formal de "funciones visibles que no funcionan o confunden al usuario".
Detectados 9 issues en total: 3 resueltos en PR #306 (13-14 ago 2026), 2 candidatos a
ocultar mientras se construye la solución real, y 4 mejoras menores para iterar con calma.

| Estado | Cantidad |
|--------|----------|
| ✅ Resuelto | 3 |
| 🔴 Pendiente — complejo | 2 |
| 🟡 Pendiente — menor | 4 |
| **Total tanda agosto 2026** | **9** |

---

## Issues activos

### 🔴 COMPLEJOS — requieren trabajo significativo antes de desplegar

---

#### USAB-04 · Importar rondas desde Garmin (end-to-end incierto)

| Campo | Detalle |
|-------|---------|
| **Descripción** | La página `/importar` existe y tiene un wizard paso a paso que incluye instrucciones para Garmin Connect. El endpoint `POST /api/import/garmin-zip` también existe. Sin embargo, el flujo no está validado E2E contra todos los formatos de export que genera Garmin hoy (el export de Garmin varía por versión de app y región). Un usuario que sigue los pasos puede llegar a un error sin explicación útil. |
| **Impacto en usuario** | Usuario hace el proceso completo (descarga el ZIP, lo sube) y recibe un error genérico o un resultado incorrecto. Experiencia frustrante que destruye confianza. |
| **Gravedad** | Alta — la funcionalidad está prometida en la interfaz pero no confiable |
| **Complejidad de arreglo** | Compleja — requiere pruebas contra múltiples exports reales de Garmin, manejo de formatos distintos, y mensajes de error específicos cuando algo no cuadra |
| **Estado** | 🔴 Pendiente |
| **Evidencia** | `src/app/importar/page.tsx`, `src/app/api/import/garmin-zip/route.ts`, `src/components/import/StepGarminInstructions.tsx` |
| **Recomendación técnica — cómo ocultar sin romper nada** | Agregar un banner de advertencia en `StepGarminInstructions.tsx` con texto tipo: "Esta función está en beta — algunos formatos de export pueden no ser reconocidos. Si encontrás un error, escribinos al bot de Telegram." El banner no rompe nada y pone expectativas correctas. Costo: 20 minutos. Alternativa más agresiva: ocultar la opción Garmin en `StepSelector.tsx` y redirigir a CSV o manual hasta que el flujo esté validado. |
| **Fecha detección** | 2026-08-13 |
| **PR asociado** | — |

---

#### USAB-05 · Plan "Pro" sin poder comprarse (solo visual)

| Campo | Detalle |
|-------|---------|
| **Descripción** | La landing page muestra tres planes: Free, Pro y (futuro) Club. El plan Pro tiene un botón/div que dice "Disponible muy pronto" pero no hay ningún flujo de compra, cobro, o siquiera captura de interés. El usuario que quiere pagar no puede. |
| **Impacto en usuario** | Usuario interesado en el plan Pro no tiene ningún camino claro. En el mejor caso se va decepcionado; en el peor, pierde confianza en el producto al ver una función incompleta. |
| **Gravedad** | Media — bloquea revenue pero no afecta a usuarios en el flujo principal (scorer/coach) |
| **Complejidad de arreglo** | Compleja — requiere decisión de producto (pricing, qué incluye Pro), pasarela de pago (Stripe u otro), lógica de entitlements en Supabase, y UI de gestión de plan |
| **Estado** | 🔴 Pendiente |
| **Evidencia** | `src/content/home.ts` (campo `comingSoon: 'Disponible muy pronto'`), `src/components/home/Plans.tsx` (línea 56), `src/components/home/marketing.css` (clase `.soon`) |
| **Recomendación técnica — cómo ocultar sin romper nada** | **Opción A (ya aplicada en PR #306):** mantener el div `.soon` con `cursor:default; opacity:0.75; user-select:none` — señal visual clara de que no es clickeable. Costo: ya hecho. **Opción B (más honesta):** reemplazar la card entera del plan Pro por un formulario de captura de email ("Notificame cuando esté listo") con un POST a una tabla `waitlist` en Supabase. Convierte el "coming soon" en un activo de marketing. Costo: 2-3 horas. Opción B es la recomendada para cuando haya fecha real de lanzamiento. |
| **Fecha detección** | 2026-08-13 |
| **PR asociado** | — (solo CSS fix en PR #306; el flujo real está pendiente) |

---

### 🟡 MENORES — para iterar con calma

---

#### USAB-06 · Demo sin preview visual antes del click

| Campo | Detalle |
|-------|---------|
| **Descripción** | La página `/demo` ofrece tres experiencias demo (espectador de torneo, organizador, coach) pero solo muestra un botón con texto. No hay screenshot, video ni thumbnail que muestre qué va a ver el usuario antes de hacer click. Requiere un "acto de fe". |
| **Impacto en usuario** | Visitante curioso no sabe si vale la pena explorar — la tasa de conversión de /demo a crear cuenta es probablemente baja. |
| **Gravedad** | Baja — no rompe nada, pero desperdicia el tráfico de visitantes |
| **Complejidad de arreglo** | Fácil — agregar thumbnails/screenshots estáticos en /demo no requiere lógica nueva |
| **Estado** | 🟡 Pendiente |
| **Fecha detección** | 2026-08-13 |
| **PR asociado** | — |

---

#### USAB-07 · Coach invisible para visitantes sin cuenta

| Campo | Detalle |
|-------|---------|
| **Descripción** | `/coach` redirige al login si el usuario no está autenticado. El coach tAIger+ es el feature más diferenciado del producto (ningún competidor lo tiene), pero un visitante curioso no puede verlo ni tocarlo sin crear cuenta primero. |
| **Impacto en usuario** | El argumento de venta más fuerte del producto es invisible para quien más lo necesita: el visitante evaluando si vale la pena registrarse. |
| **Gravedad** | Baja-Media — impacta adquisición, no a usuarios existentes |
| **Complejidad de arreglo** | Media — requiere crear una vista demo del coach sin datos reales, o redirigir al demo existente en `/demo` con un teaser del coach |
| **Estado** | 🟡 Pendiente |
| **Fecha detección** | 2026-08-13 |
| **PR asociado** | — |

---

#### USAB-08 · Onboarding vacío post-registro

| Campo | Detalle |
|-------|---------|
| **Descripción** | Después de registrarse (Google OAuth o email), el usuario aterriza en `/dashboard` con las tabs "Competencia" e "Identidad" vacías. No hay ninguna guía del tipo "¿Cuál es tu handicap? → ¿En qué club juegas? → Empieza tu primera ronda". El usuario nuevo no sabe por dónde empezar. |
| **Impacto en usuario** | Alta tasa de abandono post-registro. El usuario se registra con expectativa de usar la app y se encuentra con un dashboard en blanco sin ningún call-to-action claro. |
| **Gravedad** | Media — afecta directamente la retención de usuarios nuevos |
| **Complejidad de arreglo** | Media — requiere diseñar un flujo de onboarding de 2-3 pantallas (handicap inicial, club favorito, primera ronda) y guardarlo en el perfil |
| **Estado** | 🟡 Pendiente |
| **Fecha detección** | 2026-08-13 |
| **PR asociado** | — |

---

#### USAB-09 · Índice Golfers+ marcado como "estimated" genera desconfianza

| Campo | Detalle |
|-------|---------|
| **Descripción** | La página `/indices` explica el CPI™ y el Índice Golfers+ con ejemplos (Tiger Woods 96, Rory 34). Sin embargo, el label "estimated" aparece en el indicador propio y genera escepticismo: el usuario no entiende si el número es confiable o es una suposición del sistema. |
| **Impacto en usuario** | Usuario que llega a /indices para entender su rendimiento no confía en el número que ve. Reduce el valor percibido del producto. |
| **Gravedad** | Baja — no rompe funcionalidad, pero erosiona confianza |
| **Complejidad de arreglo** | Fácil — cambiar el label por una explicación más clara ("calculado con tus X rondas registradas") o reemplazar "estimated" por un tooltip que explique la metodología en lenguaje humano |
| **Estado** | 🟡 Pendiente |
| **Fecha detección** | 2026-08-13 |
| **PR asociado** | — |

---

## Issues resueltos (para referencia)

Los siguientes 3 issues de la tanda agosto 2026 fueron resueltos en PR #306.
Se documentan aquí para que quede registro de qué había y cómo se arregló.

---

#### USAB-01 · Botón "Organizar Torneo" — ruta verificada (no había 404)

| Campo | Detalle |
|-------|---------|
| **Descripción** | El botón "Organizar torneo" en el tab de Competencia del dashboard llevaba a `/organizador/nuevo`. Había sospecha de que esta ruta devolvía 404 o no existía. |
| **Diagnóstico real** | La ruta **sí existía** (`src/app/organizador/nuevo/page.tsx`). El botón apuntaba correctamente a `/organizador/nuevo` (`CompetenciaTab.tsx:282`). No había bug funcional — solo faltaba verificación documentada. |
| **Gravedad** | Alta (sospechada) → Ninguna (confirmada) |
| **Estado** | ✅ Verificado — no requería fix |
| **Evidencia post-PR** | `src/components/mi-golf/CompetenciaTab.tsx` línea 282: `href="/organizador/nuevo"` · `src/app/organizador/nuevo/page.tsx` existe |
| **Fecha resolución** | 2026-08-13 |
| **PR** | [#306](https://github.com/juanjoselamarca/tu-golf/pull/306) |

---

#### USAB-02 · Modal "Invitar co-administrador" no hacía nada al tocarlo

| Campo | Detalle |
|-------|---------|
| **Descripción** | En el editor de torneo, la sección de co-administradores tenía un modal placeholder que se abría pero no permitía buscar ni invitar a nadie. Al tocar el botón "Invitar", no pasaba nada. |
| **Gravedad** | Alta — funcionalidad prometida que no funciona en el flujo del organizador |
| **Complejidad de arreglo** | Media |
| **Fix aplicado** | `AdminsSection.tsx` reescrita: búsqueda en tiempo real vía `GET /api/profiles/search?q=`, llamada a `POST /api/torneos/draft/{id}/collaborators`, lista optimista de invitados, feedback de éxito/error. `TournamentDraftEditor.tsx` pasa `draftId` a `AdminsSection`. Segundo commit unificó la búsqueda con el hook canónico `useProfileSearch` (regla "un concepto, una fuente"). |
| **Estado** | ✅ Resuelto |
| **Evidencia post-PR** | `src/app/organizador/nuevo/sections/AdminsSection.tsx` (funcional, conectada al backend) |
| **Fecha resolución** | 2026-08-13 |
| **PR** | [#306](https://github.com/juanjoselamarca/tu-golf/pull/306) |

---

#### USAB-03 · Plan Pro: botón "Disponible muy pronto" parecía clickeable

| Campo | Detalle |
|-------|---------|
| **Descripción** | El div que muestra "Disponible muy pronto" en la card del plan Pro no tenía ninguna señal visual de que no era interactivo — mismo cursor, sin opacidad reducida. Un usuario podía tocarlo repetidamente esperando alguna respuesta. |
| **Gravedad** | Baja — cosmética, pero confunde |
| **Complejidad de arreglo** | Fácil (CSS) |
| **Fix aplicado** | `marketing.css`: agregado `cursor:default; opacity:0.75; user-select:none` a la clase `.soon`. El div ahora se ve claramente como contenido informativo, no como botón. |
| **Estado** | ✅ Resuelto (señal visual) · 🔴 Pendiente (flujo de compra real — ver USAB-05) |
| **Evidencia post-PR** | `src/components/home/marketing.css` línea 263 |
| **Fecha resolución** | 2026-08-13 |
| **PR** | [#306](https://github.com/juanjoselamarca/tu-golf/pull/306) |

---

## Historial de cambios

> Una fila por cada acción concreta. Agregar fila al resolver un issue, al abrir un PR,
> o al cambiar el estado de un issue existente.

| Fecha | Acción | Issue(s) | Verificado por | PR |
|-------|--------|----------|---------------|----|
| 2026-08-13 | Verificación de ruta `/organizador/nuevo` — confirmado que existe, no hay 404 | USAB-01 | Claude (CTO) — `git show faa2a55a --stat` | [#306](https://github.com/juanjoselamarca/tu-golf/pull/306) |
| 2026-08-13 | Fix: `AdminsSection` conectada al backend (búsqueda + invitación real) | USAB-02 | Claude (CTO) — commit `faa2a55a`, +207 líneas en AdminsSection.tsx | [#306](https://github.com/juanjoselamarca/tu-golf/pull/306) |
| 2026-08-13 | Fix: CSS visual en `.soon` del plan Pro (`cursor:default`, `opacity:0.75`) | USAB-03 | Claude (CTO) — commit `faa2a55a`, `marketing.css` línea 263 | [#306](https://github.com/juanjoselamarca/tu-golf/pull/306) |
| 2026-08-14 | Code review PR #306: hook unificado (`useProfileSearch`) + `captureError` en catches | USAB-02 | Claude (code-reviewer) — commit `d29ed65b` | [#306](https://github.com/juanjoselamarca/tu-golf/pull/306) |
| 2026-08-14 | PR #306 mergeado a main | USAB-01, USAB-02, USAB-03 | Juanjo (merge) | [#306](https://github.com/juanjoselamarca/tu-golf/pull/306) |
| 2026-08-17 | Creación de este documento de seguimiento | — | Claude (CTO) | PR pendiente de aprobación |

---

## Cómo usar este documento en el futuro

### Al detectar un issue nuevo

1. Asignar el próximo ID disponible (USAB-10, USAB-11, ...).
2. Completar todos los campos de la tabla.
3. Agregar una fila en "Historial de cambios" con la fecha de detección.
4. Commit en una rama nueva y abrir PR.

### Al resolver un issue

1. Mover el issue de "Issues activos" a "Issues resueltos".
2. Actualizar el campo "Estado" a ✅ Resuelto.
3. Completar "Evidencia post-PR" con la ubicación exacta del fix en el código.
4. Agregar una fila en "Historial de cambios".

### Revisión periódica recomendada

- **Antes de cada torneo real:** revisar que todos los ✅ Resueltos siguen en pie (tsc + smoke test).
- **Al inicio de cada mes:** revisar si algún 🔴 Pendiente puede moverse a "en progreso".
- **Al cerrar una ola de features:** auditar si apareció algún USAB nuevo como efecto secundario.

---

*Documento creado: 2026-08-17 | Responsable: Claude (CTO) | PM: Juan José Lamarca*
