/* ---------------- ENVIRONMENT DETECTION & BRIDGE ---------------- */
if (typeof window.timerAPI === 'undefined') {
  // We are running in a web browser (Remote Device)
  const socket = io();

  window.timerAPI = {
    start: (ms) => socket.emit('timer:start', ms),
    pause: () => socket.emit('timer:pause'),
    reset: () => socket.emit('timer:reset'),
    resume: () => socket.emit('timer:resume'),
    setTitle: (title) => socket.emit('timer:setTitle', title),
    getState: () => new Promise((resolve) => {
      socket.emit('timer:getState');
      socket.once('timer:state', (state) => resolve(state));
    }),
    onUpdate: (cb) => socket.on('timer:update', cb),
    onFinished: (cb) => socket.on('timer:finished', cb),
    onTitle: (cb) => socket.on('timer:title', (data) => cb(data)),
  };

  // Immediate state update when socket connects/reconnects
  socket.on('connect', async () => {
    const state = await window.timerAPI.getState();
    if (typeof window.renderState === 'function') {
      window.renderState(state);
    }
  });

  socket.on('timer:state', (state) => {
    if (typeof window.renderState === 'function') {
       window.renderState(state);
    }
  });
} else {
  // We are running in Electron (Local Controller)
  window.timerAPI.onServerInfo = (cb) => {
    // This comes from ipcRenderer.send('server:info') in main.js
    // But we need to use a listener since preload doesn't expose it yet
    // Actually, let's just use the global scope check or update preload.js
    // For now, I'll use a direct listener if possible, but preload is strict.
    // I'll update preload.js in the next step to expose onServerInfo.
  };
}

/* ---------------- CORE TIMER LOGIC ---------------- */
let currentState = {
  remainingMs: 0,
  isOvertime: false,
  overtimeMs: 0,
  isRunning: false,
  isPaused: false,
};

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

// Make renderState global so the socket bridge can call it
window.renderState = function({ remainingMs, isOvertime, overtimeMs, isRunning, isPaused }) {
  currentState = { remainingMs, isOvertime, overtimeMs, isRunning, isPaused };

  const timerLabel = document.getElementById("timerLabel");
  const display = document.getElementById("display");
  const statusPill = document.getElementById("statusPill");

  if (!timerLabel || !display || !statusPill) return;

  if (isOvertime) {
    timerLabel.textContent = "Time Up!";
    display.textContent = `-${formatTime(overtimeMs)}`;
    display.classList.add("overtime");
  } else {
    timerLabel.textContent = "Time Remaining";
    display.textContent = formatTime(remainingMs);
    display.classList.remove("overtime");
  }

  // Update Status Pill & Buttons
  const startBtn = document.getElementById("startBtn");
  const pauseBtn = document.getElementById("pauseBtn");

  if (isRunning) {
    statusPill.dataset.state = "running";
    statusPill.textContent = "Running";
    if (startBtn) startBtn.disabled = true;
    if (pauseBtn) {
      pauseBtn.disabled = false;
      pauseBtn.textContent = "Pause";
    }
  } else if (isPaused) {
    statusPill.dataset.state = "paused";
    statusPill.textContent = "Paused";
    if (startBtn) startBtn.disabled = false;
    if (pauseBtn) {
      pauseBtn.disabled = false;
      pauseBtn.textContent = "Resume";
    }
  } else {
    statusPill.dataset.state = "paused";
    statusPill.textContent = "Idle";
    if (startBtn) startBtn.disabled = false;
    if (pauseBtn) {
      pauseBtn.disabled = true;
      pauseBtn.textContent = "Pause";
    }
  }
};

window.addEventListener("DOMContentLoaded", async () => {
  const minutesInput = document.getElementById("minutes");
  const secondsInput = document.getElementById("seconds");
  const startBtn = document.getElementById("startBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const resetBtn = document.getElementById("resetBtn");
  const customTitleInput = document.getElementById("customTitle");
  const presetButtons = document.querySelectorAll(".preset-btn");

  // Initial State Fetch
  const state = await window.timerAPI.getState();
  window.renderState({
    remainingMs: state.remainingMs || 0,
    isOvertime: state.isOvertime || false,
    overtimeMs: state.overtimeMs || 0,
    isRunning: state.isRunning || false,
    isPaused: state.isPaused || false,
  });

  if (state.customTitle && customTitleInput) {
    customTitleInput.value = state.customTitle;
  }

  // Listen for updates
  window.timerAPI.onUpdate((data) => window.renderState(data));
  window.timerAPI.onTitle(({ title }) => {
    if (customTitleInput && document.activeElement !== customTitleInput) {
       customTitleInput.value = title;
    }
  });

  // Handle Server Info (only works in Electron)
  if (window.timerAPI.onServerInfo) {
    window.timerAPI.onServerInfo(({ url }) => {
       const infoRow = document.getElementById("remoteControlInfo");
       const urlSpan = document.getElementById("remoteUrl");
       if (infoRow && urlSpan) {
         infoRow.style.display = "flex";
         urlSpan.textContent = url;
       }
    });
  }

  // Input listeners
  presetButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mins = Number(btn.dataset.minutes || "0");
      minutesInput.value = String(mins);
      secondsInput.value = "0";
    });
  });

  startBtn.addEventListener("click", () => {
    const mins = Number(minutesInput.value) || 0;
    const secs = Number(secondsInput.value) || 0;
    const totalSeconds = mins * 60 + secs;

    if (totalSeconds <= 0) {
      secondsInput.focus();
      return;
    }

    const ms = totalSeconds * 1000;
    window.timerAPI.start(ms);
  });

  pauseBtn.addEventListener("click", () => {
    if (currentState.isRunning) {
      window.timerAPI.pause();
    } else if (currentState.isPaused) {
      window.timerAPI.resume();
    }
  });

  resetBtn.addEventListener("click", () => {
    window.timerAPI.reset();
  });

  customTitleInput.addEventListener("input", () => {
    window.timerAPI.setTitle(customTitleInput.value.trim());
  });
});