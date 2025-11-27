function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

window.addEventListener("DOMContentLoaded", async () => {
  const minutesInput = document.getElementById("minutes");
  const secondsInput = document.getElementById("seconds");
  const display = document.getElementById("display");
  const timerLabel = document.getElementById("timerLabel");
  const statusPill = document.getElementById("statusPill");

  const startBtn = document.getElementById("startBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const resetBtn = document.getElementById("resetBtn");

  const presetButtons = document.querySelectorAll(".preset-btn");

  function setStatus(isRunning) {
    if (isRunning) {
      statusPill.dataset.state = "running";
      statusPill.textContent = "Running";
      startBtn.disabled = true;
      pauseBtn.disabled = false;
    } else {
      statusPill.dataset.state = "paused";
      statusPill.textContent = "Paused";
      startBtn.disabled = false;
      pauseBtn.disabled = true;
    }
  }

  function renderState({ remainingMs, isOvertime, overtimeMs, isRunning }) {
    if (isOvertime) {
      timerLabel.textContent = "Time Up";
      display.textContent = `-${formatTime(overtimeMs)}`;
      display.classList.add("overtime");
    } else {
      timerLabel.textContent = "Time Remaining";
      display.textContent = formatTime(remainingMs);
      display.classList.remove("overtime");
    }

    setStatus(isRunning);
  }

  // Initial sync from main
  const state = await window.timerAPI.getState();
  renderState({
    remainingMs: state.remainingMs || 0,
    isOvertime: state.isOvertime || false,
    overtimeMs: state.overtimeMs || 0,
    isRunning: state.isRunning || false,
  });

  window.timerAPI.onUpdate(({ remainingMs, isOvertime, overtimeMs, isRunning }) =>
    renderState({ remainingMs, isOvertime, overtimeMs, isRunning })
  );

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
    window.timerAPI.pause();
  });

  resetBtn.addEventListener("click", () => {
    window.timerAPI.reset();
  });
});
