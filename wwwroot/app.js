const viewRooms  = document.getElementById("view-rooms");
const viewRoom   = document.getElementById("view-room");
const roomsList  = document.getElementById("rooms-list");
const tracksList = document.getElementById("tracks-list");
const roomNameEl = document.getElementById("room-name");

var currentRoomId = null;
var currentTracks = [];
var playingTrackId = null;
var userIsSeeking = false;

async function loadRooms() {
  const res = await fetch("/api/rooms");
  const rooms = await res.json();
  roomsList.innerHTML = rooms.length
    ? rooms.map(r => `
        <div class="room-card" data-id="${r.id}">
          <div class="room-cover" style="--h:${(r.id * 63) % 360}deg"></div>
          <h3>${escapeHtml(r.name)}</h3>
          <span>${r.trackCount} трек(ов)</span>
        </div>`).join("")
    : '<div class="empty-state"><div class="empty-icon">♫</div>Пока нет комнат — создайте первую</div>';

  roomsList.querySelectorAll(".room-card").forEach(card => {
    card.addEventListener("click", () => openRoom(card.dataset.id));
  });
}

async function openRoom(id) {
  const res = await fetch(`/api/rooms/${id}`);
  if (!res.ok) { alert("Комната не найдена"); return; }
  currentRoomId = id;
  const room = await res.json();
  roomNameEl.textContent = room.name;
  currentTracks = room.tracks;
  renderTracks(room.tracks);
  viewRooms.hidden = true;
  viewRoom.hidden = false;
}

function refreshRoom() {
  if (currentRoomId) openRoom(currentRoomId);
}

document.getElementById("btn-back").addEventListener("click", () => {
  currentRoomId = null;
  viewRoom.hidden = true;
  viewRooms.hidden = false;
  stopPlayback();
  loadRooms();
});

const renameForm  = document.getElementById("room-rename-form");
const renameInput = document.getElementById("input-rename");

document.getElementById("btn-rename").addEventListener("click", () => {
  renameInput.value = roomNameEl.textContent;
  renameForm.hidden = false;
  renameInput.focus();
  renameInput.select();
});

document.getElementById("btn-rename-cancel").addEventListener("click", () => {
  renameForm.hidden = true;
});

document.getElementById("btn-rename-save").addEventListener("click", saveRename);
renameInput.addEventListener("keydown", e => {
  if (e.key === "Enter") saveRename();
  if (e.key === "Escape") renameForm.hidden = true;
});

