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
  playlists: [],
  settings: {
    autoAdvance: false,
    ttsEnabled: true,
    alarmSound: 'pulse',
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
    blockedDevices: []
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
      config.playlists = loaded.playlists || [];
      
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
  mainWindow?.webContents.send('timer:devicesUpdate', Array.from(remoteDevices.values()));
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

  // Send current state to new client (Read-only initially)
  socket.emit('timer:state', { 
    remainingMs, totalMs, isRunning, isOvertime, overtimeMs, isPaused, customTitle,
    customNotes, config 
  });

  socket.on('register', ({ pin, deviceId, userAgent }) => {
    // 1. Mandatory Identity Update (Even for blocked devices)
    const dev = remoteDevices.get(socket.id);
    if (dev) {
      dev.deviceId = deviceId || dev.deviceId;
      dev.userAgent = userAgent || dev.userAgent;
      remoteDevices.set(socket.id, dev);
    }

    // 2. Blacklist Check
    if (config.settings.blockedDevices?.includes(deviceId)) {
      broadcastDevices(); // UI sync
      return socket.emit('registered', { success: false, error: 'Access Blocked' });
    }

    // 3. Authentication
    const isSuccess = (pin === config.settings.securityPin);
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

  socket.on('timer:setTitle', (title) => {
    if (!authState) return socket.emit('auth:error', 'Authentication required');
    customTitle = title || "";
    broadcast("timer:title", { title: customTitle });
  });

  socket.on('timer:getState', (callback) => {
    if (typeof callback === 'function') {
      callback({ 
        remainingMs, totalMs, isRunning, isOvertime, overtimeMs, isPaused, customTitle,
        customNotes, config,
        authRequired: !authState 
      });
    }
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
    backgroundColor: '#000000',
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

function createProjectorWindow() {
  const displays = screen.getAllDisplays();
  const externalDisplay = displays.find((d) => d.bounds.x !== 0 || d.bounds.y !== 0);

  const bounds = externalDisplay ? externalDisplay.bounds : displays[0].bounds;

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
  });
}

app.whenReady().then(() => {
  createMainWindow();
  createProjectorWindow();

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
  }
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

ipcMain.handle('timer:start', (event, { ms, wrapUp }) => {
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
    activeWrapUp // Send current overrides if any
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
ipcMain.handle("timer:saveSettings", (event, settings) => {
  config.settings = { ...config.settings, ...settings };
  saveConfig();
  broadcast('timer:configUpdate', config);
});

ipcMain.handle("timer:setNotes", (event, notes) => {
  customNotes = notes || "";
  broadcast('timer:notes', { notes: customNotes });
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

  // 2. Disconnect all remote participants
  io.sockets.sockets.forEach((socket) => {
    // We don't need to disconnect the host, but remote clients should be forced to re-auth
    socket.emit('auth:error', 'Security code has been refreshed. Please re-authenticate.');
    socket.disconnect(true);
  });

  // 3. Clear remote registry
  remoteDevices.clear();

  // 4. Broadcast the new config to local windows (to show the new PIN)
  broadcast('timer:configUpdate', config);
  mainWindow?.webContents.send('timer:devicesUpdate', []);

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
