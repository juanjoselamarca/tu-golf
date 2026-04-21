# AUDITORIA TECNICA DE VALIDACION

Fecha: 2026-03-17
Alcance: validacion ejecutable + analisis estatico sin modificar codigo
Proyecto: Tu Golf

## 1. Resumen ejecutivo

Estado real:
- El proyecto ya compila para produccion y tiene un flujo central de producto reconocible.
- No esta en estado de "demo rota", pero tampoco en un estado seguro para abrir usuarios reales sin una fase de endurecimiento.

Nivel de riesgo:
- Riesgo global: ALTO
- Riesgo mas delicado: integridad y autorizacion del scoring
- Riesgo mas claro de seguridad web: redireccion abierta plausible en callback de auth
- Riesgo mas claro de datos: consultas de historial/contexto que parecen devolver datos globales o mal segmentados

Juicio operativo:
- No recomendaria abrir la app a usuarios reales de forma amplia en el estado actual.
- Si se abre hoy, el principal problema no seria solo "bugs"; seria perdida de confianza en score, privacidad de datos y consistencia del sistema.

Debilidades principales:
- drift entre schema versionado y comportamiento real de la app
- endpoint de scoring con privilegios altos y sin auditoria visible
- validaciones y automatizacion minimas incompletas
- errores internos filtrados al usuario
- capa de insights montada sobre consultas potencialmente mal filtradas

## 2. Validaciones ejecutadas

| Comando | Resultado | Estado | Evidencia |
|---|---|---|---|
| `npm.cmd run` | Listo scripts disponibles: `dev`, `build`, `lint`; no existe `test` | OK | El comando enumero solo esos scripts |
| `npm.cmd run lint` | No corrio lint real; abrio el wizard interactivo de Next.js | FALLA | Salida: `How would you like to configure ESLint?` |
| `.\\node_modules\\.bin\\tsc.cmd --noEmit` antes del build | Falla por referencias faltantes en `.next/types/**/*.ts` | FALLA | `TS6053 File ... .next/types/... not found` |
| `npm.cmd run build` dentro del sandbox | Fallo por `spawn EPERM` | BLOQUEADO POR ENTORNO | Error exacto: `Error: spawn EPERM` |
| `npm.cmd run build` fuera del sandbox | Build completo exitoso | OK | Compilo, genero paginas y mostro tabla final de rutas |
| `.\\node_modules\\.bin\\tsc.cmd --noEmit` despues del build | Typecheck exitoso, sin salida de error | OK | Exit code 0 |
| `npm.cmd test` | No existe script de test | FALLA / NO CONFIGURADO | `npm error Missing script: "test"` |
| `git grep -n "describe\\|it\\|test\\|vitest\\|jest\\|playwright\\|cypress"` | No encontre suite real de tests del proyecto; solo referencia en `package-lock.json` | OK | Salida sin archivos de tests ejecutables del repo |
| Lectura directa de rutas API, middleware, auth, scoring, migracion SQL, docs y paginas criticas | Revision estatico-funcional completada | OK | Archivos inspeccionados manualmente durante auditoria |

## 3. Vulnerabilidades CRITICAS

### 3.1 Open redirect plausible en callback de autenticacion

- Severidad: CRITICO
- Clasificacion: B. INFERIDO POR ANALISIS ESTATICO

Evidencia:
- `src/app/auth/callback/route.ts` toma `next` desde querystring y redirige con:
  - `NextResponse.redirect(\`${baseUrl}${next}\`)`
- No hay validacion visible que limite `next` a rutas internas seguras.

Como se explotaria:
- Un atacante podria intentar enviar a un usuario un enlace de login/OAuth con un parametro `next` manipulado.
- Si la composicion final acepta patrones como `//host`, rutas absolutas o valores codificados ambiguos, el usuario autenticado podria terminar redirigido a un destino no deseado tras el login.

Que lo permite:
- concatenacion directa de `next`
- ausencia visible de sanitizacion o allowlist

Que falta para cerrarlo al 100%:
- validacion manual del flujo real con navegador/entorno OAuth activo

### 3.2 Endpoint de scoring con privilegios altos y sin auditoria visible

- Severidad: CRITICO
- Clasificacion: B. INFERIDO POR ANALISIS ESTATICO

