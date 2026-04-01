function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

window.addEventListener('DOMContentLoaded', async () => {
  const label = document.getElementById('label');
  const timeDisplay = document.getElementById('time');
  const progressBar = document.getElementById('progress-bar');
  const bgLayer = document.getElementById('bg-layer');
  const titleEl = document.getElementById('title');

  function setProgress(percent) {
    if (progressBar) {
      progressBar.style.width = `${percent * 100}%`;
    }
  }

  function render({ remainingMs, totalMs, isOvertime, overtimeMs, isPaused, isRunning }) {
    if (isOvertime) {
      label.textContent = 'TIME UP!!';
      timeDisplay.textContent = `-${formatTime(overtimeMs)}`;
      timeDisplay.classList.add('overtime');
      timeDisplay.classList.remove('pulsing');
      
      bgLayer.classList.add('overtime');
      bgLayer.classList.remove('urgency');
      document.body.classList.add('shake');
      
      setProgress(1); // Full ring in overtime
    } else {
      label.textContent = '';
      timeDisplay.textContent = formatTime(remainingMs);
      timeDisplay.classList.remove('overtime');
      
      document.body.classList.remove('shake');
      bgLayer.classList.remove('overtime');

      // Urgency Logic (< 60s)
      if (remainingMs > 0 && remainingMs <= 60000) {
        timeDisplay.classList.add('pulsing');
        bgLayer.classList.add('urgency');
      } else {
        timeDisplay.classList.remove('pulsing');
        bgLayer.classList.remove('urgency');
      }

      // Progress Calculation
      if (totalMs > 0) {
        const percent = Math.max(0, remainingMs / totalMs);
        setProgress(percent);
      } else {
        setProgress(0);
      }
    }
  }

  // Initial State
  const state = await window.timerAPI.getState();
  if (titleEl) titleEl.textContent = state.customTitle || "";
  render(state);

  // Updates
  window.timerAPI.onUpdate((data) => {
    render(data);
  });

  window.timerAPI.onTitle(({ title }) => {
    if (titleEl) titleEl.textContent = title || "";
  });
});
