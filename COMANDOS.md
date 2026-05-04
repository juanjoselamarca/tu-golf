# Comandos — Golfers+

Hoja corta de los comandos que usamos día a día. Si pides cualquiera de estos, Claude lo ejecuta.

> **Para Juanjo:** estos son los únicos que necesitas recordar. El resto Claude los invoca solo cuando aplica.

---

## 1. Trabajo de cada día

| Comando | Cuándo usarlo |
|---------|---------------|
| `/health` | "¿Cómo está la app?" — diagnóstico completo de producción (BD, APIs, errores recientes). |
| `/pre-push` | Antes de cada push. Valida tipos, tests, build, seguridad, archivos protegidos. **Obligatorio.** |
| `/pre-torneo` | **Antes de un torneo real con jugadores.** Smoke test del flujo completo + verificación de prod. |

## 2. Cuando algo se rompe

| Comando | Cuándo usarlo |
|---------|---------------|
| "investigá este bug" | Claude usa el skill `investigate` — encuentra la causa raíz, no parchea el síntoma. |
| `/security-review` | Auditoría de seguridad. Cada sprint o cuando se toca algo sensible. |

## 3. Antes de pensar un feature nuevo grande

| Comando | Cuándo usarlo |
|---------|---------------|
| "hagamos brainstorm de X" | Claude usa `brainstorming` (superpowers) o `office-hours` (gstack) según tamaño. |
| "review el plan" | Claude usa `plan-eng-review` — segundo par de ojos antes de ejecutar. |

## 4. Después de shippear

| Comando | Cuándo usarlo |
|---------|---------------|
| "actualizá los docs" | Claude usa `document-release` — sincroniza README, CHANGELOG, ARQUITECTURA. |
| "retro" | Resumen semanal/mensual: qué shippeamos, qué aprendimos, qué falta. |

## 5. Modos especiales

| Comando | Cuándo usarlo |
|---------|---------------|
| `/local` | Trabajo desde el computador de Juanjo (default). |
| `/remoto` | Trabajo remoto (configura agente en cloud). |

---

## Lo que NO necesitas pedir

Estos los hace Claude solo, sin que tengas que decirlo:

- Verificar el repo correcto al iniciar sesión
- Correr `git pull` antes de cualquier tarea no trivial
- Ejecutar SQL/migraciones de Supabase
- Decidir orden técnico (cuándo commitear, qué refactorear primero, etc.)
- Tests, build, type-check antes de cualquier push

Si Claude te pregunta algo técnico operativo, recordale: **"sos CTO, decidí tú"**.

## Cuándo SÍ debe consultarte Claude

Solo en estos 3 casos:

1. **Decisiones de producto:** qué feature priorizar, qué muestra la UI, copy de cara al usuario.
2. **Operación irreversible:** borrar usuarios reales, drop de tabla con datos, force push a main.
3. **Acción que solo puedes hacer tú:** rotar secrets en dashboards externos, configurar billing.

---

## Skills sub-utilizadas

¿Quieres saber qué herramientas tenemos instaladas y no estamos usando? → ver [`docs/SKILLS_RECOMENDADAS.md`](docs/SKILLS_RECOMENDADAS.md).
