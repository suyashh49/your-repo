"""
Local server for real-time audio separation using Hance API
Optimized for low-latency stem separation
"""

import asyncio
import json
import logging
import numpy as np
import websockets
from flask import Flask, request, jsonify
from flask_cors import CORS
import threading
import sys
import os
from pathlib import Path

# Import Hance API
try:
    import hance
except ImportError:
    print("Hance API not installed. Installing...")
    os.system("pip install hance")
    import hance

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class HanceAudioSeparationServer:
    def __init__(self, host='localhost', port=8765, http_port=8766):
        self.host = host
        self.port = port
        self.http_port = http_port
        self.clients = set()
        self.hance_engine = None
        self.processor = None
        self.model_config = {'model': 'music-stem-separation-70ms-large.hance'}
        self.processing_queue = asyncio.Queue()
        self.is_processing = False

        # Hance is designed for real-time, so smaller buffers work better
        self.audio_buffer = []
        self.buffer_target_samples = 44100 * 0.1  # 100ms buffer (very small for real-time)
        self.current_sample_rate = 44100
        self.current_channels = 2
        
        # Available models mapping
        self.hance_models = {
            'stem_separation': 'stem_separation-44.1kHz-209ms.hance',
            'music_stem_large': 'music-stem-separation-44.1kHz-209ms-large.hance',
            'music_stem_fast': 'music-stem-separation-70ms-large.hance'
        }
        
        self.app = Flask(__name__)
        CORS(self.app)
        self.setup_http_routes()
        
    def setup_http_routes(self):
        @self.app.route('/health', methods=['GET'])
        def health_check():
            return jsonify({
                'status': 'healthy',
                'processor_loaded': self.processor is not None,
                'clients_connected': len(self.clients)
            })
        
        @self.app.route('/models', methods=['GET'])
        def list_models_route():
            try:
                # List available Hance models
                available_models = []
                models_dir = Path(__file__).parent.parent / "hance-api" / "Models"
                
                for model_file in models_dir.glob("*.hance"):
                    if "stem" in model_file.name.lower():
                        available_models.append(str(model_file))
                
                return jsonify({
                    'hance_models': available_models,
                    'default_models': self.hance_models
                })
            except Exception as e:
                return jsonify({'error': str(e)}), 500
    
    async def register_client(self, websocket, path="/"):
        """Register a new WebSocket client"""
        self.clients.add(websocket)
        logger.info(f"Client connected from path: '{path}'. Total clients: {len(self.clients)}")
        
        try:
            await self.handle_client(websocket)
        finally:
            if websocket in self.clients:
                self.clients.remove(websocket)
                logger.info(f"Client disconnected. Total clients: {len(self.clients)}")

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
        
        if message_type == 'configure':
            await self.configure_model(websocket, data.get('config', {}))
        elif message_type == 'audio_data':
            await self.queue_audio_processing(websocket, data)
        else:
            logger.warning(f"Unknown message type received: {message_type}")
            await websocket.send(json.dumps({
                'type': 'error',
                'error': f'Unknown message type: {message_type}'
            }))
    
    async def configure_model(self, websocket, config_data):
        """Configure the Hance separation model"""
        try:
            model_name = config_data.get('model', 'music_stem_fast')

            # Add UVR compatibility mapping
            uvr_to_hance = {
                'hdemucs_mmi': 'music_stem_fast',  # Map UVR model to Hance model
                'htdemucs': 'music_stem_fast',
                'htdemucs_ft': 'music_stem_fast',
                'mdx_extra': 'music_stem_large',
                'mdx': 'music_stem_large'
            }            

            # If the requested model is a UVR model, map it to a Hance model
            if model_name in uvr_to_hance:
                original_model = model_name
                model_name = uvr_to_hance[model_name]
                logger.info(f"Converting UVR model name '{original_model}' to Hance model '{model_name}'")
            
            # Get model path
            if model_name in self.hance_models:
                model_file = self.hance_models[model_name]
            else:
                model_file = model_name  # Assume it's a direct path or filename
            
            # Find the full path to the model
            models_dir = Path(__file__).parent.parent / "hance-api" / "Models"
            possible_paths = [
                models_dir / model_file,                 # Direct path
                models_dir / (model_file + ".hance"),    # Add extension if missing
                Path(model_file)                         # Absolute path provided
            ]

            model_path = None
            for path in possible_paths:
                if path.exists():
                    model_path = path
                    break

            if not model_path:
                available_models = [f.name for f in models_dir.glob("*.hance")]
                raise FileNotFoundError(
                    f"Model file not found: {model_file}. Available models: {available_models}"
                )
            
            logger.info(f"Loading Hance model: {model_path}")
            
            # Initialize Hance engine
            self.hance_engine = hance.HanceEngine()
            
            # Create processor with appropriate settings
            self.processor = self.hance_engine.create_processor(
                str(model_path),
                self.current_channels,
                self.current_sample_rate
            )
            
            # Get output bus information
            num_buses = self.processor.get_number_of_output_buses()
            bus_names = []
            for i in range(num_buses):
                bus_names.append(self.processor.get_output_bus_name(i))
            
            # Configure buses for stem separation
            for i in range(num_buses):
                self.processor.set_output_bus_sensitivity(i, 0.0)  # Default sensitivity
                self.processor.set_output_bus_volume(i, 1.0)      # Full volume for all stems
            
            logger.info(f"Model loaded successfully. Output buses: {bus_names}")
            
            await websocket.send(json.dumps({
                'type': 'status',
                'status': f'Hance model {model_file} loaded successfully',
                'buses': bus_names,
                'latency': '70-209ms (real-time optimized)'
            }))
            
        except Exception as e:
            error_msg = f"Failed to load Hance model '{config_data.get('model', 'N/A')}': {str(e)}"
            logger.error(error_msg, exc_info=True)
            await websocket.send(json.dumps({
                'type': 'error',
                'error': error_msg
            }))
    
    async def queue_audio_processing(self, websocket, data_payload):
        """Queue audio data for processing with minimal buffering"""
        if not self.processor:
            await websocket.send(json.dumps({'type': 'error', 'error': 'No Hance processor loaded'}))
            return
        
        audio_data_list = data_payload.get('data')
        
        if not audio_data_list:
            logger.warning(f"No audio data in payload")
            await websocket.send(json.dumps({'type': 'error', 'error': 'No audio data in payload'}))
            return

        self.current_sample_rate = data_payload.get('sample_rate', 44100)
        self.current_channels = data_payload.get('channels', 2)

        # Add incoming audio to buffer
        self.audio_buffer.extend(audio_data_list)
        
        # Hance can process much smaller chunks efficiently
        if len(self.audio_buffer) >= self.buffer_target_samples * self.current_channels:
            # Extract buffer for processing
            audio_to_process = self.audio_buffer[:int(self.buffer_target_samples * self.current_channels)]
            # Keep remaining samples for next processing cycle
            self.audio_buffer = self.audio_buffer[int(self.buffer_target_samples * self.current_channels):]
            
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
        """Separate audio using Hance processor"""
        try:
            websocket = item['websocket']
            audio_data_flat = item['audio_data']
            sample_rate = item['sample_rate']
            channels = item['channels']
            
            # Reshape audio for Hance processor
            if channels > 0 and len(audio_data_flat) % channels == 0:
                num_frames = len(audio_data_flat) // channels
                # Reshape to [frames, channels] format expected by Hance
                audio_reshaped = audio_data_flat.reshape(num_frames, channels)
                
                # Ensure correct dtype
                audio_for_hance = np.asarray(audio_reshaped, dtype=np.float32)
            else:
                logger.error(f"Invalid audio data shape. Flat length: {len(audio_data_flat)}, Channels: {channels}")
                await websocket.send(json.dumps({'type': 'error', 'error': 'Invalid audio data'}))
                return

            # Process with Hance (this is much faster than UVR)
            loop = asyncio.get_event_loop()
            separated_stems = await loop.run_in_executor(
                None,
                self.run_hance_separation,
                audio_for_hance
            )
            
            # Send separated stems to client
            for stem_name, stem_audio in separated_stems.items():
                # Normalize audio to prevent clipping
                max_val = np.max(np.abs(stem_audio))
                if max_val > 1e-5:
                    stem_normalized = stem_audio / max_val
                else:
                    stem_normalized = stem_audio
                
                # Convert to mono for playback if stereo
                if stem_normalized.ndim > 1 and stem_normalized.shape[1] > 1:
                    stem_mono = np.mean(stem_normalized, axis=1)
                else:
                    stem_mono = stem_normalized.flatten()
                
                await websocket.send(json.dumps({
                    'type': 'separated_audio',
                    'stem': stem_name,
                    'data': stem_mono.tolist(),
                    'timestamp': item['timestamp']
                }))

        except Exception as e:
            logger.error(f"Error separating audio with Hance: {e}", exc_info=True)
            await websocket.send(json.dumps({'type': 'error', 'error': f'Hance separation failed: {str(e)}'}))
    
    def ensure_same_length(self, a, b):
        """Ensure two arrays have the same length by truncating the longer one."""
        if len(a) == len(b):
            return a, b
        
        min_len = min(len(a), len(b))
        return a[:min_len], b[:min_len]

    def run_hance_separation(self, audio_input):
        """Run Hance separation (much faster and more efficient than UVR)"""
        try:
            logger.info(f"Running Hance separation on audio shape: {audio_input.shape}")

            mix_audio = np.mean(audio_input, axis=1) if audio_input.ndim > 1 else audio_input
            
            # Process audio with Hance - this returns the processed audio directly
            processed_audio = self.processor.process(audio_input)
            
            # Get number of output buses and their names
            num_buses = self.processor.get_number_of_output_buses()
            bus_names = []

            for i in range(num_buses):
                bus_names.append(f"Available Hance output buses: {bus_names}")
            
            logger.info(f"Available Hance output buses: {bus_names}")
            # Create stems dictionary
            stems = {}
            
            # Typically, stem separation models have multiple output buses
            # Let's map them to common stem names
            has_vocals = any('vocal' in name for name in bus_names)
            
            if has_vocals:
                        # Case 1: Model directly provides vocals output
                        for i in range(min(num_buses, processed_audio.shape[1])):
                            bus_name = self.processor.get_output_bus_name(i).lower()
                            if 'vocal' in bus_name:
                                stems['vocals'] = processed_audio[:, i]
                                break
                        
                        # Create instrumental from original minus vocals
                        if 'vocals' in stems:
                            
                            
                            # Create instrumental as original minus vocals
                            instrumental = mix_audio - stems['vocals'] * 0.8  # Scaled to avoid artifacts
                            
                            # Normalize 
                            max_val = np.max(np.abs(instrumental))
                            if max_val > 1e-5:
                                instrumental = instrumental / max_val * 0.9
                                
                            stems['instrumental'] = instrumental
            else:
                # Case 2: Model provides instrumental components (bass, drums, etc.)
                # Combine all stems as instrumental
                instrumental_components = []
                
                for i in range(min(num_buses, processed_audio.shape[1])):
                    bus_name = self.processor.get_output_bus_name(i).lower()
                    instrumental_components.append(processed_audio[:, i])
                
                if instrumental_components:
                    # Mix all components
                    instrumental = np.zeros_like(instrumental_components[0])
                    for component in instrumental_components:
                        instrumental += component
                    
                    # Normalize
                    max_val = np.max(np.abs(instrumental))
                    if max_val > 1e-5:
                        instrumental = instrumental / max_val * 0.9
                    
                    stems['instrumental'] = instrumental
                    
                    # Create vocals as original minus instrumental
                    mix_audio_matched, instrumental_matched = self.ensure_same_length(mix_audio, stems['instrumental'])
                    vocals = mix_audio_matched - instrumental_matched * 0.8
                    
                    # Normalize
                    max_val = np.max(np.abs(vocals))
                    if max_val > 1e-5:
                        vocals = vocals / max_val * 0.9
                        
                    stems['vocals'] = vocals
                else:
                    # Fallback if no stems produced
                    logger.warning("No stems produced by Hance model, using default values")
                    stems['vocals'] = np.zeros(audio_input.shape[0])
                    stems['instrumental'] = np.mean(audio_input, axis=1) if audio_input.ndim > 1 else audio_input
            
            # Ensure both vocals and instrumental stems exist
            if 'vocals' not in stems:
                stems['vocals'] = np.zeros(processed_audio.shape[0])
            if 'instrumental' not in stems:
                stems['instrumental'] = np.zeros(processed_audio.shape[0])
                
            # For backward compatibility with extension expecting 4 stems
            # Map the instrumental output to bass, drums, and other stems too
            stems['bass'] = stems['instrumental'] * 0.7
            stems['drums'] = stems['instrumental'] * 0.8
            stems['other'] = stems['instrumental'] * 0.9
                    
            logger.info(f"Hance separation successful. Generated stems: {list(stems.keys())}")
            return stems
                
        except Exception as e:
            logger.error(f"Hance separation error: {e}", exc_info=True)
            raise
    
    def run_http_server(self):
        """Run the HTTP server"""
        self.app.run(host=self.host, port=self.http_port)
    
    async def start_servers(self):
        """Start both HTTP and WebSocket servers"""
        # Start HTTP server in a separate thread
        http_thread = threading.Thread(target=self.run_http_server, daemon=True)
        http_thread.start()
        
        logger.info(f"Starting Hance separation server on {self.host}:{self.port}")
        logger.info(f"HTTP server running on {self.host}:{self.http_port}")
        
        # Start WebSocket server
        ws_server = await websockets.serve(
            self.register_client,
            self.host,
            self.port
        )

        await ws_server.wait_closed()

def main():
    """Main function to start the Hance server"""
    server = HanceAudioSeparationServer()
    
    try:
        asyncio.run(server.start_servers())
    except KeyboardInterrupt:
        logger.info("Hance server stopped by user")
    except Exception as e:
        logger.error(f"Hance server error: {e}", exc_info=True)

if __name__ == "__main__":
    main()