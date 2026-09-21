@echo off
REM CEO Autonomo v2 — registra 4 tareas nocturnas + warmup + deadman en Windows Task Scheduler.
REM El resumen-ceo (agente 5) se auto-dispara al terminar el agente 4.
REM Ejecutar UNA VEZ con permisos de administrador.
REM
REM Pipeline nocturno: criticidad descendente + dependencias de salida.
REM   00:00  data-quality     (seguridad + BD)
REM   01:50  dead-end-hunter  (bugs funcionales)
REM   03:40  qa-design        (visual polish)
REM   05:30  e2e-writer       (tests, verifica todo lo anterior)
REM   ~07:10 resumen-ceo      (auto-dispara tras e2e-writer)
REM   08:00  deadman switch   (catch-up si algo falló)
REM   23:30  token warmup     (refresca OAuth antes de los agentes)

set REPO_DIR=C:\Users\juanj\OneDrive\Escritorio\Proyectos IA\tu-golf
set SCRIPT=%REPO_DIR%\scripts\ceo-autonomo.mjs

echo Registrando tareas del CEO Autonomo v2 (horario nocturno)...
echo Repo: %REPO_DIR%
echo.

REM Eliminar tareas viejas (v1 y v2)
schtasks /Delete /TN "GolfersPlus-CEO-Autonomo" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-1-FlowE2E" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-2-DeadEndHunter" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-3-RefactorSecurity" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-4-QADesign" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-5-ResumenCEO" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-1-DeadEndHunter" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-2-DataQuality" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-3-E2EWriter" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-DeadmanSwitch" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-TokenWarmup" /F 2>nul
REM Nuevos nombres v2.1
schtasks /Delete /TN "GolfersPlus-CEO-1-DataQuality" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-2-DeadEndHunter2" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-3-QADesign" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-4-E2EWriter" /F 2>nul

powershell -Command ^
  "$repo = '%REPO_DIR%'; $script = '%SCRIPT%'; " ^
  "$agents = @(" ^
  "  @{Name='GolfersPlus-CEO-1-DataQuality';    Time='00:00'; Id='1'}," ^
  "  @{Name='GolfersPlus-CEO-2-DeadEndHunter';  Time='01:50'; Id='2'}," ^
  "  @{Name='GolfersPlus-CEO-3-QADesign';       Time='03:40'; Id='3'}," ^
  "  @{Name='GolfersPlus-CEO-4-E2EWriter';      Time='05:30'; Id='4'}" ^
  "); " ^
  "" ^
  "foreach ($a in $agents) {" ^
  "  $action = New-ScheduledTaskAction -Execute 'node' -Argument ('\"' + $script + '\" --now ' + $a.Id) -WorkingDirectory $repo; " ^
  "  $trigger = New-ScheduledTaskTrigger -Daily -At $a.Time; " ^
  "  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun -DontStopOnIdleEnd -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5); " ^
  "  Register-ScheduledTask -TaskName $a.Name -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null; " ^
  "  Write-Host ('  OK: ' + $a.Name + ' a las ' + $a.Time)" ^
  "}; " ^
  "" ^
  "$dmAction = New-ScheduledTaskAction -Execute 'node' -Argument ('\"' + $script + '\" --deadman') -WorkingDirectory $repo; " ^
  "$dmTrigger = New-ScheduledTaskTrigger -Daily -At '08:00'; " ^
  "$dmSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun -DontStopOnIdleEnd -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5); " ^
  "Register-ScheduledTask -TaskName 'GolfersPlus-CEO-DeadmanSwitch' -Action $dmAction -Trigger $dmTrigger -Settings $dmSettings -Force | Out-Null; " ^
  "Write-Host '  OK: GolfersPlus-CEO-DeadmanSwitch a las 08:00'; " ^
  "" ^
  "$wuAction = New-ScheduledTaskAction -Execute 'node' -Argument ('\"' + $script + '\" --warmup') -WorkingDirectory $repo; " ^
  "$wuTrigger = New-ScheduledTaskTrigger -Daily -At '23:30'; " ^
  "$wuSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun -DontStopOnIdleEnd -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5); " ^
  "Register-ScheduledTask -TaskName 'GolfersPlus-CEO-TokenWarmup' -Action $wuAction -Trigger $wuTrigger -Settings $wuSettings -Force | Out-Null; " ^
  "Write-Host '  OK: GolfersPlus-CEO-TokenWarmup a las 23:30'"

echo.
echo Listo. 4 tareas nocturnas + warmup + deadman switch registradas.
echo.
echo PIPELINE NOCTURNO (criticidad descendente):
echo   23:30  TokenWarmup     (refresca OAuth)
echo   00:00  DataQuality     (seguridad + BD)
echo   01:50  DeadEndHunter   (bugs funcionales)
echo   03:40  QADesign        (visual polish)
echo   05:30  E2EWriter       (tests, verifica todo)
echo   ~07:10 ResumenCEO      (auto-dispara tras E2EWriter)
echo   08:00  DeadmanSwitch   (catch-up si algo fallo)
echo.
echo Para verificar: powershell -Command "Get-ScheduledTask | Where { $_.TaskName -like 'GolfersPlus*' }"
pause
