// audio-processor.js

class AudioChunkProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        // options.processorOptions.bufferSize (e.g., 4096)
        // options.processorOptions.channelCount (e.g., 2 for stereo)
        this.bufferSize = options.processorOptions?.bufferSize || 4096;
        this.channelCount = options.processorOptions?.channelCount || 2; // Assuming stereo input
        
        this._bytesWritten = 0;
        this._buffer = new Float32Array(this.bufferSize * this.channelCount); // For interleaving
        this.initBuffer();

        this.port.onmessage = (event) => {
            if (event.data.type === 'RESET_BUFFER') {
                this.initBuffer();
            }
        };
    }

    initBuffer() {
        this._bytesWritten = 0;
        // No need to clear the buffer if we always overwrite or manage _bytesWritten correctly
    }

    // data is an array of Float32Arrays (one for each input channel)
    // e.g., data[0] is left channel, data[1] is right channel for stereo
    process(inputs, outputs, parameters) {
        // We expect one input, and that input to be stereo (or mono, adaptable)
        const input = inputs[0]; 

        if (!input || input.length === 0) {
            // No input, or input is silent
            return true; // Keep processor alive
        }
        
        // For simplicity, let's assume stereo input and interleave it.
        // The backend server.py expects a flat Float32Array for a Demucs model (num_frames x num_channels)
        // but for sending over WebSocket, we might send interleaved or a JSON structure.
        // The Python UVR API likely wants non-interleaved [channels, samples] or [samples, channels]
        // Let's send interleaved Float32Array for now for simplicity in JS processing.
        // The server will need to de-interleave it if its model expects separate channels.

        const frameCount = input[0].length; // Number of samples in this block for one channel

        for (let i = 0; i < frameCount; i++) {
            for (let channel = 0; channel < this.channelCount; channel++) {
                if (input[channel]) { // Check if channel exists
                    this._buffer[this._bytesWritten++] = input[channel][i];
                } else if (this.channelCount === 1 && input[0]) { // Mono source, duplicate to fill stereo buffer if needed
                     this._buffer[this._bytesWritten++] = input[0][i]; // Left
                     // this._buffer[this._bytesWritten++] = input[0][i]; // Right (duplicate for stereo) - if server expects stereo
                }
            }

            if (this._bytesWritten >= this.bufferSize * this.channelCount) {
                // Buffer is full, send it
                this.port.postMessage({
                    type: 'AUDIO_CHUNK',
                    audioData: this._buffer.slice(0, this._bytesWritten) // Send a copy
                });
                this.initBuffer(); // Reset for next chunk
            }
        }
        return true; // Keep processor alive
    }
}

registerProcessor('audio-chunk-processor', AudioChunkProcessor);