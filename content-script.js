// // Content script for YouTube Music integration
// class YouTubeMusicSeparator {
//     constructor() {
//         this.isActive = false;
//         this.audioContext = null;
//         this.sourceNode = null;
//         this.websocket = null;
//         this.stemNodes = {};
//         this.currentConfig = null;
        
//         this.injectAudioCapture();
//         this.setupMessageListener();
//     }
    
//     injectAudioCapture() {
//         // Inject our audio capture script into the page context
//         const script = document.createElement('script');
//         script.src = chrome.runtime.getURL('injected-script.js');
//         script.onload = function() {
//             this.remove();
//         };
//         (document.head || document.documentElement).appendChild(script);
        
//         // Listen for messages from injected script
//         window.addEventListener('message', (event) => {
//             if (event.source !== window) return;
            
//             if (event.data.type === 'AUDIO_CONTEXT_READY') {
//                 this.handleAudioContextReady(event.data.audioContext);
//             } else if (event.data.type === 'AUDIO_DATA') {
//                 this.handleAudioData(event.data.audioData);
//             }
//         });
//     }
    
//     setupMessageListener() {
//         chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//             switch (message.action) {
//                 case 'startSeparation':
//                     this.startSeparation(message.config);
//                     break;
//                 case 'stopSeparation':
//                     this.stopSeparation();
//                     break;
//                 case 'updateStemVolume':
//                     this.updateStemVolume(message.stem, message.volume);
//                     break;
//             }
            
//             sendResponse({ success: true });
//         });
//     }
    
//     async startSeparation(config) {
//         try {
//             this.currentConfig = config;
//             this.isActive = true;
            
//             // Connect to WebSocket server
//             await this.connectWebSocket(config.serverUrl);
            
//             // Initialize audio processing
//             await this.initializeAudioProcessing();
            
//             // Start audio capture
//             window.postMessage({ type: 'START_AUDIO_CAPTURE' }, '*');
            
//         } catch (error) {
//             console.error('Failed to start separation:', error);
//             this.isActive = false;
//         }
//     }
    
//     async stopSeparation() {
//         this.isActive = false;
        
//         // Stop audio capture
//         window.postMessage({ type: 'STOP_AUDIO_CAPTURE' }, '*');
        
//         // Disconnect WebSocket
//         if (this.websocket) {
//             this.websocket.close();
//             this.websocket = null;
//         }
        
//         // Clean up audio nodes
//         this.cleanupAudioProcessing();
//     }
    
//     async connectWebSocket(serverUrl) {
//         return new Promise((resolve, reject) => {
//             const wsUrl = serverUrl.replace('http://', 'ws://') + '/ws';
//             this.websocket = new WebSocket(wsUrl);
            
//             this.websocket.onopen = () => {
//                 console.log('WebSocket connected');
                
//                 // Send configuration
//                 this.websocket.send(JSON.stringify({
//                     type: 'configure',
//                     config: this.currentConfig
//                 }));
                
//                 resolve();
//             };
            
//             this.websocket.onmessage = (event) => {
//                 const data = JSON.parse(event.data);
//                 this.handleServerMessage(data);
//             };
            
//             this.websocket.onerror = (error) => {
//                 console.error('WebSocket error:', error);
//                 reject(error);
//             };
            
//             this.websocket.onclose = () => {
//                 console.log('WebSocket disconnected');
//                 if (this.isActive) {
//                     // Try to reconnect
//                     setTimeout(() => this.connectWebSocket(serverUrl), 2000);
//                 }
//             };
//         });
//     }
    
//     async initializeAudioProcessing() {
//         // This will be called when we receive the AudioContext from the injected script
//         // For now, we'll set up the stem processing nodes
//         this.stemNodes = {
//             vocals: null,
//             bass: null,
//             drums: null,
//             other: null
//         };
//     }
    
//     handleAudioContextReady(audioContextInfo) {
//         console.log('Audio context ready:', audioContextInfo);
//         // Store audio context information for processing
//     }
    
//     handleAudioData(audioData) {
//         if (!this.isActive || !this.websocket) return;
        
//         // Send audio data to server for separation
//         this.websocket.send(JSON.stringify({
//             type: 'audio_data',
//             data: Array.from(audioData),
//             timestamp: Date.now()
//         }));
//     }
    
