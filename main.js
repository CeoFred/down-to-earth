const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const networkAddress = require('network-address');
const { spawn } = require('child_process');
// tunnelmole is an ES module, we will dynamic import it in the handler

// [HOT RELOAD] Listen for file changes and refresh/restart app
require('electron-reload')(__dirname, {
  electron: path.join(__dirname, 'node_modules', '.bin', 'electron')
});

let mainWindow = null;
let projectorWindow = null;

let timerInterval = null;
let remainingMs = 0;
let totalMs = 0; // The duration the timer started with
let isRunning = false;
let isOvertime = false;
let overtimeMs = 0; 
let isPaused = false;
let customTitle = "";
let customNotes = "";
let activeWrapUp = null; // Current timer's wrap-up overrides
let activeTunnelProcess = null;
const remoteDevices = new Map();

/* ---------------- CONFIG STORAGE ---------------- */
const configPath = path.join(app.getPath('userData'), 'countdown-config.json');
let config = {
  customPresets: [],
  settings: {
    autoAdvance: false,
    ttsEnabled: true,
    alarmSound: 'pulse',
    playlists: [],               // The scheduled rundown lineup
    milestones: [600, 300, 120, 60, 30], // Defaults: 10m, 5m, 2m, 1m, 30s
    readPlaylistTitle: true,
    appearance: {
      timerSize: "24vw",
      timerColor: "#ffffff",
      timerFont: "ui-monospace",
      titleSize: "6vh",
      titleColor: "rgba(255, 255, 255, 0.8)",
      titleFont: "system-ui",
      notesSize: "4.5vh",
      notesColor: "#ffffff",
      notesFont: "system-ui",
      barColor: "#3b82f6",
      barHeight: "12px"
    },
    visibility: {
      showTimer: true,
      showBar: true,
      showTitle: true,
      showNotes: true
    },
    focusMode: {
      enabled: false,
      focusedItem: "timer" // Options: "timer", "notes", "title"
    },
    wrapUp: {
      yellowMs: 60000, 
      redMs: 30000,
      flashOnRed: true,
      flashOnOvertime: true,
      soundOnYellow: false,
      soundOnRed: true
    },
    securityPin: Math.floor(1000 + Math.random() * 9000).toString(), // Generate random 4-digit PIN
    requirePinController: true,  // Whether remote controllers need PIN auth
    requirePinProjector: true,   // Whether remote projectors need PIN auth
    blockedDevices: [],
    messages: [],                // Library of pre-written stage messages
    activeMessageId: null        // ID of the currently active message (if any)
  },
  localUrl: "http://" + networkAddress() + ":8321"
};

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      const loaded = JSON.parse(data);
      // Deep merge settings
      config.settings = { ...config.settings, ...loaded.settings };
      config.customPresets = loaded.customPresets || [];
      
      // MIGRATION: Move top-level playlists to settings.playlists if needed
      if (loaded.playlists && loaded.playlists.length > 0) {
        config.settings.playlists = loaded.playlists;
        saveConfig();
        console.log("[Migration] Moved playlists into settings.");
      } else if (!config.settings.playlists) {
        config.settings.playlists = [];
      }
      
      // Ensure PIN exists
      if (!config.settings.securityPin) {
        config.settings.securityPin = Math.floor(1000 + Math.random() * 9000).toString();
        saveConfig();
      }
    }
  } catch (err) {
    console.error('Error loading config:', err);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Error saving config:', err);
  }
}

// Initial Load
loadConfig();

/* ---------------- SERVER SETUP ---------------- */
const port = 8321;
const localIp = networkAddress();
const serverUrl = `http://${localIp}:${port}`;

const expressApp = express();
const server = http.createServer(expressApp);
const io = new Server(server);

// Serve project files for remote web clients
expressApp.use(express.static(__dirname));

// Route root to renderer.html
expressApp.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'renderer.html'));
});

// Route for remote viewer
expressApp.get('/projector', (req, res) => {
  res.sendFile(path.join(__dirname, 'projector.html'));
});

