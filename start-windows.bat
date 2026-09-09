@echo off
setlocal
where docker >nul 2>nul || (echo Docker Desktop is required. & exit /b 1)
if not exist .env copy .env.example .env >nul
docker compose up -d --build
if errorlevel 1 exit /b 1
echo.
echo 4Z Academy is starting at http://localhost:3000
echo Run: docker compose logs -f app