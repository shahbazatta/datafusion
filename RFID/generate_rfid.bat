@echo off
setlocal enabledelayedexpansion

echo ========================================
echo Multi-Server RFID Simulator Launcher (Background)
echo ========================================

REM Get inputs from user
echo NOTE: Use a port range that does NOT overlap with the Camera simulator.
echo       Camera simulator uses ports starting at 3000 by default.
echo       Recommended RFID base port: 5000
echo.
set /p N="Enter number of instances (N): "
set /p BASE_PORT="Enter base port number (P, recommended 5000): "
set /p BASE_CAMERA_ID="Enter base camera_id (from camps.json, e.g. 3000): "
set /a LAST_INDEX=%N%-1

if "%N%"=="" (
    echo Error: Number of instances cannot be empty!
    pause
    exit /b 1
)
if "%BASE_PORT%"=="" (
    echo Error: Base port cannot be empty!
    pause
    exit /b 1
)
if "%BASE_CAMERA_ID%"=="" (
    echo Error: Base camera_id cannot be empty!
    pause
    exit /b 1
)

echo.
echo Starting %N% RFID simulator instances in background...
set /a MAX_PORT=%BASE_PORT% + %LAST_INDEX%
set /a MAX_CAM=%BASE_CAMERA_ID% + %LAST_INDEX%
echo Ports: %BASE_PORT% to !MAX_PORT!
echo Camera IDs: %BASE_CAMERA_ID% to !MAX_CAM!
echo.

if not exist logs mkdir logs

if exist rfid_server_ports.txt del rfid_server_ports.txt
if exist rfid_server_pids.txt del rfid_server_pids.txt

for /l %%i in (0,1,%LAST_INDEX%) do (
    set /a PORT=%BASE_PORT% + %%i
    set /a CAMERA_ID=%BASE_CAMERA_ID% + %%i
    echo Starting RFID simulator on port !PORT! (camera_id=!CAMERA_ID!)...

    start /B "" node server.js !PORT! !CAMERA_ID! > logs\rfid_server_!PORT!.log 2>&1

    echo !PORT! >> rfid_server_ports.txt
    echo RFID simulator on port !PORT! (camera_id=!CAMERA_ID!) started
    echo.
)

echo.
echo ========================================
echo All %N% RFID simulator instances started!
echo.
echo Ports in use:
for /l %%i in (0,1,%LAST_INDEX%) do (
    set /a PORT=%BASE_PORT% + %%i
    set /a CAMERA_ID=%BASE_CAMERA_ID% + %%i
    echo   Port !PORT! ^(camera_id=!CAMERA_ID!^)
)
echo.
echo Individual log files:
for /l %%i in (0,1,%LAST_INDEX%) do (
    set /a PORT=%BASE_PORT% + %%i
    echo   logs\rfid_server_!PORT!.log
)
echo.
echo Access the streaming RFID data at:
for /l %%i in (0,1,%LAST_INDEX%) do (
    set /a PORT=%BASE_PORT% + %%i
    echo   http://localhost:!PORT!/cgi-bin/videoStatServer.cgi
)
echo.
echo Download today's event log at:
for /l %%i in (0,1,%LAST_INDEX%) do (
    set /a PORT=%BASE_PORT% + %%i
    echo   http://localhost:!PORT!/cgi-bin/logs
)
echo ========================================
echo.
echo Tip: Use 'tasklist /fi "imagename eq node.exe"' to view running Node processes
echo Tip: Run kill-rfid-servers-win.bat to stop all instances
echo.
pause
