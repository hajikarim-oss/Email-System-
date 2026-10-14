@echo off
REM ==============================================================================
REM Tally Prime Sync Agent — Desktop Service Setup & Runner
REM ==============================================================================

echo ========================================================
echo  TALLY PRIME ↔ TBM CFO DASHBOARD SYNC AGENT SETUP
echo ========================================================
echo.

REM Check if Node / npx is available
where npx >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js / npx is not found in PATH.
    echo Please install Node.js (LTS version) on this machine.
    pause
    exit /b 1
)

echo [1/3] Probing Tally Prime on 127.0.0.1:9000...
npx tsx server/tally/probe.ts

echo.
echo [2/3] Starting Tally Sync Agent in Continuous Background Mode...
echo Press Ctrl + C to stop the agent.
echo.

npx tsx server/tally/agent.ts
