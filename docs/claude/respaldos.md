# Respaldos de la base de producción

> Creado el 03-oct-2026 tras el incidente del 02-oct (base congelada 4 h). El proyecto está en el **plan
> FREE de Supabase: no tiene ningún backup ni PITR**. Este respaldo es lo único que permite volver atrás.

## Qué se respalda y dónde

- **Script:** `scripts/respaldo/respaldo-diario.mjs` (Management API; no necesita la clave de Postgres).
- **Qué:** todas las tablas de `public` + `auth.users`, `auth.identities`, `auth.mfa_factors`, como JSON comprimido,
  una carpeta por día con `_manifiesto.json` (`completo`, filas y bytes por tabla, migraciones aplicadas). Sin los
  tokens de un solo uso de `auth.users` ni el secreto TOTP (no sirven para restaurar). El esquema NO va en el
  respaldo: está en `supabase/migrations/`.
- **Dónde:** `%USERPROFILE%\OneDrive\GolfersPlus-Respaldos\AAAA-MM-DD\`. OneDrive lo sube a la nube (copia fuera de
  Supabase y fuera del PC). **Nunca dentro del repo: el repo es público** y el respaldo trae emails y hashes; el
  script aborta si el destino está dentro de un repo git.
- **Verificación:** cada tabla se exporta con su `count(*)` en la misma consulta; si no calzan, error.
- **Si falla:** aviso por Telegram con el motivo; el manifiesto queda con `completo: false`.
- **Retención:** 30 días, y solo si el respaldo del día salió completo (nunca se borran respaldos buenos para dejar
  solo incompletos). Solo borra carpetas con `_manifiesto.json`.
- **Carga:** pausa de 2 s entre tablas (~4-5 min en total). La primera corrida sin pausa degradó la base free.

## Cuándo corre

Tarea de Windows `GolfersPlus-Respaldo-Diario`, todos los días a las **06:30** (después de los agentes nocturnos,
antes de que se juegue). `-StartWhenAvailable`: si el PC estaba apagado a esa hora, corre apenas se prende. La tarea
corre con la sesión de Juanjo iniciada; un reinicio sin login no respalda ese día. Registrarla (PowerShell):

```powershell
$repo = "$env:USERPROFILE\OneDrive\Escritorio\Proyectos IA\tu-golf"
$cmd = '/c if not exist "%USERPROFILE%\OneDrive\GolfersPlus-Respaldos" mkdir "%USERPROFILE%\OneDrive\GolfersPlus-Respaldos" & node --env-file=.env.local scripts\respaldo\respaldo-diario.mjs >> "%USERPROFILE%\OneDrive\GolfersPlus-Respaldos\_log.txt" 2>&1'
$a = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $cmd -WorkingDirectory $repo
$t = New-ScheduledTaskTrigger -Daily -At 06:30
$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName 'GolfersPlus-Respaldo-Diario' -Action $a -Trigger $t -Settings $s -Force
```

## Restaurar

`scripts/respaldo/restaurar.mjs` resuelve lo que el SQL ingenuo no: columnas generadas (`courses.nombre_canonico`,
`knowledge_chunks.tsv`, `auth.users.confirmed_at`…) se excluyen y Postgres las recalcula; columnas identity
(`pattern_observations.id`, `external_priors_*`) van con `OVERRIDING SYSTEM VALUE`; toma la llave primaria real.

1. **Probar primero (no escribe nada):** carga el respaldo en una tabla temporal con la misma estructura y cuenta.
   ```bash
   node --env-file=.env.local scripts/respaldo/restaurar.mjs --tabla public.courses [--fecha AAAA-MM-DD]
   ```
   Probado el 03-oct: courses 193/193, pattern_observations 588/588, profiles 88/88, auth.users 88/88,
   auth.identities 88/88, course_tees 480/480.
2. **Restaurar en prod** (zona crítica: escritura masiva de datos de usuarios). Revisar el SQL con
   `--mostrar-sql` y pasarlo por `revisor-fable`; después `--aplicar`.
   - `--modo faltantes` (default): inserta solo las filas cuyo id no existe (lo típico: "alguien borró algo").
   - `--modo actualizar`: además pisa las existentes con el dato del respaldo.
3. **Cuentas:** el usuario de la Management API no es superuser y no puede apagar triggers. Restaurar `auth.users`
   dispara `on_auth_user_created`, que crea un `profiles` vacío por cuenta. Orden: `auth.users` → `auth.identities`
   → `public.profiles` con **`--modo actualizar`** (pisa esos perfiles vacíos con el dato real) → resto de `public`
   (padres antes que hijos por las llaves foráneas).