function broadcastDevices() {
  const deviceList = Array.from(remoteDevices.values());
  mainWindow?.webContents.send('timer:devicesUpdate', deviceList);
  io.emit('timer:devicesUpdate', deviceList);
}

io.on('connection', (socket) => {
  let authState = false;

  // 3. Registry Initial Entry (Visible even before login)
  const currentDevice = {
    id: socket.id,
    deviceId: 'anonymous',
    userAgent: socket.handshake.headers['user-agent'] || 'Unknown-Device',
    ip: socket.handshake.address,
    isAuthenticated: false,
    connectedAt: new Date().toISOString()
  };
  remoteDevices.set(socket.id, currentDevice);
  broadcastDevices();

    socket.emit('timer:state', { 
      remainingMs, totalMs, isRunning, isOvertime, overtimeMs, isPaused, customTitle,
      customNotes, config,
      projectorStatus: getProjectorStatus() // Add initial hardware status
    });

    socket.on('timer:controlProjector', async (action, incomingData) => {
      if (!authState) return socket.emit('auth:error', 'Authentication required');
      
      const data = incomingData || {};
      console.log(`[Remote] Projector Command: ${action}`, data);
      let success = false;
      const displayId = data.displayId;

      switch (action) {
        case 'open':
          createProjectorWindow(displayId);
          success = true;
          break;
        case 'close':
          if (projectorWindow) {
            projectorWindow.close();
            projectorWindow = null;
            broadcastProjectorStatus();
          }
          success = true;
          break;
        case 'fullscreen':
          if (projectorWindow) {
            const isFull = projectorWindow.isFullScreen();
            projectorWindow.setFullScreen(!isFull);
            broadcastProjectorStatus();
          }
          success = true;
          break;
        case 'reload':
          if (projectorWindow) {
            projectorWindow.reload();
          }
          success = true;
          break;
        case 'focus': // Changed from bringToFront to match renderer
          if (projectorWindow) {
            projectorWindow.show();
            projectorWindow.focus();
          }
          success = true;
          break;
        case 'setDisplay':
          if (displayId) {
            createProjectorWindow(displayId);
            success = true;
          }
          break;
      }
      
      // Return result to the specific remote client for toast feedback
      socket.emit('timer:controlResult', { action, success });
    });

  socket.on('register', ({ pin, deviceId, userAgent, clientType }) => {
    // 1. Mandatory Identity Update (Even for blocked devices)
    const dev = remoteDevices.get(socket.id);
    if (dev) {
      dev.deviceId = deviceId || dev.deviceId;
      dev.userAgent = userAgent || dev.userAgent;
      dev.clientType = clientType || 'controller';
      remoteDevices.set(socket.id, dev);
    }

    // 2. Blacklist Check
    if (config.settings.blockedDevices?.includes(deviceId)) {
      broadcastDevices();
      return socket.emit('registered', { success: false, error: 'Access Blocked' });
    }

    // 3. Authentication — check if PIN is required for this client type
    const isController = (clientType !== 'projector');
    const pinRequired = isController
      ? config.settings.requirePinController
      : config.settings.requirePinProjector;

    const isSuccess = !pinRequired || (pin === config.settings.securityPin);
    if (isSuccess) {
      authState = true;
      socket.emit('registered', { success: true });
    } else {
      socket.emit('registered', { success: false, error: 'Invalid PIN' });
    }

    // 4. Update Auth Status for Monitor
    if (dev) {
      dev.isAuthenticated = isSuccess;
      remoteDevices.set(socket.id, dev);
    }
    
    broadcastDevices();
  });

  socket.on('disconnect', () => {
    if (remoteDevices.has(socket.id)) {
      remoteDevices.delete(socket.id);
      broadcastDevices();
    }
  });

  socket.on('timer:start', (data) => {
    if (!authState) return socket.emit('auth:error', 'Authentication required');
    // Support both direct ms (legacy) and production payload {ms, wrapUp}
    const ms = (typeof data === 'object' && data !== null) ? data.ms : data;
    const wrapUp = (typeof data === 'object' && data !== null) ? data.wrapUp : null;
    startTimer(ms, wrapUp);
  });

  socket.on('timer:pause', () => {
    if (!authState) return socket.emit('auth:error', 'Authentication required');
    pauseTimer();
  });

  socket.on('timer:resume', () => {
    if (!authState) return socket.emit('auth:error', 'Authentication required');
    resumeTimer();
  });

  socket.on('timer:reset', () => {
    if (!authState) return socket.emit('auth:error', 'Authentication required');
    resetTimer();
  });

  socket.on('timer:seek', (ms) => {
    if (!authState) return socket.emit('auth:error', 'Authentication required');
    seekTimer(ms);
  });

  socket.on('timer:setTitle', (title) => {
    if (!authState) return socket.emit('auth:error', 'Authentication required');
    customTitle = title || "";
    broadcast("timer:title", { title: customTitle });
  });

  socket.on('timer:getState', (callback) => {
    const state = { 
        remainingMs, totalMs, isRunning, isOvertime, overtimeMs, isPaused, customTitle,
        customNotes, config,
        authRequired: !authState 
      };

    // 1. Support Socket.io Callback pattern (Modern)
    if (typeof callback === 'function') {
      callback(state);
    }
    
    // 2. Support Separate Event pattern (Backwards compatibility with current renderer)
    socket.emit('timer:state', state);
  });

  socket.on('timer:savePreset', (preset) => {
    if (!authState) return socket.emit('auth:error', 'Authentication required');
    config.customPresets.push(preset);
    saveConfig();
    broadcast('timer:configUpdate', config);
  });

  socket.on('timer:deletePreset', (id) => {
    if (!authState) return socket.emit('auth:error', 'Authentication required');
    config.customPresets = config.customPresets.filter(p => p.id !== id);
    saveConfig();
    broadcast('timer:configUpdate', config);
  });

  socket.on('timer:identify', ({ deviceId, userAgent }) => {
    const dev = remoteDevices.get(socket.id);
    if (dev) {
      dev.deviceId = deviceId || dev.deviceId;
      dev.userAgent = userAgent || dev.userAgent;
      remoteDevices.set(socket.id, dev);
      broadcastDevices();
    }
  });

  socket.on('timer:flash', () => {
    broadcast('timer:flash');
  });

  socket.on('timer:saveSettings', (settings) => {
    if (!authState) return socket.emit('auth:error', 'Authentication required');
    config.settings = { ...config.settings, ...settings };
    saveConfig();
    broadcast('timer:configUpdate', config);
  });

  socket.on('timer:setNotes', (notes) => {
    if (!authState) return socket.emit('auth:error', 'Authentication required');
    customNotes = notes || "";
    broadcast("timer:notes", { notes: customNotes });
  });

  socket.on('timer:getDevices', () => {
    if (!authState) return socket.emit('auth:error', 'Authentication required');
    socket.emit('timer:devicesUpdate', Array.from(remoteDevices.values()));
  });

  socket.on('timer:blockDevice', ({ socketId, deviceId }) => {
    if (!authState) return socket.emit('auth:error', 'Authentication required');
    if (deviceId && !config.settings.blockedDevices.includes(deviceId)) {
      config.settings.blockedDevices.push(deviceId);
      saveConfig();
    }
    const targetSocket = io.sockets.sockets.get(socketId);
    if (targetSocket) {
      targetSocket.emit('auth:error', 'Access revoked by production director');
      targetSocket.disconnect(true);
    }
    broadcast('timer:configUpdate', config);
    broadcastDevices();
  });

  socket.on('timer:unblockDevice', (deviceId) => {
    if (!authState) return socket.emit('auth:error', 'Authentication required');
    if (deviceId) {
      config.settings.blockedDevices = config.settings.blockedDevices.filter(id => id !== deviceId);
      saveConfig();
      broadcast('timer:configUpdate', config);
      broadcastDevices();
    }
  });

  socket.on('timer:startTunnel', async () => {
    if (!authState) return socket.emit('auth:error', 'Authentication required');
    if (activeTunnelProcess) {
      return socket.emit('timer:tunnelResult', { success: true, url: config.tunnelUrl });
    }
    try {
      activeTunnelProcess = spawn('npx', ['-y', 'tunnelmole', '8321']);
      let tunnelUrl = null;
      activeTunnelProcess.stdout.on('data', (data) => {
        const output = data.toString();
        const match = output.match(/https:\/\/[a-z0-9-]+\.tunnelmole\.net/);
        if (match && !tunnelUrl) {
          tunnelUrl = match[0];
          config.tunnelUrl = tunnelUrl;
          broadcast('timer:configUpdate', config);
          saveConfig();
          socket.emit('timer:tunnelResult', { success: true, url: tunnelUrl });
        }
      });
      activeTunnelProcess.on('close', () => {
        activeTunnelProcess = null;
        config.tunnelUrl = null;
        broadcast('timer:configUpdate', config);
        saveConfig();
      });
      setTimeout(() => {
        if (!tunnelUrl) {
          if (activeTunnelProcess) activeTunnelProcess.kill();
          socket.emit('timer:tunnelResult', { success: false, error: 'Tunnel timeout' });
        }
      }, 20000);
    } catch (err) {
      socket.emit('timer:tunnelResult', { success: false, error: err.message });
    }
  });

  socket.on('timer:stopTunnel', () => {
    if (!authState) return socket.emit('auth:error', 'Authentication required');
    if (activeTunnelProcess) {
      activeTunnelProcess.kill();
      activeTunnelProcess = null;
      config.tunnelUrl = null;
      broadcast('timer:configUpdate', config);
      saveConfig();
    }
    socket.emit('timer:tunnelStopped');
  });

});

