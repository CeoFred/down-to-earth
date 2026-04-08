/* ---------------- ENVIRONMENT DETECTION & BRIDGE ---------------- */
if (typeof window.timerAPI === 'undefined') {
  // We are running in a web browser (Remote Device)
  const socket = io();
  
  // REMOTE AUTHENTICATION LOGIC
  const isRemote = true; // explicitly true if bridge is missing
  
  const initAuth = () => {
    const authOverlay = document.getElementById('remoteAuthOverlay');
    const mainShell = document.getElementById('mainShell');
    const pinInput = document.getElementById('remotePinInput');
    const authBtn = document.getElementById('authSubmitBtn');

    // Show auth overlay for remote by default
    if (isRemote && authOverlay) {
      authOverlay.style.display = 'flex';
    }
    
    // Hide main UI for remote by default
    if (isRemote && mainShell) {
      mainShell.style.display = 'none';
    }

    const getDeviceId = () => {
      let id = localStorage.getItem('remote_device_id');
      if (!id) {
        id = 'dev-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('remote_device_id', id);
      }
      return id;
    };

    authBtn?.addEventListener('click', () => {
      if (!socket.connected) {
        showToast("Waiting for connection...", "warning");
        return;
      }
      const pin = pinInput.value;
      if (pin.length === 4) {
        socket.emit('register', { 
          pin, 
          clientType: 'controller',
          deviceId: getDeviceId(),
          userAgent: navigator.userAgent
        });
        authBtn.textContent = 'Verifying...';
        authBtn.disabled = true;
      } else {
        showToast("Please enter a 4-digit PIN", "warning");
      }
    });

    // Auto-bypass if PIN not required, or re-register from session
    socket.on('connect', () => {
      socket.emit('timer:identify', { deviceId: getDeviceId(), userAgent: navigator.userAgent });

      // Fetch state first to check if PIN is required      
      socket.emit('timer:getState');
    });

    socket.once('timer:state', (state) => {
      const pinRequired = state?.config?.settings?.requirePinController !== false;
      if (!pinRequired) {
        // Auto-authenticate without PIN
        socket.emit('register', {
          pin: '',
          clientType: 'controller',
          deviceId: getDeviceId(),
          userAgent: navigator.userAgent
        });
        return;
      }
      // Try saved session PIN
      const savedPin = sessionStorage.getItem('production_pin');
      if (savedPin && authOverlay) {
        socket.emit('register', {
          pin: savedPin,
          clientType: 'controller',
          deviceId: getDeviceId(),
          userAgent: navigator.userAgent
        });
      }
    });

    socket.on('registered', ({ success, error }) => {
      const authOverlay = document.getElementById('remoteAuthOverlay');
      const authBtn = document.getElementById('authSubmitBtn');
      const pinInput = document.getElementById('remotePinInput');

      if (success) {
        const pin = pinInput?.value || sessionStorage.getItem('production_pin');
        sessionStorage.setItem('production_pin', pin);
        if (authOverlay) authOverlay.style.display = 'none';
        if (mainShell) mainShell.style.display = 'block';
        showToast("Production Deck Unlocked", "success");
      } else {
        showToast(error || "Invalid PIN", "error");
        if (authBtn) {
          authBtn.textContent = 'Unlock Deck';
          authBtn.disabled = false;
        }
        sessionStorage.removeItem('production_pin');
      }
    });

    socket.on('auth:error', (msg) => {
      showToast(msg, "error");
      if (authOverlay) authOverlay.style.display = 'flex';
      if (mainShell) mainShell.style.display = 'none';
      if (authBtn) {
        authBtn.textContent = 'Unlock Deck';
        authBtn.disabled = false;
      }
      sessionStorage.removeItem('production_pin');
    });

    socket.on('disconnect', () => {
      if (authOverlay) authOverlay.style.display = 'flex';
      // Proactively try to reconnect as soon as possible
      setTimeout(() => socket.connect(), 500);
    });

    socket.on('connect', () => {
      socket.emit('timer:identify', { 
        deviceId: getDeviceId(), 
        userAgent: navigator.userAgent 
      });
    });

    socket.on('connect', () => {
      if (authBtn) {
        authBtn.textContent = 'Unlock Deck';
        authBtn.disabled = false;
      }
    });
  };

  // Run auth init after DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }

  window.timerAPI = {
    isRemote: isRemote,
    start: (data) => socket.emit('timer:start', data),
    pause: () => socket.emit('timer:pause'),
    reset: () => socket.emit('timer:reset'),
    resume: () => socket.emit('timer:resume'),
    seek: (ms) => socket.emit('timer:seek', ms),
    setTitle: (title) => socket.emit('timer:setTitle', title),
    getState: () => new Promise((resolve) => {
      // 1. Check if we already have a cached state (e.g. from connection event)
      if (window.lastKnownState) return resolve(window.lastKnownState);
      
      // 2. Use the Socket.io Ack/Callback pattern (Reliable)
      socket.emit('timer:getState', (state) => {
        window.lastKnownState = state;
        resolve(state);
      });

      // 3. Fallback for older servers/latency: Listen for the separate event
      socket.once('timer:state', (state) => {
        window.lastKnownState = state;
        resolve(state);
      });

      // 4. Safety Timeout: We cannot stay hung forever or buttons won't work
      setTimeout(() => resolve(window.lastKnownState || {}), 2000);
    }),
    onUpdate: (cb) => socket.on('timer:update', cb),
    onFinished: (cb) => socket.on('timer:finished', cb),
    onTitle: (cb) => socket.on('timer:title', (data) => cb(data)),
    savePreset: (p) => socket.emit('timer:savePreset', p),
    deletePreset: (id) => socket.emit('timer:deletePreset', id),
    savePlaylist: (pl) => socket.emit('timer:savePlaylist', pl),
    saveSettings: (s) => socket.emit('timer:saveSettings', s),
    onConfigUpdate: (cb) => {
      socket.on('timer:configUpdate', (config) => {
        if (typeof window.appConfig !== 'undefined') window.appConfig = config;
        cb(config);
      });
    },
    flash: () => socket.emit('timer:flash'),
    saveSettings: (settings) => socket.emit('timer:saveSettings', settings),
    setNotes: (notes) => socket.emit('timer:setNotes', notes),
    startTunnel: () => new Promise((resolve, reject) => {
      socket.emit('timer:startTunnel');
      socket.once('timer:tunnelResult', (res) => {
        if (res.success) resolve(res.url);
        else reject(new Error(res.error));
      });
    }),
    stopTunnel: () => new Promise((resolve) => {
      socket.emit('timer:stopTunnel');
      socket.once('timer:tunnelStopped', () => resolve(true));
    }),
    getDevices: () => new Promise((resolve) => {
      socket.emit('timer:getDevices');
      socket.once('timer:devicesUpdate', (devices) => resolve(devices));
    }),
    onDevicesUpdate: (cb) => socket.on('timer:devicesUpdate', cb),
    onProjectorStatus: (cb) => socket.on('timer:projectorStatus', cb),
    blockDevice: (socketId, deviceId) => socket.emit('timer:blockDevice', { socketId, deviceId }),
    unblockDevice: (deviceId) => socket.emit('timer:unblockDevice', deviceId),
    refreshPin: () => Promise.reject('Not available remotely'),
    stopTunnelFn: () => Promise.reject('Not available remotely'),
    controlProjector: (action, data) => {
        socket.emit('timer:controlProjector', action, data);
        showToast(`[Remote] Triggering: ${action}`, 'info');
    }
  };

  socket.on('timer:controlResult', ({ action, success }) => {
    showToast(`${action.toUpperCase()}: ${success ? 'Command Successful' : 'Command Failed'}`, success ? 'success' : 'error');
  });

  socket.on('connect', async () => {
    const state = await window.timerAPI.getState();
    if (typeof window.renderState === 'function') window.renderState(state);
  });

  socket.on('timer:update', (state) => {
    if (typeof window.renderState === 'function') window.renderState(state);
  });

  socket.on('timer:projectorStatus', (status) => {
    if (typeof window.renderProjectorStatus === 'function') window.renderProjectorStatus(status);
  });
}

/* ---------------- AUDIO & TTS LOGIC ---------------- */
var isMuted = false;
let activeAlarmContext = null;
let lastMilestoneAnnounced = null; // To prevent multiple TTS calls for same second

