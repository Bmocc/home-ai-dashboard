@echo off
setlocal enabledelayedexpansion

python -m venv .venv
call .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt

if exist .env (
  rem Load variables from .env (lines beginning with # are ignored)
  for /f "usebackq tokens=1* delims== eol=#" %%a in (".env") do (
    if not "%%a"=="" (
      set "%%a=%%b"
    )
  )
)

if "%APP_HOST%"=="" set APP_HOST=0.0.0.0
if "%APP_PORT%"=="" set APP_PORT=8000

uvicorn main:app --host %APP_HOST% --port %APP_PORT% --reload