//     handleServerMessage(message) {
//         switch (message.type) {
//             case 'separated_audio':
//                 this.playSeparatedAudio(message.stems);
//                 break;
//             case 'error':
//                 console.error('Server error:', message.error);
//                 break;
//             case 'status':
//                 console.log('Server status:', message.status);
//                 break;
//         }
//     }
    
//     playSeparatedAudio(stems) {
//         // Play the separated stems through the Web Audio API
//         window.postMessage({
//             type: 'PLAY_SEPARATED_AUDIO',
//             stems: stems
//         }, '*');
//     }
    
//     updateStemVolume(stem, volume) {
//         window.postMessage({
//             type: 'UPDATE_STEM_VOLUME',
//             stem: stem,
//             volume: volume
//         }, '*');
//     }
    
//     cleanupAudioProcessing() {
//         // Clean up any audio processing nodes
//         this.stemNodes = {};
//     }
// }

// // Initialize when DOM is ready
// if (document.readyState === 'loading') {
//     document.addEventListener('DOMContentLoaded', () => {
//         new YouTubeMusicSeparator();
//     });
// } else {
//     new YouTubeMusicSeparator();
// }

// content-script.js
console.log('Music Separator content script loaded.');

let audioContext = null;
let audioSourceNode = null;
let workletNode = null;
let audioElement = null;
let isSeparationActive = false;

// For playing back separated stems
let separatedVocalsSource = null;
let separatedDrumsSource = null;
let separatedBassSource = null;
let separatedOtherSource = null;

let vocalsGainNode = null;
let drumsGainNode = null;
let bassGainNode = null;
let otherGainNode = null;

const WEBSOCKET_RECONNECT_ATTEMPTS = 5;
let wsReconnectCount = 0;

const BUFFER_SIZE = 4096; // Samples per channel, ensure this matches worklet and server expectations if any
const TARGET_SAMPLE_RATE = 44100; // Most models expect this

function findAudioElement() {
    // YouTube Music typically uses a <video> element for audio playback
    // This selector might need adjustment if YouTube Music changes its structure
    const videoElement = document.querySelector('video.html5-main-video');
    if (videoElement) {
        console.log('Audio element found:', videoElement);
        return videoElement;
    }
    console.warn('Could not find audio element on the page.');
    return null;
}

async function setupAudioProcessing() {
    if (audioContext && audioContext.state !== 'closed') {
        console.log('Audio processing already set up or in progress.');
        return true;
    }

    audioElement = findAudioElement();
    if (!audioElement) {
        chrome.runtime.sendMessage({ type: 'ERROR', message: 'Could not find YouTube Music audio player.' });
        return false;
    }
    
    // Mute the original YouTube Music player if we are going to play separated stems
    // audioElement.muted = true; // Do this only when we are ready to play separated stems

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: TARGET_SAMPLE_RATE // Request specific sample rate
        });
        
        console.log('AudioContext created. Sample rate:', audioContext.sampleRate);
        if (audioContext.sampleRate !== TARGET_SAMPLE_RATE) {
            console.warn(`Requested ${TARGET_SAMPLE_RATE}Hz but got ${audioContext.sampleRate}Hz. Resampling might be needed or models might not perform optimally.`);
            // We'll proceed, but the server might need to handle resampling or we add a client-side resampler.
        }

        audioSourceNode = audioContext.createMediaElementSource(audioElement);
        
        // Load the AudioWorklet
        // The path is relative to the extension's root, as defined in web_accessible_resources
        const workletURL = chrome.runtime.getURL('audio-processor.js');
        await audioContext.audioWorklet.addModule(workletURL);
        console.log('AudioWorklet module added.');

        workletNode = new AudioWorkletNode(audioContext, 'audio-chunk-processor', {
            processorOptions: {
                bufferSize: BUFFER_SIZE, // Size of buffer in the worklet per channel
                channelCount: audioSourceNode.channelCount || 2 // Get channel count from source
            }
        });
        console.log('AudioChunkProcessor worklet node created.');

        workletNode.port.onmessage = (event) => {
            if (event.data.type === 'AUDIO_CHUNK') {
                // console.log('Audio chunk received from worklet:', event.data.audioData.length);
                // Send to background script
                chrome.runtime.sendMessage({
                    type: 'AUDIO_DATA',
                    data: { // Send as an object to be JSON stringified by background.js if needed
                        type: 'audio_data', // Message type for the backend server
                        audio_format: 'float32_interleaved',
                        sample_rate: audioContext.sampleRate,
                        channels: audioSourceNode.channelCount || 2,
                        data: Array.from(event.data.audioData) // Convert Float32Array to plain array for JSON
                    }
                }).catch(err => console.error("Error sending audio chunk to background:", err));
            }
        };
        
        audioSourceNode.connect(workletNode);
        // Do NOT connect workletNode to audioContext.destination if you only want to capture
        // If you want to hear original audio while capturing (before separation playback starts):
        // workletNode.connect(audioContext.destination); 
        // However, for separation, we usually mute original and play back stems.

        // Setup gain nodes for separated stem playback
        vocalsGainNode = audioContext.createGain();
        drumsGainNode = audioContext.createGain();
        bassGainNode = audioContext.createGain();
        otherGainNode = audioContext.createGain();

        vocalsGainNode.connect(audioContext.destination);
        drumsGainNode.connect(audioContext.destination);
        bassGainNode.connect(audioContext.destination);
        otherGainNode.connect(audioContext.destination);

        console.log('Audio processing setup complete.');
        return true;

    } catch (error) {
        console.error('Error setting up Web Audio API:', error);
        chrome.runtime.sendMessage({ type: 'ERROR', message: `Web Audio API setup failed: ${error.message}` });
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
        }
        audioContext = null;
        return false;
    }
}

