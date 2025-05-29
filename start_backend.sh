# #!/bin/bash

# echo "🎵 Starting Music Separator Backend Server..."

# # Check if Python is available
# if ! command -v python3 &> /dev/null; then
#     echo "❌ Python 3 is required but not installed."
#     exit 1
# fi

# # Navigate to backend directory
# cd "$(dirname "$0")/backend"

# # Install dependencies if needed
# if [ ! -f ".dependencies_installed" ]; then
#     echo "📦 Installing dependencies..."
#     python3 install_dependencies.py
#     if [ $? -eq 0 ]; then
#         touch .dependencies_installed
#     else
#         echo "❌ Failed to install dependencies"
#         exit 1
#     fi
# fi

# # Download models and set up directory structure
# echo "📥 Checking for pre-trained models..."
# python3 -c "
# import sys
# import os
# import shutil
# sys.path.append('../ultimatevocalremover_api/src')
# from utils.get_models import download_all_models
# import json

# models_json_path = '../ultimatevocalremover_api/src/models_dir/models.json'
# if os.path.exists(models_json_path):
#     with open(models_json_path, 'r') as f:
#         models_json = json.load(f)
#     print('Downloading essential models...')
#     download_all_models(models_json)
    
#     # Set up proper directory structure for hdemucs_mmi
#     demucs_weights_dir = '../ultimatevocalremover_api/src/models_dir/demucs/weights'
#     hdemucs_mmi_dir = os.path.join(demucs_weights_dir, 'hdemucs_mmi')
#     remote_yaml_path = '../ultimatevocalremover_api/src/models_dir/demucs/demucs/remote/hdemucs_mmi.yaml'
#     model_file_path = os.path.join(demucs_weights_dir, '955717e8-8726e21a.th')
    
#     if os.path.exists(model_file_path) and os.path.exists(remote_yaml_path):
#         print('Setting up hdemucs_mmi directory structure...')
#         os.makedirs(hdemucs_mmi_dir, exist_ok=True)
        
#         # Copy YAML file
#         yaml_dest = os.path.join(hdemucs_mmi_dir, 'hdemucs_mmi.yaml')
#         if not os.path.exists(yaml_dest):
#             shutil.copy2(remote_yaml_path, yaml_dest)
#             print('✅ Copied hdemucs_mmi.yaml')
        
#         # Move model file  
#         model_dest = os.path.join(hdemucs_mmi_dir, '955717e8-8726e21a.th')
#         if not os.path.exists(model_dest):
#             shutil.move(model_file_path, model_dest)
#             print('✅ Moved model file to hdemucs_mmi directory')
            
#         print('✅ hdemucs_mmi model setup complete')
#     else:
#         if not os.path.exists(model_file_path):
#             print(f'⚠️  Model file not found at {model_file_path}')
#         if not os.path.exists(remote_yaml_path):
#             print(f'⚠️  YAML file not found at {remote_yaml_path}')
    
#     print('✅ Models downloaded successfully')
# else:
#     print('⚠️  Models config not found, proceeding without download')
# "

# # Start the server
# echo "🚀 Starting server..."
# python3 server.py


#!/bin/bash

# Start script for Music Separator Backend
echo "🎵 Music Separator Backend Launcher"
echo ""
echo "Choose your audio separation engine:"
echo "1. Hance API (Recommended - Low latency, efficient memory usage)"
echo "2. UVR API (High quality but resource intensive)"
echo ""

read -p "Enter your choice (1 or 2): " choice

case $choice in
    1)
        echo ""
        echo "🚀 Starting Hance-based separation server..."
        echo "✅ Optimized for real-time processing"
        echo "✅ Low memory usage (MB vs GB)"
        echo "✅ Fast response time (70-209ms)"
        echo ""
        
        # Navigate to backend directory
        cd "$(dirname "$0")/backend"
        
        # Check if Hance is installed
        echo "Checking Hance installation..."
        if ! python3 -c "import hance" 2>/dev/null; then
            echo "❌ Hance not found. Installing..."
            cd ..
            python3 install_dependencies.py
            cd backend
        fi
        
        # Check if models exist
        echo "Checking Hance models..."
        if [ ! -d "../hance-api/Models" ]; then
            echo "❌ Hance models not found. Please ensure hance-api folder is present."
            exit 1
        fi
        
        echo "✅ Starting Hance separation server..."
        echo "🔗 WebSocket: ws://localhost:8765"
        echo "🌐 HTTP API: http://localhost:8766"
        echo ""
        echo "Press Ctrl+C to stop the server"
        echo ""
        
        exec python3 hance_server.py
        ;;
    2)
        echo ""
        echo "⚠️  Starting UVR-based separation server..."
        echo "⚠️  This mode requires significant system resources"
        echo "⚠️  Your M2 MacBook may experience high memory usage"
        echo ""
        
        # Navigate to backend directory
        cd "$(dirname "$0")/backend"
        
        echo "✅ Starting UVR separation server..."
        echo "🔗 WebSocket: ws://localhost:8765"
        echo "🌐 HTTP API: http://localhost:8766"
        echo ""
        echo "Press Ctrl+C to stop the server"
        echo ""
        
        python3 server.py
        ;;
    *)
        echo "Invalid choice. Please run the script again and choose 1 or 2."
        exit 1
        ;;
esac