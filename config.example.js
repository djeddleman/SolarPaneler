// Configuration file for Solar Panel Monitor
// Copy this file to config.js and update with your actual URLs

const CONFIG = {
    // Base URL for the solar panel API
    apiBaseUrl: 'http://127.0.0.1',
    
    // Endpoint for panel layout data
    panelLayoutEndpoint: '/cgi-bin/dl_cgi/panels/layout',
    
    // Endpoint for power data
    powerDataEndpoint: '/cgi-bin/dl_cgi?Command=DeviceList'
};

