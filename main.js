const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let mainWindow = null;
let projectorWindow = null;

let timerInterval = null;
let remainingMs = 0;
let isRunning = false;
let isOvertime = false;
let overtimeMs = 0; 
let isPaused = false;
let customTitle = "";

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
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(channel, data);
  });
}

function startTimer(ms) {
  clearInterval(timerInterval);

  if (typeof ms === 'number') {
    remainingMs = ms;
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

  broadcast('timer:update', { remainingMs, isRunning, isOvertime, overtimeMs, isPaused });

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

    broadcast('timer:update', { remainingMs, isRunning, isOvertime, overtimeMs, isPaused });
  }, 1000);
}

function pauseTimer() {
  isRunning = false;
  isPaused = true;
  clearInterval(timerInterval);
  broadcast('timer:update', { remainingMs, isRunning, isOvertime, overtimeMs, isPaused });
}

function resumeTimer() {
  if (isRunning) return; // already running

  isRunning = true;
  isPaused = false;

  broadcast('timer:update', { remainingMs, isRunning, isOvertime, overtimeMs, isPaused });

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

    broadcast('timer:update', { remainingMs, isRunning, isOvertime, overtimeMs, isPaused });
  }, 1000);
}

function resetTimer() {
  isRunning = false;
  isPaused = false;
  remainingMs = 0;
  isOvertime = false;
  overtimeMs = 0;
  clearInterval(timerInterval);
  broadcast('timer:update', { remainingMs, isRunning, isOvertime, overtimeMs, isPaused });
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
  return { remainingMs, isRunning, isOvertime, overtimeMs, isPaused, customTitle };
});

ipcMain.handle("timer:setTitle", (event, title) => {
  customTitle = title || "";
  broadcast("timer:title", { title: customTitle });
});