Evidencia:
- `src/app/api/game/route.ts` crea cliente con `SUPABASE_SERVICE_ROLE_KEY`
- usa ese cliente para hacer `upsert` en `hole_scores` y `update` en `rounds`
- existe tabla `score_audit_log` en la migracion base, pero el flujo no inserta registros ahi

Como se explotaria o materializaria:
- Si existe cualquier bug en las comprobaciones previas o si el payload llega en un estado no previsto, el endpoint tiene permisos suficientes para alterar scoring oficial aunque RLS del cliente no lo permitiera.
- Incluso sin explotacion externa directa, cualquier error logico en ese endpoint impacta datos criticos con privilegios altos.

Que lo permite:
- service role en una superficie de negocio critica
- ausencia de rastro de cambios visible en el mismo flujo

Que falta para confirmarlo dinamicamente:
- validacion manual con usuarios/roles reales y Supabase real

### 3.3 Riesgo de leakage de datos por consultas historicas mal filtradas

- Severidad: CRITICO
- Clasificacion: B. INFERIDO POR ANALISIS ESTATICO

Evidencia:
- `src/app/api/taiger/context/route.ts` consulta `historical_rounds` sin filtro visible por `user.id`
- `src/app/api/gwi/torneo/[slug]/route.ts` calcula historial desde `historical_rounds` sin filtro por jugador
- en esa misma ruta busca patrones con `user_id = p.id`, donde `p.id` corresponde a `players.id`, no a `profiles.id`

Como se explotaria o materializaria:
- un usuario podria recibir contexto, benchmarks o insights construidos con datos ajenos o globales
- aunque la respuesta no exponga todas las filas crudas, la analitica resultante podria incorporar informacion de otros usuarios

Que lo permite:
- consultas sin segmentacion visible
- mezcla de entidades incompatibles

Que falta para confirmarlo dinamicamente:
- validar respuestas reales de esas APIs con datos poblados y distintos usuarios

## 4. Hallazgos importantes

### A. Validados por ejecucion

#### 4.1 Baseline de calidad incompleto

- Severidad: ALTO
- Clasificacion: A. VALIDADO POR EJECUCION

Evidencia:
- `lint` no funciona como check automatizado hoy
- `test` no existe
- `typecheck` solo paso despues de reconstruir `.next/types` mediante build

Impacto real:
- cualquier pipeline o colaborador nuevo puede obtener resultados inconsistentes
- el repo no ofrece una validacion minima limpia y repetible desde el primer comando

#### 4.2 Build de produccion si compila

- Severidad: MEDIO
- Clasificacion: A. VALIDADO POR EJECUCION

Evidencia:
- `npm run build` fuera del sandbox compilo correctamente y genero 37 paginas/rutas

Lectura correcta:
- esto baja el riesgo de "app incompleta"
- no reduce por si solo riesgos de seguridad o datos

### B. Inferidos por analisis estatico

#### 4.3 Desalineacion entre schema versionado y app actual

- Severidad: ALTO
- Clasificacion: B. INFERIDO POR ANALISIS ESTATICO

Evidencia:
- migracion base define `profiles.handicap`, pero la app usa `profiles.indice`
- migracion base permite `rounds.status IN ('in_progress','closed','official')`
- la app escribe y lee `completed` en scoring y vistas
- `docs/SQL_PENDIENTE.md` declara columnas/tablas adicionales fuera de la migracion base

Impacto:
- estados invalidos
- drift entre entornos
- debugging y despliegue frágiles

#### 4.4 Errores internos expuestos al usuario final

- Severidad: ALTO
- Clasificacion: B. INFERIDO POR ANALISIS ESTATICO

Evidencia:
- mensajes como "ejecuta el archivo EJECUTAR_EN_SUPABASE.sql"
- `src/utils/supabase/errors.ts` devuelve mensajes de configuracion interna

Impacto:
- filtra detalles internos
- degrada confianza del usuario

#### 4.5 Admin hardcodeado por email

- Severidad: ALTO
- Clasificacion: B. INFERIDO POR ANALISIS ESTATICO

Evidencia:
- `src/lib/admin.ts` mantiene `ADMIN_EMAILS`
- APIs y layout admin dependen de `isAdmin(user?.email)`

Impacto:
- mala trazabilidad operativa
- control de acceso poco robusto

#### 4.6 Ronda libre depende de cliente y `localStorage` para datos criticos

- Severidad: ALTO
- Clasificacion: B. INFERIDO POR ANALISIS ESTATICO

