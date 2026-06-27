# 🔬 AUDITORÍA FORENSE DEL COACH tAIger+ — v2 (reescrita)

> **Tipo:** Solo diagnóstico y clasificación. CERO correcciones de código en este sprint.
> **Prioridad:** 🔴 ABSOLUTA. El coach es el disparador de conversión y dio un resultado inutilizable. El paywall no se activa hasta que tAIger+ sea confiable.
> **Salida del sprint:** un mapa de causas raíz que permita un sprint de fix DEFINITIVO (arquitectónico, sin parches). Este doc NO arregla; habilita el arreglo correcto.

## REGLA DE ORO
CERO cambios en `/src`. Única escritura permitida: el doc de auditoría + scripts temporales de SOLO LECTURA (se borran al cerrar). Si pica un fix de una línea: se anota como fix propuesto, no se aplica.

## DISONANCIA DE ALCANCE (explícita)
Un audit no "soluciona". Soluciona el sprint de fix que sale de acá. Por eso la sección de remediación clasifica cada fix como **ARQUITECTÓNICO (definitivo)** vs **PARCHE (rechazado salvo justificación)** — ahí se contesta la pregunta "¿sin parches?".

---

## EVIDENCIA YA RECUPERADA (no re-derivar a ciegas)
- Conversación cruda: `docs/_conversacion_coach_raw.md` (sesión `7722ac8b`, 20 turnos, continuous).
- 5 síntomas ya observados (sembrados como HIPÓTESIS a confirmar/refutar/expandir, no como verdad):
  1. **Truncación**: respuesta cortada a media frase (turnos 1 y 5).
  2. **Continuación alucinada**: al "retomar", inventó H6/mantra/rutina de memoria (turno 1→3, confesado en turno 3).
  3. **Mensaje robótico "sobre par"**: el guard reemplazó la respuesta entera por un canned ante una pregunta que NO pedía score (turno 13). Hipótesis confirmada a nivel línea: `src/golf/coach/chat-engine.ts` `enforceFinalText` + `src/golf/coach/number-guard.ts`.
  4. **No accede al detalle hoyo-por-hoyo**: dice tener 10 rondas como totales sin desglose (turno 7).
  5. **Pares por hoyo / Damas vs Varones**: no recupera par+SI fiable de la cancha Este; termina diciendo que el sistema le devuelve la versión Damas con pares que "no coinciden" (turnos 17-19). OJO: misma cancha física ⇒ los pares DEBEN ser idénticos entre géneros; solo cambian CR/slope. Si el coach cree que difieren ⇒ catálogo duplicado/sucio.

Cold-start con ojos frescos sobre el CÓDIGO sigue siendo obligatorio: la siembra orienta, no exime de leer el pipeline real.

---

## ARQUITECTURA REAL v3 (mapa corregido — confirmar con grep, NO asumir v2)
El coach hoy es **agéntico v3**, no el `buildContextString → messages.create` de v2. Piezas reales:
- `src/app/api/taiger/chat/route.ts` → entrada HTTP, auth, streaming.
- `src/golf/coach/chat-engine.ts` → **loop agéntico** (`MAX_TOOL_ITERS`, `handleToolUse`), system prompt, `coachModel()`, `max_tokens`, guard final (`enforceFinalText`), retry `regenerateRelativeOnly`, validador anti-alucinación (`validateResponse`).
- `src/golf/coach/context.ts` → ensamblado de contexto del jugador.
- `src/golf/coach/number-guard.ts` → guard de procedencia de números (post-proceso determinista).
- `src/golf/coach/v3/tools/handle-tool-use.ts` + `src/golf/coach/tools.ts` → tools (incl. `compute_score_projection`, recuperación de scorecard/rondas).
- `src/golf/coach/v3/` → prompts, retrieval/RAG, resilience/fallback, priors.
- `src/lib/data/taiger.ts` → persistencia `taiger_sessions`.
- `src/app/coach/sesion/[id]/` → rendering, streaming SSE, guardado.
Producir diagrama de flujo en texto: mensaje → contexto → loop de tools (iter por iter) → guard/post-proceso → stream → render → persistencia.

---

## TAXONOMÍA DE CAPAS (8 capas — A–H)
Recorrer TODAS. Para cada síntoma, ubicar capa(s) de origen.

