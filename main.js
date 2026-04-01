const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const networkAddress = require('network-address');

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

io.on('connection', (socket) => {
  console.log('Remote client connected');

  // Send current state to new client
  socket.emit('timer:state', { remainingMs, totalMs, isRunning, isOvertime, overtimeMs, isPaused, customTitle });

  socket.on('timer:start', (ms) => {
    startTimer(ms);
  });

  socket.on('timer:pause', () => {
    pauseTimer();
  });

  socket.on('timer:resume', () => {
    resumeTimer();
  });

  socket.on('timer:reset', () => {
    resetTimer();
  });

  socket.on('timer:setTitle', (title) => {
    customTitle = title || "";
    broadcast("timer:title", { title: customTitle });
  });

  socket.on('timer:getState', () => {
    socket.emit('timer:state', { remainingMs, totalMs, isRunning, isOvertime, overtimeMs, isPaused, customTitle });
  });
});

server.listen(port, () => {
  console.log(`Remote control server running at ${serverUrl}`);
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
  }
}

function startTimer(ms) {
  clearInterval(timerInterval);

  if (typeof ms === 'number') {
    remainingMs = ms;
    totalMs = ms; // Store initial duration
    overtimeMs = 0;
    isOvertime = false;
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

ipcMain.handle('timer:start', (event, ms) => {
  startTimer(ms);
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
  return { remainingMs, totalMs, isRunning, isOvertime, overtimeMs, isPaused, customTitle };
});

ipcMain.handle("timer:setTitle", (event, title) => {
  customTitle = title || "";
  broadcast("timer:title", { title: customTitle });
});