Evidencia:
- `src/app/ronda-libre/[codigo]/score/page.tsx` guarda scores en `localStorage`
- actualiza `ronda_libre_jugadores.scores` directamente desde cliente

Impacto:
- conflicto entre dispositivos
- ultima escritura gana
- facil manipulacion del estado desde frontend

#### 4.7 Validacion de inputs desigual o insuficiente en superficies sensibles

- Severidad: MEDIO
- Clasificacion: B. INFERIDO POR ANALISIS ESTATICO

Evidencia:
- hay validacion UI en varios formularios
- pero no se observa esquema fuerte y centralizado de validacion server-side en rutas criticas
- `/api/game` consume `request.json()` y deriva comportamiento por `action` sin capa de schema visible

Impacto:
- mayor riesgo de estados invalidos y bugs de negocio

#### 4.8 Seguridad de headers no reforzada visiblemente

- Severidad: MEDIO
- Clasificacion: B. INFERIDO POR ANALISIS ESTATICO

Evidencia:
- `next.config.js` no muestra configuracion de headers de seguridad
- no vi CSP, frame protections u otros headers app-level visibles

Impacto:
- endurecimiento web incompleto

## 5. Riesgos de datos y privacidad

### 5.1 Falta de documentos y flujos basicos de privacidad visibles

- Severidad: ALTO
- Clasificacion: B. INFERIDO POR ANALISIS ESTATICO

Evidencia:
- no vi paginas de terminos, privacidad, consentimiento o borrado de cuenta en el repo
- la app trata email, nombre, handicap, historial de rondas, analytics y sesiones/patrones de coaching

Impacto:
- baja confianza del usuario
- mayor exposicion regulatoria/reputacional al abrir usuarios reales

### 5.2 Posible cruce de datos entre usuarios en capa de insights

- Severidad: CRITICO
- Clasificacion: B. INFERIDO POR ANALISIS ESTATICO

Evidencia:
- consultas globales o mal segmentadas en `taiger/context` y `gwi/torneo/[slug]`

Impacto:
- leakage analitico
- insights errados

## 6. Puntos que requieren validacion manual

- Estado real del schema aplicado hoy en Supabase productivo
- Politicas RLS reales de:
  - `rondas_libres`
  - `ronda_libre_jugadores`
  - `historical_rounds`
  - `player_patterns`
  - `taiger_sessions`
  - `analytics_events`
  - `courses`
  - `course_holes`
- Explotabilidad real del open redirect con OAuth y navegacion completa
- Validacion real de autorizacion cruzada entre usuarios en scoring
- Si existen mitigaciones en infraestructura fuera del repo:
  - headers de seguridad
  - rate limiting
  - observabilidad
  - controles de edge/proxy

## 7. Backlog para implementacion (Claude)

### CRITICO

1. Endurecer callback de auth
- Que hacer: restringir `next` a rutas internas seguras y rechazar patrones ambiguos
- Por que importa: reduce riesgo de redireccion maliciosa post-login
- Riesgo que mitiga: open redirect

2. Revisar y blindar `/api/game`
- Que hacer: reforzar autorizacion, validar transiciones de estado, acotar payload y registrar cambios sensibles
- Por que importa: es la superficie central del scoring
- Riesgo que mitiga: alteracion de scores, perdida de trazabilidad

3. Corregir segmentacion de datos en GWI/tAIger
- Que hacer: filtrar historial y patrones por entidad correcta, revisar joins e IDs
- Por que importa: evita leakage y analitica incorrecta
- Riesgo que mitiga: exposicion indirecta de datos ajenos

### ALTO

4. Alinear schema real vs codigo actual
- Que hacer: cerrar drift entre migraciones, columnas y estados usados por la app
- Por que importa: hoy la consistencia del dominio es fragil
- Riesgo que mitiga: errores de datos, deploys inconsistentes, estados invalidos

5. Dejar baseline de calidad automatizada funcional
- Que hacer: lint no interactivo, typecheck limpio, build reproducible y tests minimos en flujos criticos
- Por que importa: hoy la validacion local es inconsistente
- Riesgo que mitiga: regresiones silenciosas

6. Sustituir admin hardcodeado por autorizacion robusta
- Que hacer: mover permisos admin a un mecanismo mas mantenible y auditable
- Por que importa: el acceso por email fijo no escala ni se gobierna bien
- Riesgo que mitiga: acceso operativo debil

