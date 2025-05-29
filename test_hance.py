#!/usr/bin/env python3
"""
Test script to verify Hance API integration
"""

import sys
import numpy as np
from pathlib import Path

def test_hance_installation():
    """Test if Hance is properly installed"""
    print("🔍 Testing Hance installation...")
    
    try:
        import hance
        print("✅ Hance module imported successfully")
        
        # Initialize engine
        engine = hance.HanceEngine()
        print("✅ Hance engine created successfully")
        
        # List available models
        models = hance.list_models()
        print(f"✅ Found {len(models)} Hance models")
        
        return True, engine, models
        
    except ImportError as e:
        print(f"❌ Failed to import Hance: {e}")
        return False, None, []
    except Exception as e:
        print(f"❌ Error initializing Hance: {e}")
        return False, None, []

def test_local_models():
    """Test local Hance models"""
    print("\n🎵 Testing local Hance models...")
    
    models_dir = Path(__file__).parent / "hance-api" / "Models"
    
    if not models_dir.exists():
        print(f"❌ Models directory not found: {models_dir}")
        return False, []
    
    stem_models = list(models_dir.glob("*stem*.hance"))
    
    if not stem_models:
        print("❌ No stem separation models found")
        return False, []
    
    print(f"✅ Found {len(stem_models)} stem separation models:")
    for model in stem_models:
        print(f"  • {model.name}")
    
    return True, stem_models

def test_processor_creation(engine, model_path):
    """Test creating a processor"""
    print(f"\n🔧 Testing processor creation with {model_path.name}...")
    
    try:
        processor = engine.create_processor(str(model_path), 2, 44100)
        print("✅ Processor created successfully")
        
        # Get bus information
        num_buses = processor.get_number_of_output_buses()
        print(f"✅ Found {num_buses} output buses:")
        
        for i in range(num_buses):
            bus_name = processor.get_output_bus_name(i)
            print(f"  • Bus {i}: {bus_name}")
        
        return True, processor
        
    except Exception as e:
        print(f"❌ Failed to create processor: {e}")
        return False, None

def test_audio_processing(processor):
    """Test processing a small audio buffer"""
    print("\n🎤 Testing audio processing...")
    
    try:
        # Create test audio (100ms of sine wave)
        sample_rate = 44100
        duration = 0.1  # 100ms
        samples = int(sample_rate * duration)
        
        # Generate stereo sine wave
        t = np.linspace(0, duration, samples)
        frequency = 440  # A4 note
        audio_left = np.sin(2 * np.pi * frequency * t) * 0.5
        audio_right = np.sin(2 * np.pi * frequency * 1.5 * t) * 0.5  # Slightly different frequency
        
        # Combine to stereo
        test_audio = np.column_stack([audio_left, audio_right]).astype(np.float32)
        
        print(f"✅ Generated test audio: {test_audio.shape} samples")
        
        # Process with Hance
        output_audio = processor.process(test_audio)
        
        print(f"✅ Processing successful! Output shape: {output_audio.shape}")
        
        # Check output
        if output_audio.size > 0:
            print(f"✅ Output audio contains data (range: {np.min(output_audio):.3f} to {np.max(output_audio):.3f})")
            return True
        else:
            print("⚠️  Output audio is empty")
            return False
            
    except Exception as e:
        print(f"❌ Audio processing failed: {e}")
        return False

def main():
    """Main test function"""
    print("🧪 Hance API Integration Test")
    print("=" * 50)
    
    # Test 1: Installation
    success, engine, models = test_hance_installation()
    if not success:
        print("\n❌ Hance installation test failed")
        sys.exit(1)
    
    # Test 2: Local models
    success, local_models = test_local_models()
    if not success:
        print("\n❌ Local models test failed")
        sys.exit(1)
    
    # Test 3: Processor creation
    test_model = local_models[0]  # Use first available model
    success, processor = test_processor_creation(engine, test_model)
    if not success:
        print("\n❌ Processor creation test failed")
        sys.exit(1)
    
    # Test 4: Audio processing
    success = test_audio_processing(processor)
    if not success:
        print("\n❌ Audio processing test failed")
        sys.exit(1)
    
    print("\n" + "=" * 50)
    print("✅ ALL TESTS PASSED!")
    print("🎉 Hance API is ready for real-time audio separation!")
    print("=" * 50)
    
    print("\nNext steps:")
    print("1. Run: ./start_backend.sh")
    print("2. Choose option 1 (Hance API)")
    print("3. Open your Chrome extension")
    print("4. Enjoy efficient real-time stem separation!")

if __name__ == "__main__":
    main()