function playSeparatedStem(stemName, audioBufferArray) {
    if (!audioContext || audioContext.state === 'closed' || !audioBufferArray) return;

    const buffer = audioContext.createBuffer(
        1, // Number of channels (assuming mono stems for now)
        audioBufferArray.length,
        audioContext.sampleRate
    );
    buffer.copyToChannel(Float32Array.from(audioBufferArray), 0);

    const sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = buffer;

    let gainNode;
    if (stemName === 'vocals') {
        if (separatedVocalsSource) separatedVocalsSource.stop();
        separatedVocalsSource = sourceNode;
        gainNode = vocalsGainNode;
    } else if (stemName === 'drums') {
        if (separatedDrumsSource) separatedDrumsSource.stop();
        separatedDrumsSource = sourceNode;
        gainNode = drumsGainNode;
    } else if (stemName === 'bass') {
        if (separatedBassSource) separatedBassSource.stop();
        separatedBassSource = sourceNode;
        gainNode = bassGainNode;
    } else if (stemName === 'other') {
        if (separatedOtherSource) separatedOtherSource.stop();
        separatedOtherSource = sourceNode;
        gainNode = otherGainNode;
    }

    if (gainNode) {
        sourceNode.connect(gainNode);
        sourceNode.start();
    } else {
        console.warn(`No gain node for stem: ${stemName}`);
    }
}


async function startSeparation(config) {
    if (isSeparationActive) {
        console.log('Separation already active.');
        return { status: 'Separation already active.' };
    }
    console.log('Attempting to start separation...');
    const setupSuccess = await setupAudioProcessing();
    if (!setupSuccess) {
        return { error: 'Failed to setup audio processing.' };
    }

    // Ensure WebSocket connection is initiated from background
    await chrome.runtime.sendMessage({ type: 'INITIATE_CONNECTION' });
    
    // Configure model on backend
    // If config from popup contains modelConfig, use it, otherwise default to hdemucs_mmi
    const modelConfig = config?.modelConfig || { model: 'hdemucs_mmi', realTime: true };
    await chrome.runtime.sendMessage({ type: 'CONFIGURE_MODEL', config: modelConfig });

    if (audioElement) audioElement.muted = true; // Mute original audio
    if (workletNode) workletNode.connect(audioContext.destination); // This line is tricky. If the worklet passes audio through, this makes sense. If not, it shouldn't be connected. Our current worklet just buffers and sends.

    isSeparationActive = true;
    console.log('Separation started.');
    return { status: 'Separation started.' };
}

