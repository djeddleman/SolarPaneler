class SolarPanelMonitor {
    constructor() {
        this.panels = [];
        this.powerData = {};
        this.maxPower = 0;
        this.refreshInterval = null;
        this.refreshIntervalMinutes = 5;
        this.isDragging = false;
        this.dragPanel = null;
        this.dragOffset = { x: 0, y: 0 };
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadPanelLayout();
        await this.loadPowerData();
        this.startAutoRefresh();
        // render() is called in loadPowerData() after data is loaded
    }

    async loadPanelLayout() {
        try {
            console.log('Loading panel layout...');
            const url = CONFIG.apiBaseUrl + CONFIG.panelLayoutEndpoint;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Panel layout data received:', data);
            
            // Handle the specific JSON format: {result: {panels: [...]}, success: "true"}
            let panelsArray = [];
            if (data.result && data.result.panels) {
                panelsArray = data.result.panels;
            } else if (Array.isArray(data)) {
                panelsArray = data;
            } else if (data.panels) {
                panelsArray = data.panels;
            } else if (data.Panels) {
                panelsArray = data.Panels;
            }
            
            console.log(`Found ${panelsArray.length} panels`);
            
            // Convert the API format to our internal format
            // API format: {xCoordinate, yCoordinate, planeRotation, inverterSerialNumber}
            
            // First, find the minimum y coordinate to calculate offset for all panels
            const allYCoords = panelsArray.map(p => p.yCoordinate || p.y || 0);
            const minY = Math.min(...allYCoords);
            const yOffset = minY < 0 ? Math.abs(minY) + 50 : 50; // Offset to make all panels visible
            
            this.panels = panelsArray.map((panel, index) => {
                // Normalize coordinates (handle negative y values by offsetting)
                const x = panel.xCoordinate || panel.x || (index % 10) * 120 + 50;
                const y = (panel.yCoordinate || panel.y || Math.floor(index / 10) * 120 + 50) + yOffset;
                
                return {
                    // Keep original data
                    ...panel,
                    // Map to our standard format
                    x: x,
                    y: y,
                    width: panel.width || 80,
                    height: panel.height || 80,
                    id: panel.inverterSerialNumber || panel.id || panel.ID || `panel-${index}`,
                    serialNumber: panel.inverterSerialNumber || panel.serialNumber || panel.SerialNumber,
                    inverterSerialNumber: panel.inverterSerialNumber,
                    planeRotation: panel.planeRotation || 0
                };
            });
            
            console.log('Processed panels:', this.panels);
            
            if (this.panels.length === 0) {
                console.warn('No panels found in data, creating default panels');
                this.createDefaultPanels();
            }
            
            this.updateStatus(`Panel layout loaded: ${this.panels.length} panels`);
        } catch (error) {
            console.error('Error loading panel layout:', error);
            this.updateStatus(`Error loading panel layout: ${error.message}`);
            // Create default panels if API fails
            this.createDefaultPanels();
        }
    }
    
    createDefaultPanels() {
        // Create some default panels for testing
        this.panels = [];
        for (let i = 0; i < 12; i++) {
            this.panels.push({
                id: `panel-${i}`,
                serialNumber: `SN-${i}`,
                x: (i % 4) * 150 + 50,
                y: Math.floor(i / 4) * 120 + 50,
                width: 120,
                height: 100
            });
        }
        console.log('Created default panels:', this.panels);
    }

    async loadPowerData() {
        try {
            console.log('Loading power data...');
            const url = CONFIG.apiBaseUrl + CONFIG.powerDataEndpoint;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Power data received:', data);
            
            // Store power data by serial number or ID
            this.powerData = {};
            const devices = Array.isArray(data) ? data : (data.devices || data.DeviceList || data.Devices || []);
            
            console.log(`Found ${devices.length} total devices`);
            
            // Filter for inverters only (solar panels)
            const inverters = devices.filter(device => {
                return device.DEVICE_TYPE === "Inverter" || 
                       device.TYPE === "SOLARBRIDGE" ||
                       (device.DESCR && device.DESCR.includes("Inverter"));
            });
            
            console.log(`Found ${inverters.length} inverters (solar panels)`);
            
            inverters.forEach(device => {
                // Use SERIAL field (uppercase) to match with panel inverterSerialNumber
                const serial = device.SERIAL || device.serialNumber || device.SerialNumber || 
                              device.inverterSerialNumber || device.InverterSerialNumber ||
                              device.id || device.ID;
                
                if (serial) {
                    // Store by serial number
                    this.powerData[serial] = device;
                    
                    // Also store by lowercase version if different
                    if (serial !== serial.toLowerCase()) {
                        this.powerData[serial.toLowerCase()] = device;
                    }
                    
                    // Track maximum power for color scaling
                    const power = this.getPowerValue(device);
                    if (power > this.maxPower) {
                        this.maxPower = power;
                    }
                    
                    console.log(`Stored power data for ${serial}: ${power}W`);
                }
            });
            
            // If no max power found, set a default for color scaling
            if (this.maxPower === 0) {
                this.maxPower = 400; // Default max power for color scaling
                console.log('No power data found, using default max power for color scaling');
            }
            
            console.log('Power data processed. Max power:', this.maxPower);
            this.updateStatus(`Power data loaded - ${new Date().toLocaleTimeString()}`);
            this.render();
        } catch (error) {
            console.error('Error loading power data:', error);
            this.updateStatus(`Error loading power data: ${error.message}`);
            // Still render with default/zero power
            if (this.maxPower === 0) {
                this.maxPower = 400; // Default for color scaling
            }
            this.render();
        }
    }

    getPowerValue(device) {
        // Try various possible power field names
        // p_3phsum_kw is in kilowatts, so convert to watts by multiplying by 1000
        if (device.p_3phsum_kw !== undefined && device.p_3phsum_kw !== null) {
            return parseFloat(device.p_3phsum_kw) * 1000; // Convert kW to W
        }
        if (device.p_3phsum_kW !== undefined && device.p_3phsum_kW !== null) {
            return parseFloat(device.p_3phsum_kW) * 1000; // Convert kW to W
        }
        // Fallback to other possible field names (already in watts)
        return parseFloat(device.power || device.Power || device.powerWatts || device.PowerWatts || 
               device.currentPower || device.CurrentPower || 
               device.instantPower || device.InstantPower || 0);
    }

    setupEventListeners() {
        const canvas = document.getElementById('panelCanvas');
        const refreshNowBtn = document.getElementById('refreshNow');
        const refreshIntervalInput = document.getElementById('refreshInterval');
        const tooltip = document.getElementById('tooltip');

        // Refresh now button
        refreshNowBtn.addEventListener('click', () => {
            this.loadPowerData();
        });

        // Refresh interval input
        refreshIntervalInput.addEventListener('change', (e) => {
            this.refreshIntervalMinutes = parseInt(e.target.value) || 5;
            this.startAutoRefresh();
        });

        // Mouse events for dragging
        canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        canvas.addEventListener('mouseup', () => this.handleMouseUp());
        canvas.addEventListener('mouseleave', () => this.handleMouseUp());

        // Tooltip positioning
        canvas.addEventListener('mousemove', (e) => {
            if (!this.isDragging) {
                this.updateTooltip(e);
            }
        });
    }

    handleMouseDown(e) {
        const canvas = document.getElementById('panelCanvas');
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Find which panel was clicked
        const panel = this.panels.find(p => {
            return x >= p.x && x <= p.x + p.width &&
                   y >= p.y && y <= p.y + p.height;
        });

        if (panel) {
            this.isDragging = true;
            this.dragPanel = panel;
            this.dragOffset = {
                x: x - panel.x,
                y: y - panel.y
            };
            canvas.style.cursor = 'grabbing';
        }
    }

    handleMouseMove(e) {
        if (this.isDragging && this.dragPanel) {
            const canvas = document.getElementById('panelCanvas');
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left - this.dragOffset.x;
            const y = e.clientY - rect.top - this.dragOffset.y;

            // Update panel position
            this.dragPanel.x = Math.max(0, x);
            this.dragPanel.y = Math.max(0, y);
            this.render();
        }
    }

    handleMouseUp() {
        if (this.isDragging) {
            this.isDragging = false;
            this.dragPanel = null;
            const canvas = document.getElementById('panelCanvas');
            canvas.style.cursor = 'default';
        }
    }

    updateTooltip(e) {
        const canvas = document.getElementById('panelCanvas');
        const tooltip = document.getElementById('tooltip');
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Find panel under cursor
        const panel = this.panels.find(p => {
            return x >= p.x && x <= p.x + p.width &&
                   y >= p.y && y <= p.y + p.height;
        });

        if (panel) {
            const powerInfo = this.powerData[panel.id] || 
                             this.powerData[panel.serialNumber] || 
                             this.powerData[panel.inverterSerialNumber] || {};
            this.showTooltip(e.clientX, e.clientY, panel, powerInfo);
        } else {
            tooltip.classList.add('hidden');
        }
    }

    showTooltip(x, y, panel, powerInfo) {
        const tooltip = document.getElementById('tooltip');
        tooltip.classList.remove('hidden');
        
        let html = `<h3>Panel Details</h3>`;
        
        // Add all panel properties
        Object.keys(panel).forEach(key => {
            if (key !== 'x' && key !== 'y' && key !== 'width' && key !== 'height') {
                html += `<p><span class="label">${key}:</span> ${panel[key]}</p>`;
            }
        });
        
        // Add all power info properties
        Object.keys(powerInfo).forEach(key => {
            html += `<p><span class="label">${key}:</span> ${powerInfo[key]}</p>`;
        });
        
        tooltip.innerHTML = html;
        
        // Position tooltip
        tooltip.style.left = `${x + 10}px`;
        tooltip.style.top = `${y + 10}px`;
        
        // Adjust if tooltip goes off screen
        const tooltipRect = tooltip.getBoundingClientRect();
        if (tooltipRect.right > window.innerWidth) {
            tooltip.style.left = `${x - tooltipRect.width - 10}px`;
        }
        if (tooltipRect.bottom > window.innerHeight) {
            tooltip.style.top = `${y - tooltipRect.height - 10}px`;
        }
    }

    getColorForPower(power) {
        if (this.maxPower === 0) return '#000000'; // Black for no power
        
        const ratio = Math.min(power / this.maxPower, 1);
        
        // Interpolate from black (0,0,0) to green (0,255,0)
        const r = Math.floor(0);
        const g = Math.floor(255 * ratio);
        const b = Math.floor(0);
        
        return `rgb(${r}, ${g}, ${b})`;
    }

    render() {
        const canvas = document.getElementById('panelCanvas');
        if (!canvas) {
            console.error('Canvas element not found!');
            return;
        }
        
        const svgNS = 'http://www.w3.org/2000/svg';
        
        // Clear canvas
        canvas.innerHTML = '';
        
        console.log(`Rendering ${this.panels.length} panels`);
        
        if (this.panels.length === 0) {
            console.warn('No panels to render!');
            // Set minimum canvas size
            canvas.setAttribute('width', window.innerWidth);
            canvas.setAttribute('height', window.innerHeight - 100);
            return;
        }
        
        // Calculate canvas size based on panel positions
        let maxX = 0, maxY = 0;
        this.panels.forEach(panel => {
            maxX = Math.max(maxX, panel.x + panel.width);
            maxY = Math.max(maxY, panel.y + panel.height);
        });
        
        const canvasWidth = Math.max(maxX + 50, window.innerWidth);
        const canvasHeight = Math.max(maxY + 50, window.innerHeight - 100);
        
        canvas.setAttribute('width', canvasWidth);
        canvas.setAttribute('height', canvasHeight);
        canvas.setAttribute('viewBox', `0 0 ${canvasWidth} ${canvasHeight}`);
        canvas.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        
        console.log(`Canvas size: ${canvasWidth}x${canvasHeight}`);
        
        // Render each panel
        this.panels.forEach((panel, index) => {
            // Try multiple ways to match panel to power data
            const powerInfo = this.powerData[panel.id] || 
                             this.powerData[panel.serialNumber] || 
                             this.powerData[panel.inverterSerialNumber] || {};
            const power = this.getPowerValue(powerInfo);
            const color = this.getColorForPower(power);
            
            console.log(`Panel ${index}: id=${panel.id}, power=${power}, color=${color}, pos=(${panel.x},${panel.y}), size=${panel.width}x${panel.height}`);
            
            // Create panel rectangle
            const rect = document.createElementNS(svgNS, 'rect');
            rect.setAttribute('x', panel.x);
            rect.setAttribute('y', panel.y);
            rect.setAttribute('width', panel.width);
            rect.setAttribute('height', panel.height);
            rect.setAttribute('fill', color);
            rect.setAttribute('class', 'panel');
            rect.setAttribute('data-panel-id', panel.id || panel.serialNumber);
            canvas.appendChild(rect);
            
            // Add power text
            const text = document.createElementNS(svgNS, 'text');
            text.setAttribute('x', panel.x + panel.width / 2);
            text.setAttribute('y', panel.y + panel.height / 2);
            text.setAttribute('class', 'panel-text');
            text.textContent = `${power.toFixed(1)}W`;
            canvas.appendChild(text);
        });
        
        console.log('Rendering complete');
    }

    startAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        const intervalMs = this.refreshIntervalMinutes * 60 * 1000;
        this.refreshInterval = setInterval(() => {
            this.loadPowerData();
        }, intervalMs);
    }

    updateStatus(message) {
        const status = document.getElementById('status');
        status.textContent = message;
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SolarPanelMonitor();
});