7. Ocultar errores internos al usuario
- Que hacer: traducir mensajes tecnicos a mensajes de producto
- Por que importa: hoy se filtra detalle operativo innecesario
- Riesgo que mitiga: leakage interno y perdida de confianza

### MEDIO

8. Reducir logica critica en frontend para ronda libre
- Que hacer: mover decisiones sensibles del scoring compartido hacia servidor o endurecer el modelo actual
- Por que importa: hoy `localStorage` y cliente controlan demasiado
- Riesgo que mitiga: manipulacion y conflictos de sincronizacion

9. Reforzar headers y hardening web
- Que hacer: revisar y definir headers de seguridad adecuados para Next/Vercel
- Por que importa: endurecimiento defensivo incompleto
- Riesgo que mitiga: superficie web innecesariamente abierta

10. Mejorar observabilidad
- Que hacer: sustituir dependencia excesiva de `console.*` por una base de logging/errores mas operable
- Por que importa: incidentes seran dificiles de diagnosticar
- Riesgo que mitiga: fallas silenciosas

## 8. Prompt final para Claude

```md
Trabaja sobre este repo como Staff Engineer + Security Engineer con foco en seguridad, scoring e integridad de datos.

## Contexto

Proyecto: Tu Golf

Stack:
- Next.js 14
- TypeScript
- Tailwind
- Supabase

Producto:
App mobile-first para torneos y rondas de golf con scoring, leaderboard, historial e insights.

## Evidencia confirmada

1. `npm run lint` hoy no sirve como validacion automatizada: abre el wizard interactivo de Next.js.
2. `npm run build` si compila correctamente en entorno no restringido.
3. `tsc --noEmit` falla antes del build por `.next/types` faltantes y pasa despues del build.
4. No existe script `test`.
5. Hay drift visible entre schema versionado y codigo actual.
6. `/api/game` usa service role para operaciones criticas de scoring.
7. `auth/callback` construye redireccion usando `next` sin saneamiento visible.
8. Hay consultas en GWI/tAIger que parecen mal filtradas o mal relacionadas.
9. El producto expone mensajes internos de configuracion al usuario.
10. Ronda libre guarda datos criticos en cliente y `localStorage`.

## Riesgos probables aun no confirmados dinamicamente

- open redirect explotable en flujo real de OAuth
- leakage real de datos entre usuarios segun estado real de la base
- RLS incompleta o fuera del repo en tablas auxiliares
- fallos reales de autorizacion cruzada en scoring

## Objetivo

Endurecer el producto sin hacer trabajo cosmetico. Prioriza:
1. auth segura
2. scoring confiable
3. datos bien segmentados
4. consistencia de dominio
5. baseline de validacion automatizada

## Orden de ejecucion

### CRITICO

1. Corregir callback de auth
- Permite solo rutas internas seguras
- Cierra cualquier open redirect

2. Blindar `/api/game`
- Refuerza autorizacion
- Valida payload
- Valida estados permitidos
- Integra trazabilidad de cambios si el modelo lo permite

3. Corregir segmentacion de datos
- Revisa GWI/tAIger/contexto/historial
- Usa IDs correctos
- Filtra por usuario o entidad correcta

### ALTO

4. Alinear schema y dominio
- Corrige nombres/estados inconsistentes
- Deja una sola fuente de verdad por concepto

5. Dejar validacion automatizada minima operativa
- lint no interactivo
- typecheck estable
- build reproducible
- agrega tests minimos si el contexto ya lo permite

6. Reemplazar admin hardcodeado
- Lleva permisos a un modelo mas robusto

7. Mejorar mensajes de error
- No exponer instrucciones internas o detalles de infraestructura

### MEDIO

8. Reducir dependencia del cliente para scoring compartido
9. Reforzar headers/hardening
10. Mejorar observabilidad

## Reglas

- No hagas refactors masivos sin impacto real
- No rediseñes UI salvo que corrija un problema real
- No agregues features nuevas
- No exageres riesgos no confirmados
- Si algo depende de Supabase real y no puedes validarlo localmente, dejalo marcado como validacion manual pendiente
- Prioriza mobile en cualquier cambio de UX

## Validacion al final

Quiero que ejecutes y reportes:
- lint
- typecheck
- build
- tests existentes o agregados
- verificaciones del callback de auth
- verificaciones del flujo de scoring/autorizacion

Y que cierres con:
1. que quedo corregido
2. que sigue siendo riesgo probable
3. que requiere validacion manual en la base real
```
