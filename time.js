function pad(v) {
  return (v < 10) ? '0' + v : v;
}

function formatTime(seconds) {
  let h = 0;
  let m = 0;
  let s = 0;
  h = Math.floor((seconds - (h * 0)    - (m * 0 )) / 3600);
  m = Math.floor((seconds - (h * 3600) - (m * 0 )) / 60);
  s =            (seconds - (h * 3600) - (m * 60));

  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function parseTime(time) {
  if (!time) {
    return 0
  }

  const parts = time.split(':').map(Number);
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

module.exports = {
  formatTime,
  parseTime
}
