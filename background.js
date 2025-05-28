// background.js

const WEBSOCKET_URL = 'ws://localhost:8765';
let websocket = null;
let connectedTabId = null; // Tab ID that initiated the connection/separation
let isConnecting = false; // Prevent multiple connection attempts simultaneously
let pendingConfigureMessage = null; // To store config if CONFIGURE_MODEL arrives early

function ensureWebSocketConnection() {
    return new Promise((resolve, reject) => {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            console.log('WebSocket already open.');
            resolve(websocket);
            return;
        }

        if (isConnecting) {
            console.log("WebSocket connection attempt already in progress. Waiting...");
            // Simple polling check for the connection to complete
            let attempts = 0;
            const intervalId = setInterval(() => {
                attempts++;
                if (websocket && websocket.readyState === WebSocket.OPEN) {
                    clearInterval(intervalId);
                    console.log("Previously in-progress connection is now open.");
                    resolve(websocket);
                } else if (!isConnecting || attempts > 10) { // Stop if no longer connecting or timed out
                    clearInterval(intervalId);
                    reject(new Error("Connection attempt in progress timed out or stopped."));
                }
            }, 500);
            return;
        }

        isConnecting = true;
        console.log("Attempting new WebSocket connection...");

        if (websocket) { // Clean up any old instance
            websocket.onopen = null;
            websocket.onmessage = null;
            websocket.onerror = null;
            websocket.onclose = null;
            if (websocket.readyState !== WebSocket.CLOSED) {
                try { websocket.close(); } catch (e) { /*ignore*/ }
            }
        }

        websocket = new WebSocket(WEBSOCKET_URL);

        websocket.onopen = () => {
            isConnecting = false;
            console.log('WebSocket connection established (onopen).');
            if (connectedTabId) {
                chrome.tabs.sendMessage(connectedTabId, { type: 'WEBSOCKET_STATUS', status: 'connected' })
                    .catch(err => console.warn("Could not send WS connected status to tab:", err));
            }
            
            if (pendingConfigureMessage) {
                console.log("Sending pending CONFIGURE_MODEL message:", pendingConfigureMessage);
                if (websocket && websocket.readyState === WebSocket.OPEN) {
                    websocket.send(JSON.stringify(pendingConfigureMessage));
                    pendingConfigureMessage = null; 
                } else {
                    console.error("Tried to send pending config, but WS is not open.");
                }
            }
            resolve(websocket);
        };

        websocket.onmessage = handleWebSocketMessage; 

        websocket.onerror = (error) => {
            isConnecting = false;
            console.error('WebSocket error:', error);
            if (connectedTabId) {
                chrome.tabs.sendMessage(connectedTabId, { type: 'WEBSOCKET_STATUS', status: 'error', error: 'WebSocket connection error' })
                    .catch(err => console.warn("Could not send WS error to tab:", err));
            }
            if (websocket) {
                websocket.onclose = null; // Prevent onclose from further actions if error caused closure
            }
            websocket = null; 
            reject(error);
        };

        websocket.onclose = () => {
            // Only log and update status if isConnecting is false, meaning it wasn't an immediate failure during connection setup
            // or if this onclose is for an established connection.
            if (!isConnecting || (websocket && websocket.readyState !== WebSocket.CONNECTING)) {
                console.log('WebSocket connection closed.');
                 if (connectedTabId) { 
                    chrome.tabs.sendMessage(connectedTabId, { type: 'WEBSOCKET_STATUS', status: 'disconnected' })
                         .catch(err => console.warn("Could not send WS disconnect to tab:", err));
                }
            }
            isConnecting = false; // Ensure this is reset
            websocket = null; 
        };
    });
}

