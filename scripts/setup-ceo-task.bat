@echo off
REM CEO Autonomo — registra 5 tareas programadas en Windows Task Scheduler.
REM Cada agente corre como proceso independiente (no daemon).
REM Ejecutar UNA VEZ con permisos de administrador.

set REPO_DIR=C:\Users\juanj\OneDrive\Escritorio\Proyectos IA\tu-golf
set SCRIPT=%REPO_DIR%\scripts\ceo-autonomo.mjs

echo Registrando tareas del CEO Autonomo...
echo Repo: %REPO_DIR%
echo.

REM Eliminar tareas viejas si existen
schtasks /Delete /TN "GolfersPlus-CEO-Autonomo" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-1-FlowE2E" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-2-DeadEndHunter" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-3-RefactorSecurity" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-4-QADesign" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-5-ResumenCEO" /F 2>nul

REM Crear XMLs temporales (schtasks /Create no soporta WorkingDirectory directo)
REM Usamos PowerShell para registrar con WorkingDirectory correcto

powershell -Command ^
  "$repo = '%REPO_DIR%'; $script = '%SCRIPT%'; " ^
  "$agents = @(" ^
  "  @{Name='GolfersPlus-CEO-1-FlowE2E';       Time='09:00'; Id='1'}," ^
  "  @{Name='GolfersPlus-CEO-2-DeadEndHunter';  Time='11:30'; Id='2'}," ^
  "  @{Name='GolfersPlus-CEO-3-RefactorSecurity';Time='14:00'; Id='3'}," ^
  "  @{Name='GolfersPlus-CEO-4-QADesign';       Time='16:30'; Id='4'}," ^
  "  @{Name='GolfersPlus-CEO-5-ResumenCEO';     Time='18:00'; Id='5'}" ^
  "); " ^
  "foreach ($a in $agents) {" ^
  "  $action = New-ScheduledTaskAction -Execute 'node' -Argument ('\"' + $script + '\" --now ' + $a.Id) -WorkingDirectory $repo; " ^
  "  $trigger = New-ScheduledTaskTrigger -Daily -At $a.Time; " ^
  "  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable; " ^
  "  Register-ScheduledTask -TaskName $a.Name -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null; " ^
  "  Write-Host ('  OK: ' + $a.Name + ' a las ' + $a.Time)" ^
  "}"

echo.
echo Listo. 5 tareas registradas con WorkingDirectory correcto.
echo Para verificar: powershell -Command "Get-ScheduledTask | Where { $_.TaskName -like 'GolfersPlus*' }"
pause
