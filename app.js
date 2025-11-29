const STORAGE_KEY = "streak-bloom";
const DEFAULT_EMOJIS = ["💧", "🏃", "🧘", "🍃", "📚", "🍋", "🌙", "🥕", "🎧", "🪴"];
const MS_PER_DAY = 86_400_000;

const refs = {
  habitList: document.getElementById("habitList"),
  freezeCount: document.getElementById("freezeCount"),
  form: document.getElementById("habitForm"),
  emojiInput: document.getElementById("habitEmoji"),
  nameInput: document.getElementById("habitName"),
  settingsPanel: document.getElementById("settingsPanel"),
  openSettings: document.getElementById("openSettings"),
  closeSettings: document.getElementById("closeSettings"),
  settingsHabitList: document.getElementById("settingsHabitList"),
  toast: document.getElementById("toast"),
};

let toastTimer;
let state = hydrate();
render();

refs.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = refs.nameInput.value.trim();
  if (!name) {
    showToast("Name your habit first ✏️", "warn");
    return;
  }

  const emoji = (refs.emojiInput.value || pickEmoji()).trim() || pickEmoji();
  const habit = {
    id: generateId(),
    name,
    emoji,
    streak: 0,
    lastCheckIn: null,
  };

  state.habits.push(habit);
  saveState();
  render();
  refs.form.reset();
  showToast(`${emoji} ${name} added!`, "good");
});

refs.openSettings.addEventListener("click", () => toggleSettings(true));
refs.closeSettings.addEventListener("click", () => toggleSettings(false));
refs.settingsPanel.addEventListener("click", (event) => {
  if (event.target === refs.settingsPanel) {
    toggleSettings(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    toggleSettings(false);
  }
});

function hydrate() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const fallback = {
    habits: [],
    freeze: {
      available: 3,
      weekKey: getWeekKey(new Date()),
    },
  };

  let parsed;
  try {
    parsed = raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn("Resetting streak data", error);
    parsed = fallback;
  }

  parsed.habits = parsed.habits ?? [];
  parsed.freeze = parsed.freeze ?? fallback.freeze;

  const currentWeek = getWeekKey(new Date());
  if (parsed.freeze.weekKey !== currentWeek) {
    parsed.freeze = { available: 3, weekKey: currentWeek };
  } else {
    parsed.freeze.available = clamp(parsed.freeze.available ?? 3, 0, 3);
  }

  return parsed;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  refreshWeeklyFreezes();
  renderFreezeBank();
  renderHabits();
  renderSettingsHabits();
}

function renderFreezeBank() {
  refs.freezeCount.textContent = state.freeze.available;
}

function renderHabits() {
  refs.habitList.innerHTML = "";
  if (state.habits.length === 0) {
    const msg = document.createElement("p");
    msg.className = "empty-state";
    msg.textContent = "Add your first habit to start a streak 🌱";
    refs.habitList.appendChild(msg);
    return;
  }

  state.habits
    .slice()
    .sort((a, b) => b.streak - a.streak)
    .forEach((habit) => {
      const card = buildHabitCard(habit);
      refs.habitList.appendChild(card);
    });
}

