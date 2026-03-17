# Backlog Priorizado de Decision

Fecha: 2026-03-17
Origen: auditoria diagnostica del repositorio
Objetivo: convertir hallazgos en tareas concretas, priorizadas por impacto real

## Ahora

### 1. Reconciliar schema productivo vs repo

Prioridad: P0
Tipo: arquitectura / datos / confiabilidad
Evidencia:
- `profiles.handicap` en SQL inicial vs `profiles.indice` en app
- `rounds.status` SQL vs `completed` en app
- tablas y columnas usadas por app actual no estan representadas de forma coherente en migraciones

Definition of done:
- inventario de tablas/columnas/enums reales en Supabase productivo
- documento unico de schema vigente
- lista de incompatibilidades cerrada y priorizada
- decision explicita sobre naming final (`indice` vs `handicap`, `completed` vs `official/closed`, etc.)

Clasificacion: confirmado en codigo, requiere validacion manual del entorno productivo

### 2. Blindar `/api/game` como superficie critica

Prioridad: P0
Tipo: seguridad / integridad de negocio
Evidencia:
- service role activo en endpoint
- no se escribe audit log
- no hay enforcement claro por estado de ronda

Definition of done:
- mapa de permisos por actor: jugador, organizador, admin, sistema
- matriz de transiciones permitidas de `rounds.status`
- especificacion de audit trail por cambio de score
- lista de invariantes a validar por request

Clasificacion: confirmado en codigo

### 3. Corregir open redirect en callback OAuth

Prioridad: P1
Tipo: seguridad
Evidencia:
- `next` se concatena sin sanitizacion en `src/app/auth/callback/route.ts`

Definition of done:
- reglas de rutas permitidas para `next`
- casos de abuso documentados
- test manual de vectores basicos: URL absoluta, `//host`, encoded payloads, rutas vacias

Clasificacion: confirmado en codigo

### 4. Arreglar segmentacion de datos en GWI y TAIGER

Prioridad: P1
Tipo: producto / datos / IA
Evidencia:
- `taiger/context` no filtra `historical_rounds` por usuario
- `gwi/torneo/[slug]` consulta historial global y patrones con `player.id`

Definition of done:
- cada insight debe indicar de donde sale la data
- historial, patrones y contexto deben estar ligados al usuario correcto
- decision de producto sobre que hacer cuando no hay suficiente data confiable

Clasificacion: confirmado en codigo

## Siguiente

### 5. Definir modelo de confianza para ronda libre

Prioridad: P1
Tipo: producto / arquitectura
Problema:
- hoy mezcla guardado cliente, `localStorage`, respaldo parcial y score compartido

Preguntas a resolver:
- ronda libre es casual y editable sin garantias, o score compartido confiable
- quien puede editar a quien
- que significa "finalizar"
- como se resuelve conflicto entre dispositivos

Definition of done:
- decision de producto escrita
- reglas de ownership y consistencia por ronda
- politica offline/online definida

Clasificacion: confirmado en codigo

### 6. Reemplazar admin por email hardcodeado

Prioridad: P1
Tipo: seguridad operativa / escalabilidad

Definition of done:
- modelo de autorizacion admin fuera del codigo
- politica de alta/baja de accesos
- separacion entre rol funcional y acceso a datos sensibles

Clasificacion: confirmado en codigo

### 7. Instalar baseline de calidad automatizada

Prioridad: P1
Tipo: plataforma / DX
Evidencia:
- `npm run lint` dispara wizard interactivo
- no hay test scripts ni baseline CI-safe

Definition of done:
- lint no interactivo
- typecheck dedicado
- build smoke reproducible
- lista corta de casos criticos para testear: auth callback, scoring oficial, creacion de torneo/ronda

Clasificacion: confirmado en codigo

### 8. Esconder errores de infraestructura al usuario final

Prioridad: P2
Tipo: UX / confiabilidad
Evidencia:
- mensajes tipo "ejecuta SQL en Supabase" aparecen en flujos de producto

Definition of done:
- catalogo de errores de entorno interno vs errores de usuario
- mensajes finales sin jerga de infraestructura
- fallback o pantalla de mantenimiento para estados no configurados

Clasificacion: confirmado en codigo

## Despues

### 9. Instrumentar observabilidad real

Prioridad: P2
Tipo: operaciones

Definition of done:
- errores de auth, scoring y API capturados
- trazabilidad de acciones criticas
- panel minimo para incidentes y degradacion

Clasificacion: confirmado en codigo

### 10. Revisar RLS de tablas fuera de migracion inicial

Prioridad: P2
Tipo: seguridad / datos
Tablas a validar manualmente:
- `rondas_libres`
- `ronda_libre_jugadores`
- `historical_rounds`
- `player_patterns`
- `taiger_sessions`
- `analytics_events`
- `courses`
- `course_holes`

Definition of done:
- matriz tabla por tabla con `SELECT/INSERT/UPDATE/DELETE`
- identificacion de tablas publicas por necesidad vs por omision

Clasificacion: probable, requiere validacion manual

### 11. Revisar promesas de producto basadas en data incompleta

Prioridad: P2
Tipo: producto / UX

Casos:
- historial con par 4 asumido
- coaching "automatico"
- GWI con contexto historico posiblemente incorrecto

Definition of done:
- claim por claim: mantener, degradar, ocultar o respaldar
- copy honesto segun calidad real de datos

Clasificacion: confirmado en codigo

### 12. Consolidar primitives UI para reducir deuda

Prioridad: P3
Tipo: frontend / mantenibilidad

Definition of done:
- inventario de patrones repetidos
- top 10 primitives necesarias
- criterio de cuando usar componente vs estilos inline

Clasificacion: confirmado en codigo

## Riesgos de negocio si no se aborda

- scoring discutible frente a usuarios reales
- insights incorrectos que erosionan confianza
- mayor costo de cada sprint por schema incierto
- problemas de seguridad evitables en auth y admin
- dificultad para delegar operacion a terceros

## Recomendacion de enfoque para el otro agente

- no seguir agregando features sobre scoring/admin/insights hasta cerrar schema y permisos
- priorizar decisiones de dominio antes que mejoras cosmeticas
- tratar este backlog como trabajo de estabilizacion de producto, no como deuda "nice to have"
