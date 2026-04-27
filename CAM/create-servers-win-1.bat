@echo off
setlocal enabledelayedexpansion

echo ========================================
echo Multi-Server Instance Launcher
echo ========================================

REM Get inputs from user
set /p N="Enter number of instances (N): "
set /p BASE_PORT="Enter base port number (P): "

REM Validate inputs
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

echo.
echo Starting %N% server instances from port %BASE_PORT% to %BASE_PORT% + %N% - 1...
echo.

REM Create a file to store PIDs (optional for later management)
if exist server_pids.txt del server_pids.txt

REM Start each server instance
for /l %%i in (0,1,%N%-1) do (
    set /a PORT=%BASE_PORT% + %%i
    echo Starting server on port !PORT!...
    
    REM Start each server in a new command window
    start "Server Port !PORT!" cmd /k "node server.js !PORT!"
    
    REM Alternative: run in background without new windows
    REM node server.js !PORT! &
    
    echo Server on port !PORT! started with PID %errorlevel%
    echo !PORT! >> server_ports.txt
)

echo.
echo ========================================
echo All servers started!
echo.
echo Ports used: 
for /l %%i in (0,1,%N%-1) do (
    set /a PORT=%BASE_PORT% + %%i
    echo Port !PORT!
)
echo.
echo Check each server at:
for /l %%i in (0,1,%N%-1) do (
    set /a PORT=%BASE_PORT% + %%i
    echo http://localhost:!PORT!/cgi-bin/videoStatServer.cgi
)
echo ========================================
echo.
pause