function handleWebSocketMessage(event) {
    console.log('Message from server:', event.data);
    try {
        const message = JSON.parse(event.data);
        // Prioritize sending to the specific tab that initiated separation if active
        let targetTabId = connectedTabId; // Use the currently active tab for separation context

        if (targetTabId && (message.type === 'separated_audio' || message.type === 'status' || message.type === 'error')) {
            chrome.tabs.sendMessage(targetTabId, message)
                .catch(err => {
                    console.warn("Could not send message to targetTabId, trying runtime:", err, message);
                    chrome.runtime.sendMessage(message)
                        .catch(errRt => console.warn("Could not send message to runtime either:", errRt));
                });
        } else { 
            chrome.runtime.sendMessage(message)
                 .catch(err => console.warn("Could not send message to runtime (popup might be closed / no active tab):", err));
        }
    } catch (e) {
        console.error("Failed to parse JSON from server or forward to client:", e, event.data);
    }
}

function disconnectWebSocket() {
    if (websocket) {
        console.log('Closing WebSocket connection intentionally.');
        websocket.onclose = null; 
        try { websocket.close(); } catch(e) { /* ignore */ }
    }
    websocket = null;
    isConnecting = false;
    pendingConfigureMessage = null;
    // connectedTabId = null; // Clearing this here might be too aggressive, depends on desired reconnect behavior
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background script received message:', message, 'from sender:', sender);

    if (message.type === 'INITIATE_CONNECTION') {
        // If a tabId is provided in the message, prefer it. Otherwise, use sender.tab.id.
        // Keep existing connectedTabId if message.tabId and sender.tab.id are null.
        let newTabId = message.tabId || (sender.tab ? sender.tab.id : null);
        if (newTabId) {
            connectedTabId = newTabId;
        } else if (!connectedTabId && sender.tab) { // Only set from sender if not already set and sender is a tab
            connectedTabId = sender.tab.id;
        }
        console.log(`INITIATE_CONNECTION. Effective connectedTabId: ${connectedTabId}`);

        ensureWebSocketConnection().then(() => {
            console.log("ensureWebSocketConnection promise resolved for INITIATE_CONNECTION.");
            sendResponse({ status: 'WebSocket connection successful.' });
        }).catch(error => {
            console.error("ensureWebSocketConnection promise rejected for INITIATE_CONNECTION:", error);
            sendResponse({ error: 'WebSocket connection failed.', details: String(error) });
        });
        return true; 

    } else if (message.type === 'CONFIGURE_MODEL') {
        const configPayload = { type: 'configure', config: message.config };
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            console.log('Background: Sending CONFIGURE_MODEL to WebSocket:', message.config);
            websocket.send(JSON.stringify(configPayload));
            sendResponse({ status: 'Configuration sent.' });
        } else {
            console.warn('Background: WebSocket not open/ready. Queuing CONFIGURE_MODEL.');
            pendingConfigureMessage = configPayload; 
            
            ensureWebSocketConnection().then(() => {
                 console.log("WS connected after queuing CONFIGURE_MODEL. Pending message should have been sent by onopen handler.");
                 sendResponse({ status: 'Configuration queued and will be/was sent.' });
            }).catch(error => {
                 console.error("WS connection failed while CONFIGURE_MODEL was queued:", error);
                 sendResponse({ error: 'WebSocket connection failed, configuration not sent.', details: String(error) });
                 pendingConfigureMessage = null; // Clear if connection failed
            });
        }
        return true; 
    } else if (message.type === 'AUDIO_DATA') {
        const serverMessage = {
            type: 'audio_data',
            data: message.data.data,
            sample_rate: message.data.sampleRate,
            channels: message.data.channels,
            audio_format: message.data.audio_format,
            timestamp: Date.now() 
        };
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify(serverMessage));
            // sendResponse({ status: 'Audio data sent.' }); // Usually fire and forget
        } else {
            console.warn('WebSocket not open. Cannot send audio data.');
            // sendResponse({ error: 'WebSocket not open.' });
        }
        return false; // No async response needed for this primarily fire-and-forget message
    } else if (message.type === 'STOP_WEBSOCKET') {
        disconnectWebSocket();
        sendResponse({ status: 'WebSocket disconnected by request.' });
        // connectedTabId = null; // Explicit stop from UI, clear association
        return false;
    }
    // Default case for unhandled message types or synchronous handlers
    return false; 
});

console.log('Background service worker started/restarted.');