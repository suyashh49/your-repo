"""
Local server for real-time audio separation using Ultimate Vocal Remover API
"""

import asyncio
import json
import logging
import numpy as np
import websockets
from flask import Flask, request, jsonify
from flask_cors import CORS
import threading
import torch
import sys
import os
from pathlib import Path

# Add ultimatevocalremover_api to path
PROJECT_ROOT = Path(__file__).parent.parent
UVR_API_PATH = PROJECT_ROOT / "ultimatevocalremover_api"
if str(UVR_API_PATH) not in sys.path:
    sys.path.insert(0, str(UVR_API_PATH))

UVR_SRC_PATH = UVR_API_PATH / "src"
if str(UVR_SRC_PATH) not in sys.path:
    sys.path.insert(0, str(UVR_SRC_PATH))

from models import Demucs, VrNetwork, MDX, MDXC
from utils.fastio import read

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AudioSeparationServer:
    def __init__(self, host='localhost', port=8765, http_port=8766):
        self.host = host
        self.port = port
        self.http_port = http_port
        self.clients = set()
        self.current_model = None
        self.model_config = {'model': 'hdemucs_mmi', 'realTime': True} 
        self.processing_queue = asyncio.Queue()
        self.is_processing = False

        # Reduced buffer size for memory optimization
        self.audio_buffer = []
        self.buffer_target_samples = 44100 * 1  # Reduced to 1 second
        self.current_sample_rate = 44100
        self.current_channels = 2
        
        self.app = Flask(__name__)
        CORS(self.app)
        self.setup_http_routes()
        
    def setup_http_routes(self):
        @self.app.route('/health', methods=['GET'])
        def health_check():
            return jsonify({
                'status': 'healthy',
                'model_loaded': self.current_model is not None,
                'clients_connected': len(self.clients)
            })
        
        @self.app.route('/models', methods=['GET'])
        def list_models_route(): # Renamed to avoid conflict
            try:
                models_available = { # Renamed variable
                    'demucs': Demucs.list_models(),
                    'vr_network': VrNetwork.list_models(),
                    'mdx': MDX.list_models(),
                    'mdxc': MDXC.list_models()
                }
                return jsonify(models_available)
            except Exception as e:
                return jsonify({'error': str(e)}), 500
    
    async def register_client(self, *args): # MODIFIED for diagnostics
        """Register a new WebSocket client"""
        logger.info(f"register_client called with args: {args}")
        
        if not args or len(args) < 1: 
            logger.error(f"register_client did not receive websocket argument. Got: {args}")
            return

        websocket = args[0]
        # The 'websockets' library should pass (websocket, path)
        # If path is missing, it's an issue with the library call or version
        path = args[1] if len(args) > 1 else "/" 

        self.clients.add(websocket)
        logger.info(f"Client connected from path: '{path}'. Total clients: {len(self.clients)}")
        
        try:
            await self.handle_client(websocket)
        finally:
            if websocket in self.clients:
                self.clients.remove(websocket)
                logger.info(f"Client disconnected (Path: '{path}'). Total clients: {len(self.clients)}")

    async def handle_client(self, websocket):
        """Handle messages from a WebSocket client"""
        async for message in websocket:
            try:
                data = json.loads(message)
                await self.process_message(websocket, data)
            except json.JSONDecodeError:
                await websocket.send(json.dumps({
                    'type': 'error',
                    'error': 'Invalid JSON message'
                }))
            except Exception as e:
                logger.error(f"Error processing message: {e}")
                await websocket.send(json.dumps({
                    'type': 'error',
                    'error': str(e)
                }))
    
    async def process_message(self, websocket, data):
        """Process incoming WebSocket messages"""
        message_type = data.get('type')
        logger.info(f"Server received WebSocket message. Type: '{message_type}', Data: {data}") # ADD THIS LOG

        
        if message_type == 'configure':
            await self.configure_model(websocket, data.get('config', {}))
        elif message_type == 'audio_data':
            #logger.info(f"Received audio_data message: {data}") # Verbose log
            await self.queue_audio_processing(websocket, data)
        else:
            logger.warning(f"Unknown message type received: {message_type}") # ADD THIS LOG
            await websocket.send(json.dumps({
                'type': 'error',
                'error': f'Unknown message type: {message_type}'
            }))
    
    async def configure_model(self, websocket, config_data):
        """Configure the separation model"""
        try:
            model_name = config_data.get('model', self.model_config.get('model', 'hdemucs_mmi'))
            real_time = config_data.get('realTime', self.model_config.get('realTime', True))
            
            logger.info(f"Configuring model: {model_name} with config: {config_data}")
            
            # Force CPU-only operation with environment variable
            os.environ['CUDA_VISIBLE_DEVICES'] = ''  # Disable CUDA
            os.environ['PYTORCH_MPS_HIGH_WATERMARK_RATIO'] = '0.0'  # Disable MPS limits
            
            # Optimized metadata for memory efficiency (removed device from here)
            self.model_config = config_data 
            demucs_metadata = {
                'segment': 1,  # Very small segment
                'split': True,
                'overlap': 0.05,  # Minimal overlap
                'shifts': 0      # No shifts
            }
            
            # VR/MDX metadata with memory optimizations (removed device from here)
            vr_mdx_metadata = {
                'aggressiveness': config_data.get('aggressiveness', 0.05),
                'batch_size': 1
            }

            # Force CPU usage completely
            device = 'cpu'
            logger.info(f"Using device: {device} (forced CPU for memory efficiency)")

            if 'demucs' in model_name.lower():
                 logger.info(f"Loading Demucs model: {model_name}")
                 self.current_model = Demucs(name=model_name, other_metadata=demucs_metadata, device=device)
            elif model_name.startswith('UVR') or 'MDX' in model_name:
                if 'MDX' in model_name:
                    logger.info(f"Loading MDX model: {model_name}")
                    self.current_model = MDX(name=model_name, other_metadata=vr_mdx_metadata, device=device)
                else:
                    logger.info(f"Loading VR model: {model_name}")
                    self.current_model = VrNetwork(name=model_name, other_metadata=vr_mdx_metadata, device=device)
            else:
                logger.warning(f"Model type for '{model_name}' not explicitly handled, attempting generic load with hdemucs_mmi.")
                self.current_model = Demucs(name='hdemucs_mmi', other_metadata=demucs_metadata, device=device)
                model_name = 'hdemucs_mmi (defaulted due to unknown type)'
            
            # Move model to CPU explicitly if it's not already
            if hasattr(self.current_model, 'model') and hasattr(self.current_model.model, 'cpu'):
                self.current_model.model = self.current_model.model.cpu()

            await websocket.send(json.dumps({
                'type': 'status',
                'status': f'Model {model_name} loaded/configured successfully (CPU mode for memory efficiency)'
            }))
            logger.info(f"Model {model_name} loaded successfully on {device}. Type: {type(self.current_model)}")
            
        except Exception as e:
            error_msg = f"Failed to load or configure model '{config_data.get('model', 'N/A')}': {str(e)}"
            logger.error(error_msg, exc_info=True)
            await websocket.send(json.dumps({
                'type': 'error',
                'error': error_msg
            }))
    
   

    async def queue_audio_processing(self, websocket, data_payload):
        """Queue audio data for processing with buffering"""
        if not self.current_model:
            await websocket.send(json.dumps({'type': 'error', 'error': 'No model loaded/configured'}))
            return
        
        audio_data_list = data_payload.get('data')
    
        if not audio_data_list:
            logger.warning(f"No audio data in payload. Data payload keys: {list(data_payload.keys())}")
            await websocket.send(json.dumps({'type': 'error', 'error': 'No audio data in payload'}))
            return

        self.current_sample_rate = data_payload.get('sample_rate', 44100)
        self.current_channels = data_payload.get('channels', 2)

        # Add incoming audio to buffer
        self.audio_buffer.extend(audio_data_list)
        
        # Process when we have enough audio buffered
        if len(self.audio_buffer) >= self.buffer_target_samples * self.current_channels:
            logger.info(f"Buffer full ({len(self.audio_buffer)} samples), processing audio...")
            
            # Extract buffer for processing
            audio_to_process = self.audio_buffer[:self.buffer_target_samples * self.current_channels]
            # Keep remaining samples for next processing cycle
            self.audio_buffer = self.audio_buffer[self.buffer_target_samples * self.current_channels:]
            
            # Queue the buffered audio for processing
            await self.processing_queue.put({
                'websocket': websocket,
                'audio_data': np.array(audio_to_process, dtype=np.float32),
                'timestamp': data_payload.get('timestamp', 0),
                'channels': self.current_channels,
                'sample_rate': self.current_sample_rate
            })
            
            if not self.is_processing:
                asyncio.create_task(self.process_audio_queue())
        else:
            # Not enough data yet, just log progress
            logger.debug(f"Buffering audio: {len(self.audio_buffer)}/{self.buffer_target_samples * self.current_channels} samples")
    
    async def process_audio_queue(self):
        """Process queued audio data"""
        self.is_processing = True
        try:
            while not self.processing_queue.empty():
                item = await self.processing_queue.get()
                await self.separate_audio(item)
        except Exception as e:
            logger.error(f"Error in audio processing queue: {e}", exc_info=True)
        finally:
            self.is_processing = False
    
    async def separate_audio(self, item):
        """Separate audio using the loaded model"""
        try:
            websocket = item['websocket']
            audio_data_flat = item['audio_data'] # This is flat, interleaved from client
            sample_rate = item['sample_rate']
            channels = item['channels']
            
            # De-interleave and reshape if necessary for the model
            # Models usually expect [channels, samples] or [samples, channels]
            # Our client sends flat interleaved [sample1_ch1, sample1_ch2, sample2_ch1, sample2_ch2, ...]
            if channels > 0 and len(audio_data_flat) % channels == 0:
                num_frames = len(audio_data_flat) // channels
                # Reshape to [frames, channels]
                audio_reshaped = audio_data_flat.reshape(num_frames, channels)
                # Transpose to [channels, frames] which is common for PyTorch models
                audio_for_model = audio_reshaped.T
                
                # Ensure it's a proper numpy array with float32 dtype
                audio_for_model = np.asarray(audio_for_model, dtype=np.float32)
            else:
                logger.error(f"Invalid audio data shape or channels. Flat length: {len(audio_data_flat)}, Channels: {channels}")
                await websocket.send(json.dumps({'type': 'error', 'error': 'Invalid audio data for model processing'}))
                return

            loop = asyncio.get_event_loop()
            separated_stems_dict = await loop.run_in_executor(
                None, # Default thread pool
                self.run_separation,
                audio_for_model, # Pass correctly shaped audio
                sample_rate
            )
            
            # Send each stem as a separate message for easier client handling
            for stem_name, stem_audio_np in separated_stems_dict.items():
                # Ensure stem_audio_np is a numpy array
                if hasattr(stem_audio_np, 'cpu'):  # It's a PyTorch tensor
                    stem_audio_np = stem_audio_np.cpu().numpy()
                elif not isinstance(stem_audio_np, np.ndarray):
                    stem_audio_np = np.array(stem_audio_np)
                
                # UVR models might return multi-channel stems. For playback, often mono is fine.
                if stem_audio_np.ndim > 1 and stem_audio_np.shape[0] > 1: # if [channels, samples] and channels > 1
                    # Use numpy mean for numpy arrays
                    stem_mono_np = np.mean(stem_audio_np, axis=0)
                else: # Already mono or [1, samples]
                    stem_mono_np = stem_audio_np.flatten()

                # Normalize audio to [-1, 1] range to prevent clipping on client
                max_val = np.max(np.abs(stem_mono_np))
                if max_val > 1e-5: # Avoid division by zero or tiny numbers
                    stem_mono_normalized_np = stem_mono_np / max_val
                else:
                    stem_mono_normalized_np = stem_mono_np
                
                stem_data_list = stem_mono_normalized_np.tolist()

                await websocket.send(json.dumps({
                    'type': 'separated_audio',
                    'stem': stem_name,
                    'data': stem_data_list, # Send the list of samples
                    'timestamp': item['timestamp'] # Keep original timestamp for potential sync
                }))

        except Exception as e:
            logger.error(f"Error separating audio: {e}", exc_info=True)
            await websocket.send(json.dumps({'type': 'error', 'error': f'Separation failed: {str(e)}'}))
    
    def run_separation(self, audio_input_np, sr):
        """Run the actual separation (blocking operation)"""
        try:
            logger.info(f"Running separation on audio shape: {audio_input_np.shape}, SR: {sr}")
            logger.info(f"Audio input type: {type(audio_input_np)}, dtype: {audio_input_np.dtype}")
            
            # Aggressive memory cleanup before processing
            import gc
            gc.collect()
            
            # Clear any existing caches
            try:
                if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                    torch.mps.empty_cache()
            except (AttributeError, RuntimeError):
                pass
            
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            # Ensure input is numpy array with correct dtype and contiguous memory layout
            if not isinstance(audio_input_np, np.ndarray):
                audio_input_np = np.array(audio_input_np)
            
            if audio_input_np.dtype != np.float32:
                audio_input_np = audio_input_np.astype(np.float32)
            
            if not audio_input_np.flags['C_CONTIGUOUS']:
                audio_input_np = np.ascontiguousarray(audio_input_np)
            
            # Further reduce audio length for memory safety
            max_samples = sr * 1  # Maximum 1 second (was 2)
            if audio_input_np.shape[-1] > max_samples:
                logger.warning(f"Truncating audio from {audio_input_np.shape[-1]} to {max_samples} samples")
                audio_input_np = audio_input_np[..., :max_samples]
            
            logger.info(f"Final audio input shape: {audio_input_np.shape}, dtype: {audio_input_np.dtype}")
            
            # Run separation with explicit CPU mode
            with torch.no_grad():  # Disable gradient computation to save memory
                separated_output = self.current_model.predict(audio_input_np, sampling_rate=sr)
            
            # Aggressive cleanup after processing
            gc.collect()
            try:
                if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                    torch.mps.empty_cache()
            except (AttributeError, RuntimeError):
                pass
            
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            if not isinstance(separated_output, dict):
                logger.error(f"Model prediction did not return a dict. Got: {type(separated_output)}")
                if isinstance(separated_output, (list, tuple)) and all(isinstance(arr, np.ndarray) for arr in separated_output):
                    stems = ['vocals', 'drums', 'bass', 'other']
                    separated_output = {stems[i]: separated_output[i] for i in range(min(len(stems), len(separated_output)))}
                else:
                    raise ValueError("Model output format not recognized as a dictionary of stems.")

            logger.info(f"Separation successful. Got stems: {list(separated_output.keys())}")
            return separated_output
                
        except Exception as e:
            logger.error(f"Model separation error in run_separation: {e}", exc_info=True)
            # Cleanup on error too
            import gc
            gc.collect()
            try:
                if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                    torch.mps.empty_cache()
            except (AttributeError, RuntimeError):
                pass
            
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            raise
    
    def run_http_server(self):
        """Run the HTTP server in a separate thread"""
        self.app.run(host=self.host, port=self.http_port, debug=False) # threaded=True is default for Flask dev server
    
    async def start_servers(self):
        """Start both WebSocket and HTTP servers"""
        http_thread = threading.Thread(target=self.run_http_server, daemon=True)
        http_thread.start()
        logger.info(f"HTTP server started on {self.host}:{self.http_port}")
        
        logger.info(f"Starting WebSocket server on {self.host}:{self.port}")
        async with websockets.serve(self.register_client, self.host, self.port):
            logger.info("Audio Separation Server is running...")
            await asyncio.Future()  # Run forever

def main():
    """Main entry point"""
    server = AudioSeparationServer()
    try:
        asyncio.run(server.start_servers())
    except KeyboardInterrupt:
        logger.info("Server stopped by user.")
    except Exception as e:
        logger.error(f"Server encountered a fatal error: {e}", exc_info=True)

if __name__ == "__main__":
    main()