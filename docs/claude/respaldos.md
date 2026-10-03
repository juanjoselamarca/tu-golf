# Respaldos de la base de producción

> Creado el 03-oct-2026 tras el incidente del 02-oct (base congelada 4 h). El proyecto está en el **plan
> FREE de Supabase: no tiene ningún backup ni PITR**. Este respaldo es lo único que permite volver atrás.

## Qué se respalda y dónde

- **Script:** `scripts/respaldo/respaldo-diario.mjs` (Management API; no necesita la clave de Postgres).
- **Qué:** todas las tablas de `public` + `auth.users` y `auth.identities` (lista en `scripts/respaldo/tablas-auth.mjs`), como JSON comprimido,
  una carpeta por día con `_manifiesto.json` (`completo`, filas y bytes por tabla, migraciones aplicadas). Sin los
  tokens de un solo uso de `auth.users` (vuelven como `''` al restaurar). `auth.mfa_factors` no se respalda: un factor TOTP
  sin su secreto deja al usuario fuera; si algún día hay factores, el usuario re-enrola. El esquema NO va en el
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

`scripts/respaldo/restaurar.mjs` resuelve lo que el SQL ingenuo no:
- **Columnas:** solo las que trae el respaldo y no son generadas (Postgres recalcula `courses.nombre_canonico`,
  `knowledge_chunks.tsv`, `auth.users.confirmed_at`…). Una columna agregada después del respaldo toma su DEFAULT en
  vez de NULL. Los tokens de `auth.users` vuelven como `''` (GoTrue no acepta NULL ahí: el login fallaría).
- **Identity** (`pattern_observations.id`, `external_priors_*`): `OVERRIDING SYSTEM VALUE`, y tras aplicar se
  sincronizan las secuencias.
- **Tamaño:** la Management API rechaza cuerpos grandes (413): va por lotes de ~1 MB.
- **Prueba sin escribir:** por defecto carga cada lote en una tabla **temporal de sesión** (no visible por la API,
  desaparece con la conexión) y cuenta. Probado el 03-oct: knowledge_chunks 420/420 (11 lotes), courses 193/193,
  pattern_observations 588/588, profiles 88/88, auth.users 88/88 sin tokens NULL, auth.identities 88/88.

```bash
node --env-file=.env.local scripts/respaldo/restaurar.mjs --tabla public.courses [--fecha AAAA-MM-DD] [--ids a,b]
```

**Restaurar en prod** es escritura sobre datos de usuarios (zona crítica): revisar el SQL con `--mostrar-sql`, pasarlo
por `revisor-fable` y recién ahí `--aplicar`.
- `--modo faltantes` (default): inserta solo filas cuyo id no existe (lo típico: "alguien borró algo").
- `--modo actualizar`: pisa filas existentes con el dato del respaldo. **Exige `--ids`**: sin filtro devolvería la
  tabla entera al día del respaldo y borraría todo lo escrito desde entonces.

**Recuperar una cuenta borrada.** El usuario de la Management API no es superuser y no puede apagar triggers:
restaurar `auth.users` dispara `on_auth_user_created`, que crea un `profiles` vacío.
1. `--tabla auth.users --ids <id> --aplicar` (imprime los ids escritos).
2. `--tabla auth.identities --ids <id de la identidad> --aplicar`.
3. `--tabla public.profiles --modo actualizar --ids <id> --aplicar` (pisa el perfil vacío con el real).
4. Las tablas hijas que se hayan borrado en cascada (rondas, historial…), en modo `faltantes`.
