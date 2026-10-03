# Respaldos de la base de producción

> Creado el 03-oct-2026 tras el incidente del 02-oct (base congelada 4 h). El proyecto está en el **plan
> FREE de Supabase: no tiene ningún backup ni PITR**. Este respaldo es lo único que permite volver atrás.

## Qué se respalda y dónde

- **Script:** `scripts/respaldo/respaldo-diario.mjs` (Management API; no necesita la clave de Postgres).
- **Qué:** todas las tablas de `public` + `auth.users`, `auth.identities`, `auth.mfa_factors`, como JSON
  comprimido, una carpeta por día con `_manifiesto.json` (fecha, filas por tabla, migraciones aplicadas).
  El esquema NO va en el respaldo: está en `supabase/migrations/`.
- **Dónde:** `%USERPROFILE%\OneDrive\GolfersPlus-Respaldos\AAAA-MM-DD\`. OneDrive lo sube a la nube (copia fuera de
  Supabase y fuera del PC). **Nunca dentro del repo: el repo es público** y el respaldo trae emails y hashes.
- **Verificación:** cada tabla se exporta con su `count(*)` en la misma consulta; si no calzan, error y exit 1.
- **Retención:** 30 días. **Carga:** pausa de 2 s entre tablas (la primera corrida sin pausa degradó la base free).

## Cuándo corre

Tarea de Windows `GolfersPlus-Respaldo-Diario`, todos los días a las **06:30** (después de los agentes nocturnos y
antes de que se juegue). Si el PC está apagado a esa hora, ese día no hay respaldo. Re-registrarla (PowerShell):

```powershell
$repo = "$env:USERPROFILE\OneDrive\Escritorio\Proyectos IA\tu-golf"
$a = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c node --env-file=.env.local scripts\respaldo\respaldo-diario.mjs >> "%USERPROFILE%\OneDrive\GolfersPlus-Respaldos\_log.txt" 2>&1' -WorkingDirectory $repo
$t = New-ScheduledTaskTrigger -Daily -At 06:30
$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName 'GolfersPlus-Respaldo-Diario' -Action $a -Trigger $t -Settings $s -Force
```

`-StartWhenAvailable`: si el PC estaba apagado a las 06:30, corre apenas se prenda.

## Restaurar

Probado el 03-oct: `json_populate_recordset` reconstruye las filas con sus tipos (480/480 en `course_tees`).

1. **Una tabla o filas puntuales** (lo más común: alguien borró algo). Descomprimir el `.json.gz` y, por la
   Management API (`scripts/run-sql.mjs`), insertar solo lo que falta:
   ```sql
   insert into public.<tabla>
   select * from json_populate_recordset(null::public.<tabla>, '<json>'::json)
   on conflict (id) do nothing;
   ```
2. **Base completa** (proyecto nuevo): aplicar `supabase/migrations/` en orden, luego `auth.users` →
   `auth.identities` → tablas de `public` respetando las llaves foráneas (padres antes que hijos), con
   `session_replication_role = replica` durante la carga para no disparar triggers.

Antes de restaurar en prod: `revisor-fable` revisa el SQL (zona crítica: escritura masiva de datos de usuarios).
