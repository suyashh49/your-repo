"""
Install script for the backend dependencies
"""

import subprocess
import sys
import os
from pathlib import Path

def install_package(package):
    """Install a package using pip"""
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", package])
        print(f"✅ Successfully installed {package}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install {package}: {e}")
        return False

def main():
    """Install all required dependencies"""
    print("🔧 Installing Music Separator Backend Dependencies...")
    
    # Read requirements
    requirements_file = Path(__file__).parent / "requirements.txt"
    
    if not requirements_file.exists():
        print("❌ requirements.txt not found!")
        return False
    
    with open(requirements_file, 'r') as f:
        packages = [line.strip() for line in f if line.strip() and not line.startswith('#')]
    
    success_count = 0
    total_count = len(packages)
    
    for package in packages:
        if install_package(package):
            success_count += 1
    
    # Install ultimatevocalremover_api
    uvr_path = Path(__file__).parent.parent / "ultimatevocalremover_api"
    if uvr_path.exists():
        print("\n🎵 Installing Ultimate Vocal Remover API...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-e", str(uvr_path)])
            print("✅ Successfully installed ultimatevocalremover_api")
        except subprocess.CalledProcessError as e:
            print(f"❌ Failed to install ultimatevocalremover_api: {e}")
    
    print(f"\n📊 Installation Summary: {success_count}/{total_count} packages installed successfully")
    
    if success_count == total_count:
        print("🎉 All dependencies installed successfully!")
        print("\n🚀 To start the server, run:")
        print("   python server.py")
        return True
    else:
        print("⚠️  Some dependencies failed to install. Please check the errors above.")
        return False

if __name__ == "__main__":
    main()