function showToast(text, type = 'success') {
  let background = "linear-gradient(to right, #3b82f6, #2563eb)"; // info
  if (type === 'success') background = "linear-gradient(to right, #10b981, #059669)";
  if (type === 'warning') background = "linear-gradient(to right, #f59e0b, #d97706)";
  if (type === 'error') background = "linear-gradient(to right, #ef4444, #dc2626)";

  Toastify({
    text: text,
    duration: 3000,
    gravity: "top", 
    position: "right", 
    stopOnFocus: true, 
    style: {
      background: background,
      borderRadius: "12px",
      fontSize: "13px",
      fontWeight: "600",
      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.4)"
    }
  }).showToast();
}

window.copyToClipboard = (elementIdOrText) => {
  let text = elementIdOrText;
  const el = document.getElementById(elementIdOrText);
  if (el) text = el.value || el.textContent || el.innerText;

  if (!text || text === 'Loading...' || text === '—') {
    showToast("No URL available to copy", "warning");
    return;
  }
  navigator.clipboard.writeText(text.trim()).then(() => {
    showToast("Copied to clipboard!", "success");
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text.trim();
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast("Copied to clipboard!", "success");
  });
};

function speak(text) {
  const ttsEnabled = document.getElementById('ttsToggle')?.checked;
  if (!ttsEnabled || isMuted) return;
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.9;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

function getNaturalSpeech(totalSeconds) {
  if (totalSeconds >= 60) {
    const mins = Math.floor(totalSeconds / 60);
    const label = mins === 1 ? "1 minute" : `${mins} minutes`;
    return `${label} remaining`;
  }
  return `${totalSeconds} seconds remaining`;
}

function parseHumanTime(str) {
  str = str.trim().toLowerCase();
  
  // Format: 10:00 or 2:30
  const clockMatch = str.match(/^(\d+):(\d+)$/);
  if (clockMatch) {
    return (parseInt(clockMatch[1]) * 60) + parseInt(clockMatch[2]);
  }
  
  // Format: 2m 30s or 5m or 30s
  let total = 0;
  const mMatch = str.match(/(\d+)\s*m/);
  const sMatch = str.match(/(\d+)\s*s/);
  
  if (mMatch) total += parseInt(mMatch[1]) * 60;
  if (sMatch) total += parseInt(sMatch[1]);
  
  if (!mMatch && !sMatch) {
    // Fallback to raw number (assumed seconds)
    const raw = parseInt(str);
    return isNaN(raw) ? null : raw;
  }
  
  return total;
}

function formatMilestone(totalSecs) {
  if (totalSecs >= 60) {
    const mins = Math.floor(totalSecs / 60);
    const remainingSecs = totalSecs % 60;
    return remainingSecs > 0 ? `${mins}m ${remainingSecs}s` : `${mins}m`;
  }
  return `${totalSecs}s`;
}

function stopAlarm() {
  if (activeAlarmContext) {
    try { activeAlarmContext.close(); } catch (e) {}
    activeAlarmContext = null;
  }
}

function playAlarm() {
  if (isMuted) return;
  stopAlarm();

  const type = document.getElementById('alarmSoundSelect')?.value || 'pulse';
  if (type === 'none') return;

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  
  activeAlarmContext = new AudioContext();
  const now = activeAlarmContext.currentTime;

  if (type === 'pulse') {
    const totalDuration = 7; 
    const pulseInterval = 0.5;
    for (let i = 0; i < totalDuration; i += pulseInterval) {
      const startTime = now + i;
      const duration = pulseInterval * 0.8;
      const osc = activeAlarmContext.createOscillator();
      const gain = activeAlarmContext.createGain();
      osc.type = 'sine'; 
      osc.frequency.setValueAtTime(880, startTime);
      osc.frequency.exponentialRampToValueAtTime(440, startTime + duration);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(1.0, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      osc.connect(gain);
      gain.connect(activeAlarmContext.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    }
  } else if (type === 'chime') {
    const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    freqs.forEach((f, i) => {
      const osc = activeAlarmContext.createOscillator();
      const gain = activeAlarmContext.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + (i * 0.15));
      gain.gain.setValueAtTime(0, now + (i * 0.15));
      gain.gain.linearRampToValueAtTime(0.6, now + (i * 0.15) + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + (i * 0.15) + 1.5);
      osc.connect(gain); gain.connect(activeAlarmContext.destination);
      osc.start(now + (i * 0.15)); osc.stop(now + 2);
    });
  } else if (type === 'gong') {
    const osc = activeAlarmContext.createOscillator();
    const gain = activeAlarmContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 4);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1.0, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 4);
    osc.connect(gain); gain.connect(activeAlarmContext.destination);
    osc.start(now); osc.stop(now + 4);
  }
}

/* ---------------- CORE TIMER & WORKFLOW LOGIC ---------------- */
let currentState = { remainingMs: 0, totalMs: 0, isRunning: false, isPaused: false, isOvertime: false };
let appConfig = { customPresets: [], settings: { playlists: [] } };
let currentPlaylistIndex = -1;

