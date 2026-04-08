function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

function formatTimeHTML(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}<span class="timer-colon">:</span>${String(seconds).padStart(
    2,
    "0"
  )}`;
}

window.addEventListener('DOMContentLoaded', async () => {
  const isRemote = (typeof window.timerAPI === 'undefined');
  
  if (isRemote) {
    const socket = io();
    window.timerAPI = {
      getState: () => new Promise(resolve => {
        socket.emit('timer:getState', (state) => resolve(state));
      }),
      onUpdate: (cb) => socket.on('timer:update', cb),
      onTitle: (cb) => socket.on('timer:title', cb),
      onNotes: (cb) => socket.on('timer:notes', cb),
      onConfigUpdate: (cb) => socket.on('timer:configUpdate', cb),
      submitPin: (pin) => socket.emit('register', { pin, clientType: 'projector', deviceId: getDeviceId(), userAgent: navigator.userAgent }),
      onAuth: (cb) => socket.on('registered', (res) => cb(res.success)),
      onFlash: (cb) => socket.on('timer:flash', cb)
    };

    const overlay = document.getElementById('remoteAuthOverlay');
    const pinInput = document.getElementById('remotePinInput');
    const submitBtn = document.getElementById('authSubmitBtn');

    const getDeviceId = () => {
      let id = localStorage.getItem('remote_device_id');
      if (!id) {
        id = 'dev-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('remote_device_id', id);
      }
      return id;
    };

    socket.on('connect', () => {
      socket.emit('timer:identify', { deviceId: getDeviceId(), userAgent: navigator.userAgent });
      socket.emit('timer:getState');
    });

    if (submitBtn) {
      submitBtn.onclick = () => window.timerAPI.submitPin(pinInput.value);
    }
    if (pinInput) {
      pinInput.onkeypress = (e) => { if (e.key === 'Enter') window.timerAPI.submitPin(pinInput.value); };
    }

    // Check PIN requirement from current state
    const checkPinRequired = (state) => {
      const pinRequired = state?.config?.settings?.requirePinProjector !== false;
      if (!pinRequired) {
        // Auto-authenticate — no PIN needed
        socket.emit('register', { pin: '', clientType: 'projector', deviceId: getDeviceId(), userAgent: navigator.userAgent });
      } else {
        // Show PIN overlay
        if (overlay) overlay.style.display = 'flex';
      }
    };

    // 1. Listen for broadcast (if it arrives after we set up)
    socket.once('timer:state', checkPinRequired);
    
    // 2. Proactively ask for it (if we missed the broadcast)
    window.timerAPI.getState().then(checkPinRequired);

    window.timerAPI.onAuth((success) => {
      if (success) {
        if (overlay) overlay.style.display = 'none';
        initProjector();
      } else {
        if (overlay) overlay.style.display = 'flex';
        if (pinInput) {
          pinInput.value = '';
          pinInput.style.borderColor = '#ef4444';
          setTimeout(() => pinInput.style.borderColor = 'rgba(255, 255, 255, 0.1)', 1000);
        }
      }
    });
  } else {
    initProjector();
  }

  async function initProjector() {
    const state = await window.timerAPI.getState();
    const label = document.getElementById('label');
    const timeDisplay = document.getElementById('time');
    const titleEl = document.getElementById('title');
    const bgLayer = document.getElementById('bg-layer');
    let lastZone = 'green';
    let audioCtx = null;
    let isFlashActive = false;

    function playBeep(freq = 880, duration = 0.15) {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
      } catch (e) { /* Audio Context may be blocked */ }
    }

    function setSegments(remainingMs, totalMs, wrapUp) {
      const greenSeg = document.getElementById('segment-green');
      const yellowSeg = document.getElementById('segment-yellow');
      const redSeg = document.getElementById('segment-red');
      const container = document.querySelector('.progress-container');
      if (!greenSeg || !yellowSeg || !redSeg || !container) return;

      const yellowLimit = wrapUp.yellowMs || 60000;
      const redLimit = wrapUp.redMs || 30000;

      const redMs = Math.min(totalMs, redLimit);
      const yellowMs = Math.max(0, Math.min(totalMs - redMs, yellowLimit - redMs));
      const greenMs = Math.max(0, totalMs - redMs - yellowMs);

      let currentZone = 'green';
      if (remainingMs <= redLimit) currentZone = 'red';
      else if (remainingMs <= yellowLimit) currentZone = 'yellow';

      if (currentZone !== lastZone) {
        if (currentZone === 'yellow' && wrapUp.soundOnYellow) playBeep(440, 0.2); 
        if (currentZone === 'red') {
          if (wrapUp.soundOnRed) playBeep(880, 0.3);
          if (wrapUp.flashOnRed) {
            container.classList.remove('flashing-3x');
            void container.offsetWidth; // Reflow
            container.classList.add('flashing-3x');
          }
        }
        lastZone = currentZone;
      }

      const redFill = Math.max(0, Math.min(redMs, remainingMs));
      const yellowFill = Math.max(0, Math.min(yellowMs, remainingMs - redMs));
      const greenFill = Math.max(0, Math.min(greenMs, remainingMs - redMs - yellowMs));

      const totalPercent = (remainingMs / totalMs) * 100;
      container.style.setProperty('--marker-pos', `${totalPercent}%`);

      greenSeg.style.width = `${(greenFill / totalMs) * 100}%`;
      yellowSeg.style.width = `${(yellowFill / totalMs) * 100}%`;
      redSeg.style.width = `${(redFill / totalMs) * 100}%`;
    }

    function updateProjectorClock() {
      const clockEl = document.getElementById('clock');
      if (!clockEl) return;
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        second: '2-digit', 
        hour12: true 
      });
    }

    function render({ remainingMs, totalMs, isOvertime, overtimeMs, isPaused, isRunning }) {
      const config = (window.lastConfig || state.config);
      const vis = config?.settings?.visibility || { showTimer: true, showBar: true, showTitle: true, showNotes: true, showClock: false };
      const wrapUp = config?.settings?.wrapUp || { yellowMs: 60000, redMs: 30000, flashOnRed: true, flashOnOvertime: true };

      const clockEl = document.getElementById('clock');
      if (clockEl) clockEl.style.display = vis.showClock ? 'block' : 'none';

      const container = document.querySelector('.progress-container');
      const timerStack = document.querySelector('.timer-stack');

      if (isOvertime) {
        if (titleEl) titleEl.style.display = 'none';
        if (timerStack) timerStack.style.display = vis.showTimer ? 'flex' : 'none';
        label.style.display = 'none';
        timeDisplay.style.display = vis.showTimer ? 'block' : 'none';
        timeDisplay.innerHTML = `<span style="font-size: 0.8em; vertical-align: middle; margin-right: 0.1em; opacity: 0.8;">-</span>${formatTimeHTML(overtimeMs)}`;
        timeDisplay.classList.add('overtime');
        timeDisplay.classList.remove('pulsing');
        
        bgLayer.classList.add('overtime');
        bgLayer.classList.remove('urgency');
        document.body.classList.add('shake');

        if (wrapUp.flashOnOvertime) {
          container.classList.add('flashing-indefinite');
        }
        
        setSegments(0, totalMs, wrapUp);
      } else {
        if (titleEl) titleEl.style.display = vis.showTitle ? 'block' : 'none';
        if (timerStack) timerStack.style.display = vis.showTimer ? 'flex' : 'none';
        label.style.display = 'block';
        label.textContent = '';
        timeDisplay.style.display = vis.showTimer ? 'block' : 'none';
        timeDisplay.innerHTML = formatTimeHTML(remainingMs);
        timeDisplay.classList.remove('overtime');
        
        document.body.classList.remove('shake');
        bgLayer.classList.remove('overtime');
        if (container) container.classList.remove('flashing-indefinite');

        // Urgency Logic (< 60s)
        if (remainingMs > 0 && remainingMs <= 60000) {
          timeDisplay.classList.add('pulsing');
          bgLayer.classList.add('urgency');
        } else {
          timeDisplay.classList.remove('pulsing');
          bgLayer.classList.remove('urgency');
        }

        // Apply Flash Persistent State
        if (isFlashActive) {
          timeDisplay.classList.add('flash-active');
          const notesContainer = document.getElementById('notes-container');
          if (notesContainer) notesContainer.classList.add('notes-flash');
        } else {
          timeDisplay.classList.remove('flash-active');
          const notesContainer = document.getElementById('notes-container');
          if (notesContainer) notesContainer.classList.remove('notes-flash');
        }

        // Restore lastZone if we reset to high time
        if (remainingMs > wrapUp.yellowMs) lastZone = 'green';

        // Progress Bar Visibility
        if (container) container.style.display = vis.showBar ? 'flex' : 'none';

        if (totalMs > 0) {
          setSegments(remainingMs, totalMs, wrapUp);
        } else {
          setSegments(0, 1, wrapUp);
        }
      }
    }

    function updateNotes(notes) {
      const notesContainer = document.getElementById('notes-container');
      const content = document.getElementById('notes-content');
      if (!notesContainer || !content) return;

      const config = (window.lastConfig || state.config);
      const vis = config?.settings?.visibility || { showNotes: true };

      // Reset rich styles
      content.className = '';
      content.style.color = '';
      document.body.classList.remove('focus-notes', 'has-notes');
      content.style.fontSize = ''; // reset to CSS variable

      if (notes && vis.showNotes) {
        let text = "";
        
        if (typeof notes === 'object') {
          text = notes.text || "";
          if (notes.bold) content.classList.add('msg-bold');
          if (notes.caps) content.classList.add('msg-caps');
          if (notes.flash) content.classList.add('msg-flash');
          if (notes.focus) document.body.classList.add('focus-notes');
          if (notes.color) content.style.color = notes.color;
        } else {
          text = notes;
        }

        if (text.trim() !== "") {
          content.textContent = text;
          notesContainer.classList.add('active');
          document.body.classList.add('has-notes');

          // Dynamic Scaling (Delayed to allow layout/transitions to finish)
          setTimeout(() => fitNotesText(content), 50);
        } else {
          notesContainer.classList.remove('active');
        }
      } else {
        notesContainer.classList.remove('active');
      }
    }

    function fitNotesText(el) {
      const parent = el.parentElement;
      if (!parent) return;

      const maxBoxHeight = parent.offsetHeight;
      const originalSizeVal = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--notes-size')) || 4.5;
      const unit = getComputedStyle(document.documentElement).getPropertyValue('--notes-size').includes('vh') ? 'vh' : 'vw';
      
      let fontSize = originalSizeVal;
      el.style.fontSize = fontSize + unit;

      // Incrementally shrink font size until it fits OR hits 1.5vh minimum (very small)
      while (el.scrollHeight > maxBoxHeight && fontSize > 1.5) {
        fontSize -= 0.1;
        el.style.fontSize = fontSize + unit;
      }
    }

    function applyAppearance(config) {
      if (!config || !config.settings) return;
      const settings = config.settings;
      
      window.lastConfig = config;

      if (settings.appearance) {
        const app = settings.appearance;
        const root = document.documentElement;
        root.style.setProperty('--timer-size', app.timerSize);
        root.style.setProperty('--timer-color', app.timerColor);
        root.style.setProperty('--timer-font', app.timerFont);
        root.style.setProperty('--title-size', app.titleSize);
        root.style.setProperty('--title-color', app.titleColor);
        root.style.setProperty('--title-font', app.titleFont || 'system-ui');
        root.style.setProperty('--notes-size', app.notesSize);
        root.style.setProperty('--notes-color', app.notesColor);
        root.style.setProperty('--notes-font', app.notesFont || 'system-ui');
        root.style.setProperty('--bar-color', app.barColor);
        root.style.setProperty('--bar-height', app.barHeight);
        root.style.setProperty('--clock-size', app.clockSize || '17vh');
        root.style.setProperty('--clock-color', app.clockColor || 'rgba(255,255,255,0.83)');
      }
      
      const nStr = window.currentNotes || state.customNotes || "";
      updateNotes(nStr);
      if (window.lastState) render(window.lastState);
    }

    function applyFocusMode(config) {
      if (!config || !config.settings || !config.settings.focusMode) return;
      const focus = config.settings.focusMode;
      const body = document.body;
      const title = document.getElementById('title');
      const timer = document.getElementById('time');
      const notes = document.getElementById('notes-container');

      body.classList.remove('focus-mode', 'focus-timer', 'focus-notes', 'focus-title');
      [title, timer, notes].forEach(el => {
        if (el) el.classList.remove('focused-item', 'item-top', 'item-bottom');
      });

      if (!focus.enabled) return;

      body.classList.add('focus-mode');
      
      if (focus.focusedItem === 'timer') {
        body.classList.add('focus-timer');
        if (title) title.classList.add('item-top');
        if (timer) timer.classList.add('focused-item');
        if (notes) notes.classList.add('item-bottom');
      } else if (focus.focusedItem === 'notes') {
        body.classList.add('focus-notes');
        if (title) title.classList.add('item-top');
        if (timer) timer.classList.add('item-bottom');
        if (notes) notes.classList.add('focused-item');
      } else if (focus.focusedItem === 'title') {
        body.classList.add('focus-title');
        if (title) title.classList.add('focused-item');
        if (timer) timer.classList.add('item-bottom');
        if (notes) notes.classList.add('item-bottom');
      }
    }

    window.timerAPI.onUpdate((data) => {
      window.lastState = data;
      render(data);
    });

    window.timerAPI.onConfigUpdate((config) => {
      applyAppearance(config);
      applyFocusMode(config);
    });

    window.timerAPI.onTitle(({ title }) => {
      const titleElement = document.getElementById('title');
      if (titleElement) titleElement.textContent = title || "";
    });

    window.timerAPI.onNotes(({ notes }) => {
      window.currentNotes = notes;
      updateNotes(notes);
    });

    if (window.timerAPI.onFlash) {
      window.timerAPI.onFlash(() => {
        // Activate persistent flash state
        isFlashActive = true;
        
        // Immediate physical blast effect (Flash the entire background white)
        document.body.classList.add('flash-blast');
        setTimeout(() => document.body.classList.remove('flash-blast'), 200);

        // Immediate manual render to apply styles instantly
        if (window.lastState || state) {
          render(window.lastState || state);
        }

        // Auto-clear after production-safe interval (3s)
        setTimeout(() => {
          isFlashActive = false;
          // Render again to clear styles
          if (window.lastState || state) {
            render(window.lastState || state);
          }
        }, 3000);
        
        // Trigger high-attention signaling beep
        playBeep(1200, 0.1); 
        setTimeout(() => playBeep(1200, 0.1), 150);
      });
    }

    // Initial setup
    if (state.customTitle) {
      if (titleEl) titleEl.textContent = state.customTitle;
    }
    if (state.customNotes) {
      updateNotes(state.customNotes);
    }
    if (state.config) {
      applyAppearance(state.config);
      applyFocusMode(state.config);
    }
    render(state);

    updateProjectorClock();
    setInterval(updateProjectorClock, 1000);
  }
});
