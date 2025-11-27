function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

window.addEventListener('DOMContentLoaded', async () => {
  const label = document.getElementById('label');
  const timeDisplay = document.getElementById('time');

  const state = await window.timerAPI.getState();

  function render({ remainingMs, isOvertime, overtimeMs }) {
    if (isOvertime) {

      label.textContent = 'TIME UP!!';
      timeDisplay.textContent = `-${formatTime(overtimeMs)}`;
      timeDisplay.style.fontSize = '20vh';
      document.body.style.background = '#800'; // reddish
    } else {

      label.textContent = '';
      timeDisplay.textContent = formatTime(remainingMs);
      document.body.style.background = '#000';
    }
  }

  render({
    remainingMs: state.remainingMs || 0,
    isOvertime: state.isOvertime || false,
    overtimeMs: state.overtimeMs || 0,
  });

  window.timerAPI.onUpdate(({ remainingMs, isOvertime, overtimeMs }) => {
    render({ remainingMs, isOvertime, overtimeMs });
  });

  window.timerAPI.onFinished(() => {
    
  });
});