server.listen(port, () => {
  console.log(`Remote control server running at ${serverUrl}`);
  console.log(`-------------------------------------------`);
  console.log(`SECURITY PIN: ${config.settings.securityPin}`);
  console.log(`-------------------------------------------`);
});

function createMainWindow() {
  mainWindow = new BrowserWindow({
    fullscreen: true,
    frame: true,
    autoHideMenuBar: true,
    backgroundColor: '#1414147d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('renderer.html');

  // Send server info to local renderer when ready
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('server:info', { url: serverUrl });
  });

    mainWindow.on('closed', () => {
    mainWindow = null;

    if (projectorWindow) {
      projectorWindow.close();
      projectorWindow = null;
    }
  });
}

function createProjectorWindow(targetDisplayId = null) {
  if (projectorWindow && !projectorWindow.isDestroyed()) {
    if (targetDisplayId) {
      const displays = screen.getAllDisplays();
      const target = displays.find(d => d.id.toString() === targetDisplayId.toString());
      if (target) {
        projectorWindow.setFullScreen(false);
        projectorWindow.setBounds(target.bounds);
        projectorWindow.setFullScreen(true);
      }
    }
    projectorWindow.show();
    projectorWindow.focus();
    broadcastProjectorStatus();
    return;
  }

  const displays = screen.getAllDisplays();
  let targetDisplay = null;
  
  if (targetDisplayId) {
      targetDisplay = displays.find(d => d.id.toString() === targetDisplayId.toString());
  }
  
  if (!targetDisplay) {
      targetDisplay = displays.find((d) => d.bounds.x !== 0 || d.bounds.y !== 0) || displays[0];
  }

  const bounds = targetDisplay.bounds;

  projectorWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,               
    fullscreen: true,          
    autoHideMenuBar: true,    
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  projectorWindow.loadFile('projector.html');

   projectorWindow.once('ready-to-show', () => {
    projectorWindow.setFullScreen(true);
    broadcastProjectorStatus();
  });

  projectorWindow.on('closed', () => {
    projectorWindow = null;
    broadcastProjectorStatus();
  });

  // Track if projector is moved between displays manually (if not in fullscreen)
  projectorWindow.on('moved', broadcastProjectorStatus);
  projectorWindow.on('resized', broadcastProjectorStatus);
}

