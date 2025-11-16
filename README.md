# SolarPaneler
Render PV6 Solar Panel 

## Setup

1. Copy the example configuration file:
   ```bash
   cp config.example.js config.js
   ```

2. Edit `config.js` and update the URLs with your actual API endpoints:
   - `apiBaseUrl`: Base URL for your solar panel API
   - `panelLayoutEndpoint`: Endpoint path for panel layout data
   - `powerDataEndpoint`: Endpoint path for power data

Note: `config.js` is ignored by git, so each installation can have its own configuration.
