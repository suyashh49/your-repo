
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
            const response = await chrome.tabs.sendMessage(currentTabId, {
                type: isSeparating ? 'START_SEPARATION' : 'STOP_SEPARATION',
                config: isSeparating ? getCurrentStemConfig() : {}
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

    function getCurrentStemConfig() {
        const config = {};
        Object.keys(stemVolumeSliders).forEach(stemName => {
            if(stemVolumeSliders[stemName]) {
                config[stemName] = parseInt(stemVolumeSliders[stemName].value, 10) / 100;
            }
        });
        return config;
    }

    // Initial check
    checkServerStatus();
});