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

# Download models and set up directory structure
echo "📥 Checking for pre-trained models..."
python3 -c "
import sys
import os
import shutil
sys.path.append('../ultimatevocalremover_api/src')
from utils.get_models import download_all_models
import json

models_json_path = '../ultimatevocalremover_api/src/models_dir/models.json'
if os.path.exists(models_json_path):
    with open(models_json_path, 'r') as f:
        models_json = json.load(f)
    print('Downloading essential models...')
    download_all_models(models_json)
    
    # Set up proper directory structure for hdemucs_mmi
    demucs_weights_dir = '../ultimatevocalremover_api/src/models_dir/demucs/weights'
    hdemucs_mmi_dir = os.path.join(demucs_weights_dir, 'hdemucs_mmi')
    remote_yaml_path = '../ultimatevocalremover_api/src/models_dir/demucs/demucs/remote/hdemucs_mmi.yaml'
    model_file_path = os.path.join(demucs_weights_dir, '955717e8-8726e21a.th')
    
    if os.path.exists(model_file_path) and os.path.exists(remote_yaml_path):
        print('Setting up hdemucs_mmi directory structure...')
        os.makedirs(hdemucs_mmi_dir, exist_ok=True)
        
        # Copy YAML file
        yaml_dest = os.path.join(hdemucs_mmi_dir, 'hdemucs_mmi.yaml')
        if not os.path.exists(yaml_dest):
            shutil.copy2(remote_yaml_path, yaml_dest)
            print('✅ Copied hdemucs_mmi.yaml')
        
        # Move model file  
        model_dest = os.path.join(hdemucs_mmi_dir, '955717e8-8726e21a.th')
        if not os.path.exists(model_dest):
            shutil.move(model_file_path, model_dest)
            print('✅ Moved model file to hdemucs_mmi directory')
            
        print('✅ hdemucs_mmi model setup complete')
    else:
        if not os.path.exists(model_file_path):
            print(f'⚠️  Model file not found at {model_file_path}')
        if not os.path.exists(remote_yaml_path):
            print(f'⚠️  YAML file not found at {remote_yaml_path}')
    
    print('✅ Models downloaded successfully')
else:
    print('⚠️  Models config not found, proceeding without download')
"

# Start the server
echo "🚀 Starting server..."
python3 server.py