app.whenReady().then(() => {
  createMainWindow();
  createProjectorWindow();

  // Listen for display changes (e.g. plugging in a monitor)
  screen.on('display-added', broadcastProjectorStatus);
  screen.on('display-removed', broadcastProjectorStatus);
  screen.on('display-metrics-changed', broadcastProjectorStatus);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      createProjectorWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------------- TIMER LOGIC ---------------- */
function broadcast(channel, data) {
  // Update Electron windows (Local)
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(channel, data);
  });

  // Update Socket.io clients (Remote)
  if (channel === 'timer:update') {
    io.emit('timer:update', data);
  } else if (channel === 'timer:title') {
    io.emit('timer:title', data);
  } else if (channel === 'timer:finished') {
    io.emit('timer:finished', data);
  } else if (channel === 'timer:configUpdate') {
    io.emit('timer:configUpdate', data);
  } else if (channel === 'timer:notes') {
    io.emit('timer:notes', data);
  } else if (channel === 'timer:flash') {
    io.emit('timer:flash');
  } else if (channel === 'timer:projectorStatus') {
    // Broadcast hardware status to all remote controllers
    io.emit('timer:projectorStatus', data);
  }
}

/* ---------------- PROJECTOR STATUS MONITORING ---------------- */
function getProjectorStatus() {
  if (!projectorWindow || projectorWindow.isDestroyed()) {
    return { active: false, label: "Disconnected", isExternal: false };
  }

  try {
    const displays = screen.getAllDisplays();
    const currentDisplay = screen.getDisplayMatching(projectorWindow.getBounds());
    const isExternal = currentDisplay.id !== screen.getPrimaryDisplay().id;

    return {
      active: true,
      isExternal,
      displayName: currentDisplay.label || `Display ${currentDisplay.id}`,
      displayId: currentDisplay.id,
      allDisplays: displays.map(d => ({
          id: d.id,
          label: d.label || `Display ${d.id}`,
          isPrimary: d.id === screen.getPrimaryDisplay().id,
          bounds: d.bounds
      }))
    };
  } catch (err) {
    console.error("Error calculating projector status:", err);
    return { active: false, label: "Error", isExternal: false };
  }
}

