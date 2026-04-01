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

/* ---------------- AUDIO LOGIC ---------------- */
let isMuted = false;
let activeAlarmContext = null;

function stopAlarm() {
  if (activeAlarmContext) {
    try {
      activeAlarmContext.close();
    } catch (e) {}
    activeAlarmContext = null;
  }
}

function playAlarm() {
  if (isMuted) return;
  stopAlarm(); // Stop any existing alarm

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  
  activeAlarmContext = new AudioContext();
  const now = activeAlarmContext.currentTime;
  
  // Make it last 7 seconds
  const totalDuration = 7; 
  const pulseInterval = 0.5; // seconds per pulse

  for (let i = 0; i < totalDuration; i += pulseInterval) {
    const startTime = now + i;
    const duration = pulseInterval * 0.8; // 80% duty cycle for the beep

    const osc = activeAlarmContext.createOscillator();
    const gain = activeAlarmContext.createGain();

    // Piercing square wave for high visibility, or high-freq sine
    osc.type = 'sine'; 
    osc.frequency.setValueAtTime(880, startTime); // A5
    osc.frequency.exponentialRampToValueAtTime(440, startTime + duration); // Slide down for siren effect
    
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(1.0, startTime + 0.02); // MAX VOLUME
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    osc.connect(gain);
    gain.connect(activeAlarmContext.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }
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
    stopAlarm(); // Stop when paused
  } else {
    statusPill.dataset.state = "paused";
    statusPill.textContent = "Idle";
    if (startBtn) startBtn.disabled = false;
    if (pauseBtn) {
      pauseBtn.disabled = true;
      pauseBtn.textContent = "Pause";
    }
    stopAlarm(); // Stop when idle
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

  // Listen for timer finish to play alarm
  window.timerAPI.onFinished(() => {
    playAlarm();
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
    stopAlarm(); // Stop alarm immediately on click
    if (currentState.isRunning) {
      window.timerAPI.pause();
    } else if (currentState.isPaused) {
      window.timerAPI.resume();
    }
  });

  resetBtn.addEventListener("click", () => {
    stopAlarm(); // Stop alarm immediately on reset
    window.timerAPI.reset();
  });

  customTitleInput.addEventListener("input", () => {
    window.timerAPI.setTitle(customTitleInput.value.trim());
  });

  const muteBtn = document.getElementById("muteBtn");
  if (muteBtn) {
    muteBtn.addEventListener("click", () => {
      isMuted = !isMuted;
      muteBtn.textContent = isMuted ? "🔇 Muted" : "🔊 Sound On";
      muteBtn.style.color = isMuted ? "#ef4444" : "#9ca3af";
    });
  }

  const testSoundBtn = document.getElementById("testSoundBtn");
  if (testSoundBtn) {
    testSoundBtn.addEventListener("click", () => {
      playAlarm();
    });
  }

  const copyUrlBtn = document.getElementById("copyUrlBtn");
  const remoteUrlSpan = document.getElementById("remoteUrl");
  const copyFeedback = document.getElementById("copyFeedback");
  let feedbackTimeout = null;

  if (copyUrlBtn && remoteUrlSpan && copyFeedback) {
    copyUrlBtn.addEventListener("click", async () => {
      const url = remoteUrlSpan.textContent;
      if (!url) return;

      try {
        await navigator.clipboard.writeText(url);
        
        // Handle feedback animation
        clearTimeout(feedbackTimeout);
        copyFeedback.style.opacity = "1";
        
        feedbackTimeout = setTimeout(() => {
          copyFeedback.style.opacity = "0";
        }, 2000);
      } catch (err) {
        console.error("Failed to copy URL: ", err);
      }
    });

    // Add visual hover feedback
    copyUrlBtn.addEventListener("mouseenter", () => {
       remoteUrlSpan.style.borderColor = "var(--accent)";
       remoteUrlSpan.style.background = "rgba(59, 130, 246, 0.25)";
    });
    copyUrlBtn.addEventListener("mouseleave", () => {
       remoteUrlSpan.style.borderColor = "rgba(59, 130, 246, 0.2)";
       remoteUrlSpan.style.background = "var(--accent-soft)";
    });
  }
});