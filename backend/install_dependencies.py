# """
# Install script for the backend dependencies
# """

# import subprocess
# import sys
# import os
# from pathlib import Path

# def install_package(package):
#     """Install a package using pip"""
#     try:
#         subprocess.check_call([sys.executable, "-m", "pip", "install", package])
#         print(f"✅ Successfully installed {package}")
#         return True
#     except subprocess.CalledProcessError as e:
#         print(f"❌ Failed to install {package}: {e}")
#         return False

# def main():
#     """Install all required dependencies"""
#     print("🔧 Installing Music Separator Backend Dependencies...")
    
#     # Read requirements
#     requirements_file = Path(__file__).parent / "requirements.txt"
    
#     if not requirements_file.exists():
#         print("❌ requirements.txt not found!")
#         return False
    
#     with open(requirements_file, 'r') as f:
#         packages = [line.strip() for line in f if line.strip() and not line.startswith('#')]
    
#     success_count = 0
#     total_count = len(packages)
    
#     for package in packages:
#         if install_package(package):
#             success_count += 1
    
#     # Install ultimatevocalremover_api
#     uvr_path = Path(__file__).parent.parent / "ultimatevocalremover_api"
#     if uvr_path.exists():
#         print("\n🎵 Installing Ultimate Vocal Remover API...")
#         try:
#             subprocess.check_call([sys.executable, "-m", "pip", "install", "-e", str(uvr_path)])
#             print("✅ Successfully installed ultimatevocalremover_api")
#         except subprocess.CalledProcessError as e:
#             print(f"❌ Failed to install ultimatevocalremover_api: {e}")
    
#     print(f"\n📊 Installation Summary: {success_count}/{total_count} packages installed successfully")
    
#     if success_count == total_count:
#         print("🎉 All dependencies installed successfully!")
#         print("\n🚀 To start the server, run:")
#         print("   python server.py")
#         return True
#     else:
#         print("⚠️  Some dependencies failed to install. Please check the errors above.")
#         return False

# if __name__ == "__main__":
#     main()

#!/usr/bin/env python3
"""
Installation script for Music Separator Extension dependencies
Now using Hance API for efficient real-time separation
"""

import subprocess
import sys
import os
from pathlib import Path

def run_command(command, description=""):
    """Run a command and handle errors"""
    print(f"\n{'='*50}")
    print(f"Running: {description}")
    print(f"Command: {command}")
    print(f"{'='*50}")
    
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        if result.stdout:
            print("STDOUT:", result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error running command: {e}")
        if e.stdout:
            print("STDOUT:", e.stdout)
        if e.stderr:
            print("STDERR:", e.stderr)
        return False

def install_hance():
    """Install Hance API"""
    print("\n🎵 Installing Hance API for real-time audio separation...")
    
    # Install Hance Python package
    success = run_command("pip3 install hance", "Installing Hance Python package")
    if not success:
        print("❌ Failed to install Hance package")
        return False
    
    # Update models (this downloads the latest models)
    print("\n📥 Downloading Hance models...")
    try:
        import hance
        hance.update_models()
        print("✅ Hance models updated successfully")
    except Exception as e:
        print(f"⚠️  Could not update Hance models: {e}")
        print("Models will be downloaded when first used")
    
    return True

def install_basic_dependencies():
    """Install basic Python dependencies"""
    print("\n📦 Installing basic dependencies...")
    
    dependencies = [
        "flask",
        "flask-cors", 
        "websockets",
        "numpy",
        "soundfile",  # Required for Hance file processing
        "asyncio"
    ]
    
    for dep in dependencies:
        success = run_command(f"pip3 install {dep}", f"Installing {dep}")
        if not success:
            print(f"❌ Failed to install {dep}")
            return False
    
    return True

def verify_installation():
    """Verify that all components are properly installed"""
    print("\n🔍 Verifying installation...")
    
    try:
        import hance
        import flask
        import websockets
        import numpy as np
        import soundfile as sf
        
        # Test Hance
        engine = hance.HanceEngine()
        models = hance.list_models()
        
        print("✅ All dependencies installed successfully!")
        print(f"✅ Hance engine initialized")
        print(f"✅ Available Hance models: {len(models)}")
        
        return True
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False
    except Exception as e:
        print(f"❌ Verification error: {e}")
        return False

def main():
    """Main installation function"""
    print("🚀 Music Separator Extension - Hance Installation")
    print("This will install Hance API for efficient real-time audio separation")
    
    # Check Python version
    if sys.version_info < (3, 7):
        print("❌ Python 3.7 or higher is required")
        sys.exit(1)
    
    print(f"✅ Python {sys.version} detected")
    
    # Install dependencies
    steps = [
        (install_basic_dependencies, "Installing basic dependencies"),
        (install_hance, "Installing Hance API"),
        (verify_installation, "Verifying installation")
    ]
    
    for step_func, step_name in steps:
        print(f"\n{'='*60}")
        print(f"STEP: {step_name}")
        print(f"{'='*60}")
        
        if not step_func():
            print(f"\n❌ Failed at step: {step_name}")
            print("\nTroubleshooting tips:")
            print("1. Make sure you have Python 3.7+ installed")
            print("2. Try running with 'pip' instead of 'pip3'")
            print("3. Check your internet connection")
            print("4. Try running as administrator/sudo if needed")
            sys.exit(1)
    
    print(f"\n{'='*60}")
    print("✅ INSTALLATION COMPLETE!")
    print(f"{'='*60}")
    print("\nHance API is now installed and ready for real-time audio separation!")
    print("Hance provides:")
    print("  • Low latency (70-209ms vs UVR's seconds)")
    print("  • Efficient memory usage (MB vs GB)")
    print("  • Real-time optimized models")
    print("  • No GPU requirements")
    print("\nNext steps:")
    print("1. Run: python3 hance_server.py")
    print("2. Open Chrome extension and start separating!")

if __name__ == "__main__":
    main()