function formatTime(ms) {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatTimeHTML(ms) {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}<span class="timer-colon">:</span>${String(seconds).padStart(2, "0")}`;
}

function renderCustomPresets() {
  const container = document.getElementById('customPresetsContainer');
  if (!container) return;

  const presets = appConfig.customPresets || [];
  if (presets.length === 0) {
    container.innerHTML = '<div style="font-size: 11px; color: var(--muted); width: 100%; text-align: center;">No custom presets yet.</div>';
    return;
  }

  container.innerHTML = presets.map(p => `
    <div class="preset-btn-wrapper" style="position: relative; flex: 1; min-width: 80px;">
      <button class="preset-btn" onclick="loadTimerPreset(${p.minutes}, ${p.seconds}, '${p.title.replace(/'/g, "\\'")}')" style="width: 100%; text-align: left; padding: 10px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); color: white; cursor: pointer; transition: all 0.2s ease;">
        <span style="font-size: 13px; font-weight: 800; display: block;">${p.minutes}m</span>
        <span style="font-size: 9px; opacity: 0.6; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.title}</span>
      </button>
      <button onclick="deletePreset('${p.id}')" style="position: absolute; top: -5px; right: -5px; width: 18px; height: 18px; border-radius: 50%; background: #ef4444; border: none; color: white; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 10;">×</button>
    </div>
  `).join('');
}

function updateDashboardClock() {
  const timeEl = document.getElementById('dashboardClockTime');
  const zoneEl = document.getElementById('dashboardClockZone');
  if (!timeEl || !zoneEl) return;

  const now = new Date();
  timeEl.textContent = now.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit', 
    second: '2-digit', 
    hour12: true 
  });

  // Get timezone name (e.g. Africa/Lagos) and abbreviation (e.g. WAT)
  const zoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = now.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ');
  const zoneAbbr = parts[parts.length - 1];
  
  zoneEl.textContent = `${zoneName.replace(/_/g, ' ').replace(/\//g, ' / ')} (${zoneAbbr})`;
}

/* ---------------- TIMELINE LOGIC ---------------- */
let isScrubbing = false;

function initTimeline() {
  const wrapper = document.getElementById('timelineWrapper');
  const container = document.getElementById('timelineContainer');
  if (!container) return;

  const handleScrub = (e) => {
    if (!currentState.totalMs || currentState.totalMs <= 0) return;
    
    const rect = container.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    let progress = Math.max(0, Math.min(1, x / rect.width));
    
    // In our countdown, 0% progress (left) is totalMs, 100% progress (right) is 0ms
    const targetMs = Math.round(currentState.totalMs * (1 - progress));
    
    // Optimistic UI update
    const playhead = document.getElementById('playhead');
    if (playhead) playhead.style.left = `${progress * 100}%`;
    
    window.timerAPI.seek(targetMs);
  };

  container.addEventListener('mousedown', (e) => {
    isScrubbing = true;
    handleScrub(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (isScrubbing) handleScrub(e);
  });

  window.addEventListener('mouseup', () => {
    isScrubbing = false;
  });

  // Touch support for tablets/phones
  container.addEventListener('touchstart', (e) => {
    isScrubbing = true;
    handleScrub(e);
  }, { passive: false });

  window.addEventListener('touchmove', (e) => {
    if (isScrubbing) {
      e.preventDefault();
      handleScrub(e);
    }
  }, { passive: false });

  // Standard Inputs Listener (for live timeline preview)
  const previewUpdate = () => {
    if (!currentState.isRunning && !currentState.isPaused) {
      const mins = parseInt(document.getElementById('minutes').value) || 0;
      const secs = parseInt(document.getElementById('seconds').value) || 0;
      const totalMs = (mins * 60 + secs) * 1000;
      if (totalMs > 0 && window.lastTotalMs !== totalMs) {
        renderTimelineMarkers(totalMs, appConfig.settings.wrapUp);
        window.lastTotalMs = totalMs;
      }
    }
  };
  document.getElementById('minutes').addEventListener('input', previewUpdate);
  document.getElementById('seconds').addEventListener('input', previewUpdate);

  // Initial markers
  const initialMins = parseInt(document.getElementById('minutes').value) || 10;
  const initialSecs = parseInt(document.getElementById('seconds').value) || 0;
  renderTimelineMarkers((initialMins * 60 + initialSecs) * 1000, appConfig.settings.wrapUp);
}

function renderTimelineMarkers(totalMs, wrapUp) {
  const markersContainer = document.getElementById('timelineMarkers');
  const segmentsContainer = document.getElementById('timelineSegments');
  if (!markersContainer || !segmentsContainer) return;

  markersContainer.innerHTML = '';
  segmentsContainer.innerHTML = '';

  if (!totalMs || totalMs <= 0) return;

  const totalSecs = totalMs / 1000;
  
  // 1. Render Segments (Green, Orange, Red)
  const yellowSec = (wrapUp?.yellowMs || 60000) / 1000;
  const redSec = (wrapUp?.redMs || 30000) / 1000;

  // Green segment (from start to yellow)
  if (totalSecs > yellowSec) {
    const greenWidth = ((totalSecs - yellowSec) / totalSecs) * 100;
    const div = document.createElement('div');
    div.className = 'segment segment-green';
    div.style.width = `${greenWidth}%`;
    segmentsContainer.appendChild(div);
  }

  // Orange segment (from yellow to red)
  if (totalSecs > redSec) {
    const orangeStart = Math.min(totalSecs, yellowSec);
    const orangeSecs = orangeStart - redSec;
    const orangeWidth = (orangeSecs / totalSecs) * 100;
    const div = document.createElement('div');
    div.className = 'segment segment-orange';
    div.style.width = `${orangeWidth}%`;
    segmentsContainer.appendChild(div);
  }

  // Red segment (from red to 0)
  const redStart = Math.min(totalSecs, redSec);
  const redWidth = (redStart / totalSecs) * 100;
  const div = document.createElement('div');
  div.className = 'segment segment-red';
  div.style.width = `${redWidth}%`;
  segmentsContainer.appendChild(div);

  // 2. Render Markers (Dynamic labels)
  const interval = totalSecs > 600 ? 300 : 60; // 5 mins for long timers, 1 min for short
  for (let s = 0; s <= totalSecs; s += interval) {
    const pos = (1 - (s / totalSecs)) * 100;
    if (pos < 0 || pos > 100) continue;
    
    const div = document.createElement('div');
    div.className = 'marker';
    div.style.left = `${pos}%`;
    div.textContent = formatTime(s * 1000);
    markersContainer.appendChild(div);
  }
}

window.loadTimerPreset = (mins, secs, title) => {
  document.getElementById('minutes').value = mins;
  document.getElementById('seconds').value = secs;
  document.getElementById('customTitle').value = title;
  showToast(`Loaded: ${title}`, "info");
};

function renderMessages() {
  const container = document.getElementById('messagesList');
  if (!container) return;

  const messages = appConfig.settings.messages || [];
  const activeId = appConfig.settings.activeMessageId;

  if (messages.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--muted); padding: 40px 0; font-size: 12px; background: rgba(255,255,255,0.02); border-radius:16px;">
        No messages created yet.
      </div>
    `;
    return;
  }

  container.innerHTML = messages.map(msg => {
    const isActive = activeId === msg.id;
    return `
      <div class="message-card ${isActive ? 'active' : ''}" data-id="${msg.id}">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <textarea class="msg-input" placeholder="Type your message..." onchange="updateMessageText('${msg.id}', this.value)" rows="2">${msg.text}</textarea>
          <button onclick="deleteMessage('${msg.id}')" style="background:none; border:none; opacity:0.3; cursor:pointer; font-size:14px; padding:4px;">🗑️</button>
        </div>
        
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="format-btn ${msg.bold ? 'active' : ''}" onclick="toggleMessageFormat('${msg.id}', 'bold')" title="Bold">B</button>
            <button class="format-btn ${msg.caps ? 'active' : ''}" onclick="toggleMessageFormat('${msg.id}', 'caps')" title="All Caps">AA</button>
            
            <div style="width:1px; height:16px; background:rgba(255,255,255,0.1); margin:0 4px;"></div>
            
            <button class="format-btn ${msg.flash ? 'active' : ''}" style="width:auto; padding:0 8px; font-size:9px;" onclick="toggleMessageFormat('${msg.id}', 'flash')">FLASH</button>
            <button class="format-btn ${msg.focus ? 'active' : ''}" style="width:auto; padding:0 8px; font-size:9px;" onclick="toggleMessageFormat('${msg.id}', 'focus')">FOCUS</button>
            
            <div style="width:1px; height:16px; background:rgba(255,255,255,0.1); margin:0 4px;"></div>
            
            <div style="display:flex; align-items:center; gap:4px; background:rgba(255,255,255,0.03); padding:4px 8px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
              <input type="color" value="${msg.color || '#ffffff'}" onchange="updateMessageColor('${msg.id}', this.value)" style="width:18px; height:18px; border:none; background:none; cursor:pointer; padding:0;">
              <span style="font-size:9px; font-family:monospace; opacity:0.6;">${(msg.color || '#ffffff').toUpperCase()}</span>
            </div>
          </div>
          
          <button class="show-toggle-btn ${isActive ? 'on' : 'off'}" onclick="toggleMessageVisibility('${msg.id}')">
            ${isActive ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.updateMessageText = (id, text) => {
  const messages = [...(appConfig.settings.messages || [])];
  const idx = messages.findIndex(m => m.id === id);
  if (idx !== -1) {
    messages[idx].text = text;
    window.timerAPI.saveSettings({ messages });
    syncActiveMessage(id, messages[idx]);
  }
};

window.updateMessageColor = (id, color) => {
  const messages = [...(appConfig.settings.messages || [])];
  const idx = messages.findIndex(m => m.id === id);
  if (idx !== -1) {
    messages[idx].color = color;
    window.timerAPI.saveSettings({ messages });
    syncActiveMessage(id, messages[idx]);
  }
};

window.toggleMessageFormat = (id, field) => {
  const messages = [...(appConfig.settings.messages || [])];
  const idx = messages.findIndex(m => m.id === id);
  if (idx !== -1) {
    messages[idx][field] = !messages[idx][field];
    window.timerAPI.saveSettings({ messages });
    syncActiveMessage(id, messages[idx]);
  }
};

function syncActiveMessage(id, msgData) {
  if (appConfig.settings.activeMessageId === id) {
    window.timerAPI.setNotes(msgData);
  }
}

window.toggleMessageVisibility = (id) => {
  const currentActive = appConfig.settings.activeMessageId;
  const newActive = (currentActive === id) ? null : id;
  
  // Update setting immediately
  window.timerAPI.saveSettings({ activeMessageId: newActive });
  
  // Send the actual display signal to the projector
  if (newActive) {
    const msg = appConfig.settings.messages.find(m => m.id === id);
    if (msg) {
      window.timerAPI.setNotes(msg);
    }
  } else {
    window.timerAPI.setNotes("");
  }
};

window.deleteMessage = (id) => {
  if (appConfig.settings.activeMessageId === id) {
    window.timerAPI.setNotes("");
    window.timerAPI.saveSettings({ activeMessageId: null });
  }
  const messages = (appConfig.settings.messages || []).filter(m => m.id !== id);
  window.timerAPI.saveSettings({ messages });
  showToast("Message deleted", "info");
};

function renderPlaylist() {
  const container = document.getElementById('playlistContainer');
  if (!container) return;

  const playlists = appConfig.settings.playlists || [];

  if (playlists.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--muted); padding: 40px 20px; font-size: 12px; background: rgba(255,255,255,0.02); border-radius: 12px;">
        Playlist is empty. Add timers to get started.
      </div>
    `;
    return;
  }

  container.innerHTML = playlists.map((item, index) => {
    const isActive = index === currentPlaylistIndex;
    const isPaused = currentState?.isPaused;
    
    return `
      <div class="playlist-item ${isActive ? 'active' : ''}" data-index="${index}">
        ${isActive ? `<div id="playlist-progress-active" class="playlist-progress"></div>` : ''}
        
        <div class="info">
          <div class="title" style="display:flex; align-items:center; gap:8px;">
            <span style="opacity:0.4; font-size:10px; font-family:var(--font-mono);">${index + 1}.</span>
            <span 
              contenteditable="true" 
              class="playlist-title-edit" 
              onblur="window.updatePlaylistTitle(${index}, this.innerText)"
              onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}"
              style="outline:none; cursor:text; min-width:20px; font-weight:700; color:#fff;"
            >${item.title || 'Untitled Session'}</span>
            ${item.notes ? `<span title="${item.notes.replace(/"/g, '&quot;')}" style="font-size:10px; opacity:0.6; cursor:help;">📝</span>` : ''}
          </div>
          <div class="time" style="display:flex; align-items:center; gap:4px; margin-top:2px;">
            <input type="number" class="playlist-time-input" value="${item.minutes}" onchange="window.updatePlaylistTime(${index}, this.value, ${item.seconds})">
            <span style="font-size:9px; opacity:0.5; font-family:var(--font-mono);">m</span>
            <input type="number" class="playlist-time-input" value="${item.seconds}" onchange="window.updatePlaylistTime(${index}, ${item.minutes}, this.value)" min="0" max="59">
            <span style="font-size:9px; opacity:0.5; font-family:var(--font-mono);">s</span>
          </div>
        </div>
        
        <div class="actions">
           ${isActive ? `
             <button onclick="window.timerAPI.pause()" class="btn-icon" style="background:rgba(59,130,246,0.2); border:1px solid rgba(59,130,246,0.3); color:var(--accent); border-radius:8px; width:32px; height:32px; display:flex; align-items:center; justify-content:center; cursor:pointer;" id="playlist-pause-btn">
               ${isPaused ? '▶' : '⏸'}
             </button>
             <button onclick="startPlaylistAt(${index})" class="btn-icon" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:8px; width:32px; height:32px; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="Restart">
               🔄
             </button>
           ` : `
             <button onclick="startPlaylistAt(${index})" style="background:none; border:none; color:var(--accent); cursor:pointer; font-size:18px; padding:4px;">▶</button>
           `}
           <button onclick="removeFromPlaylist(${index})" style="background:none; border:none; color:#ef4444; opacity:0.8; cursor:pointer; font-size:18px; padding:4px;" title="Remove">&times;</button>
        </div>
      </div>
    `;
  }).join('');
}

window.applyPreset = (mins, secs, title, ySec = null, rSec = null) => {
  document.getElementById('minutes').value = mins;
  document.getElementById('seconds').value = secs;
  document.getElementById('customTitle').value = title || "";
  
  const yEl = document.getElementById('overrideYellow');
  const rEl = document.getElementById('overrideRed');
  if (yEl) yEl.value = ySec || "";
  if (rEl) rEl.value = rSec || "";

  window.timerAPI.setTitle(title || "");
  // Switch to Timer tab
  document.querySelector('[data-tab="timer"]').click();
};

window.deletePreset = (id) => {
  window.timerAPI.deletePreset(id);
  showToast("Preset deleted", "warning");
};

window.startPlaylistAt = (index) => {
  currentPlaylistIndex = index;
  const playlists = appConfig.settings.playlists || [];
  const item = playlists[index];
  if (item) {
    document.getElementById('minutes').value = item.minutes;
    document.getElementById('seconds').value = item.seconds;
    document.getElementById('customTitle').value = item.title;
    
    const yEl = document.getElementById('overrideYellow');
    const rEl = document.getElementById('overrideRed');
    if (yEl) yEl.value = item.yellowSec || "";
    if (rEl) rEl.value = item.redSec || "";
    
    let wrapUp = null;
    if (item.yellowSec || item.redSec) {
      wrapUp = {
        yellowMs: (item.yellowSec || 60) * 1000,
        redMs: (item.redSec || 30) * 1000,
        flashOnRed: appConfig.settings.wrap_up?.flashOnRed ?? true,
        flashOnOvertime: appConfig.settings.wrap_up?.flashOnOvertime ?? true,
        soundOnYellow: appConfig.settings.wrap_up?.soundOnYellow ?? false,
        soundOnRed: appConfig.settings.wrap_up?.soundOnRed ?? true
      };
    }

    window.timerAPI.setTitle(item.title);
    window.timerAPI.setNotes(item.notes || "");
    window.timerAPI.start({ ms: (item.minutes * 60 + item.seconds) * 1000, wrapUp });
    renderPlaylist();
    // Speak title if enabled
    if (appConfig.settings.readPlaylistTitle) speak(item.title);
  }
};

window.removeFromPlaylist = (index) => {
  if (currentPlaylistIndex === index) {
    window.timerAPI.reset();
    currentPlaylistIndex = -1;
  } else if (currentPlaylistIndex > index) {
    currentPlaylistIndex--;
  }

  const playlists = [...(appConfig.settings.playlists || [])];
  playlists.splice(index, 1);
  window.timerAPI.saveSettings({ playlists });
};

window.updatePlaylistTitle = (index, newTitle) => {
  const playlists = [...(appConfig.settings.playlists || [])];
  if (playlists[index]) {
    playlists[index].title = newTitle;
    if (currentPlaylistIndex === index) {
      window.timerAPI.setTitle(newTitle);
    }
    window.timerAPI.saveSettings({ playlists });
  }
};

window.updatePlaylistTime = (index, mins, secs) => {
  const playlists = [...(appConfig.settings.playlists || [])];
  if (playlists[index]) {
    playlists[index].minutes = parseInt(mins) || 0;
    playlists[index].seconds = Math.max(0, Math.min(59, parseInt(secs) || 0));
    window.timerAPI.saveSettings({ playlists });
  }
};

window.timerAPI.onProjectorStatus((status) => {
  if (typeof window.renderProjectorStatus === 'function') window.renderProjectorStatus(status);
});

window.renderProjectorStatus = function(status) {
  const pill = document.getElementById('projectorStatusPill');
  const powerState = document.getElementById('projectorPowerState');
  const powerBtn = document.getElementById('projectorPowerBtn');
  const powerText = document.getElementById('projectorPowerText');
  const powerIcon = document.getElementById('projectorPowerIcon');
  const fsBtn = document.getElementById('projectorFullscreenBtn');
  const reloadBtn = document.getElementById('projectorReloadBtn');
  const focusBtn = document.getElementById('projectorFocusBtn');
  const select = document.getElementById('projectorDisplaySelect');

  // Handle Display List Update (Optimization: avoid overwriting if list is identical)
  if (select && status?.allDisplays) {
    const listIds = status.allDisplays.map(d => d.id).join(',');
    if (select.dataset.lastIds !== listIds) {
        console.log("[ProjectionDeck] Display list changed, updating dropdown.");
        const options = status.allDisplays.map(d => 
        `<option value="${d.id}" ${d.id === status.displayId ? 'selected' : ''}>
            ${d.isPrimary ? '⭐️ ' : ''}${d.label}
        </option>`
        ).join('');
        select.innerHTML = options;
        select.dataset.lastIds = listIds;
    } else {
        // Just sync current selection if it differs without rebuilding entire HTML
        if (select.value != status.displayId && status.displayId) {
            select.value = status.displayId;
        }
    }
  }

  if (!status || !status.active) {
    if (pill) {
      pill.textContent = 'Projector: Off';
      pill.dataset.active = 'false';
      pill.dataset.external = 'false';
    }
    if (powerState) {
      powerState.textContent = 'OFFLINE';
      powerState.style.background = 'rgba(239, 68, 68, 0.1)';
      powerState.style.color = 'var(--danger)';
    }
    if (powerBtn) {
       if (powerText) powerText.textContent = 'Open Stage Display';
       if (powerIcon) powerIcon.textContent = '🚀';
       powerBtn.classList.replace('btn-secondary', 'btn-primary');
    }
    if (fsBtn) fsBtn.disabled = true;
    if (reloadBtn) reloadBtn.disabled = true;
    if (focusBtn) focusBtn.disabled = true;
    return;
  }

  if (pill) {
    pill.dataset.active = 'true';
    pill.dataset.external = status.isExternal ? 'true' : 'false';
    pill.textContent = `Proj: ${status.displayName || 'Connected'}`;
  }

  if (powerState) {
    powerState.textContent = status.isExternal ? 'EXTERNAL' : 'LOCAL';
    powerState.style.background = status.isExternal ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)';
    powerState.style.color = status.isExternal ? '#10b981' : 'var(--accent)';
  }

  if (powerBtn) {
    if (powerText) powerText.textContent = 'Close Stage Display';
    if (powerIcon) powerIcon.textContent = '🔌';
    powerBtn.classList.replace('btn-primary', 'btn-secondary');
  }

  if (fsBtn) fsBtn.disabled = false;
  if (reloadBtn) reloadBtn.disabled = false;
  if (focusBtn) focusBtn.disabled = false;
};

window.renderState = function(state) {
  if (!state) return;
  const { remainingMs, totalMs, isRunning, isPaused, isOvertime, overtimeMs, config, projectorStatus } = state;
  currentState = state;

  if (projectorStatus) window.renderProjectorStatus(projectorStatus);
  
  if (config) {
    appConfig = config;
    renderCustomPresets();
    renderMessages();
    // Update settings UI if they changed
    const autoAdvance = document.getElementById('autoAdvanceToggle');
    if (autoAdvance) autoAdvance.checked = config.settings.autoAdvance;
    const tts = document.getElementById('ttsToggle');
    if (tts) tts.checked = config.settings.ttsEnabled;
    const titleSpeak = document.getElementById('readPlaylistTitleToggle');
    if (titleSpeak) titleSpeak.checked = config.settings.readPlaylistTitle;
    const sound = document.getElementById('alarmSoundSelect');
    if (sound) sound.value = config.settings.alarmSound;
    const miles = document.getElementById('milestonesInput');
    if (miles && config.settings.milestones) {
      // Format milestones nicely for the human user (e.g. 300 -> 5m)
      miles.value = config.settings.milestones.map(formatMilestone).join(', ');
    }
    
    // Appearance Sync
    if (config.settings.appearance) {
      const app = config.settings.appearance;
      const syncVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) el.value = val;
      };
      
      syncVal('appearanceTimerSize', app.timerSize);
      syncVal('appearanceTimerColor', app.timerColor);
      syncVal('appearanceTimerColorHex', app.timerColor);
      syncVal('appearanceTimerFont', app.timerFont);
      
      syncVal('appearanceTitleSize', app.titleSize);
      syncVal('appearanceTitleColor', app.titleColor);
      
      syncVal('appearanceNotesSize', app.notesSize);
      syncVal('appearanceNotesColor', app.notesColor);
      
      syncVal('appearanceBarColor', app.barColor);
      syncVal('appearanceBarHeight', app.barHeight);

      syncVal('appearanceClockSize', app.clockSize);
      syncVal('appearanceClockColor', app.clockColor);
      
      const clockHexEl = document.getElementById('appearanceClockColorValue');
      if (clockHexEl) clockHexEl.value = app.clockColor || 'rgba(255,255,255,0.8)';
    }
    
    // Focus Mode Sync
    if (config.settings.focusMode) {
      const focus = config.settings.focusMode;
      const enableEl = document.getElementById('focusModeEnabled');
      const itemEl = document.getElementById('focusModeItem');
      if (enableEl) enableEl.checked = focus.enabled;
      if (itemEl) itemEl.value = focus.focusedItem;
    }
    
    // Visibility Sync
    if (config.settings.visibility) {
      const vis = config.settings.visibility;
      const syncCheck = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.checked = val;
      };
      syncCheck('showTimerToggle', vis.showTimer);
      syncCheck('showBarToggle', vis.showBar);
      syncCheck('showTitleToggle', vis.showTitle);
      syncCheck('showNotesToggle', vis.showNotes);
      syncCheck('showClockToggle', vis.showClock);
    }
    
    // Sync stage notes across devices
    const notesEl = document.getElementById('stageNotes');
    if (notesEl && state.customNotes !== undefined) {
      if (document.activeElement !== notesEl) {
        notesEl.value = state.customNotes;
      }
    }

    // Connectivity UI Updates (Local + Global)
    updateConnectivityUI(config);

    // Wrap-up Sync
    if (config.settings.wrapUp) {
      const wu = config.settings.wrapUp;
      const wuYellow = document.getElementById('wrapUpYellow');
      const wuRed = document.getElementById('wrapUpRed');
      const wuFlashRed = document.getElementById('wrapUpFlashRed');
      const wuFlashOvertime = document.getElementById('wrapUpFlashOvertime');
      const wuSound = document.getElementById('wrapUpSoundEnabled');
      
      if (wuYellow) wuYellow.value = wu.yellowMs / 1000;
      if (wuRed) wuRed.value = wu.redMs / 1000;
      if (wuFlashRed) wuFlashRed.checked = wu.flashOnRed;
      if (wuFlashOvertime) wuFlashOvertime.checked = wu.flashOnOvertime;
      if (wuSound) wuSound.checked = wu.soundOnYellow;
    }
  }

  // Timeline UI Updates
  const timelineWrapper = document.getElementById('timelineWrapper');
  if (timelineWrapper) {
    // Determine which totalMs to use for the timeline (active session or idle preview)
    let displayTotalMs = totalMs || 0;
    
    if (!isRunning && !isPaused) {
      const mins = parseInt(document.getElementById('minutes').value) || 0;
      const secs = parseInt(document.getElementById('seconds').value) || 0;
      displayTotalMs = (mins * 60 + secs) * 1000;
    }

    if (displayTotalMs > 0) {
      if (window.lastTotalMs !== displayTotalMs) {
        renderTimelineMarkers(displayTotalMs, config?.settings?.wrapUp || appConfig.settings.wrapUp);
        window.lastTotalMs = displayTotalMs;
      }

      const playhead = document.getElementById('playhead');
      if (playhead && !isScrubbing) {
        let progress = 0;
        if (isOvertime) {
          progress = 1; 
        } else if ((isRunning || isPaused) && totalMs > 0) {
          progress = 1 - (remainingMs / totalMs);
        } else {
          progress = 0; // At start for idle preview
        }
        playhead.style.left = `${Math.min(1, Math.max(0, progress)) * 100}%`;
      }
    }
  }

  const display = document.getElementById("display");
  const label = document.getElementById("timerLabel");
  const statusPill = document.getElementById("statusPill");

  if (isOvertime) {
    label.style.display = "none";
    display.innerHTML = `<span style="font-size: 0.8em; vertical-align: middle; margin-right: 0.1em; opacity: 0.8;">-</span>${formatTimeHTML(overtimeMs)}`;
    display.style.color = "var(--danger)";
  } else {
    label.style.display = "block";
    label.textContent = currentState.customTitle || "Time Remaining";
    display.innerHTML = formatTimeHTML(remainingMs);
    display.style.color = "var(--text)";
  }

  // Milestone TTS
  if (isRunning && !isOvertime) {
    const totalSecs = Math.floor(remainingMs / 1000);
    const milestones = appConfig.settings.milestones || [];
    
    for (const ms of milestones) {
      if (totalSecs === ms && lastMilestoneAnnounced !== ms) {
        speak(getNaturalSpeech(ms));
        lastMilestoneAnnounced = ms;
        break; 
      }
    }
  } else {
    lastMilestoneAnnounced = null;
  }

  // Button States
  const startBtn = document.getElementById("startBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = (isRunning || isPaused) ? "Restart" : "Start";
  }
  
  if (pauseBtn) {
    pauseBtn.disabled = !isRunning && !isPaused;
    pauseBtn.textContent = isPaused ? "Resume" : "Pause";
  }
  
  if (isRunning) {
    statusPill.textContent = "Running";
    statusPill.dataset.state = "running";
  } else if (isPaused) {
    statusPill.textContent = "Paused";
    statusPill.dataset.state = "paused";
    stopAlarm();
  } else {
    statusPill.textContent = "Idle";
    statusPill.dataset.state = "paused";
    stopAlarm();
  }

  // Playlist Real-time Updates (Progress & Buttons)
  if (currentPlaylistIndex !== -1) {
    const activeProgress = document.getElementById('playlist-progress-active');
    if (activeProgress && totalMs > 0) {
      const progress = isOvertime ? 1 : 1 - (remainingMs / totalMs);
      activeProgress.style.width = `${Math.min(1, Math.max(0, progress)) * 100}%`;
    }
    
    const playlistPauseBtn = document.getElementById('playlist-pause-btn');
    if (playlistPauseBtn) {
      playlistPauseBtn.textContent = isPaused ? '▶' : '⏸';
      playlistPauseBtn.onclick = () => isPaused ? window.timerAPI.resume() : window.timerAPI.pause();
    }
  }
};

function updateConnectivityUI(config) {
  if (!config) return;
  const baseUrl = config.tunnelUrl || config.localUrl || `http://${window.location.hostname}:8321`;
  const localUrl = config.localUrl || `http://${window.location.hostname}:8321`;
  const globalUrl = config.tunnelUrl;

  // Populate all URL fields
  const localDisplay = document.getElementById('localUrlDisplay');
  const globalDisplay = document.getElementById('globalUrlDisplay');
  const pinDisplay = document.getElementById('pinDisplay');
  const linkController = document.getElementById('linkController');
  const linkProjector = document.getElementById('linkProjector');
  const copyGlobalBtn = document.getElementById('copyGlobalBtn');
  const reqPinController = document.getElementById('requirePinController');
  const reqPinProjector = document.getElementById('requirePinProjector');

  if (localDisplay) localDisplay.value = localUrl;
  if (pinDisplay) pinDisplay.textContent = config.settings?.securityPin || '----';
  
  if (reqPinController) reqPinController.checked = config.settings?.requirePinController !== false;
  if (reqPinProjector) reqPinProjector.checked = config.settings?.requirePinProjector !== false;

  if (linkController) linkController.value = localUrl + '/';
  if (linkProjector) linkProjector.value = localUrl + '/projector';

  if (globalUrl) {
    if (globalDisplay) { globalDisplay.value = globalUrl; globalDisplay.style.color = '#f38020'; }
    if (copyGlobalBtn) copyGlobalBtn.style.display = 'block';
    const startBtn = document.getElementById('startTunnelBtn');
    const stopBtn = document.getElementById('stopTunnelBtn');
    if (startBtn) startBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'block';
  } else {
    if (globalDisplay) { globalDisplay.value = 'Not active'; globalDisplay.style.color = 'var(--muted)'; }
    if (copyGlobalBtn) copyGlobalBtn.style.display = 'none';
    const startBtn = document.getElementById('startTunnelBtn');
    const stopBtn = document.getElementById('stopTunnelBtn');
    if (startBtn) { startBtn.style.display = 'block'; startBtn.textContent = 'Go Global'; startBtn.disabled = false; }
    if (stopBtn) stopBtn.style.display = 'none';
  }

  // QR points to best available URL
  updateQRCode(baseUrl);
}

function updateQRCode(url) {
  const qrEl = document.getElementById('qrcode');
  if (!qrEl || typeof QRCode === 'undefined') return;
  
  qrEl.innerHTML = ''; // Clear old one
  new QRCode(qrEl, {
    text: url,
    width: 140,
    height: 140,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
}

/* ---------------- EVENTS ---------------- */
window.addEventListener("DOMContentLoaded", async () => {
  // Playlist Modal Reference & Logic
  const playlistModal = document.getElementById('playlistModal');
  const addTimerBtn = document.getElementById('addTimerBtn');
  const modalCancelBtn = document.getElementById('modalCancelBtn');
  const modalSaveBtn = document.getElementById('modalSaveBtn');

  if (addTimerBtn && playlistModal) {
    addTimerBtn.addEventListener('click', () => {
      playlistModal.style.display = 'flex';
      const modalTitleInput = document.getElementById('modalTitle');
      if (modalTitleInput) modalTitleInput.focus();
    });

    const closePlaylistModal = () => {
      playlistModal.style.display = 'none';
      const fields = ['modalTitle', 'modalNotes', 'modalMinutes', 'modalSeconds'];
      fields.forEach(f => {
        const el = document.getElementById(f);
        if (el) el.value = (f === 'modalMinutes') ? '10' : (f === 'modalSeconds' ? '0' : '');
      });
    };

    if (modalCancelBtn) modalCancelBtn.addEventListener('click', closePlaylistModal);

    if (modalSaveBtn) {
      modalSaveBtn.addEventListener('click', () => {
        const titleInput = document.getElementById('modalTitle');
        const notesInput = document.getElementById('modalNotes');
        const minsInput = document.getElementById('modalMinutes');
        const secsInput = document.getElementById('modalSeconds');

        const title = titleInput.value.trim() || "Unnamed Session";
        const notes = notesInput.value.trim();
        const minutes = parseInt(minsInput.value) || 0;
        const seconds = parseInt(secsInput.value) || 0;

        const newItem = { title, notes, minutes, seconds };
        
        const playlists = [...(appConfig.settings.playlists || [])];
        playlists.push(newItem);
        window.timerAPI.saveSettings({ playlists });
        
        closePlaylistModal();
        showToast(`"${title}" added to lineup`);
      });
    }

    // Close on Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && playlistModal.style.display === 'flex') {
        closePlaylistModal();
      }
    });
  }

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`${btn.dataset.tab}Tab`).classList.add('active');
    });
  });

  // Playlist Navigation Controls
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const clearPlaylistBtn = document.getElementById('clearPlaylistBtn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPlaylistIndex > 0) {
        window.startPlaylistAt(currentPlaylistIndex - 1);
      } else {
        showToast("Already at starting item", "info");
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentPlaylistIndex < playlistQueue.length - 1) {
        window.startPlaylistAt(currentPlaylistIndex + 1);
      } else {
        showToast("End of playlist reached", "info");
      }
    });
  }

  if (clearPlaylistBtn) {
    clearPlaylistBtn.addEventListener('click', () => {
      if (playlistQueue.length === 0) return;
      if (confirm("Clear the entire playlist lineup?")) {
        playlistQueue = [];
        currentPlaylistIndex = -1;
        window.timerAPI.reset();
        window.timerAPI.setNotes("");
        renderPlaylist();
        showToast("Playlist Lineup Cleared", "warning");
      }
    });
  }

  // Timeline Initialization
  initTimeline();

  // Setup
  // Non-blocking initial setup
  window.timerAPI.getState().then(state => {
    // 1. Core State & Config
    appConfig = state.config;
    window.renderState(state);
    
    // 2. Clear initial views based on loaded config
    renderPlaylist();
    renderMessages();
    renderCustomPresets();

    // 3. Initialize Projection Deck if status is available
    if (state?.projectorStatus) {
      window.renderProjectorStatus(state.projectorStatus);
    }
  }).catch(err => console.error("Initial state sync failed:", err));

  window.timerAPI.onUpdate(window.renderState);
  window.timerAPI.onFinished(() => {
    playAlarm();
    speak("Time is up");
    
    // Auto Advance Logic
    const autoAdvance = document.getElementById('autoAdvanceToggle')?.checked;
    if (autoAdvance && currentPlaylistIndex < playlistQueue.length - 1) {
      showToast("Auto-advancing to next item in 10s...", "info");
      setTimeout(() => window.startPlaylistAt(currentPlaylistIndex + 1), 10000);
    }
  });

  window.timerAPI.onConfigUpdate((config) => {
    appConfig = config;
    
    // Centralized View Refresh
    renderPlaylist();
    renderCustomPresets();
    renderMessages();
    updateConnectivityUI(config);

    // Re-render state to ensure all UI settings (toggles, milestones) sync
    window.renderState({ ...currentState, config });
    
    // Refresh device list to reflect block/unblock changes
    if (window.timerAPI.getDevices) {
      window.timerAPI.getDevices().then(window.renderDevices);
    }
  });

  // Message Creation
  document.getElementById('addMessageBtn')?.addEventListener('click', () => {
    const messages = [...(appConfig.settings.messages || [])];
    const newMessage = {
      id: Date.now().toString(),
      text: "New Production Note",
      color: "#ffffff",
      bold: true,
      caps: false,
      flash: false,
      focus: false
    };
    messages.push(newMessage);
    window.timerAPI.saveSettings({ messages });
    showToast("Message added to library", "success");
  });

  // Handle Tunneling
  document.getElementById('startTunnelBtn')?.addEventListener('click', async (e) => {
    try {
      e.target.disabled = true;
      e.target.textContent = 'Migrating to Cloud...';
      showToast("Requesting Public Global Address...", "info");
      
      const url = await window.timerAPI.startTunnel();
      showToast("Production Deck is now GLOBAL!", "success");
    } catch (err) {
      console.error('Tunnel Error:', err);
      showToast("Tunnel failed. Check internet/firewall.", "error");
      e.target.disabled = false;
      e.target.textContent = 'Retry Global Tunnel';
    }
  });

  document.getElementById('stopTunnelBtn')?.addEventListener('click', async () => {
    try {
      const success = await window.timerAPI.stopTunnel();
      if (success) {
        showToast("Global Access Disabled", "warning");
      }
    } catch (err) {
      showToast("Failed to stop tunnel", "error");
    }
  });

  // Handle PIN Refresh
  document.getElementById('refreshPinBtn')?.addEventListener('click', async () => {
    if (confirm("Generating a new security code will instantly disconnect ALL remote devices. Continue?")) {
      try {
        await window.timerAPI.refreshPin();
        showToast("Session Refreshed with New PIN", "success");
      } catch (err) {
        showToast("Failed to refresh PIN", "error");
      }
    }
  });

  // Security Toggles (Immediate save)
  document.getElementById('requirePinController')?.addEventListener('change', (e) => {
    window.timerAPI.saveSettings({ requirePinController: e.target.checked });
    showToast(`Controller PIN ${e.target.checked ? 'Enabled' : 'Disabled'}`, "info");
  });

  document.getElementById('requirePinProjector')?.addEventListener('change', (e) => {
    window.timerAPI.saveSettings({ requirePinProjector: e.target.checked });
    showToast(`Projector PIN ${e.target.checked ? 'Enabled' : 'Disabled'}`, "info");
  });

  window.renderDevices = (devices) => {
    const tbody = document.getElementById('devicesTableBody');
    const badge = document.getElementById('deviceCountBadge');
    if (!tbody || !badge) return;

    badge.textContent = `${devices.length} Active`;

    if (devices.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="padding: 20px; text-align: center; color: var(--muted);">No remote devices connected.</td></tr>';
      return;
    }

    tbody.innerHTML = devices.map(dev => {
      const isAuth = dev.isAuthenticated;
      const isBlocked = appConfig.settings.blockedDevices?.includes(dev.deviceId);
      
      // Extract browser name from user agent
      const ua = dev.userAgent;
      let deviceName = 'Remote Device';
      if (ua.includes('iPhone')) deviceName = 'iPhone';
      else if (ua.includes('Android')) deviceName = 'Android Tablet';
      else if (ua.includes('Macintosh')) deviceName = 'Mac Desktop';
      else if (ua.includes('Windows')) deviceName = 'PC Desktop';

      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.02); opacity: ${isBlocked ? '0.6' : '1'};">
          <td style="padding: 10px;">
            <div style="font-weight: 600; color: ${isBlocked ? '#ef4444' : 'inherit'};">${deviceName} ${isBlocked ? '(Blocked)' : ''}</div>
            <div style="font-size: 9px; opacity: 0.5;">${dev.ip.replace('::ffff:', '')} • ${dev.deviceId}</div>
          </td>
          <td style="padding: 10px;">
            <span style="color: ${isBlocked ? '#ef4444' : (isAuth ? '#22c55e' : '#eab308')};">
              ${isBlocked ? '● Banned' : (isAuth ? '● Authenticated' : '○ Connected')}
            </span>
          </td>
          <td style="padding: 10px; text-align: right; display: flex; gap: 4px; justify-content: flex-end;">
            ${isBlocked ? `
              <button onclick="unblockDevice('${dev.deviceId}')" style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.2); color: #22c55e; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-weight: 600;">Unblock</button>
            ` : `
              <button onclick="blockDevice('${dev.id}', '${dev.deviceId}')" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-weight: 600;">Block</button>
            `}
          </td>
        </tr>
      `;
    }).join('');
  };

  // DEVICE MONITORING (Host Only)
  if (window.timerAPI.onDevicesUpdate) {
    window.timerAPI.onDevicesUpdate(window.renderDevices);
    
    // Initial fetch for the monitor
    if (window.timerAPI.getDevices) {
      window.timerAPI.getDevices().then(window.renderDevices);
    }
  }

  window.unblockDevice = (deviceId) => {
    window.timerAPI.unblockDevice(deviceId);
    showToast("Device pardoned", "success");
    // Force a UI refresh because unblocking happens locally first
    if (appConfig.settings.blockedDevices) {
      appConfig.settings.blockedDevices = appConfig.settings.blockedDevices.filter(id => id !== deviceId);
      window.renderDevices(window.lastKnownDevices || []);
    }
  };

  window.blockDevice = (socketId, deviceId) => {
    if (confirm("Permanently block this device ID? They will be instantly disconnected.")) {
      window.timerAPI.blockDevice(socketId, deviceId);
      showToast("Device Blacklisted", "error");
    }
  };

  // Standard Presets Listener
  document.querySelectorAll('.preset-btn[data-minutes]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mins = btn.getAttribute('data-minutes');
      document.getElementById('minutes').value = mins;
      document.getElementById('seconds').value = 0;
      // UX Improvement: Switch back to Timer tab automatically
      document.querySelector('[data-tab="timer"]').click();
    });
  });

  // Live Title Sync
  const titleInput = document.getElementById('customTitle');
  if (titleInput) {
    titleInput.addEventListener('input', (e) => {
      window.timerAPI.setTitle(e.target.value);
    });
  }

  // Controls
  document.getElementById('startBtn')?.addEventListener('click', () => {
    const mins = parseInt(document.getElementById('minutes')?.value) || 0;
    const secs = parseInt(document.getElementById('seconds')?.value) || 0;
    
    const yEl = document.getElementById('overrideYellow');
    const rEl = document.getElementById('overrideRed');
    const yVal = yEl ? parseInt(yEl.value) : NaN;
    const rVal = rEl ? parseInt(rEl.value) : NaN;
    
    let wrapUp = null;
    if (!isNaN(yVal) || !isNaN(rVal)) {
      wrapUp = {
        yellowMs: (yVal || 60) * 1000,
        redMs: (rVal || 30) * 1000,
        flashOnRed: appConfig.settings.wrapUp.flashOnRed,
        flashOnOvertime: appConfig.settings.wrapUp.flashOnOvertime,
        soundOnYellow: appConfig.settings.wrapUp.soundOnYellow,
        soundOnRed: appConfig.settings.wrapUp.soundOnRed
      };
    }

    const isRestart = currentState.isRunning || currentState.isPaused;
    const title = document.getElementById('customTitle')?.value || "";
    window.timerAPI.setTitle(title);
    window.timerAPI.start({ ms: (mins * 60 + secs) * 1000, wrapUp });
    showToast(isRestart ? "Timer Restarted" : "Timer Started", isRestart ? "info" : "success");
  });

  document.getElementById('pauseBtn')?.addEventListener('click', () => {
    if (currentState.isRunning) {
      window.timerAPI.pause();
      showToast("Timer Paused", "warning");
    } else {
      window.timerAPI.resume();
      showToast("Timer Resumed");
    }
  });

  document.getElementById('resetBtn')?.addEventListener('click', () => {
    window.timerAPI.reset();
    currentPlaylistIndex = -1;
    renderPlaylist();
    showToast("Timer Reset", "info");
  });

  document.getElementById('flashBtn')?.addEventListener('click', () => {
    window.timerAPI.flash();
    showToast("Flash Command Sent ⚡️", "info");
  });

  document.getElementById('savePresetBtn')?.addEventListener('click', () => {
    const mins = parseInt(document.getElementById('minutes')?.value) || 0;
    const secs = parseInt(document.getElementById('seconds')?.value) || 0;
    const yEl = document.getElementById('overrideYellow');
    const rEl = document.getElementById('overrideRed');
    const yVal = yEl ? parseInt(yEl.value) : NaN;
    const rVal = rEl ? parseInt(rEl.value) : NaN;
    const title = document.getElementById('customTitle')?.value || `${mins}m Preset`;

    const preset = { id: Date.now().toString(), minutes: mins, seconds: secs, title };
    if (!isNaN(yVal)) preset.yellowSec = yVal;
    if (!isNaN(rVal)) preset.redSec = rVal;

    window.timerAPI.savePreset(preset);
    showToast(`Preset "${title}" Saved`);
  });

  // Previous addToPlaylistBtn listener was here, removed as it reached the wrong IDs

  document.getElementById('nextBtn')?.addEventListener('click', () => {
    const playlists = appConfig.settings.playlists || [];
    if (currentPlaylistIndex < playlists.length - 1) {
      window.startPlaylistAt(currentPlaylistIndex + 1);
    }
  });

  document.getElementById('prevBtn')?.addEventListener('click', () => {
    if (currentPlaylistIndex > 0) {
      window.startPlaylistAt(currentPlaylistIndex - 1);
    }
  });

  document.getElementById('clearPlaylistBtn')?.addEventListener('click', () => {
    currentPlaylistIndex = -1;
    window.timerAPI.saveSettings({ playlists: [] });
    showToast("Lineup Cleared", "warning");
  });

  document.getElementById('testSoundBtn')?.addEventListener('click', playAlarm);
  
  document.getElementById('saveSettingsBtn')?.addEventListener('click', () => {
    const autoAdvance = document.getElementById('autoAdvanceToggle')?.checked;
    const ttsEnabled = document.getElementById('ttsToggle')?.checked;
    const readPlaylistTitle = document.getElementById('readPlaylistTitleToggle')?.checked;
    const alarmSound = document.getElementById('alarmSoundSelect')?.value;
    const milestoneStr = document.getElementById('milestonesInput')?.value || "";
    
    const visibility = {
      showTimer: document.getElementById('showTimerToggle')?.checked,
      showBar: document.getElementById('showBarToggle')?.checked,
      showTitle: document.getElementById('showTitleToggle')?.checked,
      showNotes: document.getElementById('showNotesToggle')?.checked,
      showClock: document.getElementById('showClockToggle')?.checked,
    };
    
    const milestones = milestoneStr.split(',')
      .map(s => parseHumanTime(s.trim()))
      .filter(n => n !== null && !isNaN(n))
      .sort((a, b) => b - a);
      
    const wrapUp = {
      yellowMs: (parseInt(document.getElementById('wrapUpYellow')?.value) || 60) * 1000,
      redMs: (parseInt(document.getElementById('wrapUpRed')?.value) || 30) * 1000,
      flashOnRed: document.getElementById('wrapUpFlashRed')?.checked,
      flashOnOvertime: document.getElementById('wrapUpFlashOvertime')?.checked,
      soundOnYellow: document.getElementById('wrapUpSoundEnabled')?.checked,
      soundOnRed: document.getElementById('wrapUpSoundEnabled')?.checked
    };

    const settings = { autoAdvance, ttsEnabled, readPlaylistTitle, alarmSound, milestones, visibility, wrapUp };
    window.timerAPI.saveSettings(settings);
    showToast("Production Settings Saved & Synced", "success");
  });

  // Appearance Save
  document.getElementById('saveAppearanceBtn')?.addEventListener('click', () => {
    const appearance = {
      timerSize: document.getElementById('appearanceTimerSize').value,
      timerColor: document.getElementById('appearanceTimerColor').value,
      timerFont: document.getElementById('appearanceTimerFont').value,
      titleSize: document.getElementById('appearanceTitleSize').value,
      titleColor: document.getElementById('appearanceTitleColor').value,
      notesSize: document.getElementById('appearanceNotesSize').value,
      notesColor: document.getElementById('appearanceNotesColor').value,
      clockSize: document.getElementById('appearanceClockSize').value,
      clockColor: document.getElementById('appearanceClockColor').value,
      barColor: document.getElementById('appearanceBarColor').value,
      barHeight: document.getElementById('appearanceBarHeight').value,
    };

    const focusMode = {
      enabled: document.getElementById('focusModeEnabled').checked,
      focusedItem: document.getElementById('focusModeItem').value
    };
    
    window.timerAPI.saveSettings({ appearance, focusMode });
    showToast("Projector Theme Updated", "success");
  });

  // Reset Appearance logic
  document.getElementById('resetAppearanceBtn')?.addEventListener('click', () => {
    const defaults = {
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
        clockSize: "17vh",
        clockColor: "rgba(255, 255, 255, 0.83)",
        barColor: "#3b82f6",
        barHeight: "12px"
      },
      focusMode: {
        enabled: false,
        focusedItem: "timer"
      }
    };
    window.timerAPI.saveSettings(defaults);
    showToast("Theme Reset to Factory Defaults", "info");
  });

  // Sync Color Picker and Hex for Timer
  const timerColor = document.getElementById('appearanceTimerColor');
  const timerHex = document.getElementById('appearanceTimerColorHex');
  timerColor?.addEventListener('input', (e) => { timerHex.value = e.target.value; });
  timerHex?.addEventListener('input', (e) => { timerColor.value = e.target.value; });

  document.getElementById('muteBtn')?.addEventListener('click', (e) => {
    isMuted = !isMuted;
    const label = isMuted ? "🔇 Audio Off" : "🔊 Audio On";
    e.target.textContent = label;
    e.target.classList.toggle('btn-secondary', isMuted);
    e.target.classList.toggle('btn-primary', !isMuted);
    showToast(label, isMuted ? 'warning' : 'success');
  });

  // Stage Notes Listener
  const stageNotes = document.getElementById('stageNotes');
  if (stageNotes) {
    stageNotes.addEventListener('input', (e) => {
      window.timerAPI.setNotes(e.target.value);
    });
  }

  // Copy Links Functionality
  window.copyToClipboard = async (elementId) => {
    const input = document.getElementById(elementId);
    if (!input) return;
    
    try {
      await navigator.clipboard.writeText(input.value);
      showToast("Link Copied to Clipboard", "success");
      
      const btn = input.nextElementSibling;
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = "Copied!";
        btn.classList.replace('btn-secondary', 'btn-primary');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.replace('btn-primary', 'btn-secondary');
        }, 2000);
      }
    } catch (err) {
      showToast("Failed to copy link", "error");
    }
  };



  // Copy URL logic (Existing Header)
  const copyBtn = document.getElementById('copyUrlBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const url = document.getElementById('remoteUrl').textContent;
      await navigator.clipboard.writeText(url);
      showToast("Remote URL Copied to Clipboard");
      const feedback = document.getElementById('copyFeedback');
      feedback.style.opacity = '1';
      setTimeout(() => feedback.style.opacity = '0', 2000);
    });
  }

  // Preload Server Info
  if (window.timerAPI.onServerInfo) {
    window.timerAPI.onServerInfo(({ url }) => {
      // Update Main Header
      document.getElementById('remoteControlInfo').style.display = 'flex';
      document.getElementById('remoteUrl').textContent = url;

      // Update Output Tab Inputs
      const ctrlInput = document.getElementById('linkController');
      const projInput = document.getElementById('linkProjector');
      if (ctrlInput) ctrlInput.value = url;
      if (projInput) projInput.value = `${url}/projector`;
    });
  }
});

// Finalize Projection Deck (Global Scope)
const setupProjectionDeck = () => {
  const powerBtn = document.getElementById('projectorPowerBtn');
  const fsBtn = document.getElementById('projectorFullscreenBtn');
  const reloadBtn = document.getElementById('projectorReloadBtn');
  const focusBtn = document.getElementById('projectorFocusBtn');
  const select = document.getElementById('projectorDisplaySelect');

  if (!powerBtn) return; // Not on correct page/tab

  console.log("[ProjectionDeck] Initializing Shared Controls...");

  powerBtn.onclick = async () => {
    const pill = document.getElementById('projectorStatusPill');
    const isActive = pill?.dataset.active === 'true';
    const displayId = select?.value;
    
    if (!isActive) {
        window.timerAPI.controlProjector('open', { displayId });
        showToast("Opening Projection Window...");
    } else {
        window.timerAPI.controlProjector('close');
        showToast("Closing Projection Window...");
    }
  };

  if (select) {
    select.onchange = (e) => {
      const displayId = e.target.value;
      const isActive = document.getElementById('projectorStatusPill')?.dataset.active === 'true';
      if (displayId && isActive) {
          window.timerAPI.controlProjector('setDisplay', { displayId });
          showToast(`Targeting Display ID: ${displayId}`);
      }
    };
  }

  if (fsBtn) {
    fsBtn.onclick = () => {
      window.timerAPI.controlProjector('fullscreen');
      showToast("Toggling Fullscreen Mode");
    };
  }

  if (reloadBtn) {
    reloadBtn.onclick = () => {
      window.timerAPI.controlProjector('reload');
      showToast("Triggering Stage Hot Reload", "info");
    };
  }

  if (focusBtn) {
    focusBtn.onclick = () => {
      window.timerAPI.controlProjector('focus');
      showToast("Bringing Projection to Front", "info");
    };
  }

  // Initial Clock Start
  updateDashboardClock();
  setInterval(updateDashboardClock, 1000);
};

// Ensure initialization happens as soon as possible
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupProjectionDeck);
} else {
  setupProjectionDeck();
}