async function saveRename() {
  const name = renameInput.value.trim();
  if (!name) return;
  const res = await fetch(`/api/rooms/${currentRoomId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (res.ok) {
    const data = await res.json();
    roomNameEl.textContent = data.name;
    renameForm.hidden = true;
  } else {
    const err = await res.json();
    alert(err.error || "Ошибка переименования");
  }
}

document.getElementById("btn-delete-room").addEventListener("click", async () => {
  if (!confirm(`Удалить комнату «${roomNameEl.textContent}»? Все треки будут удалены.`)) return;
  const res = await fetch(`/api/rooms/${currentRoomId}`, { method: "DELETE" });
  if (res.ok) {
    currentRoomId = null;
    viewRoom.hidden = true;
    viewRooms.hidden = false;
    stopPlayback();
    loadRooms();
  }
});

function renderTracks(tracks) {
  tracksList.innerHTML = tracks.length
    ? tracks.map((t, i) => `
      <div class="track-row ${t.id === playingTrackId ? "playing" : ""}" data-id="${t.id}">
        <span class="rank">${i + 1}</span>
        ${t.fileUrl
          ? `<button class="cover play-btn" style="--h:${(t.id * 47) % 360}deg" title="Воспроизвести">
               <span class="play-icon">${t.id === playingTrackId && !audioEl.paused ? "❙❙" : "▶"}</span>
             </button>`
          : `<span class="cover" style="--h:${(t.id * 47) % 360}deg"></span>`}
        <div class="meta">
          <strong>${escapeHtml(t.title)}</strong>
          <span>${escapeHtml(t.artist)}${t.durationSec ? " · " + formatTime(t.durationSec) : ""}${!t.fileUrl ? " · без аудио" : ""}</span>
        </div>
        <div class="vote-group">
          <button class="vote-btn down" data-dir="down" title="Дизлайк">−</button>
          <span class="votes-count ${t.votes > 0 ? "pos" : t.votes < 0 ? "neg" : ""}">${t.votes > 0 ? "+" : ""}${t.votes}</span>
          <button class="vote-btn up" data-dir="up" title="Лайк">+</button>
        </div>
        <button class="btn-remove" title="Удалить">×</button>
      </div>`).join("")
    : '<div class="empty-state"><div class="empty-icon">♪</div>Очередь пуста — добавьте первый трек</div>';

  tracksList.querySelectorAll(".vote-btn").forEach(btn => {
    btn.addEventListener("click", () => vote(btn.closest(".track-row").dataset.id, btn.dataset.dir));
  });
  tracksList.querySelectorAll(".btn-remove").forEach(btn => {
    btn.addEventListener("click", () => removeTrack(btn.closest(".track-row").dataset.id));
  });
  tracksList.querySelectorAll(".play-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.closest(".track-row").dataset.id);
      if (id === playingTrackId && !audioEl.paused) pausePlayback();
      else playTrackById(id);
    });
  });
}

async function vote(trackId, direction) {
  const res = await fetch(`/api/tracks/${trackId}/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ direction }),
  });
  if (res.ok) refreshRoom();
}

async function removeTrack(trackId) {
  if (Number(trackId) === playingTrackId) stopPlayback();
  await fetch(`/api/tracks/${trackId}`, { method: "DELETE" });
  refreshRoom();
}

const dropzone    = document.getElementById("dropzone");
const fileInput   = document.getElementById("file-input");
const uploadStatus = document.getElementById("upload-status");

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) uploadFile(fileInput.files[0]);
});

["dragover", "dragleave", "drop"].forEach(evt => {
  dropzone.addEventListener(evt, e => e.preventDefault());
});
dropzone.addEventListener("dragover", () => dropzone.classList.add("drag-over"));
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
dropzone.addEventListener("drop", e => {
  dropzone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) uploadFile(file);
});

function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);

  uploadStatus.hidden = false;
  uploadStatus.className = "upload-status";
  uploadStatus.innerHTML = `<div class="upload-bar"><div class="upload-bar-fill" style="width:0%"></div></div><span>Загружаем «${escapeHtml(file.name)}»…</span>`;

  const xhr = new XMLHttpRequest();
  xhr.open("POST", `/api/rooms/${currentRoomId}/upload`);
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      const fill = uploadStatus.querySelector(".upload-bar-fill");
      if (fill) fill.style.width = pct + "%";
    }
  };
  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      const track = JSON.parse(xhr.responseText);
      uploadStatus.className = "upload-status success";
      uploadStatus.innerHTML = `✓ Добавлено: «${escapeHtml(track.title)}» — ${escapeHtml(track.artist)}`;
      fileInput.value = "";
      refreshRoom();
      setTimeout(() => { uploadStatus.hidden = true; }, 2500);
    } else {
      const err = JSON.parse(xhr.responseText || "{}");
      uploadStatus.className = "upload-status error";
      uploadStatus.textContent = "⚠ " + (err.error || "Ошибка загрузки");
    }
  };
  xhr.onerror = () => {
    uploadStatus.className = "upload-status error";
    uploadStatus.textContent = "⚠ Сетевая ошибка";
  };
  xhr.send(form);
}

const audioEl      = document.getElementById("audio-el");
const playerBar    = document.getElementById("player-bar");
const playerToggle = document.getElementById("player-toggle");
const playerSkip   = document.getElementById("player-skip");
const playerTitle  = document.getElementById("player-title");
const playerArtist = document.getElementById("player-artist");
const playerSeek   = document.getElementById("player-seek");
const timeCurrentEl = document.getElementById("player-time-current");
const timeTotalEl   = document.getElementById("player-time-total");

