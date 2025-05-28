document.addEventListener('DOMContentLoaded', () => {
    const serverStatusDiv = document.getElementById('server-status');
    const toggleButton = document.getElementById('toggle-separation');
    const stemControlsDiv = document.getElementById('stem-controls');
    const stemVolumeSliders = {
        vocals: document.getElementById('vocals-volume'),
        drums: document.getElementById('drums-volume'),
        bass: document.getElementById('bass-volume'),
        other: document.getElementById('other-volume')
    };
    const stemValueDisplays = {
        vocals: document.getElementById('vocals-value'),
        drums: document.getElementById('drums-value'),
        bass: document.getElementById('bass-value'),
        other: document.getElementById('other-value')
    };

    const HTTP_SERVER_URL = 'http://localhost:8766'; // Correct port for Flask HTTP server
    let isSeparating = false;
    let currentTabId = null;

    // Get current tab ID
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            currentTabId = tabs[0].id;
        }
    });

    async function checkServerStatus() {
        try {
            // --- THIS IS THE FIX ---
            // The health check endpoint is on the HTTP server (port 8766)
            const response = await fetch(`${HTTP_SERVER_URL}/health`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (data.status === 'healthy') {
                serverStatusDiv.textContent = 'Server: Healthy';
                serverStatusDiv.className = 'status healthy';
                toggleButton.disabled = false;
            } else {
                serverStatusDiv.textContent = `Server: Unhealthy (${data.status})`;
                serverStatusDiv.className = 'status unhealthy';
                toggleButton.disabled = true;
            }
        } catch (error) {
            console.error('Error checking server status:', error);
            serverStatusDiv.textContent = 'Server: Error connecting (Is it running?)';
            serverStatusDiv.className = 'status unhealthy';
            toggleButton.disabled = true;
        }
    }

    toggleButton.addEventListener('click', async () => {
        if (!currentTabId) {
            serverStatusDiv.textContent = 'Error: Could not get active tab.';
            serverStatusDiv.className = 'status unhealthy';
            return;
        }

        isSeparating = !isSeparating;
        toggleButton.textContent = isSeparating ? 'Stop Separation' : 'Start Separation';
        stemControlsDiv.style.display = isSeparating ? 'block' : 'none';

        // Send message to content script to start/stop
        try {
            // Prepare the full config including modelConfig
            let messageConfig = {};
            if (isSeparating) {
                messageConfig = {
                    stemVolumes: getCurrentStemVolumes(), // Renamed for clarity
                    modelConfig: { model: 'hdemucs_mmi', realTime: true } // Add model config here
                };
            }

            const response = await chrome.tabs.sendMessage(currentTabId, {
                type: isSeparating ? 'START_SEPARATION' : 'STOP_SEPARATION',
                config: messageConfig 
            });
            console.log('Message sent to content script, response:', response);
            if (response && response.status) {
                 serverStatusDiv.textContent = `Status: ${response.status}`;
            }
        } catch (error) {
            console.error('Error sending message to content script:', error);
            serverStatusDiv.textContent = 'Error communicating with page. Refresh YouTube Music?';
            serverStatusDiv.className = 'status unhealthy';
            // Revert state if communication failed
            isSeparating = !isSeparating;
            toggleButton.textContent = isSeparating ? 'Stop Separation' : 'Start Separation';
            stemControlsDiv.style.display = isSeparating ? 'block' : 'none';
        }
    });

    Object.keys(stemVolumeSliders).forEach(stemName => {
        const slider = stemVolumeSliders[stemName];
        const display = stemValueDisplays[stemName];
        if (slider && display) {
            slider.addEventListener('input', (event) => {
                const volume = event.target.value;
                display.textContent = volume;
                if (isSeparating && currentTabId) {
                    chrome.tabs.sendMessage(currentTabId, {
                        type: 'SET_STEM_VOLUME',
                        stem: stemName,
                        volume: parseInt(volume, 10) / 100 // Send as 0.0 - 1.0
                    }).catch(err => console.error('Error setting stem volume:', err));
                }
            });
        }
    });

    function getCurrentStemVolumes() { 
        const volumes = {};
        Object.keys(stemVolumeSliders).forEach(stemName => {
            if(stemVolumeSliders[stemName]) {
                volumes[stemName] = parseInt(stemVolumeSliders[stemName].value, 10) / 100;
            }
        });
        return volumes;
    }

    // Initial check
    checkServerStatus();

    // Listen for messages from the background script (e.g., server errors, status updates)
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log("Popup received message from background:", message);
        if (message.type === 'error') {
            serverStatusDiv.textContent = `Server Error: ${message.error}`;
            serverStatusDiv.className = 'status unhealthy';
            // If the error indicates a critical failure, reset UI
            if (message.error.includes("No model loaded") || 
                message.error.includes("Failed to load or configure model") ||
                message.error.includes("WebSocket connection error")) {
                
                isSeparating = false;
                toggleButton.textContent = 'Start Separation';
                stemControlsDiv.style.display = 'none';
                // Consider disabling the button if the server/model is fundamentally broken
                // toggleButton.disabled = true; 
            }
            // It's good practice to call sendResponse if the listener might be the last one.
            // However, for runtime messages to popup, it's often not strictly needed if no reply is expected by sender.
            // sendResponse({status: "Popup noted server error"}); 
        } else if (message.type === 'status') {
            serverStatusDiv.textContent = `Server: ${message.status}`;
            if (message.status.includes("successfully")) {
                 serverStatusDiv.className = 'status healthy';
            } else if (message.status.includes("Failed") || message.status.includes("failed")) { // Broader check
                 serverStatusDiv.className = 'status unhealthy';
            }
            // sendResponse({status: "Popup noted server status"});
        } else if (message.type === 'WEBSOCKET_STATUS') {
            console.log("Popup received WebSocket status:", message.status);
            if (message.status === 'connected') {
                // If server status was previously error, re-check, as WS is now up.
                if (serverStatusDiv.className.includes('unhealthy')) {
                    checkServerStatus(); 
                } else {
                    serverStatusDiv.textContent = 'Server: Connected';
                    serverStatusDiv.className = 'status healthy';
                }
                toggleButton.disabled = false;
            } else if (message.status === 'error' || message.status === 'disconnected') {
                serverStatusDiv.textContent = `Server: WebSocket ${message.status}. ${message.error || ''}`;
                serverStatusDiv.className = 'status unhealthy';
                isSeparating = false;
                toggleButton.textContent = 'Start Separation';
                stemControlsDiv.style.display = 'none';
                toggleButton.disabled = true; // Disable if WS is down or errored
            }
            // sendResponse({status: "Popup noted WebSocket status"});
        }
        // Return true if you intend to use sendResponse asynchronously. Not needed here.
    });
});