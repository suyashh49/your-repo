// // Background service worker
// chrome.runtime.onInstalled.addListener(() => {
//     console.log('Music Separator Extension installed');
// });

// // Handle extension icon click
// chrome.action.onClicked.addListener((tab) => {
//     // Check if we're on YouTube Music
//     if (tab.url.includes('music.youtube.com')) {
//         chrome.action.openPopup();
//     } else {
//         // Redirect to YouTube Music
//         chrome.tabs.update(tab.id, { url: 'https://music.youtube.com' });
//     }
// });

// // Monitor tab changes
// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//     if (changeInfo.status === 'complete' && tab.url?.includes('music.youtube.com')) {
//         // Ensure content script is injected
//         chrome.scripting.executeScript({
//             target: { tabId: tabId },
//             files: ['content-script.js']
//         }).catch(() => {
//             // Script already injected or tab not ready
//         });
//     }
// });

// background.js

const WEBSOCKET_URL = 'ws://localhost:8765';
let websocket = null;
let connectedTabId = null; // Tab ID that initiated the connection/separation

function connectWebSocket() {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        console.log('WebSocket already open.');
        return;
    }

    websocket = new WebSocket(WEBSOCKET_URL);

    websocket.onopen = () => {
        console.log('WebSocket connection established.');
        // Optionally send a configuration message if needed upon connection
        // websocket.send(JSON.stringify({ type: 'configure', config: { model: 'htdemucs' } }));
        if (connectedTabId) {
            chrome.tabs.sendMessage(connectedTabId, { type: 'WEBSOCKET_STATUS', status: 'connected' })
                .catch(err => console.warn("Could not send WS status to tab, it might be closed:", err));
        }
    };

    websocket.onmessage = (event) => {
        console.log('Message from server:', event.data);
        const message = JSON.parse(event.data);

        if (message.type === 'separated_audio' && connectedTabId) {
            // Forward to content script
            chrome.tabs.sendMessage(connectedTabId, message)
                .catch(err => console.warn("Could not send separated_audio to tab:", err));
        } else if (message.type === 'status' || message.type === 'error') {
            // Forward status/error messages to the popup if it's open,
            // or handle them directly (e.g., update icon)
            chrome.runtime.sendMessage(message)
                .catch(err => console.warn("Could not send message to runtime (popup might be closed):", err));
            if (connectedTabId) {
                 chrome.tabs.sendMessage(connectedTabId, message)
                    .catch(err => console.warn("Could not send server status/error to tab:", err));
            }
        }
    };

    websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (connectedTabId) {
            chrome.tabs.sendMessage(connectedTabId, { type: 'WEBSOCKET_STATUS', status: 'error', error: 'WebSocket connection error' })
                .catch(err => console.warn("Could not send WS error to tab:", err));
        }
        // Attempt to reconnect or notify user
        websocket = null; // Reset for reconnection attempt
    };

    websocket.onclose = () => {
        console.log('WebSocket connection closed.');
        if (connectedTabId) {
            chrome.tabs.sendMessage(connectedTabId, { type: 'WEBSOCKET_STATUS', status: 'disconnected' })
                 .catch(err => console.warn("Could not send WS disconnect to tab:", err));
        }
        websocket = null; // Reset for reconnection attempt
        // Optionally, you might want to implement a retry mechanism here
    };
}

function disconnectWebSocket() {
    if (websocket) {
        console.log('Closing WebSocket connection.');
        websocket.close();
        websocket = null;
    }
    connectedTabId = null;
}

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background script received message:', message, 'from sender:', sender);

    if (message.type === 'INITIATE_CONNECTION') {
        // A content script (e.g. on YouTube Music) is ready for separation
        connectedTabId = sender.tab ? sender.tab.id : null;
        if (!connectedTabId && message.tabId) { // Fallback if sender.tab is not available (e.g. from popup)
            connectedTabId = message.tabId;
        }
        console.log(`Connection initiated by tab: ${connectedTabId}`);
        if (!websocket || websocket.readyState !== WebSocket.OPEN) {
            connectWebSocket();
        } else {
             // If already connected, confirm status to the new tab
            chrome.tabs.sendMessage(connectedTabId, { type: 'WEBSOCKET_STATUS', status: 'connected' })
                .catch(err => console.warn("Could not send WS status to newly initiating tab:", err));
        }
        sendResponse({ status: 'WebSocket connection process started.' });
        return true; // Indicates an async response
    } else if (message.type === 'AUDIO_DATA') {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            // Forward audio data from content script to WebSocket server
            // Ensure data is stringified if it's an object
            const dataToSend = typeof message.data === 'string' ? message.data : JSON.stringify(message.data);
            websocket.send(dataToSend);
            // console.log('Sent audio data to server.');
            sendResponse({ status: 'Audio data sent to server.' });
        } else {
            console.warn('WebSocket not open. Cannot send audio data.');
            sendResponse({ error: 'WebSocket not open.' });
        }
        return true; // Indicates an async response
    } else if (message.type === 'CONFIGURE_MODEL') {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            console.log('Background: Sending CONFIGURE_MODEL to WebSocket:', message.config); // Added log
            websocket.send(JSON.stringify({ type: 'configure', config: message.config }));
            sendResponse({ status: 'Configuration sent.' });
        } else {
            console.warn('Background: WebSocket not open. Cannot send configuration.'); // Added log
            sendResponse({ error: 'WebSocket not open. Cannot send configuration.' });
        }
        return true;
    } else if (message.type === 'STOP_WEBSOCKET') {
        disconnectWebSocket();
        sendResponse({ status: 'WebSocket disconnected by request.' });
        return true;
    }
    // Handle other messages if necessary
});

// Attempt to connect when the extension starts,
// but it's often better to connect on demand (e.g., when user starts separation)
// connectWebSocket();

console.log('Background service worker started.');