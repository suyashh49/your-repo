#!/bin/bash

echo "🎵 Starting Music Separator Backend Server..."

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed."
    exit 1
fi

# Navigate to backend directory
cd "$(dirname "$0")/backend"

# Install dependencies if needed
if [ ! -f ".dependencies_installed" ]; then
    echo "📦 Installing dependencies..."
    python3 install_dependencies.py
    if [ $? -eq 0 ]; then
        touch .dependencies_installed
    else
        echo "❌ Failed to install dependencies"
        exit 1
    fi
fi

# Download models if needed
echo "📥 Checking for pre-trained models..."
python3 -c "
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
"

# Start the server
echo "🚀 Starting server..."
python3 server.py