function broadcastProjectorStatus() {
  const status = getProjectorStatus();
  broadcast('timer:projectorStatus', status);
}

function startTimer(ms, wrapUpOverride = null) {
  clearInterval(timerInterval);

  if (typeof ms === 'number') {
    remainingMs = ms;
    totalMs = ms; // Store initial duration
    overtimeMs = 0;
    isOvertime = false;
    activeWrapUp = wrapUpOverride;
  }

  if (remainingMs <= 0) {
    remainingMs = 0;
    isOvertime = true;
    overtimeMs = 0;
  }

  isRunning = true;
  isPaused = false;

  broadcast('timer:update', { remainingMs, totalMs, isRunning, isOvertime, overtimeMs, isPaused });

  timerInterval = setInterval(() => {
    if (!isOvertime) {
      remainingMs -= 1000;

      if (remainingMs <= 0) {
        remainingMs = 0;
        isOvertime = true;
        overtimeMs = 0;
        broadcast('timer:finished', {});
      }
    } else {
      overtimeMs += 1000;
    }

    broadcast('timer:update', { remainingMs, totalMs, isRunning, isOvertime, overtimeMs, isPaused });
  }, 1000);
}

function pauseTimer() {
  isRunning = false;
  isPaused = true;
  clearInterval(timerInterval);
  broadcast('timer:update', { remainingMs, totalMs, isRunning, isOvertime, overtimeMs, isPaused });
}

function resumeTimer() {
  if (isRunning) return; // already running

  isRunning = true;
  isPaused = false;

  broadcast('timer:update', { remainingMs, totalMs, isRunning, isOvertime, overtimeMs, isPaused });

  timerInterval = setInterval(() => {
    if (!isOvertime) {
      remainingMs -= 1000;

      if (remainingMs <= 0) {
        remainingMs = 0;
        isOvertime = true;
        overtimeMs = 0;
        broadcast('timer:finished', {});
      }
    } else {
      overtimeMs += 1000;
    }

    broadcast('timer:update', { remainingMs, totalMs, isRunning, isOvertime, overtimeMs, isPaused });
  }, 1000);
}