function playTrackById(id) {
  const track = currentTracks.find(t => t.id === id);
  if (!track || !track.fileUrl) return;

  playingTrackId = id;
  audioEl.src = track.fileUrl;
  audioEl.play();

  playerTitle.textContent = track.title;
  playerArtist.textContent = track.artist;
  playerBar.hidden = false;
  renderTracks(currentTracks);
}

function pausePlayback() {
  audioEl.pause();
  renderTracks(currentTracks);
}

function stopPlayback() {
  audioEl.pause();
  audioEl.src = "";
  playingTrackId = null;
  playerBar.hidden = true;
}

function skipTrack() {
  if (!playingTrackId) return;
  const idx = currentTracks.findIndex(t => t.id === playingTrackId);
  const next = currentTracks.slice(idx + 1).find(t => t.fileUrl);
  if (next) playTrackById(next.id); else stopPlayback();
}

playerToggle.addEventListener("click", () => {
  if (!playingTrackId) return;
  if (audioEl.paused) audioEl.play(); else audioEl.pause();
});
playerSkip.addEventListener("click", skipTrack);

audioEl.addEventListener("play",  () => { playerToggle.textContent = "❙❙"; renderTracks(currentTracks); });
audioEl.addEventListener("pause", () => { playerToggle.textContent = "▶";  renderTracks(currentTracks); });

audioEl.addEventListener("loadedmetadata", () => {
  playerSeek.max = audioEl.duration || 0;
  timeTotalEl.textContent = formatTime(audioEl.duration);
});

audioEl.addEventListener("timeupdate", () => {
  if (!audioEl.duration || userIsSeeking) return;
  playerSeek.value = audioEl.currentTime;
  timeCurrentEl.textContent = formatTime(audioEl.currentTime);
  timeTotalEl.textContent = formatTime(audioEl.duration);
});

audioEl.addEventListener("ended", skipTrack);

playerSeek.addEventListener("input", () => {
  userIsSeeking = true;
  timeCurrentEl.textContent = formatTime(Number(playerSeek.value));
});
playerSeek.addEventListener("change", () => {
  audioEl.currentTime = Number(playerSeek.value);
  userIsSeeking = false;
});

function formatTime(sec) {
  if (!isFinite(sec)) return "0:00";
  sec = Math.floor(sec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const VOL_R    = 52;
const VOL_CX   = 70;
const VOL_CY   = 70;
const VOL_CIRC = 2 * Math.PI * VOL_R;
const VOL_ARC  = VOL_CIRC * (270 / 360);

const volBtn    = document.getElementById("vol-btn");
const volPopup  = document.getElementById("vol-popup");
const volArcEl  = document.getElementById("vol-arc");
const volMarker = document.getElementById("vol-marker");
const volNum    = document.getElementById("vol-num");
const volPct    = document.getElementById("vol-pct");

let volume = 0.8;

(function drawTicks() {
  const g = document.getElementById("vol-ticks");
  for (let i = 0; i <= 10; i++) {
    const frac = i / 10;
    const deg  = -135 + frac * 270;
    const rad  = (deg - 90) * Math.PI / 180;
    const r1   = 62, r2 = 66;
    const x1 = VOL_CX + r1 * Math.cos(rad);
    const y1 = VOL_CY + r1 * Math.sin(rad);
    const x2 = VOL_CX + r2 * Math.cos(rad);
    const y2 = VOL_CY + r2 * Math.sin(rad);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1); line.setAttribute("y1", y1);
    line.setAttribute("x2", x2); line.setAttribute("y2", y2);
    line.setAttribute("stroke", i % 5 === 0 ? "rgba(250,246,236,.55)" : "rgba(250,246,236,.2)");
    line.setAttribute("stroke-width", i % 5 === 0 ? "2" : "1");
    line.setAttribute("stroke-linecap", "round");
    g.appendChild(line);
  }
})();

function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  audioEl.volume = volume;

  const pct = Math.round(volume * 100);
  const filled = VOL_ARC * volume;
  volArcEl.setAttribute("stroke-dasharray", `${filled} ${VOL_CIRC - filled}`);

  const deg = -135 + volume * 270;
  volMarker.setAttribute("transform", `rotate(${deg} ${VOL_CX} ${VOL_CY})`);

  volNum.textContent = pct;
  volPct.textContent = pct;

  const w1 = document.getElementById("vol-wave-1");
  const w2 = document.getElementById("vol-wave-2");
  if (volume === 0) {
    w1.setAttribute("opacity", "0"); w2.setAttribute("opacity", "0");
  } else if (volume < 0.4) {
    w1.setAttribute("opacity", "1"); w2.setAttribute("opacity", "0");
  } else {
    w1.setAttribute("opacity", "1"); w2.setAttribute("opacity", "1");
  }
}