function buildHabitCard(habit) {
  const template = document.getElementById("habitTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  const today = getToday();
  const meta = getHabitMeta(habit, today);

  node.dataset.id = habit.id;
  node.querySelector(".habit-emoji").textContent = habit.emoji || pickEmoji();
  node.querySelector(".habit-name").textContent = habit.name;
  node.querySelector(".streak-count").textContent = habit.streak;
  node.querySelector(".last-check").textContent = meta.lastCheckLabel;

  const statusEl = node.querySelector(".status");
  statusEl.textContent = meta.statusText;
  statusEl.className = `status ${meta.statusTone}`.trim();

  const checkBtn = node.querySelector(".check-in");
  checkBtn.disabled = !meta.canCheckIn;
  checkBtn.title = meta.checkInHint;
  checkBtn.addEventListener("click", () => handleCheckIn(habit.id));

  const freezeBtn = node.querySelector(".freeze");
  freezeBtn.disabled = !meta.canFreeze;
  freezeBtn.title = meta.freezeHint;
  freezeBtn.addEventListener("click", () => handleFreeze(habit.id));

  return node;
}

function renderSettingsHabits() {
  refs.settingsHabitList.innerHTML = "";

  if (state.habits.length === 0) {
    const li = document.createElement("li");
    li.className = "hint";
    li.textContent = "Nothing to delete yet. Add a habit first.";
    refs.settingsHabitList.appendChild(li);
    return;
  }

  state.habits.forEach((habit) => {
    const li = document.createElement("li");
    li.className = "settings-row";
    li.innerHTML = `
      <span>${habit.emoji} ${habit.name}</span>
      <button type="button" aria-label="Delete ${habit.name}">🗑️ Remove</button>
    `;
    li.querySelector("button").addEventListener("click", () => deleteHabit(habit.id));
    refs.settingsHabitList.appendChild(li);
  });
}

function deleteHabit(id) {
  const habit = state.habits.find((entry) => entry.id === id);
  if (!habit) return;
  const confirmed = window.confirm(`Delete ${habit.emoji} ${habit.name}?`);
  if (!confirmed) return;

  state.habits = state.habits.filter((entry) => entry.id !== id);
  saveState();
  render();
  showToast(`${habit.name} removed`, "warn");
}

function handleCheckIn(id) {
  refreshWeeklyFreezes();
  const habit = state.habits.find((entry) => entry.id === id);
  if (!habit) return;

  const today = getToday();
  const todayStr = formatDay(today);

  if (!habit.lastCheckIn) {
    habit.streak = 1;
    habit.lastCheckIn = todayStr;
    saveState();
    render();
    showToast(`🔥 ${habit.name} streak started!`, "good");
    return;
  }

  const lastDate = parseDay(habit.lastCheckIn);
  const gap = dayDiff(lastDate, today);

  if (gap === 0) {
    showToast("Already checked in today", "warn");
    return;
  }

  if (gap === 1) {
    habit.streak += 1;
    habit.lastCheckIn = todayStr;
    saveState();
    render();
    showToast(`Streak up to ${habit.streak} 🔥`, "good");
    return;
  }

  if (state.freeze.available > 0) {
    showToast("Missed a day. Use ❄️ freeze to protect this streak.", "warn");
    return;
  }

  habit.streak = 1;
  habit.lastCheckIn = todayStr;
  saveState();
  render();
  showToast(`No freezes left. ${habit.name} streak restarted.`, "bad");
}

function handleFreeze(id) {
  refreshWeeklyFreezes();
  const habit = state.habits.find((entry) => entry.id === id);
  if (!habit) return;

  if (!habit.lastCheckIn) {
    showToast("Start the habit before freezing it.", "warn");
    return;
  }

  if (state.freeze.available === 0) {
    showToast("No freezes available this week.", "bad");
    return;
  }

  const today = getToday();
  const lastDate = parseDay(habit.lastCheckIn);
  const gap = dayDiff(lastDate, today);

  if (gap < 2) {
    showToast("You're on track. Freezes cover missed days only.", "warn");
    return;
  }

  const yesterday = addDays(today, -1);
  const boostedDate = addDays(lastDate, 1);
  const nextDate = boostedDate > yesterday ? yesterday : boostedDate;

  habit.lastCheckIn = formatDay(nextDate);
  state.freeze.available -= 1;
  saveState();
  render();
  showToast(`❄️ Freeze applied to ${habit.name}!`, "good");
}

function getHabitMeta(habit, today) {
  if (!habit.lastCheckIn) {
    return {
      canCheckIn: true,
      canFreeze: false,
      statusText: "Tap check-in to spark this streak ✨",
      statusTone: "positive",
      checkInHint: "Log today's effort",
      freezeHint: "Freeze unlocks after your first check-in",
      lastCheckLabel: "No check-ins yet",
    };
  }

  const lastDate = parseDay(habit.lastCheckIn);
  const gap = dayDiff(lastDate, today);
  const lastCheckLabel = formatLastCheck(lastDate, today);

  if (gap === 0) {
    return {
      canCheckIn: false,
      canFreeze: false,
      statusText: "Already glowing today 💡",
      statusTone: "positive",
      checkInHint: "Come back tomorrow",
      freezeHint: "No freeze needed",
      lastCheckLabel,
    };
  }

  if (gap === 1) {
    return {
      canCheckIn: true,
      canFreeze: false,
      statusText: "You're on pace — keep blooming!",
      statusTone: "positive",
      checkInHint: "Keep the streak going",
      freezeHint: "All good here",
      lastCheckLabel,
    };
  }

  const missed = gap - 1;
  const canFreeze = state.freeze.available > 0;
  const statusText = canFreeze
    ? `Missed ${missed} day${missed > 1 ? "s" : ""}. Use ❄️ freeze to keep the streak.`
    : `Out of freezes. Next check-in restarts this streak.`;

  return {
    canCheckIn: !canFreeze,
    canFreeze,
    statusText,
    statusTone: canFreeze ? "warning" : "danger",
    checkInHint: canFreeze ? "Apply a freeze first" : "Logging now restarts the streak",
    freezeHint: canFreeze ? "Spend a freeze to shield the gap" : "Wait for next week's freezes",
    lastCheckLabel,
  };
}

function formatLastCheck(lastDate, today) {
  const gap = dayDiff(lastDate, today);
  if (gap === 0) return "Last check-in: Today";
  if (gap === 1) return "Last check-in: Yesterday";
  return `Last check-in: ${lastDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

function dayDiff(a, b) {
  const diff = startOfDay(b) - startOfDay(a);
  return Math.round(diff / MS_PER_DAY);
}

function getToday() {
  return startOfDay(new Date());
}

function addDays(date, days) {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + days);
  return startOfDay(clone);
}

function startOfDay(date) {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function parseDay(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDay(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / MS_PER_DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function generateId() {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function pickEmoji() {
  const index = Math.floor(Math.random() * DEFAULT_EMOJIS.length);
  return DEFAULT_EMOJIS[index];
}

function toggleSettings(open) {
  refs.settingsPanel.classList.toggle("hidden", !open);
}

function showToast(message, tone = "good") {
  if (!refs.toast) return;
  refs.toast.textContent = message;
  refs.toast.className = `toast show ${tone === "good" ? "good" : tone === "bad" ? "bad" : "warn"}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    refs.toast.classList.remove("show");
  }, 2500);
}

function refreshWeeklyFreezes() {
  const currentWeek = getWeekKey(new Date());
  if (state.freeze.weekKey !== currentWeek) {
    state.freeze.weekKey = currentWeek;
    state.freeze.available = 3;
    saveState();
  }
}
