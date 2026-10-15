@echo off
title Tally Prime Continuous Sync Bridge - TBM CFO
color 0A
cd /d "%~dp0"
set CLOUD_API_URL=https://tbmoutreach.tech

echo ==============================================================================
echo       TALLY PRIME 5.0 / 4.x - CONTINUOUS SYNC BRIDGE (WINDOWS)
echo ==============================================================================
echo.
echo [1/3] Probing Tally Prime on 127.0.0.1:9000...

call npx tsx server/tally/probe.ts
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo [ERROR] Could not connect to Tally Prime on port 9000!
    echo.
    echo Please follow these simple steps in Tally Prime:
    echo   1. Ensure Tally Prime is OPEN and your Company is loaded.
    echo   2. Press F1 (Help) ^> Settings ^> Connectivity.
    echo   3. Set "TallyPrime acts as" to "Both" (or Server).
    echo   4. Set "Port" to 9000.
    echo   5. Press Ctrl+A to save, then re-run this script.
    echo.
    pause
    exit /b 1
)

echo.
echo [2/3] Initializing Tally Live Sync Agent...
echo       - Automatic Monotonic AlterID Watermarking: ACTIVE
echo       - Real-Time Voucher & Ledger Reconciliation: ACTIVE
echo       - Offline Resilient Buffering: ACTIVE
echo.
echo [3/3] STARTING 24/7 BACKGROUND SYNC WORKER...
echo       (Keep this window open or minimized while using Tally Prime)
echo.
echo ==============================================================================
echo.

:LOOP
call npx tsx server/tally/agent.ts
echo.
echo [WARNING] Agent process ended. Re-launching in 5 seconds...
timeout /t 5 /nobreak >nul
goto LOOP
