# 🎵 Ultimate Music Separator Extension

A sophisticated Chrome extension that provides real-time audio separation for YouTube Music using the Ultimate Vocal Remover API. Separate vocals, bass, drums, and other instruments in real-time while listening to your favorite tracks.

## ✨ Features

- **Real-time Audio Separation**: Separate music into individual stems (vocals, bass, drums, other) while streaming
- **Multiple AI Models**: Support for Demucs, MDX-Net, VR Network, and MDXC models
- **Individual Stem Control**: Adjust volume of each separated instrument independently
- **High-Quality Processing**: Optional high-quality mode for better separation results
- **YouTube Music Integration**: Seamlessly works with YouTube Music interface
- **Local Processing**: All audio processing happens locally for privacy and low latency

## 🚀 Quick Start

### Prerequisites

- **Google Chrome** (latest version recommended)
- **Python 3.8+** with pip
- **4GB+ RAM** (8GB+ recommended for high-quality mode)
- **GPU support** (optional, for faster processing)

### Installation

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd Music-Separator-Extension
   ```

2. **Start the Backend Server**
   
   **On macOS/Linux:**
   ```bash
   chmod +x start_backend.sh
   ./start_backend.sh

   // ... existing code ...
   **On Windows:**
   ```powershell
   .\start_backend.ps1
   ```
   This will install all Python dependencies and start the local server. It might take some time on the first run.

3. **Load the Extension in Chrome**
   - Open Chrome and go to `chrome://extensions`
   - Enable **Developer mode** (toggle in the top right)
   - Click **Load unpacked**
   - Select the `Music-Separator-Extension` directory (the root of this project)

4. **Start Separating!**
   - Go to [YouTube Music](https://music.youtube.com)
   - Play a song
   - Click the Music Separator extension icon in your Chrome toolbar
   - Click **Start Separation**

## 🛠️ How It Works

The extension combines several technologies:

1.  **Chrome Extension**:
    *   `manifest.json`: Defines the extension's structure, permissions, and scripts.
    *   `popup.html`/`popup.js`: Provides the user interface for controlling the separation.
    *   `background.js`: Manages extension state and communication.
    *   `content-script.js`: Injected into YouTube Music pages to interact with the audio.
    *   `injected-script.js`: Runs in the page's context to capture audio using the Web Audio API.

2.  **Local Python Backend Server**:
    *   Built with Flask (for HTTP health checks) and WebSockets (for real-time audio data transfer).
    *   Uses the `ultimatevocalremover_api` to perform the actual audio separation.
    *   Receives audio chunks from the extension, processes them, and sends back the separated stems.

3.  **Audio Pipeline**:
    *   The `injected-script.js` intercepts the audio output from YouTube Music using the Web Audio API.
    *   Audio data is streamed via WebSocket to the local Python server.
    *   The server uses a selected AI model (e.g., Demucs, MDX) to separate the audio into stems.
    *   The separated stems are streamed back to the extension.
    *   The `injected-script.js` then uses Web Audio API to play these stems, allowing individual volume control.

## ⚙️ Development

### Project Structure

Music-Separator-Extension/
├── ultimatevocalremover_api/ # Git submodule for the UVR API
├── backend/
│ ├── server.py # Main Flask & WebSocket server
│ ├── requirements.txt # Python dependencies
│ └── install_dependencies.py # Script to install backend deps
├── icons/
│ ├── icon16.png
│ ├── icon48.png
│ └── icon128.png
├── manifest.json # Chrome extension manifest
├── popup.html # Extension popup UI
├── popup.js # Logic for the popup
├── content-script.js # Injected into YouTube Music pages
├── injected-script.js # Runs in page context for Web Audio API access
├── background.js # Extension service worker
├── start_backend.sh # Linux/macOS backend startup script
├── start_backend.ps1 # Windows backend startup script
└── README.md # This file


### Setting up `ultimatevocalremover_api`

This project uses the `ultimatevocalremover_api` as a Git submodule. If you cloned the repository without `--recurse-submodules`, you'll need to initialize and update the submodule:

```bash
git submodule init
git submodule update
```

### Backend Development

- The backend server is in the `backend/` directory.
- Modify `server.py` for changes to the API or WebSocket handling.
- Dependencies are managed via `requirements.txt`.

### Frontend Development (Chrome Extension)

- Extension files are in the root directory (`manifest.json`, `popup.html`, `*.js`).
- After making changes to the extension files, you might need to reload the extension in `chrome://extensions` (click the refresh icon for the unpacked extension).

##  modeluconfig.json

The `ultimatevocalremover_api/src/models_dir/models.json` file lists available models and their download URLs. The backend server uses this to download models on first run. You can add or modify model entries here.

## ⚠️ Troubleshooting

-   **Server Not Connecting**:
    *   Ensure the backend server is running (`./start_backend.sh` or `.\start_backend.ps1`).
    *   Check the console output from the script for any errors.
    *   Verify your firewall isn't blocking connections to `http://localhost:8765` (WebSocket) or `http://localhost:8766` (HTTP).
-   **No Audio Separation**:
    *   Make sure a song is playing on YouTube Music.
    *   Open the Chrome Developer Tools (F12 or Option+Cmd+J) on the YouTube Music tab and check the Console for errors.
    *   Check the Developer Tools for the extension popup (right-click the extension icon, "Inspect popup") and background script (from `chrome://extensions`, click "Service worker").
-   **Poor Separation Quality**:
    *   Try a different model from the popup (e.g., `hdemucs_mmi` for higher quality).
    *   Ensure "High Quality Mode" is checked if available and your system can handle it.
    *   Real-time processing with small audio chunks can sometimes affect quality.
-   **Python Errors during Backend Startup**:
    *   Ensure you have Python 3.8+ and pip installed.
    *   Try deleting the `.dependencies_installed` file in the `backend` directory and running the startup script again to force a fresh dependency installation.
    *   Ensure PyTorch is installed correctly for your system (CPU or GPU version). The `install_dependencies.py` tries to install a generic PyTorch version. You might need a specific version depending on your CUDA setup.

## 🤝 Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## 📜 License

This project is licensed under the MIT License - see the `LICENSE` file for details (You'll need to add a LICENSE file). The `ultimatevocalremover_api` has its own license.

## 🙏 Acknowledgements

-   The developers of [Ultimate Vocal Remover GUI](https://github.com/Anjok07/ultimatevocalremovergui) and the [UVR API](https://github.com/NextAudioGen/ultimatevocalremover_api).
-   The creators of the various audio separation models.

---

This README provides a comprehensive guide to get your Music Separator Extension up and running. Enjoy real-time stem separation on YouTube Music!