function resetTimer() {
  isRunning = false;
  isPaused = false;
  remainingMs = 0;
  totalMs = 0;
  isOvertime = false;
  overtimeMs = 0;
  clearInterval(timerInterval);
  broadcast('timer:update', { remainingMs, totalMs, isRunning, isOvertime, overtimeMs, isPaused });
}

function seekTimer(ms) {
  if (ms <= 0) {
    remainingMs = 0;
    isOvertime = true;
    overtimeMs = Math.abs(ms);
  } else {
    remainingMs = ms;
    isOvertime = false;
    overtimeMs = 0;
  }
  broadcast('timer:update', { remainingMs, totalMs, isRunning, isOvertime, overtimeMs, isPaused });
}

ipcMain.handle('timer:start', (event, data) => {
  // Support both raw ms (legacy) and structured payload {ms, wrapUp}
  const ms = (typeof data === 'object' && data !== null) ? data.ms : data;
  const wrapUp = (typeof data === 'object' && data !== null) ? data.wrapUp : null;
  startTimer(ms, wrapUp);
});

ipcMain.handle('timer:pause', () => {
  pauseTimer();
});

ipcMain.handle('timer:resume', () => {
  resumeTimer();
});

ipcMain.handle('timer:reset', () => {
  resetTimer();
});

ipcMain.handle('timer:seek', (event, ms) => {
  seekTimer(ms);
});

ipcMain.handle('timer:flash', () => {
  broadcast('timer:flash');
});

ipcMain.handle("timer:getState", () => {
  return { 
    remainingMs, 
    totalMs, 
    isRunning, 
    isOvertime, 
    overtimeMs, 
    isPaused, 
    customTitle, 
    customNotes, 
    config,
    activeWrapUp, // Send current overrides if any
    projectorStatus: getProjectorStatus()
  };
});

ipcMain.handle("timer:savePreset", (event, preset) => {
  config.customPresets.push(preset);
  saveConfig();
  broadcast('timer:configUpdate', config);
});

ipcMain.handle("timer:deletePreset", (event, id) => {
  config.customPresets = config.customPresets.filter(p => p.id !== id);
  saveConfig();
  broadcast('timer:configUpdate', config);
});

ipcMain.handle("timer:setTitle", (event, title) => {
  customTitle = title || "";
  broadcast("timer:title", { title: customTitle });
});
ipcMain.handle('timer:saveSettings', (event, settings) => {
  config.settings = { ...config.settings, ...settings };
  saveConfig();
  broadcast('timer:configUpdate', config);
});

ipcMain.handle("timer:setNotes", (event, notes) => {
  customNotes = notes || "";
  broadcast('timer:notes', { notes: customNotes });
});

ipcMain.handle('timer:controlProjector', (event, action, data) => {
  const displayId = data?.displayId;
  
  if (action === 'open') {
    createProjectorWindow(displayId);
    return true;
  }

  if (!projectorWindow || projectorWindow.isDestroyed()) {
    if (action === 'setDisplay' && displayId) {
       createProjectorWindow(displayId);
       return true;
    }
    return false;
  }

  switch (action) {
    case 'close':
      projectorWindow.close();
      return true;
    case 'fullscreen':
      const isFull = projectorWindow.isFullScreen();
      projectorWindow.setFullScreen(!isFull);
      return true;
    case 'reload':
      projectorWindow.reload();
      return true;
    case 'focus':
      projectorWindow.focus();
      return true;
    case 'setDisplay':
      if (displayId) {
          createProjectorWindow(displayId);
          return true;
      }
      break;
  }
  return false;
});