- **A · DATOS / CONTEXTO** — `context.ts` ensambla incompleto/vacío/desordenado; el coach no recibe rondas/CPI/GWI/patrones; desincronización con el perfil real.
- **B · SYSTEM PROMPT** — no respeta framework científico (Rotella/VISION54/ACSI-28/SMTQ/Broadie SG); consejos genéricos sin QUÉ/POR QUÉ/CÓMO medir; idioma; marca/terminología (índice≠handicap, tAIger+, CPI≠GWI); tono no premium.
- **C · RENDERING / UX** — streaming roto/cortado/duplicado; markdown crudo; spinner infinito; error de API no manejado.
- **D · PERSISTENCIA / SESIÓN** — ¿se reenvía el historial COMPLETO en cada turno o el coach es stateless y pierde el hilo? ¿se guarda/recupera bien `taiger_sessions`?
- **E · MODELO / API** — `max_tokens` corto (⇒ corte a media frase, hipótesis 1); modelo correcto; sin créditos ⇒ falla silenciosa; `try/catch` real alrededor de `messages.create`.
- **F · SEGURIDAD / PRIVACIDAD** — *(VERIFICAR SIN ASUMIR; esta conversación NO mostró leakage)*. Confirmar que las queries de rondas/patrones filtran `user_id`. No inflar: marcar "sin evidencia en este incidente" si aplica.
- **G · GUARDAS / POST-PROCESO DETERMINISTA** *(NUEVA)* — `number-guard`, `enforceFinalText`, `regenerateRelativeOnly`, validador anti-alucinación. ¿Bloquean/reescriben salidas legítimas? ¿El fallback canned aparece en contextos que no piden score? Aquí vive la hipótesis 3. Distinguir: ¿el guard tiene un BUG, o se comporta SEGÚN DISEÑO pero el diseño es demasiado amplio? (cruzar con spec, ver abajo).
- **H · LOOP AGÉNTICO DE TOOLS** *(NUEVA)* — recorrer el tool-loop iteración por iteración: ¿qué tools se llaman, con qué args, qué devuelven? Tools que devuelven vacío/incorrecto/género equivocado (hipótesis 4 y 5). ¿El coach maneja tool-results vacíos o alucina sobre ellos? ¿`MAX_TOOL_ITERS` corta una investigación a medias?

---

## CRUCE FORENSE (corazón) — conversación ↔ código ↔ data ↔ SPEC
Recorrer la conversación turno por turno. Para cada respuesta que falló:
1. **Qué dijo mal** (cita textual + nº de turno).
2. **Qué decía el contexto/tool real** (comparar contra `context.ts`, los tool-results, y la data real en Supabase). ¿Tenía la info y la ignoró (B/G) o nunca la recibió (A/H)?
3. **Qué decía el system prompt** que debía pasar. ¿Viola instrucción explícita o el prompt nunca cubrió el caso?
4. **Qué decía el DISEÑO** *(nuevo)*. Cruzar contra specs existentes — p.ej. `docs/superpowers/specs/2026-06-03-coach-aritmetica-hard-guarantee-design.md` (guard "sobre par"), spec maestro cerebro v3. Distinguir **bug** (código viola diseño) de **hallazgo de diseño** (código cumple un diseño que está mal/es demasiado amplio).
5. **Causa raíz** con `archivo:línea`.
No conformarse con el primer culpable: un síntoma puede apilar 3 causas (A+B+E). Documentar las tres.

---

## CLASIFICACIÓN POR GRAVEDAD
| Nivel | Criterio |
|-------|----------|
| 🔴 CRÍTICO | Coach inutilizable/engañoso: alucina datos, leakage, respuesta cortada/vacía, falla silenciosa, pierde el hilo, guard que rompe respuestas legítimas. |
| 🟠 ALTO | Degrada el valor: genérico sin datos, ignora framework, no persiste/reenvía historial, tools que devuelven mal y el coach no lo maneja. |
| 🟡 MEDIO | Daña lo premium: terminología (handicap/CPI/GWI), markdown roto, tono flojo, idioma. |
| 🟢 MENOR | Pulido: latencia, microcopy. |

Ficha por hallazgo:
```
### [🔴/🟠/🟡/🟢] H-NN — Título
- Capa(s): A/B/C/D/E/F/G/H
- Síntoma (evidencia): "cita textual turno N"
- Qué debió pasar: ...
- ¿Bug o diseño?: bug | diseño-demasiado-amplio | data-sucia
- Causa raíz: archivo:línea (o system prompt / contexto vacío / tool X / spec Y)
- Impacto en el usuario: ...
- Fix propuesto: descripción concreta + clasificado ARQUITECTÓNICO vs PARCHE (NO implementado)
- Esfuerzo: S/M/L · Bloquea paywall: sí/no
```

---

## OUTPUT — `docs/AUDITORIA_COACH_2026-06-27.md`
1. **Resumen ejecutivo** (≤10 líneas): causa dominante del desastre; conteo por gravedad.
2. **Tabla priorizada** por gravedad + bloquea-paywall.
3. **Fichas detalladas** agrupadas por capa A–H.
4. **Mapa del pipeline** (texto).
5. **Plan de remediación** para el sprint siguiente: orden de fixes, agrupando por archivo, marcando dependencias, y **cada uno etiquetado ARQUITECTÓNICO (definitivo) vs PARCHE**. Los parches se rechazan salvo justificación explícita de bloqueo. NO se ejecuta ahora.
6. **Anexo**: `docs/_conversacion_coach_raw.md` referenciado.

## REGLAS DE EJECUCIÓN
- Cero cambios en `/src`. Solo el `.md` + scripts temporales de lectura (borrar al final).
- Precisión > exhaustividad: un `archivo:línea` confirmado > diez sospechas.
- Si un dato depende de Supabase y no se valida localmente: marcar "validación manual pendiente" con la query exacta.
- Patrón sistémico (p.ej. "el contexto siempre llega vacío", "ningún tool-result vacío se maneja") ⇒ hallazgo raíz único, no N síntomas sueltos.
- Workaround hook claude-mem: si `Read` devuelve solo la línea 1 con aviso de "prior observations", leer el archivo con `Grep` (pattern `.`, output_mode content) o `sed -n` vía Bash.

## CIERRE
Commit del doc en `chore/coach-forense-claude`, push, **no merge a main**. El sprint de correcciones se diseña a partir de este documento.
