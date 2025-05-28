// // Injected script that runs in the page context to access Web Audio API
// (function() {
//     'use strict';
    
//     class AudioCaptureManager {
//         constructor() {
//             this.isCapturing = false;
//             this.audioContext = null;
//             this.analyserNode = null;
//             this.sourceNode = null;
//             this.gainNodes = {};
//             this.originalConnect = null;
//             this.separatedBuffers = {};
            
//             this.initializeAudioInterception();
//         }
        
//         initializeAudioInterception() {
//             // Wait for audio context to be created
//             this.interceptAudioContext();
            
//             // Listen for messages from content script
//             window.addEventListener('message', (event) => {
//                 if (event.source !== window) return;
                
//                 switch (event.data.type) {
//                     case 'START_AUDIO_CAPTURE':
//                         this.startCapture();
//                         break;
//                     case 'STOP_AUDIO_CAPTURE':
//                         this.stopCapture();
//                         break;
//                     case 'PLAY_SEPARATED_AUDIO':
//                         this.playSeparatedAudio(event.data.stems);
//                         break;
//                     case 'UPDATE_STEM_VOLUME':
//                         this.updateStemVolume(event.data.stem, event.data.volume);
//                         break;
//                 }
//             });
//         }
        
//         interceptAudioContext() {
//             const originalAudioContext = window.AudioContext || window.webkitAudioContext;
//             const self = this;
            
//             window.AudioContext = window.webkitAudioContext = function(...args) {
//                 const context = new originalAudioContext(...args);
                
//                 // Store reference to audio context
//                 self.audioContext = context;
                
//                 // Intercept connect method to capture audio
//                 if (!self.originalConnect) {
//                     self.originalConnect = AudioNode.prototype.connect;
                    
//                     AudioNode.prototype.connect = function(destination, ...args) {
//                         // Check if connecting to destination (speakers)
//                         if (destination === context.destination) {
//                             // Intercept this connection for our processing
//                             self.interceptAudioOutput(this, destination);
//                         }
                        
//                         return self.originalConnect.apply(this, [destination, ...args]);
//                     };
//                 }
                
//                 // Notify content script that audio context is ready
//                 window.postMessage({
//                     type: 'AUDIO_CONTEXT_READY',
//                     audioContext: {
//                         sampleRate: context.sampleRate,
//                         state: context.state
//                     }
//                 }, '*');
                
//                 return context;
//             };
//         }
        
//         interceptAudioOutput(sourceNode, destination) {
//             if (this.sourceNode) return; // Already intercepted
            
//             this.sourceNode = sourceNode;
            
//             // Create analyser node for capturing audio data
//             this.analyserNode = this.audioContext.createAnalyser();
//             this.analyserNode.fftSize = 2048;
            
//             // Create gain nodes for each stem
//             this.gainNodes = {
//                 vocals: this.audioContext.createGain(),
//                 bass: this.audioContext.createGain(),
//                 drums: this.audioContext.createGain(),
//                 other: this.audioContext.createGain(),
//                 master: this.audioContext.createGain()
//             };
            
//             // Connect: source -> analyser -> master gain -> destination
//             sourceNode.connect(this.analyserNode);
//             this.analyserNode.connect(this.gainNodes.master);
//             this.gainNodes.master.connect(destination);
            
//             console.log('Audio output intercepted successfully');
//         }
        
//         startCapture() {
//             if (!this.audioContext || !this.analyserNode) {
//                 console.error('Audio context not ready for capture');
//                 return;
//             }
            
//             this.isCapturing = true;
//             this.captureAudioData();
//         }
        
//         stopCapture() {
//             this.isCapturing = false;
//         }
        
//         captureAudioData() {
//             if (!this.isCapturing) return;
            
//             const bufferLength = this.analyserNode.frequencyBinCount;
//             const dataArray = new Float32Array(bufferLength);
            
//             this.analyserNode.getFloatTimeDomainData(dataArray);
            
//             // Send audio data to content script
//             window.postMessage({
//                 type: 'AUDIO_DATA',
//                 audioData: dataArray
//             }, '*');
            
//             // Continue capturing
//             requestAnimationFrame(() => this.captureAudioData());
//         }
        
//         playSeparatedAudio(stems) {
//             if (!this.audioContext) return;
            
//             // Create audio buffers from separated stems
//             Object.entries(stems).forEach(([stemName, audioData]) => {
//                 if (!this.gainNodes[stemName]) return;
                
//                 // Convert audio data to AudioBuffer
//                 const audioBuffer = this.audioContext.createBuffer(
//                     2, // stereo
//                     audioData.length,
//                     this.audioContext.sampleRate
//                 );
                
//                 // Fill buffer with audio data
//                 for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
//                     const channelData = audioBuffer.getChannelData(channel);
//                     for (let i = 0; i < audioData.length; i++) {
//                         channelData[i] = audioData[i];
//                     }
//                 }
                
//                 // Create buffer source and play
//                 const bufferSource = this.audioContext.createBufferSource();
//                 bufferSource.buffer = audioBuffer;
//                 bufferSource.connect(this.gainNodes[stemName]);
//                 bufferSource.start();
                
//                 // Store reference for volume control
//                 this.separatedBuffers[stemName] = bufferSource;
//             });
            
//             // Connect all stems to master output (initially muted original)
//             this.gainNodes.master.gain.value = 0; // Mute original
            
//             Object.values(this.gainNodes).forEach(gainNode => {
//                 if (gainNode !== this.gainNodes.master) {
//                     gainNode.connect(this.audioContext.destination);
//                 }
//             });
//         }
        
//         updateStemVolume(stem, volume) {
//             if (this.gainNodes[stem]) {
//                 this.gainNodes[stem].gain.value = volume;
//             }
//         }
//     }
    
//     // Initialize audio capture manager
//     new AudioCaptureManager();
// })();

//-----------------------------------------------------------


// injected-script.js
console.log('Music Separator injected script loaded.');

// This script runs in the context of the web page.
// It can be used to access page-level JavaScript variables or functions
// that are not accessible from the content script's isolated world.

// Example: Exposing a global function (if needed)
// window.myExtensionHelper = {
//   getPlayerData: () => {
//     // Access some global player object from YouTube Music
//     return window.ytmusicplayer || null;
//   }
// };

// For now, it doesn't need to do much.
// The content script will handle audio capture via Web Audio API on the <video> element.