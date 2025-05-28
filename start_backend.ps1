# PowerShell script for Windows users

Write-Host "🎵 Starting Music Separator Backend Server..." -ForegroundColor Green

# Check if Python is available
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Python 3 is required but not installed." -ForegroundColor Red
    exit 1
}

# Navigate to backend directory
Set-Location "$PSScriptRoot\backend"

# Install dependencies if needed
if (-not (Test-Path ".dependencies_installed")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    python install_dependencies.py
    if ($LASTEXITCODE -eq 0) {
        New-Item -ItemType File -Name ".dependencies_installed" | Out-Null
    } else {
        Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
}

# Download models
Write-Host "📥 Checking for pre-trained models..." -ForegroundColor Yellow

$pythonScript = @"
import sys
import os
sys.path.append('../ultimatevocalremover_api/src')
from utils.get_models import download_all_models
import json

models_json_path = '../ultimatevocalremover_api/src/models_dir/models.json'
if os.path.exists(models_json_path):
    with open(models_json_path, 'r') as f:
        models_json = json.load(f)
    print('Downloading essential models...')
    download_all_models(models_json)
    print('✅ Models downloaded successfully')
else:
    print('⚠️  Models config not found, proceeding without download')
"@

python -c $pythonScript

# Start the server
Write-Host "🚀 Starting server..." -ForegroundColor Green
python server.py