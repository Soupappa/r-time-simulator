@echo off
cd /d "%~dp0"
start "" http://localhost:5176
npm run dev -- --port 5176