function stopSeparation() {
    if (!isSeparationActive) {
        console.log('Separation not active.');
        return { status: 'Separation not active.' };
    }
    console.log('Stopping separation...');
    if (audioSourceNode) audioSourceNode.disconnect();
    if (workletNode) {
        workletNode.disconnect();
        // workletNode.port.postMessage({ type: 'RESET_BUFFER' }); // Reset buffer in worklet
    }
    // Don't close audioContext immediately if we want to play out remaining buffered separated audio
    // if (audioContext && audioContext.state !== 'closed') {
    //     audioContext.close().then(() => audioContext = null);
    // }
    
    if (audioElement) audioElement.muted = false; // Unmute original audio

    // Stop any playing separated stems
    if (separatedVocalsSource) separatedVocalsSource.stop();
    if (separatedDrumsSource) separatedDrumsSource.stop();
    if (separatedBassSource) separatedBassSource.stop();
    if (separatedOtherSource) separatedOtherSource.stop();
    separatedVocalsSource = null;
    // etc.

    isSeparationActive = false;
    chrome.runtime.sendMessage({ type: 'STOP_WEBSOCKET' }); // Tell background to close WS
    console.log('Separation stopped.');
    return { status: 'Separation stopped.' };
}

function setStemVolume(stemName, volume) { // volume is 0.0 to 1.0
    console.log(`Setting volume for ${stemName} to ${volume}`);
    if (!audioContext || audioContext.state === 'closed') return;
    
    let gainNode;
    if (stemName === 'vocals') gainNode = vocalsGainNode;
    else if (stemName === 'drums') gainNode = drumsGainNode;
    else if (stemName === 'bass') gainNode = bassGainNode;
    else if (stemName === 'other') gainNode = otherGainNode;

    if (gainNode) {
        gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    }
}

// Listen for messages from the background script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message);

    if (message.type === 'START_SEPARATION') {
        // message.config now contains stemVolumes and modelConfig
        startSeparation(message.config) 
            .then(sendResponse)
            .catch(err => {
                console.error("Error in startSeparation:", err);
                sendResponse({ error: err.message || 'Failed to start separation' });
            });
        return true; // Indicates an async response
    } else if (message.type === 'STOP_SEPARATION') {
        sendResponse(stopSeparation());
        // No return true needed as stopSeparation is synchronous
    } else if (message.type === 'SET_STEM_VOLUME') {
        setStemVolume(message.stem, message.volume);
        sendResponse({ status: `Volume set for ${message.stem}` });
    } else if (message.type === 'separated_audio') {
        // This is where we receive processed audio from the backend (via background.js)
        console.log('Received separated audio:', message.stem, /*message.data?.length*/); // Avoid error if data is missing
        playSeparatedStem(message.stem, message.data);
        sendResponse({status: "Stem received by content script"});
    } else if (message.type === 'WEBSOCKET_STATUS') {
        console.log('WebSocket status update from background:', message.status, message.error || '');
        if (message.status === 'error' || message.status === 'disconnected') {
            if (wsReconnectCount < WEBSOCKET_RECONNECT_ATTEMPTS && isSeparationActive) {
                console.log('Attempting to reconnect WebSocket...');
                wsReconnectCount++;
                setTimeout(() => {
                     // Tab ID is usually not needed when content script messages background.
                     // Background script can get tab ID from 'sender.tab.id'.
                     chrome.runtime.sendMessage({ type: 'INITIATE_CONNECTION' }); 
                }, 2000 * wsReconnectCount); 
            } else if (isSeparationActive) {
                console.error('Failed to reconnect WebSocket after multiple attempts. Stopping separation.');
                stopSeparation(); 
            }
        } else if (message.status === 'connected') {
            wsReconnectCount = 0; 
        }
        sendResponse({status: "WebSocket status noted by content script"});
    } else if (message.type === 'status' && message.status) { // Status from server
        console.log("Server status/message:", message.status);
        sendResponse({status: "Server status noted by content script"});
    } else if (message.type === 'error' && message.error) { // Error from server (forwarded by background)
        console.error("Server error from backend:", message.error);
        if (message.error.includes('No model loaded/configured') && isSeparationActive) {
            console.log("Backend reports no model is loaded. Stopping separation in content script.");
            stopSeparation(); // Reset content script state
        }
        // The popup will also receive this error from background.js and update its own UI.
        sendResponse({status: "Server error noted by content script"});
    }
    // For synchronous listeners or if sendResponse is called, returning false or nothing is fine.
    // Return true only if sendResponse will be called asynchronously.
    return false; // Default for synchronous message handlers
});

// Optionally, let background script know this content script is ready,
// especially if auto-starting separation or if popup always expects connection.
// chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', tabId: null /*chrome will fill this*/ });
// However, for on-demand start from popup, this might not be needed until START_SEPARATION.

console.log('Music Separator content script fully initialized.');