// TUNNEL CONTROL IPCs
ipcMain.handle('timer:startTunnel', async () => {
  if (activeTunnelProcess) return config.tunnelUrl;

  return new Promise((resolve, reject) => {
    console.log('Starting Tunnelmole for port 8321...');
    // We use npx to ensure we use the local version without global install
    activeTunnelProcess = spawn('npx', ['-y', 'tunnelmole', '8321']);

    let tunnelUrl = null;

    activeTunnelProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('TM Data:', output);
      const match = output.match(/https:\/\/[a-z0-9-]+\.tunnelmole\.net/);
      if (match && !tunnelUrl) {
        tunnelUrl = match[0];
        config.tunnelUrl = tunnelUrl;
        broadcast('timer:configUpdate', config);
        saveConfig();
        resolve(tunnelUrl);
      }
    });

    activeTunnelProcess.stderr.on('data', (data) => {
      console.error('TM Error:', data.toString());
    });

    activeTunnelProcess.on('close', (code) => {
      console.log(`Tunnelmole exited with code ${code}`);
      activeTunnelProcess = null;
      config.tunnelUrl = null;
      broadcast('timer:configUpdate', config);
      saveConfig();
    });

    setTimeout(() => {
      if (!tunnelUrl) {
        if (activeTunnelProcess) activeTunnelProcess.kill();
        reject(new Error('Tunnel timeout'));
      }
    }, 20000);
  });
});

ipcMain.handle('timer:stopTunnel', () => {
  if (activeTunnelProcess) {
    activeTunnelProcess.kill();
    activeTunnelProcess = null;
    config.tunnelUrl = null;
    broadcast('timer:configUpdate', config);
    saveConfig();
    return true;
  }
  return false;
});

// DEVICE AUTHORITY IPCs
ipcMain.handle('timer:blockDevice', (event, { socketId, deviceId }) => {
  if (deviceId && !config.settings.blockedDevices.includes(deviceId)) {
    config.settings.blockedDevices.push(deviceId);
    saveConfig();
  }
  const socket = io.sockets.sockets.get(socketId);
  if (socket) {
    socket.emit('auth:error', 'Access revoked by production director');
    socket.disconnect(true);
  }
  broadcast('timer:configUpdate', config);
  broadcastDevices();
  return true;
});

ipcMain.handle('timer:unblockDevice', (event, deviceId) => {
  if (deviceId) {
    config.settings.blockedDevices = config.settings.blockedDevices.filter(id => id !== deviceId);
    saveConfig();
    broadcast('timer:configUpdate', config);
    broadcastDevices();
    return true;
  }
  return false;
});

ipcMain.handle('timer:refreshPin', () => {
  // 1. Generate new PIN
  const newPin = Math.floor(1000 + Math.random() * 9000).toString();
  config.settings.securityPin = newPin;
  saveConfig();

  // 2. Selectively disconnect remote participants
  io.sockets.sockets.forEach((socket) => {
    const dev = remoteDevices.get(socket.id);
    if (!dev) return;

    // Check if security PIN is required for this specific device type
    const isController = dev.clientType === 'controller';
    const pinRequired = isController
      ? config.settings.requirePinController
      : config.settings.requirePinProjector;

    if (pinRequired) {
      // Security code has been refreshed, force them to re-auth
      socket.emit('auth:error', 'Security code has been refreshed. Please re-authenticate.');
      socket.disconnect(true);
      remoteDevices.delete(socket.id);
    }
    // If not required, leave them connected and authenticated
  });

  // 3. Broadcast the new config to local windows (to show the new PIN)
  broadcast('timer:configUpdate', config);
  broadcastDevices();

  console.log(`-------------------------------------------`);
  console.log(`SECURITY PIN REFRESHED: ${newPin}`);
  console.log(`-------------------------------------------`);

  return newPin;
});

ipcMain.handle('timer:getDevices', () => {
  return Array.from(remoteDevices.values());
});

process.on('exit', () => {
  if (activeTunnelProcess) activeTunnelProcess.kill();
});

// SAFETY ENGINE: Prevent "Uncaught Exception" crashes from network blips
process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception caught by Safety Engine:', err);
  // We log but don't quit to keep the timer running during production
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});
