const { app, BrowserWindow, ipcMain, nativeImage, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const networkAddress = require('network-address');
const { spawn } = require('child_process');
// tunnelmole is an ES module, we will dynamic import it in the handler

const APP_NAME = 'Down to Earth';
const APP_ID = 'com.codemon.downtoearth';
const appIconPng = path.join(__dirname, 'build', 'icon.png');
const appIconIco = path.join(__dirname, 'build', 'icon.ico');
const appIconPath = process.platform === 'win32' ? appIconIco : appIconPng;

app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);

if (!app.isPackaged) {
  try {
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, 'node_modules', '.bin', 'electron')
    });
  } catch (err) {
    console.warn('[dev] electron-reload is unavailable:', err.message);
  }
}

let mainWindow = null;
let projectorWindow = null;
const PROJECTOR_FULLSCREEN_KEEPALIVE_MS = 5000;
let projectorFullscreenKeepAlive = null;

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
let currentPlaylistIndex = -1; // Index in config.settings.playlists
let activeTunnelProcess = null;
const remoteDevices = new Map();
let countdownEndsAt = null;
let overtimeStartedAt = null;

function getLocalIpAddress() {
  try {
    return networkAddress() || '127.0.0.1';
  } catch (err) {
    console.warn('Unable to detect local network address, falling back to localhost:', err.message);
    return '127.0.0.1';
  }
}

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
      timerFont: "Outfit",
      titleSize: "6vh",
      titleColor: "rgba(255, 255, 255, 0.8)",
      titleFont: "Outfit",
      notesSize: "4.5vh",
      notesColor: "#ffffff",
      notesFont: "Outfit",
      clockSize: "17vh",
      clockColor: "rgba(255, 255, 255, 0.83)",
      barColor: "#3b82f6",
      barHeight: "12px"
    },
    visibility: {
      showTimer: true,
      showBar: true,
      showClock: false,
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
  localUrl: "http://" + getLocalIpAddress() + ":8321"
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeConfigDefaults(defaultValue, loadedValue) {
  if (!isPlainObject(defaultValue) || !isPlainObject(loadedValue)) {
    return loadedValue === undefined ? defaultValue : loadedValue;
  }

  const merged = { ...defaultValue };
  for (const [key, value] of Object.entries(loadedValue)) {
    merged[key] = mergeConfigDefaults(defaultValue[key], value);
  }
  return merged;
}

function migrateFontToOutfit(settings) {
  const appearance = settings?.appearance;
  if (!appearance) return;

  const legacySansFonts = new Set(["system-ui", "'Inter'", "Inter"]);
  if (!appearance.timerFont || appearance.timerFont === "ui-monospace" || legacySansFonts.has(appearance.timerFont)) {
    appearance.timerFont = "Outfit";
  }
  if (!appearance.titleFont || legacySansFonts.has(appearance.titleFont)) {
    appearance.titleFont = "Outfit";
  }
  if (!appearance.notesFont || legacySansFonts.has(appearance.notesFont)) {
    appearance.notesFont = "Outfit";
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      const loaded = JSON.parse(data);
      // Deep merge settings
      config.settings = mergeConfigDefaults(config.settings, loaded.settings || {});
      migrateFontToOutfit(config.settings);
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

function setProjectorNotes(notes) {
  customNotes = notes || "";
  broadcast("timer:notes", { notes: customNotes });
}

function applySettingsUpdate(settings = {}) {
  const previousActiveMessageId = config.settings.activeMessageId || null;
  config.settings = { ...config.settings, ...settings };

  if (
    Object.prototype.hasOwnProperty.call(settings, 'messages') ||
    Object.prototype.hasOwnProperty.call(settings, 'activeMessageId')
  ) {
    const messages = Array.isArray(config.settings.messages) ? config.settings.messages : [];
    const activeMessageId = config.settings.activeMessageId || null;
    const activeMessage = activeMessageId ? messages.find(message => message.id === activeMessageId) : null;

    if (activeMessage) {
      setProjectorNotes(activeMessage);
    } else {
      config.settings.activeMessageId = null;
      if (previousActiveMessageId) {
        setProjectorNotes("");
      }
    }
  }

  saveConfig();
  broadcast('timer:configUpdate', config);
}

// Initial Load
loadConfig();

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

/* ---------------- SERVER SETUP ---------------- */
const preferredPort = 8321;
const localIp = getLocalIpAddress();
let activePort = preferredPort;
let serverUrl = `http://${localIp}:${activePort}`;
let serverStarted = false;

function updateServerUrl(port) {
  activePort = port;
  serverUrl = `http://${localIp}:${activePort}`;
  config.localUrl = serverUrl;
}

const expressApp = express();
const server = http.createServer(expressApp);
const io = new Server(server);
server.on('error', (err) => {
  if (serverStarted) {
    console.error('Remote control server error:', err);
  }
});
const controllerOutPath = path.join(__dirname, 'controller', 'controller', 'out');
const hasControllerBuild = fs.existsSync(path.join(controllerOutPath, 'index.html'));

// Serve project files for remote web clients
if (hasControllerBuild) {
  expressApp.use(express.static(controllerOutPath));
}
expressApp.use(express.static(__dirname));

// Route root to renderer.html
expressApp.get('/', (req, res) => {
  if (hasControllerBuild) {
    res.sendFile(path.join(controllerOutPath, 'index.html'));
  } else {
    res.sendFile(path.join(__dirname, 'renderer.html'));
  }
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
          updateProjectorFullscreenKeepAlive();
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
            updateProjectorFullscreenKeepAlive();
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
            updateProjectorFullscreenKeepAlive();
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
    
    const ms = (typeof data === 'object' && data !== null) ? data.ms : data;
    const wrapUp = (typeof data === 'object' && data !== null) ? data.wrapUp : null;
    const index = (typeof data === 'object' && data !== null) ? data.index : -1;
    const title = (typeof data === 'object' && data !== null) ? data.title : "";
    const notes = (typeof data === 'object' && data !== null) ? data.notes : "";

    if (title) {
      customTitle = title;
      broadcast('timer:title', { title });
    }
    if (notes !== undefined) {
      customNotes = notes;
      broadcast('timer:notes', { notes });
    }

    startTimer(ms, wrapUp, index);
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
        projectorStatus: getProjectorStatus(),
        currentPlaylistIndex,
        currentTitle: getRunningItemTitle(),
        activeWrapUp,
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

  socket.on('timer:refreshPin', (callback) => {
    if (!authState) return socket.emit('auth:error', 'Authentication required');
    const newPin = refreshSecurityPin();
    if (typeof callback === 'function') callback(newPin);
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
    applySettingsUpdate(settings);
  });

  socket.on('timer:setNotes', (notes) => {
    if (!authState) return socket.emit('auth:error', 'Authentication required');
    setProjectorNotes(notes);
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
      activeTunnelProcess = spawn('npx', ['-y', 'tunnelmole', String(activePort)]);
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

function listenOnPort(port) {
  return new Promise((resolve, reject) => {
    const handleError = (err) => {
      server.off('listening', handleListening);
      reject(err);
    };

    const handleListening = () => {
      server.off('error', handleError);
      resolve(port);
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port);
  });
}

async function startRemoteServer() {
  const maxFallbackPort = preferredPort + 20;

  for (let port = preferredPort; port <= maxFallbackPort; port += 1) {
    try {
      const listeningPort = await listenOnPort(port);
      updateServerUrl(listeningPort);
      serverStarted = true;
      console.log(`Remote control server running at ${serverUrl}`);
      console.log(`-------------------------------------------`);
      console.log(`SECURITY PIN: ${config.settings.securityPin}`);
      console.log(`-------------------------------------------`);
      return true;
    } catch (err) {
      if (err.code === 'EADDRINUSE' && port < maxFallbackPort) {
        console.warn(`Port ${port} is busy; trying ${port + 1}.`);
        continue;
      }

      console.error('Remote control server failed to start:', err);
      return false;
    }
  }

  return false;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    fullscreen: true,
    frame: true,
    autoHideMenuBar: true,
    backgroundColor: '#1414147d',
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (serverStarted && hasControllerBuild) {
    mainWindow.loadURL(serverUrl);
  } else {
    mainWindow.loadFile('renderer.html');
  }

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

function shouldKeepProjectorFullscreen() {
  return Boolean(
    projectorWindow &&
    !projectorWindow.isDestroyed() &&
    isRunning &&
    !isPaused
  );
}

function enforceProjectorFullscreen() {
  if (!shouldKeepProjectorFullscreen()) return;

  try {
    if (!projectorWindow.isVisible()) {
      projectorWindow.show();
    }
    if (!projectorWindow.isFullScreen()) {
      projectorWindow.setFullScreen(true);
      broadcastProjectorStatus();
    }
  } catch (err) {
    console.error('Unable to keep projector fullscreen:', err);
  }
}

function updateProjectorFullscreenKeepAlive() {
  if (shouldKeepProjectorFullscreen()) {
    if (!projectorFullscreenKeepAlive) {
      projectorFullscreenKeepAlive = setInterval(enforceProjectorFullscreen, PROJECTOR_FULLSCREEN_KEEPALIVE_MS);
      projectorFullscreenKeepAlive.unref?.();
    }
    enforceProjectorFullscreen();
    return;
  }

  if (projectorFullscreenKeepAlive) {
    clearInterval(projectorFullscreenKeepAlive);
    projectorFullscreenKeepAlive = null;
  }
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
    updateProjectorFullscreenKeepAlive();
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
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  projectorWindow.loadFile('projector.html');

   projectorWindow.once('ready-to-show', () => {
    projectorWindow.setFullScreen(true);
    updateProjectorFullscreenKeepAlive();
    broadcastProjectorStatus();
  });

  projectorWindow.on('closed', () => {
    projectorWindow = null;
    updateProjectorFullscreenKeepAlive();
    broadcastProjectorStatus();
  });

  // Track if projector is moved between displays manually (if not in fullscreen)
  projectorWindow.on('moved', broadcastProjectorStatus);
  projectorWindow.on('resized', broadcastProjectorStatus);
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin' && app.dock && fs.existsSync(appIconPng)) {
    app.dock.setIcon(nativeImage.createFromPath(appIconPng));
  }

  await startRemoteServer();
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
function getDisplayLabel(display, index, primaryDisplayId) {
  const label = display.label?.trim();
  if (label) return label;
  if (display.id === primaryDisplayId) return 'Primary Display';
  return `Display ${index + 1}`;
}

function getDisplayList() {
  const displays = screen.getAllDisplays();
  const primaryDisplayId = screen.getPrimaryDisplay().id;

  return displays.map((display, index) => ({
    id: display.id,
    label: getDisplayLabel(display, index, primaryDisplayId),
    isPrimary: display.id === primaryDisplayId,
    bounds: display.bounds
  }));
}

function getProjectorStatus() {
  const displays = getDisplayList();

  if (!projectorWindow || projectorWindow.isDestroyed()) {
    return {
      active: false,
      label: "Disconnected",
      displayName: "Disconnected",
      isExternal: false,
      isFullScreen: false,
      displays,
      allDisplays: displays
    };
  }

  try {
    const currentDisplay = screen.getDisplayMatching(projectorWindow.getBounds());
    const currentDisplayInfo = displays.find(display => display.id === currentDisplay.id);
    const isExternal = currentDisplay.id !== screen.getPrimaryDisplay().id;

    return {
      active: true,
      isExternal,
      isFullScreen: projectorWindow.isFullScreen(),
      displayName: currentDisplayInfo?.label || currentDisplay.label || `Display ${currentDisplay.id}`,
      displayId: currentDisplay.id,
      displays,
      allDisplays: displays
    };
  } catch (err) {
    console.error("Error calculating projector status:", err);
    return {
      active: false,
      label: "Error",
      displayName: "Error",
      isExternal: false,
      isFullScreen: false,
      displays,
      allDisplays: displays
    };
  }
}

function broadcastProjectorStatus() {
  const status = getProjectorStatus();
  broadcast('timer:projectorStatus', status);
}

function requestSpeech(text) {
  const phrase = String(text || '').trim();
  if (!phrase || !config.settings.ttsEnabled) return;
  broadcast('timer:speak', { text: phrase });
}

function announcePlaylistItem(index) {
  if (!config.settings.readPlaylistTitle) return;
  if (index < 0) return;

  const itemTitle = config.settings.playlists?.[index]?.title || getRunningItemTitle();
  requestSpeech(itemTitle);
}

function refreshSecurityPin() {
  const newPin = Math.floor(1000 + Math.random() * 9000).toString();
  config.settings.securityPin = newPin;
  saveConfig();

  io.sockets.sockets.forEach((socket) => {
    const dev = remoteDevices.get(socket.id);
    if (!dev) return;

    const isController = dev.clientType === 'controller';
    const pinRequired = isController
      ? config.settings.requirePinController
      : config.settings.requirePinProjector;

    if (pinRequired) {
      socket.emit('auth:error', 'Security code has been refreshed. Please re-authenticate.');
      socket.disconnect(true);
      remoteDevices.delete(socket.id);
    }
  });

  broadcast('timer:configUpdate', config);
  broadcastDevices();

  console.log(`-------------------------------------------`);
  console.log(`SECURITY PIN REFRESHED: ${newPin}`);
  console.log(`-------------------------------------------`);

  return newPin;
}

function getTimerState(extra = {}) {
  return {
    remainingMs,
    totalMs,
    isRunning,
    isOvertime,
    overtimeMs,
    isPaused,
    customTitle,
    customNotes,
    currentPlaylistIndex,
    currentTitle: getRunningItemTitle(),
    activeWrapUp,
    ...extra
  };
}

function syncTimerFromClock() {
  if (!isRunning) return false;

  const now = Date.now();
  let finishedNow = false;

  if (!isOvertime) {
    remainingMs = Math.max(0, (countdownEndsAt || now) - now);
    if (remainingMs <= 0) {
      remainingMs = 0;
      isOvertime = true;
      overtimeStartedAt = countdownEndsAt || now;
      overtimeMs = Math.max(0, now - overtimeStartedAt);
      finishedNow = true;
    }
  } else {
    overtimeMs = Math.max(0, now - (overtimeStartedAt || now));
  }

  return finishedNow;
}

function runTimerInterval() {
  clearInterval(timerInterval);

  // Broadcast state immediately so clients don't wait 1s for the first tick
  broadcast('timer:update', getTimerState());

  timerInterval = setInterval(() => {
    const finishedNow = syncTimerFromClock();
    if (finishedNow) {
      broadcast('timer:finished', {});
    }

    if (isOvertime && config.settings.autoAdvance && overtimeMs >= 10000) {
      processAutoAdvance();
      return;
    }

    broadcast('timer:update', getTimerState());
  }, 250);
}

function getRunningItemTitle() {
  if (currentPlaylistIndex >= 0 && config.settings.playlists?.[currentPlaylistIndex]) {
    return config.settings.playlists[currentPlaylistIndex].title;
  }
  return customTitle;
}

function processAutoAdvance() {
  const nextIdx = currentPlaylistIndex + 1;
  const playlists = config.settings.playlists || [];
  
  if (nextIdx < playlists.length && config.settings.autoAdvance) {
    const nextItem = playlists[nextIdx];
    const itemMs = (nextItem.minutes * 60 + nextItem.seconds) * 1000;
    
    let wrapUp = null;
    if (nextItem.yellowSec || nextItem.redSec) {
      wrapUp = {
        yellowMs: (nextItem.yellowSec || 60) * 1000,
        redMs: (nextItem.redSec || 30) * 1000,
        flashOnRed: config.settings.wrapUp?.flashOnRed ?? true,
        flashOnOvertime: config.settings.wrapUp?.flashOnOvertime ?? true,
        soundOnYellow: config.settings.wrapUp?.soundOnYellow ?? false,
        soundOnRed: config.settings.wrapUp?.soundOnRed ?? true
      };
    }
    
    startTimer(itemMs, wrapUp, nextIdx);
  } else {
    resetTimer();
  }
}

function startTimer(ms, wrapUpOverride = null, index = -1) {
  currentPlaylistIndex = index;
  const now = Date.now();
  if (typeof ms === 'number') {
    remainingMs = Math.max(0, ms);
    totalMs = Math.max(0, ms);
    overtimeMs = 0;
    isOvertime = false;
    activeWrapUp = wrapUpOverride;
  }
  countdownEndsAt = now + remainingMs;
  overtimeStartedAt = null;
  if (remainingMs <= 0) {
    remainingMs = 0;
    isOvertime = true;
    overtimeStartedAt = now;
  }
  isRunning = true;
  isPaused = false;
  runTimerInterval();
  updateProjectorFullscreenKeepAlive();
  announcePlaylistItem(currentPlaylistIndex);
}

function pauseTimer() {
  syncTimerFromClock();
  isRunning = false;
  isPaused = true;
  countdownEndsAt = null;
  overtimeStartedAt = null;
  clearInterval(timerInterval);
  updateProjectorFullscreenKeepAlive();
  broadcast('timer:update', getTimerState());
}

function resumeTimer() {
  if (isRunning) return; 
  isRunning = true;
  isPaused = false;
  const now = Date.now();
  if (isOvertime) {
    overtimeStartedAt = now - overtimeMs;
    countdownEndsAt = now;
  } else {
    countdownEndsAt = now + remainingMs;
    overtimeStartedAt = null;
  }
  runTimerInterval();
  updateProjectorFullscreenKeepAlive();
}

function resetTimer() {
  isRunning = false;
  isPaused = false;
  remainingMs = 0;
  totalMs = 0;
  isOvertime = false;
  overtimeMs = 0;
  activeWrapUp = null;
  currentPlaylistIndex = -1;
  countdownEndsAt = null;
  overtimeStartedAt = null;
  clearInterval(timerInterval);
  updateProjectorFullscreenKeepAlive();
  broadcast('timer:update', getTimerState());
}

function seekTimer(ms) {
  const targetMs = Number(ms) || 0;
  if (targetMs <= 0) {
    remainingMs = 0;
    isOvertime = true;
    overtimeMs = Math.abs(targetMs);
  } else {
    remainingMs = targetMs;
    isOvertime = false;
    overtimeMs = 0;
  }
  if (isRunning) {
    const now = Date.now();
    if (isOvertime) {
      countdownEndsAt = now;
      overtimeStartedAt = now - overtimeMs;
    } else {
      countdownEndsAt = now + remainingMs;
      overtimeStartedAt = null;
    }
  }
  updateProjectorFullscreenKeepAlive();
  broadcast('timer:update', getTimerState());
}

ipcMain.handle('timer:start', (event, data) => {
  const ms = (typeof data === 'object' && data !== null) ? data.ms : data;
  const wrapUp = (typeof data === 'object' && data !== null) ? data.wrapUp : null;
  const index = (typeof data === 'object' && data !== null) ? data.index : -1;
  const title = (typeof data === 'object' && data !== null) ? data.title : "";
  const notes = (typeof data === 'object' && data !== null) ? data.notes : "";
  
  if (title) customTitle = title;
  if (notes !== undefined) customNotes = notes;
  
  startTimer(ms, wrapUp, index);
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
    currentPlaylistIndex,
    currentTitle: getRunningItemTitle(),
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
  applySettingsUpdate(settings);
});

ipcMain.handle("timer:setNotes", (event, notes) => {
  setProjectorNotes(notes);
});

ipcMain.handle('timer:controlProjector', (event, action, data) => {
  const displayId = data?.displayId;
  
  if (action === 'open') {
    createProjectorWindow(displayId);
    updateProjectorFullscreenKeepAlive();
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
      updateProjectorFullscreenKeepAlive();
      broadcastProjectorStatus();
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
          updateProjectorFullscreenKeepAlive();
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
    console.log(`Starting Tunnelmole for port ${activePort}...`);
    // We use npx to ensure we use the local version without global install
    activeTunnelProcess = spawn('npx', ['-y', 'tunnelmole', String(activePort)]);

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
  return refreshSecurityPin();
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
