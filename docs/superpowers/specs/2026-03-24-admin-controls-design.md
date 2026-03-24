# Admin Controls — Funciones de Edicion y Control

## Spec v1.0 — 2026-03-24

---

## 1. Vision

El admin de Golfers+ necesita poder intervenir en cualquier dato del sistema para resolver emergencias en produccion. Actualmente es read-only. Este spec agrega capacidades CRUD completas con audit trail, confirmacion para acciones destructivas, y drawers de detalle/edicion.

---

## 2. Componentes Compartidos Nuevos

### AdminDrawer
- Panel lateral deslizante (400px desktop, fullscreen mobile)
- Header con titulo + boton cerrar
- Body scrollable
- Footer con botones de accion
- Backdrop oscuro clickeable para cerrar

### AdminConfirmModal
- Modal centrado para confirmar acciones destructivas
- Texto de advertencia + input de confirmacion (escribir "ELIMINAR")
- Botones: Cancelar (gris) + Confirmar (rojo)

### AdminInlineEdit
- Campo editable inline (click para editar, Enter para guardar, Esc para cancelar)
- Indicador de estado: guardando, exito, error

---

## 3. Funciones por Entidad

### 3.1 Usuarios
**Donde:** Golf Ops > tab Usuarios > click en fila abre drawer

**Drawer de detalle:**
- Avatar + nombre + email
- Campos editables: nombre, email, HCP index, role (dropdown)
- Actividad: total rondas, torneos, sesiones tAIger
- Fecha de registro
- Boton "Guardar cambios"

**API:** `PATCH /api/admin/users/[id]/route.ts`
- Body: `{ name?, email?, indice?, role? }`
- Valida que role sea 'player' | 'organizer' | 'admin'

### 3.2 Rondas Libres
**Donde:** Golf Ops > tab Rondas > tabla de rondas (NUEVA) > click abre drawer

La tab Rondas actualmente solo muestra KPIs. Se agrega una tabla con las ultimas rondas y acciones.

**Tabla de rondas libres:**
- Columnas: Codigo, Cancha, Jugadores, Estado, Fecha
- Estado con AdminBadge (en_curso = warning, finalizada = success)
- Click abre drawer de detalle

**Drawer de detalle:**
- Info: codigo, cancha, tees, hoyos, modo_juego, creador, fecha
- Lista de jugadores con scores por hoyo
- Cada score es editable inline (click -> input -> enter)
- Boton "Forzar cierre" (solo si en_curso)
- Boton "Eliminar ronda" (modal confirmacion)

**APIs:**
- `GET /api/admin/rondas-libres/[id]/route.ts` — Detalle completo con jugadores y scores
- `PATCH /api/admin/rondas-libres/[id]/route.ts` — Cambiar estado
- `PATCH /api/admin/rondas-libres/[id]/scores/route.ts` — Editar scores de un jugador
- `DELETE /api/admin/rondas-libres/[id]/route.ts` — Eliminar ronda + jugadores

### 3.3 Torneos
**Donde:** Golf Ops > tab Torneos > click en fila abre drawer

**Drawer de detalle:**
- Info editable: nombre, status, formato, hoyos
- Lista de jugadores inscritos
- Lista de rounds con totales
- Boton "Guardar cambios"
- Boton "Eliminar torneo" (modal confirmacion)

**APIs:**
- `GET /api/admin/tournaments/[id]/route.ts` — Detalle con players y rounds
- `PATCH /api/admin/tournaments/[id]/route.ts` — Editar campos
- `DELETE /api/admin/tournaments/[id]/route.ts` — Eliminar torneo + cascade

### 3.4 Scores (hole_scores)
**Donde:** Dentro del drawer de ronda libre o torneo, al ver detalle de un round

**Edicion de scores:**
- Tabla de 9 o 18 hoyos con columns: Hoyo, Par, Gross, Net, Pts
- Gross editable inline
- Al guardar: recalcula net y points automaticamente
- Guarda en score_audit_log

**API:** `PATCH /api/admin/hole-scores/route.ts`
- Body: `{ scores: [{ id, gross_score }] }`
- Recalcula net_score y points en el servidor
- Inserta en score_audit_log

### 3.5 tAIger Sessions
**Donde:** Golf Ops > tab tAIger > tabla de sesiones (NUEVA) > click abre drawer

**Tabla de sesiones recientes:**
- Columnas: Usuario, Tipo, Fecha, Mensajes

**Drawer de detalle:**
- Info: usuario, tipo, fecha, tecnicas asignadas
- Transcripcion completa (messages array renderizado como chat)
- Patrones del usuario asociados
- Boton "Eliminar sesion" (modal confirmacion)

**APIs:**
- `GET /api/admin/taiger-sessions/[id]/route.ts` — Detalle con messages y user info
- `DELETE /api/admin/taiger-sessions/[id]/route.ts` — Eliminar sesion

### 3.6 Acciones Globales (Sistema)
**Donde:** Sistema page > nueva seccion "Acciones Admin"

**Forzar cierre de rondas abandonadas:**
- Boton que cierra todas las rondas en_curso con >24h de antiguedad
- Muestra cuantas se cerraron

**SQL Console:**
- Textarea para escribir SQL
- Boton "Ejecutar" (usa exec_sql RPC)
- Resultado mostrado en tabla formateada o JSON
- Solo SELECT permitidos desde la UI (el RPC puede filtrar)

**APIs:**
- `POST /api/admin/actions/force-close/route.ts` — Cierra rondas abandonadas
- `POST /api/admin/actions/sql/route.ts` — Ejecuta SQL via exec_sql

---

## 4. Audit Trail

Toda accion de edicion/eliminacion se registra. Para scores usamos score_audit_log existente. Para otras acciones, loggeamos en analytics_events con event_type='admin_action' y metadata con detalles.

---

## 5. Seguridad

- Todos los endpoints PATCH/DELETE verifican isAdmin()
- Acciones destructivas requieren confirmacion en UI
- SQL console solo ejecuta via exec_sql RPC (limitado por permisos del RPC)
- Audit trail de todas las acciones