setVolume(0.8);

function closeVolPopup() {
  volPopup.hidden = true;
  volBtn.classList.remove("active");
}

function attachOutsideClick() {
  document.addEventListener("click", function handler(e) {
    if (volPopup.contains(e.target)) {
      document.addEventListener("click", handler, { once: true });
      return;
    }
    closeVolPopup();
  }, { once: true });
}

volBtn.addEventListener("click", () => {
  const wasHidden = volPopup.hidden;
  volPopup.hidden = !wasHidden;
  volBtn.classList.toggle("active", wasHidden);
  if (wasHidden) setTimeout(attachOutsideClick, 0);
});

const volKnob = document.getElementById("vol-knob");

volPopup.addEventListener("wheel", (e) => {
  e.preventDefault();
  setVolume(volume - e.deltaY * 0.002);
}, { passive: false });

let dragStartY   = null;
let dragStartVol = null;

volKnob.addEventListener("pointerdown", (e) => {
  dragStartY   = e.clientY;
  dragStartVol = volume;
  volKnob.setPointerCapture(e.pointerId);
  e.preventDefault();
});

volKnob.addEventListener("pointermove", (e) => {
  if (dragStartY === null) return;
  const delta = (dragStartY - e.clientY) / 140;
  setVolume(dragStartVol + delta);
});

volKnob.addEventListener("pointerup",     () => { dragStartY = null; });
volKnob.addEventListener("pointercancel", () => { dragStartY = null; });

const modal = document.getElementById("modal-new-room");
document.getElementById("btn-new-room").addEventListener("click", () => {
  modal.hidden = false;
  const input = document.getElementById("input-room-name");
  input.value = "";
  input.focus();
});
document.getElementById("btn-cancel-room").addEventListener("click", () => { modal.hidden = true; });
document.getElementById("btn-create-room").addEventListener("click", async () => {
  const name = document.getElementById("input-room-name").value.trim();
  if (!name) return;
  const res = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (res.ok) {
    modal.hidden = true;
    loadRooms();
  }
});

const THEME_KEY = "oborot-theme";
const btnTheme = document.getElementById("btn-theme");

function syncThemeButton() {
  const theme = document.documentElement.getAttribute("data-theme");
  btnTheme.textContent = theme === "dark" ? "☀️ Светлая" : "🌙 Тёмная";
}
syncThemeButton();

btnTheme.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
  syncThemeButton();
});

const modalHelp = document.getElementById("modal-help");
document.getElementById("btn-help").addEventListener("click", () => { modalHelp.hidden = false; });
document.getElementById("btn-close-help").addEventListener("click", () => { modalHelp.hidden = true; });
modalHelp.addEventListener("click", (e) => { if (e.target === modalHelp) modalHelp.hidden = true; });

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  modalHelp.hidden = true;
  modal.hidden = true;
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

loadRooms();
