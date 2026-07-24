// Wrap everything in an IIFE so our `const supabase` doesn't clash
// with the global `supabase` namespace set by the CDN script.
(function () {
"use strict";
// ═══════════════════════════════════════════════════════════════════
//  SUPABASE CLIENT  (credentials come from supabase-config.js)
// ═══════════════════════════════════════════════════════════════════
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════════════════════════════════════════════════════
//  CONSTANTS & DEFAULTS
// ═══════════════════════════════════════════════════════════════════
const clients = ["All clients", "AMM Law", "BRC Consultancy", "Briq Consultancy", "Multiplier", "Ultimate", "ADH"];
let today = new Date();
let timeOffset = 0;
const storageKey = "gregu-client-tasks";
const profileStorageKey = "blackrose-profiles";
const sessionStorageKey = "blackrose-active-profile";
const defaultProfiles = [
  { id: "diane-marie", name: "Diane Meria", details: "Black Rose team member", image: "./assets/diane marie.jpeg", phone: "" },
  { id: "greg", name: "Gregory Nyataige", details: "Black Rose team member", image: "./assets/greg.jpeg", phone: "" },
  { id: "mercy", name: "Mercy Waweru", details: "Black Rose team member", image: "./assets/mercy.jpeg", phone: "" },
  { id: "wangui-muchiri", name: "Wangui Muchiri", details: "Black Rose team member", image: "./assets/wangui muchiri.jpeg", phone: "" },
  { id: "shadrack", name: "Shadrack Kojack", details: "Black Rose team member", image: "./assets/Shadrack.jpeg", phone: "" },
  { id: "carol-nduta", name: "Profile 6", details: "Vacant Profile", image: "", phone: "" },
];

let selectedClient = "All clients";
let profiles = [...defaultProfiles];
let activeProfileId = "";
let assignmentFilter = "all";
let activeView = "tasks";

const passwordStorageKey = "blackrose-client-passwords";
const defaultPasswords = [
  { id: "pass-1", category: "kra", client: "AMM Law", username: "P051234567X", password: "Password123" },
  { id: "pass-2", category: "gmail", client: "BRC Consultancy", username: "info@blackrose.co.ke", password: "SecretPassword" }
];

let passwords = loadPasswords();
let activePasswordCategory = "kra";

// ═══════════════════════════════════════════════════════════════════
//  AUTH STATE  (tracks current Supabase session)
// ═══════════════════════════════════════════════════════════════════
let _currentUser = null;  // Supabase auth user
let _currentUserProfile = null; // matching row from public.profiles
let _pinMode = "enter";   // "enter" | "set"
let _pendingPinProfileId = null;

// ═══════════════════════════════════════════════════════════════════
//  AUTH SCREEN BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════
async function initAuth() {
  console.log('[BlackRose Auth] initAuth() starting...');
  syncTimeOffset(); // Sync time asynchronously so it doesn't block auth loading
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    console.log('[BlackRose Auth] Existing session found for:', session.user.email);
    _currentUser = session.user;
    await onSignedIn();
  } else {
    console.log('[BlackRose Auth] No existing session, showing auth screen.');
    showAuthScreen();
  }

  // Listen for future auth state changes.
  // Skip INITIAL_SESSION because we already handle it with getSession() above.
  // Without this guard, onSignedIn() would be called TWICE on page load,
  // creating a race condition that silently breaks the login flow.
  supabase.auth.onAuthStateChange(async (_event, session) => {
    console.log('[BlackRose Auth] onAuthStateChange:', _event, '| user:', session?.user?.email ?? 'none');
    if (_event === 'INITIAL_SESSION') {
      console.log('[BlackRose Auth] Skipping INITIAL_SESSION (handled by getSession above).');
      return;
    }
    if (session?.user) {
      _currentUser = session.user;
      await onSignedIn();
    } else {
      _currentUser = null;
      _currentUserProfile = null;
      showAuthScreen();
    }
  });
}

function showAuthScreen() {
  // Preserve any error message that was set before this is called (e.g. from onSignedIn)
  const existingError = document.getElementById("authError");
  const errorWasVisible = existingError && !existingError.hidden;
  const errorText = existingError ? existingError.textContent : "";

  document.getElementById("authScreen").hidden = false;
  document.getElementById("loginScreen").hidden = true;
  document.querySelector(".app-shell").classList.add("locked");

  // Restore error if it was showing (signOut triggers this, which would lose the message)
  if (errorWasVisible && errorText) {
    existingError.hidden = false;
    existingError.textContent = errorText;
  }
}

async function onSignedIn() {
  console.log('[BlackRose Auth] onSignedIn() called for:', _currentUser?.email);

  // Check if this user is approved in our profiles table
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("email", _currentUser.email)
    .single();

  console.log('[BlackRose Auth] Profile lookup result:', { profile, error });

  const submitBtn = document.getElementById("authSubmit");

  if (error || !profile) {
    // Surface the REAL error from Supabase so we can diagnose it
    let errMsg;
    if (error) {
      console.error('[BlackRose Auth] Supabase error on profiles lookup:', error);
      errMsg = `Login failed — DB error: "${error.message}" (code: ${error.code}). Check browser console (F12) for details.`;
    } else {
      console.error('[BlackRose Auth] No profile row found for:', _currentUser.email);
      errMsg = `Your email (${_currentUser.email}) is not in the profiles table. Ask an admin to add it in Supabase Dashboard.`;
    }
    showAuthError(errMsg);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = _authMode === "signin" ? "Sign In" : "Request Access";
    }
    // Sign out silently — the onAuthStateChange will call showAuthScreen()
    // but we preserve the error message by setting it BEFORE signOut()
    await supabase.auth.signOut();
    return;
  }

  if (!profile.approved) {
    // Show "Awaiting approval" message and sign the user back out
    console.warn('[BlackRose Auth] User exists but is not approved:', _currentUser.email);
    document.getElementById("authError").hidden = true;
    document.getElementById("authPending").hidden = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = _authMode === "signin" ? "Sign In" : "Request Access";
    }
    document.getElementById("authScreen").hidden = false;
    document.getElementById("loginScreen").hidden = true;
    await supabase.auth.signOut();
    return;
  }

  // Approved — load profiles from DB and show the profile picker
  console.log('[BlackRose Auth] User approved, loading app for:', _currentUser.email);
  _currentUserProfile = profile;
  document.getElementById("authScreen").hidden = true;
  await loadProfilesFromDB();
  await loadPasswordsFromDB();
  await loadTasksFromDB();
  await loadMeetingsFromDB();
  await loadUnwindMessagesFromDB();
  await loadVibesFromDB();
  showProfilePicker();
}

async function loadProfilesFromDB() {
  const { data, error } = await supabase.from("profiles").select("*");
  if (!error && data && data.length) {
    profiles = data.map(p => ({
      id: p.id,
      name: p.name,
      details: p.details || "Black Rose team member",
      image: p.image_url || "",
      email: p.email,
      approved: p.approved,
      pin_hash: p.pin_hash || null,
      phone: p.phone || "",
    }));
  }
}

const INACTIVITY_LIMIT_MS = 15 * 60 * 1000; // 15 minutes

function updateActivity() {
  if (activeProfileId) {
    localStorage.setItem(sessionStorageKey + "-time", Date.now().toString());
  }
}

// Listen for activity to reset the timer
["mousemove", "mousedown", "keydown", "touchstart", "scroll"].forEach(evt => {
  document.addEventListener(evt, updateActivity, { passive: true });
});

// Check every 30 seconds if we've been inactive for too long
setInterval(() => {
  if (activeProfileId) {
    const lastActive = parseInt(localStorage.getItem(sessionStorageKey + "-time") || "0", 10);
    if (Date.now() - lastActive > INACTIVITY_LIMIT_MS) {
      console.log("[BlackRose] Auto-locking due to inactivity.");
      showLogin();
    }
  }
}, 30000);

function showProfilePicker() {
  const savedProfileId = localStorage.getItem(sessionStorageKey);
  const lastActive = parseInt(localStorage.getItem(sessionStorageKey + "-time") || "0", 10);
  
  // If we have a saved profile and it hasn't been 15 minutes since last activity
  if (savedProfileId && Date.now() - lastActive <= INACTIVITY_LIMIT_MS) {
    console.log("[BlackRose] Restoring session for profile:", savedProfileId);
    activateProfile(savedProfileId);
    return;
  }

  // Otherwise, clear any stale session and show the picker
  localStorage.removeItem(sessionStorageKey);
  localStorage.removeItem(sessionStorageKey + "-time");
  document.getElementById("loginScreen").hidden = false;
  document.querySelector(".app-shell").classList.add("locked");
  renderLogin();
}

// ── Sign In / Sign Up form handling ─────────────────────────────
let _authMode = "signin"; // "signin" | "signup"

function setupAuthForm() {
  const form = document.getElementById("authForm");
  const tabSignIn = document.getElementById("tabSignIn");
  const tabSignUp = document.getElementById("tabSignUp");
  const confirmField = document.getElementById("authConfirmField");
  const submitBtn = document.getElementById("authSubmit");
  const togglePwd = document.getElementById("toggleAuthPassword");
  const pwdInput = document.getElementById("authPassword");

  tabSignIn.addEventListener("click", () => {
    _authMode = "signin";
    tabSignIn.classList.add("active");
    tabSignUp.classList.remove("active");
    confirmField.hidden = true;
    submitBtn.textContent = "Sign In";
    clearAuthMessages();
  });

  tabSignUp.addEventListener("click", () => {
    _authMode = "signup";
    tabSignUp.classList.add("active");
    tabSignIn.classList.remove("active");
    confirmField.hidden = false;
    submitBtn.textContent = "Request Access";
    clearAuthMessages();
  });

  togglePwd.addEventListener("click", () => {
    pwdInput.type = pwdInput.type === "password" ? "text" : "password";
    togglePwd.textContent = pwdInput.type === "password" ? "👁" : "🙈";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthMessages();
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    submitBtn.disabled = true;
    submitBtn.textContent = _authMode === "signin" ? "Signing in…" : "Requesting access…";

    if (_authMode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        showAuthError(error.message === "Invalid login credentials"
          ? "Incorrect email or password. Please try again."
          : error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = "Sign In";
      }
      // If success, onAuthStateChange fires → onSignedIn()
    } else {
      const confirm = document.getElementById("authConfirm").value;
      if (password !== confirm) {
        showAuthError("Passwords do not match.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Request Access";
        return;
      }

      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        showAuthError(error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = "Request Access";
      } else {
        // Sign up successful
        if (!data.session) {
          // Email confirmation required by Supabase settings
          showAuthError("Account created! Please check your email for a confirmation link.");
          submitBtn.disabled = false;
          submitBtn.textContent = "Request Access";
        } else {
          // Auto-logged in. onAuthStateChange will trigger onSignedIn().
        }
      }
    }
  });

  // Sign out button on profile picker screen
  document.getElementById("authSignOutBtn").addEventListener("click", async () => {
    activeProfileId = "";
    await supabase.auth.signOut();
  });
}

function showAuthError(msg) {
  const el = document.getElementById("authError");
  el.textContent = msg;
  el.hidden = false;
}

function clearAuthMessages() {
  document.getElementById("authError").hidden = true;
  document.getElementById("authPending").hidden = false ? false : true;
  document.getElementById("authPending").hidden = true;
  const submitBtn = document.getElementById("authSubmit");
  submitBtn.disabled = false;
  submitBtn.textContent = _authMode === "signin" ? "Sign In" : "Request Access";
}

// ═══════════════════════════════════════════════════════════════════
//  PIN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function setupPinDialog() {
  const dialog = document.getElementById("pinDialog");
  const submitBtn = document.getElementById("pinSubmitBtn");
  const cancelBtn = document.getElementById("pinCancelBtn");
  const inputs = Array.from(document.querySelectorAll(".pin-input"));

  // Auto-advance inputs and handle backspace
  inputs.forEach((input, idx) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && idx > 0) {
        inputs[idx - 1].focus();
        inputs[idx - 1].classList.remove("filled");
      }
      // Only allow digits
      if (!/^\d$/.test(e.key) && !["Backspace", "Tab", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
      }
    });
    input.addEventListener("input", () => {
      input.classList.toggle("filled", !!input.value);
      if (input.value && idx < 3) inputs[idx + 1].focus();
      // Auto-submit when all 4 are filled
      if (inputs.every(i => i.value)) submitBtn.click();
    });
  });

  submitBtn.addEventListener("click", async () => {
    const pin = inputs.map(i => i.value).join("");
    if (pin.length < 4) return;

    const profile = profiles.find(p => p.id === _pendingPinProfileId);
    if (!profile) return;

    const hash = await sha256(pin);

    if (_pinMode === "set") {
      // Save new PIN hash to Supabase
      const { error } = await supabase
        .from("profiles")
        .update({ pin_hash: hash })
        .eq("id", profile.id);

      if (!error) {
        profile.pin_hash = hash;
        dialog.close();
        activateProfile(_pendingPinProfileId);
      } else {
        showPinError("Failed to save PIN. Please try again.");
      }
    } else {
      // Verify PIN
      if (hash === profile.pin_hash) {
        dialog.close();
        activateProfile(_pendingPinProfileId);
      } else {
        shakePin(inputs);
        showPinError("Incorrect PIN. Please try again.");
        inputs.forEach(i => { i.value = ""; i.classList.remove("filled"); });
        inputs[0].focus();
      }
    }
  });

  cancelBtn.addEventListener("click", () => {
    dialog.close();
    clearPinInputs();
  });
}

function openPinDialog(profile) {
  _pendingPinProfileId = profile.id;
  const dialog = document.getElementById("pinDialog");
  const avatarWrap = document.getElementById("pinAvatarWrap");
  const title = document.getElementById("pinTitle");
  const subtitle = document.getElementById("pinSubtitle");
  const setInfo = document.getElementById("pinSetInfo");
  const errorEl = document.getElementById("pinError");

  // Render avatar
  avatarWrap.innerHTML = profile.image
    ? `<img src="${profile.image}" alt="${escapeHtml(profile.name)}" />`
    : `<span class="pin-avatar-placeholder">${escapeHtml(profile.name[0])}</span>`;

  if (!profile.pin_hash) {
    // First time — set PIN mode
    _pinMode = "set";
    title.textContent = `Set a PIN for ${profile.name}`;
    subtitle.textContent = "Choose a 4-digit PIN to secure your profile.";
    setInfo.hidden = false;
    document.getElementById("pinSubmitBtn").textContent = "Set PIN";
  } else {
    _pinMode = "enter";
    title.textContent = `Welcome back, ${profile.name.split(" ")[0]}`;
    subtitle.textContent = "Enter your 4-digit PIN to unlock your profile.";
    setInfo.hidden = true;
    document.getElementById("pinSubmitBtn").textContent = "Unlock";
  }

  errorEl.hidden = true;
  clearPinInputs();
  dialog.showModal();
  setTimeout(() => document.getElementById("pin0").focus(), 100);
}

function clearPinInputs() {
  document.querySelectorAll(".pin-input").forEach(i => {
    i.value = "";
    i.classList.remove("filled");
  });
}

function showPinError(msg) {
  const el = document.getElementById("pinError");
  el.textContent = msg;
  el.hidden = false;
}

function shakePin(inputs) {
  inputs.forEach(i => {
    i.classList.remove("shake");
    void i.offsetWidth; // reflow to restart animation
    i.classList.add("shake");
  });
}



/**
 * iOS Safari Fix: showModal() on a <dialog> can place it at the document top
 * rather than the current viewport when the page is scrolled.
 * This helper calls showModal() then immediately scrolls the dialog into view
 * as a belt-and-suspenders safety net for older iOS versions.
 */
function openModal(dialog) {
  dialog.showModal();
  // On iOS the browser may not honour position:fixed immediately; scrollIntoView
  // ensures the dialog is visible in the current viewport.
  requestAnimationFrame(() => {
    dialog.scrollIntoView({ block: "center", behavior: "instant" });
  });
}


async function loadPasswordsFromDB() {
  const { data, error } = await supabase.from("passwords").select("*");
  if (!error && data) {
    passwords = data.map(p => ({
      id: p.id,
      category: p.category,
      client: p.client,
      username: p.username,
      password: p.password
    }));
  }
}

function loadPasswords() {
  try {
    const saved = JSON.parse(localStorage.getItem(passwordStorageKey) || "[]");
    return saved.length ? saved : defaultPasswords;
  } catch {
    return defaultPasswords;
  }
}

function persistPasswords() {
  localStorage.setItem(passwordStorageKey, JSON.stringify(passwords));
}

const meetingStorageKey = "blackrose-meetings";
const defaultMeetings = [
  {
    id: "meeting-1",
    title: "Weekly Operations Sync",
    description: "Review client tasks, bookkeeping logs, and tax filings for the upcoming week.",
    date: "2026-07-13",
    time: "10:00",
    link: "https://meet.google.com/abc-defg-hij",
    organizer: "diane-marie",
    participants: ["diane-marie", "greg", "mercy", "wangui-muchiri", "shadrack"]
  },
  {
    id: "meeting-2",
    title: "VAT Return Review",
    description: "Review VAT reconciliation reports before submission.",
    date: "2026-07-14",
    time: "14:30",
    link: "https://meet.google.com/xyz-pdq-rst",
    organizer: "mercy",
    participants: ["mercy", "shadrack"]
  }
];

async function loadMeetingsFromDB() {
  const { data, error } = await supabase.from("meetings").select("*");
  if (!error && data) {
    meetings = data.map(m => ({
      id: m.id,
      title: m.title,
      description: m.description || "",
      date: m.date,
      time: m.time.substring(0,5),
      link: m.link || "",
      organizer: m.organizer_id,
      participants: m.participants || []
    }));
  }
}

function loadMeetings() {
  try {
    const saved = JSON.parse(localStorage.getItem(meetingStorageKey) || "[]");
    return saved.length ? saved : defaultMeetings;
  } catch {
    return defaultMeetings;
  }
}

function persistMeetings() {
  localStorage.setItem(meetingStorageKey, JSON.stringify(meetings));
}

let meetings = loadMeetings();

let tasks = [];

const savedTasks = loadTasks();
if (savedTasks.length) tasks = savedTasks;
// Migration: split old combined "Ultimate & ADH" client into "Ultimate"
// (Users can manually reassign existing tasks to ADH if needed)
tasks = tasks.map(t => t.client === "Ultimate & ADH" ? { ...t, client: "Ultimate" } : t);

tasks = tasks.map(normalizeTask);


const clientTabs = document.querySelector("#clientTabs");
const taskBoard = document.querySelector("#taskBoard");
const viewTitle = document.querySelector("#viewTitle");
const openTaskCount = document.querySelector("#openTaskCount");
const taskDialog = document.querySelector("#taskDialog");
const taskForm = document.querySelector("#taskForm");
const dialogTitle = document.querySelector("#dialogTitle");
const appShell = document.querySelector(".app-shell");
const loginScreen = document.querySelector("#loginScreen");
const profileGrid = document.querySelector("#profileGrid");
const profileDialog = document.querySelector("#profileDialog");
const profileForm = document.querySelector("#profileForm");
const currentProfileLabel = document.querySelector("#currentProfileLabel");
const assignmentFilters = document.querySelector("#assignmentFilters");

const viewToggle = document.querySelector("#viewToggle");
const newMeetingButton = document.querySelector("#newMeetingButton");
const newTaskButton = document.querySelector("#newTaskButton");
const tasksHeading = document.querySelector("#tasksHeading");
const meetingsView = document.querySelector("#meetingsView");
const meetingsGrid = document.querySelector("#meetingsGrid");
const openMeetingCount = document.querySelector("#openMeetingCount");
const meetingDialog = document.querySelector("#meetingDialog");
const meetingForm = document.querySelector("#meetingForm");
const meetingDialogTitle = document.querySelector("#meetingDialogTitle");
const meetingsScheduleBtn = document.querySelector("#meetingsScheduleBtn");
const recurrenceDialog = document.querySelector("#recurrenceDialog");
const recurrenceForm = document.querySelector("#recurrenceForm");
const commentsDialog = document.querySelector("#commentsDialog");

async function syncTimeOffset() {
  try {
    const start = performance.now();
    const resp = await fetch(window.location.pathname, { method: "HEAD", cache: "no-store" });
    const dateHeader = resp.headers.get("Date");
    if (dateHeader) {
      const serverTime = new Date(dateHeader);
      const rtt = performance.now() - start;
      const adjustedServerTime = new Date(serverTime.getTime() + rtt / 2);
      timeOffset = adjustedServerTime.getTime() - Date.now();
      console.log(`[TimeSync] Server time: ${adjustedServerTime.toISOString()}, local offset: ${timeOffset}ms`);
      today = getCurrentTime();
      if (typeof render === "function") {
        updateClock();
        render();
      }
    }
  } catch (e) {
    console.warn("[TimeSync] Failed to sync time with server, falling back to local PC clock.", e);
  }
}

function updateClock() {
  today = getCurrentTime();
  const options = { weekday: "long", day: "numeric", month: "long", year: "numeric" };
  const dateStr = today.toLocaleDateString("en-GB", options);
  const timeStr = today.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const label = document.querySelector("#todayLabel");
  if (label) {
    label.textContent = `${dateStr} · ${timeStr}`;
  }
}
updateClock();
setInterval(updateClock, 1000);

document.querySelector("#newTaskButton").addEventListener("click", () => openTaskDialog());
document.querySelector("#newMeetingButton").addEventListener("click", () => openMeetingDialog());
document.querySelector("#meetingsScheduleBtn").addEventListener("click", () => openMeetingDialog());
document.querySelector("#switchProfileButton").addEventListener("click", showLogin);

// Toggle see more / see less for long task details
taskBoard.addEventListener("click", (event) => {
  const toggleBtn = event.target.closest(".toggle-details-btn");
  if (!toggleBtn) return;
  const container = toggleBtn.closest(".task-details-text");
  if (!container) return;
  
  const shortText = container.querySelector(".short-text");
  const fullText = container.querySelector(".full-text");
  if (shortText && fullText) {
    const isShowingFull = !fullText.hidden;
    if (isShowingFull) {
      shortText.hidden = false;
      fullText.hidden = true;
    } else {
      shortText.hidden = true;
      fullText.hidden = false;
    }
  }
});

document.querySelector("#notifyButton").addEventListener("click", async () => {
  if ("Notification" in window) await Notification.requestPermission();
});
taskForm.addEventListener("submit", saveTask);
profileForm.addEventListener("submit", saveProfile);
meetingForm.addEventListener("submit", saveMeeting);
recurrenceForm.addEventListener("submit", saveRecurrence);

document.querySelector("#cancelRecurrenceButton").addEventListener("click", () => recurrenceDialog.close());
document.querySelector("#closeRecurrenceButton").addEventListener("click", () => recurrenceDialog.close());
document.querySelector("#skipRecurrenceButton").addEventListener("click", skipRecurrence);

document.querySelector("#closeCommentsBtn").addEventListener("click", () => commentsDialog.close());
document.querySelector("#submitCommentBtn").addEventListener("click", postComment);
document.querySelector("#addChecklistBtn").addEventListener("click", addChecklistItem);
document.querySelector("#exportButton").addEventListener("click", openExportPanel);
document.querySelector("#copyExportBtn").addEventListener("click", copyExport);
document.querySelector("#printExportBtn").addEventListener("click", () => window.print());
document.querySelector("#closeExportBtn").addEventListener("click", closeExportPanel);

viewToggle.querySelectorAll(".toggle-btn").forEach((button) => {
  button.addEventListener("click", () => {
    activeView = button.dataset.view;
    render();
  });
});

assignmentFilters.querySelectorAll(".filter-btn").forEach((button) => {
  button.addEventListener("click", () => {
    assignmentFilter = button.dataset.filter;
    render();
  });
});

document.querySelector("#dismissNotificationButton").addEventListener("click", () => {
  if (!activeProfileId) return;
  const seenIds = getSeenTaskIds(activeProfileId);
  const unseenTasks = tasks.filter(
    (task) =>
      task.status === "open" &&
      task.assignedTo === activeProfileId &&
      task.assignedBy !== activeProfileId &&
      !seenIds.includes(task.id)
  );
  const nextSeen = [...seenIds, ...unseenTasks.map((t) => t.id)];
  saveSeenTaskIds(activeProfileId, nextSeen);
  updateNotifications();
});

function visibleTasks() {
  let filtered = selectedClient === "All clients" ? tasks : tasks.filter((task) => task.client === selectedClient);
  if (assignmentFilter === "to-me") {
    filtered = filtered.filter((task) => task.assignedTo === activeProfileId);
  } else if (assignmentFilter === "by-me") {
    filtered = filtered.filter((task) => task.assignedBy === activeProfileId);
  } else if (assignmentFilter === "to-others") {
    filtered = filtered.filter((task) => task.assignedTo !== activeProfileId);
  }
  return filtered;
}

function openTasksFor(client) {
  const scoped = client === "All clients" ? tasks : tasks.filter((task) => task.client === client);
  return scoped.filter((task) => task.status === "open").length;
}

function getProfile(profileId) {
  return profiles.find((profile) => profile.id === profileId) || profiles[0];
}

function profileOptions(selectedId) {
  return profiles
    .map((profile) => `<option value="${profile.id}" ${profile.id === selectedId ? "selected" : ""}>${escapeHtml(profile.name)}</option>`)
    .join("");
}

function classifyTask(task) {
  const due = new Date(task.due);
  if (task.status === "completed") return "completed";
  if (due < startOfDay(today)) return "overdue";
  if (sameDay(due, today)) return "today";
  return "upcoming";
}

function render() {
  renderLogin();
  renderSession();
  
  viewToggle.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === activeView);
  });

  const isTask = activeView === "tasks";
  const isMeeting = activeView === "meetings";
  const isDash = activeView === "dashboard";
  const isWorkload = activeView === "workload";
  const isUnwind = activeView === "unwind";
  const isPasswords = isTask && selectedClient === "Passwords";

  clientTabs.style.display = isTask ? "" : "none";
  tasksHeading.style.display = isTask && !isPasswords ? "" : "none";
  taskBoard.style.display = isTask && !isPasswords ? "" : "none";
  newTaskButton.style.display = isTask && !isPasswords ? "" : "none";
  
  const passwordsHeading = document.querySelector("#passwordsHeading");
  const passwordsView = document.querySelector("#passwordsView");
  if (passwordsHeading) passwordsHeading.hidden = !isPasswords;
  if (passwordsView) passwordsView.hidden = !isPasswords;

  document.querySelector("#meetingsView").hidden = !isMeeting;
  document.querySelector("#newMeetingButton").hidden = !isMeeting;
  document.querySelector("#dashboardView").hidden = !isDash;
  document.querySelector("#workloadView").hidden = !isWorkload;
  document.querySelector("#unwindView").hidden = !isUnwind;

  if (isTask) {
    renderFilters();
    renderTabs();
    if (isPasswords) {
      renderPasswords();
    } else {
      renderBoard();
      injectStatutoryDeadlines();
    }
  }
  if (isMeeting) renderMeetings();
  if (isDash) renderDashboard();
  if (isWorkload) renderWorkload();
  if (isUnwind) renderUnwind();
  
  updateNotifications();
}

function renderFilters() {
  assignmentFilters.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === assignmentFilter);
  });
}

function renderSession() {
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId);
  currentProfileLabel.textContent = activeProfile ? `Signed in as ${activeProfile.name}` : "";
}

function renderLogin() {
  // NOTE: App shell and login screen visibility is managed by the auth layer (initAuth/onSignedIn).
  // This function only re-renders the profile grid contents.
  profileGrid.innerHTML = profiles.map(renderProfileCard).join("");
  profileGrid.querySelectorAll(".profile-card").forEach((card) => {
    card.addEventListener("click", () => selectProfile(card.dataset.profileId));
  });
  profileGrid.querySelectorAll(".profile-edit").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openProfileDialog(profiles.find((profile) => profile.id === button.dataset.profileId));
    });
  });
}

function renderProfileCard(profile) {
  const photo = profile.image
    ? `<img class="profile-photo" src="${profile.image}" alt="${escapeHtml(profile.name)}" />`
    : `<span class="profile-placeholder" aria-hidden="true">+</span>`;

  return `<button class="profile-card" data-profile-id="${profile.id}" type="button">
    ${photo}
    <span class="profile-meta">
      <h2>${escapeHtml(profile.name)}</h2>
      <p>${escapeHtml(profile.details || "Add profile details")}</p>
    </span>
    <span class="icon-button profile-edit" data-profile-id="${profile.id}" title="Edit profile">Edit</span>
  </button>`;
}

function selectProfile(profileId) {
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) return;
  openPinDialog(profile);
}

function activateProfile(profileId) {
  activeProfileId = profileId;
  localStorage.setItem(sessionStorageKey, profileId);
  localStorage.setItem(sessionStorageKey + "-time", Date.now().toString());
  
  assignmentFilter = "all";
  activeView = "tasks";
  document.getElementById("loginScreen").hidden = true;
  document.querySelector(".app-shell").classList.remove("locked");
  render();
}

function showLogin() {
  activeProfileId = "";
  localStorage.removeItem(sessionStorageKey);
  localStorage.removeItem(sessionStorageKey + "-time");
  
  assignmentFilter = "all";
  activeView = "tasks";
  // Return to profile picker (stay signed in to Supabase)
  document.getElementById("loginScreen").hidden = false;
  document.querySelector(".app-shell").classList.add("locked");
  renderLogin();
}

function openProfileDialog(profile) {
  document.querySelector("#profileId").value = profile.id;
  document.querySelector("#profileName").value = profile.name;
  document.querySelector("#profileDetails").value = profile.details;
  document.querySelector("#profilePhone").value = profile.phone || "";
  document.querySelector("#profileImage").value = "";
  openModal(profileDialog);
}

async function saveProfile(event) {
  event.preventDefault();
  const id = document.querySelector("#profileId").value;
  const imageInput = document.querySelector("#profileImage");
  const saveBtn = document.querySelector("#saveProfileButton");

  const nextProfile = {
    ...profiles.find((profile) => profile.id === id),
    name: document.querySelector("#profileName").value,
    details: document.querySelector("#profileDetails").value,
    phone: document.querySelector("#profilePhone").value,
  };

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  // ── Upload image to Supabase Storage if a new file was chosen ──
  if (imageInput.files.length) {
    const file = imageInput.files[0];
    const ext = file.name.split(".").pop();
    const path = `${id}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("profile-images")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      console.error("[BlackRose] Image upload failed:", uploadError);
      alert(`Image upload failed: ${uploadError.message}`);
      saveBtn.disabled = false;
      saveBtn.textContent = "Save profile";
      return;
    }

    // Get the public URL for the uploaded file
    const { data: urlData } = supabase.storage
      .from("profile-images")
      .getPublicUrl(path);

    nextProfile.image = urlData.publicUrl;
    nextProfile.image_url = urlData.publicUrl;
  }

  // ── Save name, details, and image_url to Supabase profiles table ──
  const updatePayload = {
    name: nextProfile.name,
    details: nextProfile.details,
    phone: nextProfile.phone,
  };
  if (nextProfile.image_url) updatePayload.image_url = nextProfile.image_url;

  const { error: dbError } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", id);

  if (dbError) {
    console.error("[BlackRose] Profile DB update failed:", dbError);
    alert(`Profile save failed: ${dbError.message}`);
    saveBtn.disabled = false;
    saveBtn.textContent = "Save profile";
    return;
  }

  // ── Update local state ──
  profiles = profiles.map((profile) => (profile.id === id ? nextProfile : profile));
  persistProfiles();
  saveBtn.disabled = false;
  saveBtn.textContent = "Save profile";
  profileDialog.close();
  render();
}

function renderTabs() {
  const tabList = [...clients, "Passwords"];
  clientTabs.innerHTML = tabList
    .map((client) => {
      const active = client === selectedClient ? " active" : "";
      const count = client === "Passwords" ? 0 : openTasksFor(client);
      return `<button class="tab${active}" data-client="${client}">
        ${count ? '<span class="dot"></span>' : ""}
        <span>${client}</span>
        ${client !== "Passwords" ? `<span class="count">${count}</span>` : ""}
      </button>`;
    })
    .join("");

  clientTabs.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      selectedClient = tab.dataset.client;
      render();
    });
  });
}

function renderBoard() {
  viewTitle.textContent = selectedClient;
  const scoped = visibleTasks();
  const openCount = scoped.filter((task) => task.status === "open").length;
  openTaskCount.textContent = `${openCount} open ${openCount === 1 ? "task" : "tasks"}`;

  const groups = [
    ["overdue", "Overdue", "Nothing overdue - good work."],
    ["today", "Due today", "Nothing due today."],
    ["upcoming", "Upcoming", "Nothing scheduled yet."],
    ["completed", "Recently completed", "Nothing completed yet."],
  ];

  taskBoard.innerHTML = groups.map(([key, title, empty]) => renderSection(key, title, empty, scoped)).join("");
  taskBoard.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", handleAction));
}

function renderSection(key, title, empty, scoped) {
  const priorityOrder = { urgent: 0, normal: 1, low: 2 };
  const rows = scoped
    .filter((task) => classifyTask(task) === key)
    .sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 1;
      const pb = priorityOrder[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return new Date(a.due) - new Date(b.due);
    });
  const clientColumn = selectedClient === "All clients";

  return `<article class="task-section">
    <header class="section-header ${key}">
      <h3>${title}</h3>
      <span class="section-count">${rows.length} ${rows.length === 1 ? "task" : "tasks"}</span>
    </header>
    ${
      rows.length
        ? `<table class="task-table">
            <thead>
              <tr>
                ${clientColumn ? "<th>Client</th>" : ""}
                <th>Task</th>
                <th>Assigned</th>
                <th>Due</th>
                <th>Details</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows.map((task) => renderTaskRow(task, clientColumn)).join("")}</tbody>
          </table>`
        : `<div class="empty-state">${empty}</div>`
    }
  </article>`;
}

function formatTaskDetails(detailsText) {
  if (!detailsText) return "";
  const words = detailsText.trim().split(/\s+/);
  if (words.length <= 10) {
    return escapeHtml(detailsText);
  }
  const shortText = words.slice(0, 10).join(" ");
  return `
    <div class="task-details-text">
      <span class="short-text">${escapeHtml(shortText)}... <button class="text-link-btn toggle-details-btn" type="button">See more</button></span>
      <span class="full-text" hidden>${escapeHtml(detailsText)} <button class="text-link-btn toggle-details-btn" type="button">See less</button></span>
    </div>
  `;
}

function renderTaskRow(task, clientColumn) {
  const completed = task.status === "completed";
  const assignedTo = getProfile(task.assignedTo);
  const assignedBy = getProfile(task.assignedBy);
  const isMine = activeProfileId && task.assignedTo === activeProfileId;
  const priorityBadge = task.priority === "urgent" ? `<span class="badge priority-urgent">🔴 Urgent</span>` : task.priority === "low" ? `<span class="badge priority-low">🟢 Low</span>` : "";
  const kraBadge = task.source === "kra" ? `<span class="badge kra-badge">KRA</span>` : "";
  const checklistProgress = (task.checklist && task.checklist.length > 0) ? (() => { const done = task.checklist.filter(i => i.done).length; return `<span class="badge checklist-badge">${done}/${task.checklist.length} docs</span>`; })() : "";
  const commentCount = (task.comments && task.comments.length > 0) ? `<span class="badge comment-badge">💬 ${task.comments.length}</span>` : "";
  const countdown = !completed ? getCountdownLabel(task.due) : "";
  return `<tr>
    ${clientColumn ? `<td class="client-cell" data-label="Client">${task.client}</td>` : ""}
    <td class="task-cell" data-label="Task">
      ${escapeHtml(task.title)}
      <div class="badge-row">${priorityBadge}${kraBadge}${task.repeat ? `<span class="badge">${task.repeat}</span>` : ""}${checklistProgress}${commentCount}</div>
    </td>
    <td class="assigned-cell" data-label="Assigned">
      <span class="assignee-name">${escapeHtml(assignedTo.name)}</span>
      ${isMine ? `<span class="badge mine-badge">Me</span>` : ""}
      <span class="assigned-by">by ${escapeHtml(assignedBy.name)}</span>
    </td>
    <td class="due-cell" data-label="Due">${formatDue(task.due)}${countdown ? `<br/><span class="countdown-badge ${countdown.cls}">${countdown.label}</span>` : ""}</td>
    <td class="details-cell" data-label="Details">${formatTaskDetails(task.details)}</td>
    <td class="actions-cell" data-label="Actions">
      <div class="row-actions">
        <button class="icon-button" title="${completed ? "Restore" : "Complete"}" data-action="${completed ? "restore" : "complete"}" data-id="${task.id}">${completed ? "↻" : "✓"}</button>
        <button class="icon-button" title="Notes" data-action="comments" data-id="${task.id}">💬</button>
        <button class="icon-button" title="Edit" data-action="edit" data-id="${task.id}">✎</button>
        <button class="icon-button" title="Delete" data-action="delete" data-id="${task.id}">x</button>
      </div>
    </td>
  </tr>`;
}

async function handleAction(event) {
  const { action, id } = event.currentTarget.dataset;
  if (action === "edit") return openTaskDialog(tasks.find((task) => task.id === id));
  if (action === "comments") return openCommentsDialog(tasks.find((task) => task.id === id));
  if (action === "delete") {
    tasks = tasks.filter((task) => task.id !== id);
    persistTasks();
    render();
    await supabase.from("tasks").delete().eq("id", id);
    return;
  }
  if (action === "complete") {
    const task = tasks.find((t) => t.id === id);
    if (task && task.repeat && (task.repeat === "monthly" || task.repeat === "weekly")) {
      return openRecurrenceDialog(task);
    }
    updateTask(id, { status: "completed" });
  }
  if (action === "restore") updateTask(id, { status: "open" });
}

async function updateTask(id, patch) {
  tasks = tasks.map((task) => (task.id === id ? { ...task, ...patch } : task));
  persistTasks();
  render();

  const dbPatch = {};
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.checklist !== undefined) dbPatch.checklist = patch.checklist;
  
  if (Object.keys(dbPatch).length > 0) {
    await supabase.from("tasks").update(dbPatch).eq("id", id);
  }
}

function openTaskDialog(task) {
  const creatorId = task?.assignedBy || activeProfileId || profiles[0].id;
  const assigneeId = task?.assignedTo || activeProfileId || profiles[0].id;
  dialogTitle.textContent = task ? "Edit task" : "New task";
  document.querySelector("#taskId").value = task?.id ?? "";
  document.querySelector("#taskClient").innerHTML = clients
    .filter((client) => client !== "All clients")
    .map((client) => `<option>${client}</option>`)
    .join("");
  document.querySelector("#taskClient").value = task?.client ?? (selectedClient === "All clients" ? "BRC Consultancy" : selectedClient);
  document.querySelector("#taskTitle").value = task?.title ?? "";
  document.querySelector("#taskDetails").value = task?.details ?? "";
  document.querySelector("#taskAssignedBy").innerHTML = profileOptions(creatorId);
  document.querySelector("#taskAssignedTo").innerHTML = profileOptions(assigneeId);
  document.querySelector("#taskDate").value = task?.due.slice(0, 10) ?? "2026-07-10";
  document.querySelector("#taskTime").value = task?.due.slice(11) ?? "09:00";
  document.querySelector("#taskPriority").value = task?.priority ?? "normal";
  document.querySelector("#taskRepeat").value = task?.repeat ?? "";
  document.querySelector("#taskStatus").value = task?.status ?? "open";
  renderChecklistEditor(task?.checklist ?? []);
  openModal(taskDialog);
}

async function saveTask(event) {
  event.preventDefault();
  const id = document.querySelector("#taskId").value || createId();
  const existingTask = tasks.find((t) => t.id === id);
  const nextTask = {
    id,
    client: document.querySelector("#taskClient").value,
    title: document.querySelector("#taskTitle").value,
    details: document.querySelector("#taskDetails").value,
    assignedBy: document.querySelector("#taskAssignedBy").value,
    assignedTo: document.querySelector("#taskAssignedTo").value,
    due: `${document.querySelector("#taskDate").value}T${document.querySelector("#taskTime").value}`,
    priority: document.querySelector("#taskPriority").value,
    repeat: document.querySelector("#taskRepeat").value,
    status: document.querySelector("#taskStatus").value,
    checklist: readChecklistEditor(),
    comments: existingTask?.comments ?? [],
    source: existingTask?.source ?? "",
  };

  tasks = tasks.some((task) => task.id === id) ? tasks.map((task) => (task.id === id ? nextTask : task)) : [...tasks, nextTask];
  persistTasks();
  taskDialog.close();
  render();

  const dbTask = {
    id: nextTask.id,
    client: nextTask.client,
    title: nextTask.title,
    details: nextTask.details,
    assigned_by: nextTask.assignedBy,
    assigned_to: nextTask.assignedTo,
    due_date: document.querySelector("#taskDate").value,
    due_time: document.querySelector("#taskTime").value,
    priority: nextTask.priority,
    repeat: nextTask.repeat,
    status: nextTask.status,
    checklist: nextTask.checklist
  };

  if (existingTask) {
    await supabase.from("tasks").update(dbTask).eq("id", id);
  } else {
    await supabase.from("tasks").insert([dbTask]);
  }

  // Trigger WhatsApp notification prompt only for NEW tasks assigned to someone else
  const isNewTask = !existingTask;
  const isAssignedToOther = nextTask.assignedTo !== activeProfileId;
  if (isNewTask && isAssignedToOther && nextTask.status === "open") {
    const assignee = getProfile(nextTask.assignedTo);
    if (assignee && assignee.phone) {
      setTimeout(() => {
        const shouldNotify = confirm(`\ud83d\udce8 Send a WhatsApp task alert to ${assignee.name}?`);
        if (shouldNotify) {
          const priorityIcon = nextTask.priority === "urgent" ? "\ud83d\udd34 URGENT\n" : "";
          const message =
            `\ud83d\udd14 *Task Alert — Black Rose Tracker*\n` +
            `${priorityIcon}\n` +
            `*You have been assigned a task:*\n` +
            `*Task:* ${nextTask.title}\n` +
            `*Client:* ${nextTask.client}\n` +
            `*Due:* ${formatDue(nextTask.due)}\n` +
            (nextTask.details ? `*Details:* ${nextTask.details}\n` : "") +
            `\n\ud83d\udd17 Open the app to view & complete it: ${window.location.origin}/`;

          let phoneNum = assignee.phone.trim().replace(/[\s\-()]/g, "");
          if (!phoneNum.startsWith("+") && phoneNum.length === 9)  phoneNum = `+254${phoneNum}`;
          else if (!phoneNum.startsWith("+") && phoneNum.startsWith("0")) phoneNum = `+254${phoneNum.substring(1)}`;

          window.open(`https://wa.me/${phoneNum}?text=${encodeURIComponent(message)}`, "_blank");
        }
      }, 200);
    }
  }
}



function formatDue(value) {
  const date = new Date(value);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short" });
  const day = date.getDate();
  const month = date.toLocaleDateString("en-GB", { month: "short" });
  const time = date.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: false });
  return `${weekday} ${day} ${month} · ${time}`;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getCurrentTime() {
  return new Date(Date.now() + timeOffset);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadProfiles() {
  try {
    const saved = JSON.parse(localStorage.getItem(profileStorageKey) || "[]");
    return saved.length === 6 ? saved : defaultProfiles;
  } catch {
    return defaultProfiles;
  }
}

function persistProfiles() {
  localStorage.setItem(profileStorageKey, JSON.stringify(profiles));
}

async function loadTasksFromDB() {
  const { data, error } = await supabase.from("tasks").select("*, comments:task_comments(*)");
  if (!error && data) {
    tasks = data.map(t => ({
      id: t.id,
      client: t.client,
      title: t.title,
      details: t.details || "",
      assignedBy: t.assigned_by,
      assignedTo: t.assigned_to,
      due: `${t.due_date}T${t.due_time.substring(0,5)}`,
      priority: t.priority,
      repeat: t.repeat || "",
      status: t.status,
      checklist: t.checklist || [],
      comments: (t.comments || []).map(c => ({
        id: c.id,
        authorId: c.author_id,
        text: c.text,
        timestamp: c.created_at
      })).sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp)),
      source: ""
    }));
  }
}

function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "[]");
  } catch {
    return [];
  }
}

function persistTasks() {
  localStorage.setItem(storageKey, JSON.stringify(tasks));
}

function normalizeTask(task) {
  const fallbackProfileId = profiles[0]?.id || "diane-marie";
  return {
    ...task,
    assignedBy: task.assignedBy || fallbackProfileId,
    assignedTo: task.assignedTo || fallbackProfileId,
    priority: task.priority || "normal",
    checklist: task.checklist || [],
    comments: task.comments || [],
    source: task.source || "",
  };
}

function getSeenTaskIds(profileId) {
  try {
    return JSON.parse(localStorage.getItem(`blackrose-seen-tasks-${profileId}`) || "[]");
  } catch {
    return [];
  }
}

function saveSeenTaskIds(profileId, ids) {
  localStorage.setItem(`blackrose-seen-tasks-${profileId}`, JSON.stringify(ids));
}

function updateNotifications() {
  if (!activeProfileId) {
    document.querySelector("#notificationBanner").hidden = true;
    return;
  }

  const seenIds = getSeenTaskIds(activeProfileId);
  const unseenTasks = tasks.filter(
    (task) =>
      task.status === "open" &&
      task.assignedTo === activeProfileId &&
      task.assignedBy !== activeProfileId &&
      !seenIds.includes(task.id)
  );

  const banner = document.querySelector("#notificationBanner");
  const textEl = document.querySelector("#notificationText");

  if (unseenTasks.length === 0) {
    banner.hidden = true;
    return;
  }

  if (unseenTasks.length === 1) {
    const task = unseenTasks[0];
    const assigner = getProfile(task.assignedBy);
    textEl.textContent = `${assigner.name} assigned you a new task: "${task.title}"`;
  } else {
    const assigners = [...new Set(unseenTasks.map((t) => getProfile(t.assignedBy).name))];
    let assignerText = assigners.slice(0, -1).join(", ");
    if (assigners.length > 1) {
      assignerText += ` and ${assigners[assigners.length - 1]}`;
    } else {
      assignerText = assigners[0];
    }
    textEl.textContent = `You have ${unseenTasks.length} new tasks assigned to you by ${assignerText}`;
  }

  banner.hidden = false;
}

function renderMeetings() {
  openMeetingCount.textContent = `${meetings.length} upcoming ${meetings.length === 1 ? "meeting" : "meetings"}`;
  const sorted = [...meetings].sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));

  if (sorted.length === 0) {
    meetingsGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">No meetings scheduled yet.</div>`;
    return;
  }

  meetingsGrid.innerHTML = sorted.map(renderMeetingCard).join("");
  meetingsGrid.querySelectorAll("[data-meeting-action]").forEach((button) => {
    button.addEventListener("click", handleMeetingAction);
  });
}

function renderMeetingCard(meeting) {
  const organizer = getProfile(meeting.organizer);
  return `<article class="meeting-card">
    <div class="meeting-card-header">
      <div class="meeting-card-organizer">
        ${organizer.image ? `<img src="${organizer.image}" alt="${escapeHtml(organizer.name)}" />` : `<span class="profile-placeholder" style="width:2rem;height:2rem;font-size:0.8rem;">+</span>`}
        <span class="org-name">by ${escapeHtml(organizer.name)}</span>
      </div>
      <h3>${escapeHtml(meeting.title)}</h3>
    </div>
    
    <div class="meeting-card-time">
      <span class="time-icon">📅</span>
      <span>${formatMeetingTime(meeting.date, meeting.time)}</span>
    </div>

    <p class="meeting-card-desc">${escapeHtml(meeting.description || "No description provided.")}</p>

    <div class="meeting-card-participants">
      <h4>Invitees</h4>
      <div class="participant-badge-list">
        ${meeting.participants.map(pId => `<span class="participant-badge">${escapeHtml(getProfile(pId).name)}</span>`).join("")}
      </div>
    </div>

    <div class="meeting-card-actions">
      ${meeting.link ? `<a href="${escapeHtml(meeting.link)}" target="_blank" class="primary-button compact-button meeting-join-btn" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none;">Join Meeting ↗</a>` : `<button class="outline-button compact-button" disabled style="opacity: 0.5; cursor: not-allowed; min-height: 2.2rem; padding: 0 1rem; font-size: 0.9rem;">No Link Available</button>`}
      <div class="row-actions">
        <button class="icon-button" title="Edit" data-meeting-action="edit" data-id="${meeting.id}">✎</button>
        <button class="icon-button" title="Delete" data-meeting-action="delete" data-id="${meeting.id}">x</button>
      </div>
    </div>
  </article>`;
}

function formatMeetingTime(dateStr, timeStr) {
  const date = new Date(`${dateStr}T${timeStr}`);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short" });
  const day = date.getDate();
  const month = date.toLocaleDateString("en-GB", { month: "short" });
  const time = date.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: false });
  return `${weekday} ${day} ${month} · ${time}`;
}

async function handleMeetingAction(event) {
  const { meetingAction, id } = event.currentTarget.dataset;
  if (meetingAction === "edit") {
    return openMeetingDialog(meetings.find((m) => m.id === id));
  }
  if (meetingAction === "delete") {
    meetings = meetings.filter((m) => m.id !== id);
    persistMeetings();
    render();
    await supabase.from("meetings").delete().eq("id", id);
  }
}

function openMeetingDialog(meeting) {
  const organizerId = meeting?.organizer || activeProfileId || profiles[0].id;
  meetingDialogTitle.textContent = meeting ? "Edit meeting" : "Schedule meeting";
  
  document.querySelector("#meetingId").value = meeting?.id ?? "";
  document.querySelector("#meetingTitle").value = meeting?.title ?? "";
  document.querySelector("#meetingLink").value = meeting?.link ?? "";
  document.querySelector("#meetingDescription").value = meeting?.description ?? "";
  document.querySelector("#meetingOrganizer").innerHTML = profileOptions(organizerId);
  document.querySelector("#meetingDate").value = meeting?.date ?? "2026-07-10";
  document.querySelector("#meetingTime").value = meeting?.time ?? "10:00";
  
  const participantsContainer = document.querySelector("#meetingParticipants");
  const selectedParticipants = meeting?.participants ?? profiles.map(p => p.id);
  
  participantsContainer.innerHTML = profiles.map(profile => {
    const checked = selectedParticipants.includes(profile.id) ? "checked" : "";
    return `<label>
      <input type="checkbox" name="meeting_participant" value="${profile.id}" ${checked}>
      ${escapeHtml(profile.name)}
    </label>`;
  }).join("");

  openModal(meetingDialog);
}

async function saveMeeting(event) {
  event.preventDefault();
  const id = document.querySelector("#meetingId").value || createId();
  
  const checkedCheckboxes = document.querySelectorAll('input[name="meeting_participant"]:checked');
  const participants = Array.from(checkedCheckboxes).map(cb => cb.value);
  
  if (participants.length === 0) {
    alert("Please select at least one participant.");
    return;
  }

  const existingMeeting = meetings.find((m) => m.id === id);

  const nextMeeting = {
    id,
    title: document.querySelector("#meetingTitle").value,
    link: document.querySelector("#meetingLink").value,
    description: document.querySelector("#meetingDescription").value,
    organizer: document.querySelector("#meetingOrganizer").value,
    date: document.querySelector("#meetingDate").value,
    time: document.querySelector("#meetingTime").value,
    participants
  };

  meetings = meetings.some((m) => m.id === id) 
    ? meetings.map((m) => (m.id === id ? nextMeeting : m)) 
    : [...meetings, nextMeeting];
    
  persistMeetings();
  meetingDialog.close();
  render();

  const dbMeeting = {
    id: nextMeeting.id,
    title: nextMeeting.title,
    description: nextMeeting.description,
    date: nextMeeting.date,
    time: nextMeeting.time,
    link: nextMeeting.link,
    organizer_id: nextMeeting.organizer,
    participants: nextMeeting.participants
  };

  if (existingMeeting) {
    await supabase.from("meetings").update(dbMeeting).eq("id", id);
  } else {
    await supabase.from("meetings").insert([dbMeeting]);
  }
}

function getNextOccurrenceDate(dateStr, repeat) {
  const date = new Date(dateStr);
  if (repeat === "monthly") {
    date.setMonth(date.getMonth() + 1);
  } else if (repeat === "weekly") {
    date.setDate(date.getDate() + 7);
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function openRecurrenceDialog(task) {
  document.querySelector("#recurrenceTaskId").value = task.id;
  document.querySelector("#recurrenceText").textContent = `Filing return / completing the task: "${task.title}". This is a recurring task (${task.repeat}). Set the next occurrence date and time below.`;
  
  const nextDate = getNextOccurrenceDate(task.due.slice(0, 10), task.repeat);
  document.querySelector("#recurrenceDate").value = nextDate;
  document.querySelector("#recurrenceTime").value = task.due.slice(11) || "09:00";
  openModal(recurrenceDialog);
}

function saveRecurrence(event) {
  event.preventDefault();
  const id = document.querySelector("#recurrenceTaskId").value;
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  updateTask(id, { status: "completed" });

  const nextDate = document.querySelector("#recurrenceDate").value;
  const nextTime = document.querySelector("#recurrenceTime").value;
  const nextTask = {
    id: createId(),
    client: task.client,
    title: task.title,
    details: task.details,
    assignedBy: task.assignedBy,
    assignedTo: task.assignedTo,
    due: `${nextDate}T${nextTime}`,
    repeat: task.repeat,
    status: "open",
  };

  tasks = [...tasks, nextTask];
  persistTasks();
  recurrenceDialog.close();
  render();
}

function skipRecurrence() {
  const id = document.querySelector("#recurrenceTaskId").value;
  updateTask(id, { status: "completed" });
  persistTasks();
  recurrenceDialog.close();
  render();
}

function getCountdownLabel(dueStr) {
  const due = new Date(dueStr);
  const now = getCurrentTime();
  const dueStart = startOfDay(due);
  const nowStart = startOfDay(now);
  const diffMs = dueStart - nowStart;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: `Overdue ${Math.abs(diffDays)}d`, cls: "countdown-overdue" };
  if (diffDays === 0) return { label: "Due today", cls: "countdown-today" };
  if (diffDays === 1) return { label: "Tomorrow", cls: "countdown-soon" };
  if (diffDays <= 3) return { label: `${diffDays} days left`, cls: "countdown-soon" };
  return { label: `${diffDays} days left`, cls: "countdown-ok" };
}

// ── Feature 2: Checklist Editor ───────────────────────────────────────────────
let _pendingChecklist = [];

function renderChecklistEditor(items) {
  _pendingChecklist = items.map(i => ({ ...i }));
  redrawChecklistEditor();
}

function redrawChecklistEditor() {
  const container = document.querySelector("#checklistItems");
  if (!container) return;
  container.innerHTML = _pendingChecklist.map((item, idx) => `
    <div class="checklist-editor-item">
      <div class="checklist-editor-item">
      <input type="checkbox" ${item.done ? "checked" : ""} data-check-idx="${idx}" />
      <span>${escapeHtml(item.label)}</span>
      <button type="button" class="icon-button" data-remove-idx="${idx}" style="margin-left:auto;font-size:0.75rem;">x</button>
    </div>
  `).join("");
  container.querySelectorAll("[data-check-idx]").forEach(cb => {
    cb.addEventListener("change", () => { _pendingChecklist[+cb.dataset.checkIdx].done = cb.checked; });
  });
  container.querySelectorAll("[data-remove-idx]").forEach(btn => {
    btn.addEventListener("click", () => { _pendingChecklist.splice(+btn.dataset.removeIdx, 1); redrawChecklistEditor(); });
  });
}

function addChecklistItem() {
  const input = document.querySelector("#checklistInput");
  const label = input.value.trim();
  if (!label) return;
  _pendingChecklist.push({ label, done: false });
  input.value = "";
  redrawChecklistEditor();
}

function readChecklistEditor() {
  return _pendingChecklist.map(i => ({ ...i }));
}

// ── Feature 1: Task Comments ──────────────────────────────────────────────────
let _activeCommentTaskId = null;

function openCommentsDialog(task) {
  if (!task) return;
  _activeCommentTaskId = task.id;
  document.querySelector("#commentsTaskTitle").textContent = task.title;
  renderComments(task.comments || []);
  document.querySelector("#commentInput").value = "";
  openModal(commentsDialog);
}

function renderComments(comments) {
  const list = document.querySelector("#commentsList");
  if (!comments.length) {
    list.innerHTML = `<p style="color:var(--muted);font-size:0.85rem;">No notes yet. Add the first one below.</p>`;
    return;
  }
  list.innerHTML = comments.map(c => {
    const author = getProfile(c.authorId);
    return `<div class="comment-item">
      <div class="comment-header">
        <strong>${escapeHtml(author.name)}</strong>
        <time>${c.timestamp}</time>
      </div>
      <p>${escapeHtml(c.text)}</p>
    </div>`;
  }).join("");
  list.scrollTop = list.scrollHeight;
}

async function postComment() {
  const text = document.querySelector("#commentInput").value.trim();
  if (!text || !_activeCommentTaskId) return;
  const task = tasks.find(t => t.id === _activeCommentTaskId);
  if (!task) return;
  const comment = {
    id: createId(),
    authorId: activeProfileId || profiles[0].id,
    text,
    timestamp: getCurrentTime().toISOString(),
  };
  const updated = [...(task.comments || []), comment];
  task.comments = updated;
  persistTasks();
  document.querySelector("#commentInput").value = "";
  renderComments(updated);

  await supabase.from("task_comments").insert([{
    id: comment.id,
    task_id: _activeCommentTaskId,
    author_id: comment.authorId,
    text: comment.text
  }]);
}

// ── Feature 4: Client Dashboard ───────────────────────────────────────────────
function renderDashboard() {
  const clientList = clients.filter(c => c !== "All clients");
  const allOpen = tasks.filter(t => t.status === "open");
  const allOverdue = allOpen.filter(t => classifyTask(t) === "overdue");
  const allToday = allOpen.filter(t => classifyTask(t) === "today");

  document.querySelector("#dashboardSubtitle").textContent =
    `${allOpen.length} open · ${allOverdue.length} overdue · ${allToday.length} due today`;

  const grid = document.querySelector("#dashboardGrid");
  grid.innerHTML = clientList.map(client => {
    const clientTasks = tasks.filter(t => t.client === client);
    const open = clientTasks.filter(t => t.status === "open");
    const overdue = open.filter(t => classifyTask(t) === "overdue");
    const dueToday = open.filter(t => classifyTask(t) === "today");
    const upcoming = open.filter(t => classifyTask(t) === "upcoming");
    const completed = clientTasks.filter(t => t.status === "completed");
    const nextTask = [...open].sort((a, b) => new Date(a.due) - new Date(b.due))[0];
    const urgentCount = open.filter(t => t.priority === "urgent").length;
    const statusCls = overdue.length ? "dash-overdue" : dueToday.length ? "dash-today" : "dash-ok";
    return `<div class="dashboard-card ${statusCls}">
      <div class="dash-client-name">${client}</div>
      <div class="dash-stats">
        <div class="dash-stat"><span class="dash-num ${overdue.length ? "stat-red" : ""}">${overdue.length}</span><span>Overdue</span></div>
        <div class="dash-stat"><span class="dash-num ${dueToday.length ? "stat-amber" : ""}">${dueToday.length}</span><span>Today</span></div>
        <div class="dash-stat"><span class="dash-num">${upcoming.length}</span><span>Upcoming</span></div>
        <div class="dash-stat"><span class="dash-num stat-green">${completed.length}</span><span>Done</span></div>
      </div>
      ${urgentCount ? `<div class="dash-urgent-flag">\ud83d\udd34 ${urgentCount} urgent</div>` : ""}
      ${nextTask ? `<div class="dash-next">Next: <strong>${escapeHtml(nextTask.title.slice(0, 50))}${nextTask.title.length > 50 ? "…" : ""}</strong> — ${formatDue(nextTask.due)}</div>` : `<div class="dash-next" style="color:var(--success);">\u2705 All clear</div>`}
    </div>`;
  }).join("");
}

// ── Feature 7: Workload View ──────────────────────────────────────────────────
function renderWorkload() {
  const openTasks = tasks.filter(t => t.status === "open");
  const maxCount = Math.max(1, ...profiles.map(p => openTasks.filter(t => t.assignedTo === p.id).length));
  document.querySelector("#workloadSubtitle").textContent =
    `${openTasks.length} open tasks across ${profiles.length} team members`;

  const grid = document.querySelector("#workloadGrid");
  grid.innerHTML = profiles.map(profile => {
    const mine = openTasks.filter(t => t.assignedTo === profile.id);
    const overdue = mine.filter(t => classifyTask(t) === "overdue").length;
    const pct = Math.round((mine.length / maxCount) * 100);
    const barCls = overdue > 0 ? "bar-danger" : mine.length > 4 ? "bar-warning" : "bar-ok";
    const photo = profile.image
      ? `<img src="${profile.image}" alt="${escapeHtml(profile.name)}" class="workload-avatar" />`
      : `<span class="profile-placeholder workload-avatar-placeholder">${escapeHtml(profile.name[0])}</span>`;
    return `<div class="workload-card">
      <div class="workload-header">
        ${photo}
        <div>
          <strong>${escapeHtml(profile.name)}</strong>
          <p style="margin:0;font-size:0.8rem;color:var(--muted);">${escapeHtml(profile.details || "")}</p>
        </div>
        <div class="workload-count-badge">${mine.length}</div>
      </div>
      <div class="workload-bar-track"><div class="workload-bar ${barCls}" style="width:${pct}%"></div></div>
      <div class="workload-task-list">
        ${mine.slice(0, 5).map(t => `<div class="workload-task-item ${classifyTask(t) === "overdue" ? "wl-overdue" : ""}">
          <span class="wl-client">${t.client}</span> ${escapeHtml(t.title.slice(0, 45))}${t.title.length > 45 ? "…" : ""}
          <span class="wl-due">${formatDue(t.due)}</span>
        </div>`).join("")}
        ${mine.length > 5 ? `<div style="font-size:0.8rem;color:var(--muted);padding:0.25rem 0;">+${mine.length - 5} more tasks</div>` : ""}
      </div>
    </div>`;
  }).join("");
}

// ── Feature 5: KRA/iTax Statutory Calendar ────────────────────────────────────
const kraCalendar = [
  { title: "VAT Return Filing", day: 20, client: "BRC Consultancy", details: "File monthly VAT return on iTax before the 20th. Prepare and review before submission.", assignTo: "shadrack" },
  { title: "PAYE Filing", day: 9, client: "BRC Consultancy", details: "File monthly PAYE returns on iTax and remit by the 9th of the month.", assignTo: "shadrack" },
  { title: "Withholding Tax Filing", day: 20, client: "BRC Consultancy", details: "File withholding tax certificates and remit by the 20th.", assignTo: "mercy" },
  { title: "Corporate Income Tax Instalment", day: 20, client: "BRC Consultancy", details: "Quarterly instalment tax (4th month, 6th month, 9th month, 12th month).", assignTo: "mercy" },
];

function injectStatutoryDeadlines() {
  const now = getCurrentTime();
  const yr = now.getFullYear();
  const mo = now.getMonth();
  let changed = false;

  kraCalendar.forEach(item => {
    const dueDate = new Date(yr, mo, item.day, 9, 0);
    const dueDateStr = dueDate.toISOString().slice(0, 16);
    
    // Only auto-generate if we are 4 days or less from the deadline
    const daysUntilDue = (dueDate - now) / (1000 * 60 * 60 * 24);
    if (daysUntilDue > 4) return;

    const existsThisMonth = tasks.some(
      t => t.source === "kra" && t.title === item.title && t.due.slice(0, 7) === dueDateStr.slice(0, 7)
    );
    if (existsThisMonth) return;
    const profile = profiles.find(p => p.id === item.assignTo) || profiles[0];
    tasks.push(normalizeTask({
      id: createId(),
      client: item.client,
      title: item.title,
      details: item.details,
      assignedBy: profiles.find(p => p.id === "diane-marie")?.id || profiles[0].id,
      assignedTo: profile.id,
      due: dueDateStr,
      repeat: "monthly",
      status: dueDate < now ? "completed" : "open",
      source: "kra",
      priority: "urgent",
      checklist: [],
      comments: [],
    }));
    changed = true;
  });

  if (changed) persistTasks();
}

// ── Feature 8: Export / WhatsApp Summary ─────────────────────────────────────
function openExportPanel() {
  const panel = document.querySelector("#exportPanel");
  const text = generateSummaryText();
  document.querySelector("#exportText").textContent = text;
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth" });
}

function closeExportPanel() {
  document.querySelector("#exportPanel").hidden = true;
}

function generateSummaryText() {
  const now = getCurrentTime().toLocaleDateString("en-KE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const clientList = clients.filter(c => c !== "All clients");
  let out = `BLACK ROSE CONSULTANCY — TASK SUMMARY\n${now}\n${"═".repeat(45)}\n\n`;

  clientList.forEach(client => {
    const open = tasks.filter(t => t.client === client && t.status === "open");
    if (!open.length) return;
    out += `📁 ${client.toUpperCase()}\n${"─".repeat(35)}\n`;
    const groups = [
      ["overdue", "🔴 OVERDUE"],
      ["today", "🟡 DUE TODAY"],
      ["upcoming", "🟢 UPCOMING"],
    ];
    groups.forEach(([key, label]) => {
      const rows = open.filter(t => classifyTask(t) === key).sort((a, b) => new Date(a.due) - new Date(b.due));
      if (!rows.length) return;
      out += `\n${label}\n`;
      rows.forEach(t => {
        const assignee = getProfile(t.assignedTo).name;
        out += `  • ${t.title}\n    → Assigned to: ${assignee} | Due: ${formatDue(t.due)}\n`;
      });
    });
    out += "\n";
  });

  out += `${"═".repeat(45)}\nGenerated by Black Rose Task Tracker`;
  return out;
}

function copyExport() {
  const text = document.querySelector("#exportText").textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector("#copyExportBtn");
    btn.textContent = "✓ Copied!";
    setTimeout(() => { btn.textContent = "Copy to clipboard"; }, 2000);
  });
}

// ══════════════════════════════════════════════════════════════
// UNWIND — Chill Zone
// ══════════════════════════════════════════════════════════════

const UNWIND_STORAGE_KEY   = "blackrose-unwind-chat";
const VIBE_STORAGE_KEY     = "blackrose-vibe-votes";

const UNWIND_STICKERS = [
  "😂","🤣","😭","😤","💀","🔥","🥲","😎","🤩","🥹",
  "😴","🤡","👀","💅","🤌","🫡","🫠","😬","🥴","🤯",
  "🙃","😏","🤭","🫢","😮‍💨","💪","🎉","🎊","✨","🌚",
  "😩","🤦","🙈","🐐","👑","🏆","💸","🫶","❤️‍🔥","⚡"
];

const UNWIND_QUOTES = [
  "\"Work hard in silence. Let your task list make the noise.\" — Nobody at BRC",
  "\"The spreadsheet is always greener on the other side.\" — Unknown accountant",
  "\"If it ain't in QuickBooks, did it even happen?\" — Shadrack, probably",
  "\"Behind every great accountant is a very confused client.\" — Ancient proverb",
  "\"We don't make mistakes, we make audit adjustments.\" — BRC Motto",
  "\"Deadlines are just suggestions made by people who don't file VAT.\" — Mercy",
  "\"Stay calm and reconcile.\" — The BRC way",
  "\"Rest is a human right, unless the VAT return is due.\" — KRA, basically",
];

const REACTION_EMOJIS = ["👍","❤️","😂","😮","😢","🔥","💀","🥲"];

// Seed messages to populate the chat on first load
const SEED_MESSAGES = [
  { id: "seed-1", authorId: "diane-marie", type: "text", content: "Guys this UNWIND tab was literally the best idea 😂 finally somewhere we can just vibe", timestamp: "10 Jul · 08:14", reactions: {} },
  { id: "seed-2", authorId: "greg", type: "text", content: "Finally!! I've been dying to send memes in this app 💀", timestamp: "10 Jul · 08:16", reactions: { "😂": ["mercy", "wangui-muchiri"] } },
  { id: "seed-3", authorId: "shadrack", type: "sticker", content: "🎉", timestamp: "10 Jul · 08:17", reactions: {} },
  { id: "seed-4", authorId: "mercy", type: "text", content: "okay but who's the goon this week 👀 don't be shy", timestamp: "10 Jul · 08:19", reactions: { "😂": ["diane-marie", "greg", "carol-nduta"], "🔥": ["shadrack"] } },
  { id: "seed-5", authorId: "wangui-muchiri", type: "text", content: "The rankings don't lie 😭😭 I'm just gonna go cry in VAT reconciliations", timestamp: "10 Jul · 08:21", reactions: { "💀": ["greg", "mercy"] } },
  { id: "seed-6", authorId: "carol-nduta", type: "text", content: "LMAOO wangui 💀 but fr tho this is so fun. okay back to work 😤", timestamp: "10 Jul · 08:23", reactions: { "❤️": ["diane-marie"] } },
];

let _unwindInitialized = false;

// ── Storage ─────────────────────────────────────────────────
let unwindMessages = [];
let vibeVotes = {};

async function loadUnwindMessagesFromDB() {
  const { data, error } = await supabase.from("chat_messages").select("*").order("created_at", { ascending: true });
  if (!error && data) {
    unwindMessages = data.map(m => ({
      id: m.id,
      authorId: m.author_id,
      type: m.type,
      content: m.content,
      timestamp: new Date(m.created_at).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }),
      reactions: m.reactions || {}
    }));
  }
}

function loadUnwindMessages() {
  return unwindMessages;
}

function persistUnwindMessages(msgs) {
  unwindMessages = msgs;
}

async function loadVibesFromDB() {
  const { data, error } = await supabase.from("vibe_votes").select("*");
  if (!error && data) {
    vibeVotes = {};
    data.forEach(v => { vibeVotes[v.profile_id] = v.vibe; });
  }
}

function loadVibeVotes() {
  return vibeVotes;
}

function persistVibeVotes(votes) {
  vibeVotes = votes;
}

// ── Rankings algorithm ───────────────────────────────────────
function computeRankings() {
  return profiles.map(profile => {
    const mine = tasks.filter(t => t.assignedTo === profile.id);
    const overdueCount  = mine.filter(t => t.status === "open" && classifyTask(t) === "overdue").length;
    const urgentOpen    = mine.filter(t => t.status === "open" && t.priority === "urgent").length;
    const openCount     = mine.filter(t => t.status === "open").length;
    const completedCount= mine.filter(t => t.status === "completed").length;
    const slackScore = (overdueCount * 3) + (urgentOpen * 2) + openCount - completedCount;
    return { profile, slackScore, overdueCount, urgentOpen, openCount, completedCount };
  }).sort((a, b) => b.slackScore - a.slackScore);
}

function getRankReason(entry, isGoon) {
  if (isGoon) {
    if (entry.overdueCount > 0) return `${entry.overdueCount} overdue · ${entry.openCount} open`;
    if (entry.urgentOpen > 0)   return `${entry.urgentOpen} urgent open tasks`;
    return `${entry.openCount} open tasks pending`;
  } else {
    if (entry.completedCount > 0) return `${entry.completedCount} done · ${entry.openCount} open`;
    return `${entry.openCount} open · ${entry.completedCount} done`;
  }
}

function renderRankCard(entry, position, isGoon, isTopShowoff) {
  const medals = isGoon
    ? ["😈", "😤", "🙈"]
    : ["🌟", "💪", "😌"];
  const medal = medals[Math.min(position, 2)];
  const photo = entry.profile.image
    ? `<img src="${entry.profile.image}" alt="${escapeHtml(entry.profile.name)}" class="rank-avatar" />`
    : `<span class="rank-avatar-placeholder">${escapeHtml(entry.profile.name[0])}</span>`;
  const score = isGoon ? `score: ${entry.slackScore}` : `score: ${-entry.slackScore}`;
  const topClass = isTopShowoff ? " top-showoff" : "";
  return `<div class="rank-card${topClass}">
    <span class="rank-medal">${medal}</span>
    ${photo}
    <div class="rank-info">
      <span class="rank-name">${escapeHtml(entry.profile.name)}</span>
      <span class="rank-reason">${getRankReason(entry, isGoon)}</span>
    </div>
    <span class="rank-score">${score}</span>
  </div>`;
}

// ── Vibe Poll ────────────────────────────────────────────────
function renderVibePoll() {
  const votes = loadVibeVotes();
  const myVote = activeProfileId ? votes[activeProfileId] : null;
  const counts = { thriving: 0, grinding: 0, dead: 0 };
  Object.values(votes).forEach(v => { if (counts[v] !== undefined) counts[v]++; });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  // Mark selected
  document.querySelectorAll(".vibe-btn").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.vibe === myVote);
  });

  const resultsEl = document.querySelector("#vibeResults");
  if (total === 0) { resultsEl.hidden = true; return; }
  resultsEl.hidden = false;

  const vibeLabels = { thriving: "🔥 Thriving", grinding: "😤 Grinding", dead: "💀 Help" };
  resultsEl.innerHTML = Object.entries(counts).map(([key, count]) => {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return `<div class="vibe-bar-row">
      <span class="vibe-bar-label">${vibeLabels[key]}</span>
      <div class="vibe-bar-track"><div class="vibe-bar-fill" style="width:${pct}%"></div></div>
      <span class="vibe-bar-count">${count}</span>
    </div>`;
  }).join("");
}

// ── Chat rendering ───────────────────────────────────────────
function renderChatBubble(msg) {
  const isMe = msg.authorId === activeProfileId;
  const author = getProfile(msg.authorId);
  const avatarHtml = author.image
    ? `<img src="${author.image}" alt="${escapeHtml(author.name)}" />`
    : `<span class="meta-avatar-placeholder">${escapeHtml(author.name[0])}</span>`;

  let bubbleContent = "";
  if (msg.type === "text") {
    bubbleContent = `<div class="chat-bubble">${escapeHtml(msg.content)}</div>`;
  } else if (msg.type === "sticker") {
    bubbleContent = `<div class="chat-bubble chat-bubble-sticker">${msg.content}</div>`;
  } else if (msg.type === "image" || msg.type === "gif") {
    bubbleContent = `<div class="chat-bubble" style="padding:0.25rem;">
      <img src="${msg.content}" alt="shared image" class="chat-bubble-img" loading="lazy" />
    </div>`;
  }

  // Reactions
  const reactionMap = msg.reactions || {};
  const reactionChips = Object.entries(reactionMap)
    .filter(([, users]) => users.length > 0)
    .map(([emoji, users]) => {
      const iMine = activeProfileId && users.includes(activeProfileId);
      return `<button class="reaction-chip ${iMine ? "mine" : ""}" data-msg-id="${msg.id}" data-emoji="${emoji}">
        ${emoji}<span class="reaction-count">${users.length}</span>
      </button>`;
    }).join("");

  const reactBtn = `<button class="add-reaction-btn" data-msg-id="${msg.id}" title="React">+😊</button>`;

  return `<div class="chat-msg ${isMe ? "mine" : "theirs"}" data-msg-id="${msg.id}">
    <div class="chat-msg-meta">
      ${avatarHtml}
      <span>${escapeHtml(author.name)}</span>
      <span>${msg.timestamp}</span>
    </div>
    ${bubbleContent}
    <div class="reaction-row">
      ${reactionChips}
      ${reactBtn}
    </div>
  </div>`;
}

function renderChatMessages() {
  const msgs = loadUnwindMessages();
  const container = document.querySelector("#chatMessages");
  if (!container) return;
  container.innerHTML = msgs.map(renderChatBubble).join("");

  // Reaction chip clicks (toggle)
  container.querySelectorAll(".reaction-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const { msgId, emoji } = chip.dataset;
      toggleReaction(msgId, emoji);
    });
  });

  // Add reaction button
  container.querySelectorAll(".add-reaction-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openReactionPicker(btn);
    });
  });

  container.scrollTop = container.scrollHeight;
}

async function toggleReaction(msgId, emoji) {
  if (!activeProfileId) return;
  const msg = unwindMessages.find(m => m.id === msgId);
  if (!msg) return;
  if (!msg.reactions) msg.reactions = {};
  if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
  const idx = msg.reactions[emoji].indexOf(activeProfileId);
  if (idx === -1) { msg.reactions[emoji].push(activeProfileId); }
  else            { msg.reactions[emoji].splice(idx, 1); }
  renderChatMessages();

  await supabase.from("chat_messages").update({ reactions: msg.reactions }).eq("id", msgId);
}

function openReactionPicker(anchorBtn) {
  // Remove any existing picker
  document.querySelectorAll(".reaction-picker").forEach(p => p.remove());

  const msgId = anchorBtn.dataset.msgId;
  const picker = document.createElement("div");
  picker.className = "reaction-picker";
  REACTION_EMOJIS.forEach(emoji => {
    const btn = document.createElement("button");
    btn.textContent = emoji;
    btn.addEventListener("click", () => {
      toggleReaction(msgId, emoji);
      picker.remove();
    });
    picker.appendChild(btn);
  });

  // Position relative to bubble
  const bubble = anchorBtn.closest(".chat-msg");
  bubble.style.position = "relative";
  bubble.appendChild(picker);

  // Close on outside click
  const close = (e) => {
    if (!picker.contains(e.target) && e.target !== anchorBtn) {
      picker.remove();
      document.removeEventListener("click", close);
    }
  };
  setTimeout(() => document.addEventListener("click", close), 0);
}

async function postUnwindMessage(type, content) {
  if (!content || !content.toString().trim()) return;
  const now = getCurrentTime();
  const ts = now.toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const msg = {
    id: createId(),
    authorId: activeProfileId || profiles[0].id,
    type,
    content: content.toString().trim(),
    timestamp: ts,
    reactions: {}
  };
  unwindMessages.push(msg);
  renderChatMessages();

  await supabase.from("chat_messages").insert([{
    id: msg.id,
    author_id: msg.authorId,
    type: msg.type,
    content: msg.content,
    reactions: msg.reactions
  }]);
}

// ── Sticker / GIF pickers ────────────────────────────────────
function initStickerPicker() {
  const grid = document.querySelector("#stickerGrid");
  if (!grid || grid.children.length) return;
  grid.innerHTML = UNWIND_STICKERS.map(s =>
    `<button class="sticker-btn" data-sticker="${s}">${s}</button>`
  ).join("");
  grid.querySelectorAll(".sticker-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      postUnwindMessage("sticker", btn.dataset.sticker);
      document.querySelector("#stickerPicker").hidden = true;
    });
  });
}

// Curated GIFs as fallback (Tenor public media)
const CURATED_GIFS = [
  "https://media.tenor.com/xzHk0dZ3tOQAAAAM/laugh-laughing.gif",
  "https://media.tenor.com/2Ge3uxSi5Z0AAAAC/kermit-the-frog-typing.gif",
  "https://media.tenor.com/qhFOHJpHvToAAAAM/confused-travolta.gif",
  "https://media.tenor.com/JLkNXqWkVGQAAAAM/this-is-fine-fire.gif",
  "https://media.tenor.com/4XHZnfO1DXMAAAAC/i-have-no-idea-what-im-doing.gif",
  "https://media.tenor.com/5DLuuAYHpmwAAAAM/done-work-done.gif",
  "https://media.tenor.com/PdKWN2hAhU0AAAAC/michael-scott-no.gif",
  "https://media.tenor.com/VcA3LZrMDgIAAAAM/friday-finally.gif",
  "https://media.tenor.com/eqKFX3L7_XAAAAAC/yes-excited.gif",
];

function renderCuratedGifs() {
  const grid = document.querySelector("#gifGrid");
  if (!grid) return;
  grid.innerHTML = CURATED_GIFS.map(url =>
    `<img src="${url}" class="gif-thumb" alt="GIF" data-gif-url="${url}" />`
  ).join("");
  grid.querySelectorAll(".gif-thumb").forEach(img => {
    img.addEventListener("click", () => {
      postUnwindMessage("gif", img.dataset.gifUrl);
      document.querySelector("#gifPicker").hidden = true;
    });
  });
}

// ── Image upload ─────────────────────────────────────────────
function handleUnwindImageUpload(file) {
  if (!file || !file.type.startsWith("image/")) return;
  if (file.size > 1024 * 1024) {
    showUnwindToast("❌ Image too large. Max size is 1 MB.");
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => postUnwindMessage("image", reader.result));
  reader.readAsDataURL(file);
}

function showUnwindToast(text) {
  const el = document.createElement("div");
  el.textContent = text;
  Object.assign(el.style, {
    position: "fixed", bottom: "2rem", left: "50%", transform: "translateX(-50%)",
    background: "rgba(20,17,12,0.88)", color: "#fff", padding: "0.6rem 1.2rem",
    borderRadius: "999px", fontSize: "0.88rem", zIndex: "9999",
    boxShadow: "0 4px 16px rgba(0,0,0,0.25)", fontFamily: "inherit",
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Main renderUnwind ─────────────────────────────────────────
function renderUnwind() {
  // Quote of the day (deterministic by day-of-year)
  const now = getCurrentTime();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  document.querySelector("#unwindQuote").innerHTML =
    `<em>${UNWIND_QUOTES[dayOfYear % UNWIND_QUOTES.length]}</em>`;

  // Rankings
  const ranked = computeRankings();
  const goons    = ranked.slice(0, 3);
  const showoffs = ranked.slice(3).reverse(); // best performer first

  document.querySelector("#goonsList").innerHTML =
    goons.map((e, i) => renderRankCard(e, i, true, false)).join("");

  document.querySelector("#showoffsList").innerHTML =
    showoffs.map((e, i) => renderRankCard(e, i, false, i === 0)).join("");

  // Vibe Poll
  renderVibePoll();

  // Chat
  renderChatMessages();
  initStickerPicker();
  renderCuratedGifs();

  // Wire up events only once
  if (_unwindInitialized) return;
  _unwindInitialized = true;

  // Send text on button click or Enter (Shift+Enter = newline)
  const textarea = document.querySelector("#chatTextarea");
  const sendBtn  = document.querySelector("#chatSendBtn");

  const sendText = () => {
    const text = textarea.value.trim();
    if (!text) return;
    postUnwindMessage("text", text);
    textarea.value = "";
    textarea.style.height = "auto";
  };
  sendBtn.addEventListener("click", sendText);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); }
  });
  // Auto-grow textarea
  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 128) + "px";
  });

  // Sticker toggle
  document.querySelector("#stickerToggleBtn").addEventListener("click", () => {
    const sp = document.querySelector("#stickerPicker");
    const gp = document.querySelector("#gifPicker");
    sp.hidden = !sp.hidden;
    gp.hidden = true;
  });

  // GIF toggle
  document.querySelector("#gifToggleBtn").addEventListener("click", () => {
    const gp = document.querySelector("#gifPicker");
    const sp = document.querySelector("#stickerPicker");
    gp.hidden = !gp.hidden;
    sp.hidden = true;
  });

  // GIF search (Tenor)
  document.querySelector("#gifSearchBtn").addEventListener("click", searchTenorGifs);
  document.querySelector("#gifSearchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchTenorGifs();
  });

  // Image upload
  document.querySelector("#chatImageInput").addEventListener("change", (e) => {
    if (e.target.files[0]) {
      handleUnwindImageUpload(e.target.files[0]);
      e.target.value = "";
    }
  });

  // Vibe buttons
  document.querySelectorAll(".vibe-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!activeProfileId) { showUnwindToast("Log in to cast your vibe!"); return; }
      vibeVotes[activeProfileId] = btn.dataset.vibe;
      renderVibePoll();
      
      supabase.from("vibe_votes").upsert({
        profile_id: activeProfileId,
        vibe: btn.dataset.vibe
      }).then(() => {});
    });
  });
}

// ── Tenor GIF search ─────────────────────────────────────────
function searchTenorGifs() {
  const query = document.querySelector("#gifSearchInput").value.trim();
  if (!query) { renderCuratedGifs(); return; }
  // Tenor API v2 (public, no key required for basic use on localhost/personal)
  const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=AIzaSyAyimkuYQYF_FXVALexPzpzuM5f7A7RnOA&limit=9&media_filter=gif`;
  fetch(url)
    .then(r => r.json())
    .then(data => {
      const grid = document.querySelector("#gifGrid");
      if (!grid) return;
      if (!data.results || !data.results.length) {
        grid.innerHTML = `<p style="font-size:0.8rem;color:var(--muted);grid-column:1/-1;padding:0.5rem;">No GIFs found. Try another search!</p>`;
        return;
      }
      grid.innerHTML = data.results.map(item => {
        const gifUrl = item.media_formats?.gif?.url || item.media_formats?.tinygif?.url || "";
        const previewUrl = item.media_formats?.tinygif?.url || gifUrl;
        return `<img src="${previewUrl}" class="gif-thumb" alt="${escapeHtml(item.title || 'GIF')}" data-gif-url="${gifUrl}" />`;
      }).join("");
      grid.querySelectorAll(".gif-thumb").forEach(img => {
        img.addEventListener("click", () => {
          postUnwindMessage("gif", img.dataset.gifUrl);
          document.querySelector("#gifPicker").hidden = true;
        });
      });
    })
    .catch(() => renderCuratedGifs()); // fallback to curated on network error
}

// ── Feature 9: Passwords Manager ──────────────────────────────────────────────
function initClientDatalist() {
  const datalist = document.querySelector("#clientDatalist");
  if (datalist) {
    const actualClients = clients.filter(c => c !== "All clients");
    datalist.innerHTML = actualClients.map(c => `<option value="${escapeHtml(c)}">`).join("");
  }
}

function initPasswordFilters() {
  const filterContainer = document.querySelector("#passwordFilters");
  if (!filterContainer) return;
  filterContainer.querySelectorAll(".category-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activePasswordCategory = btn.dataset.category;
      filterContainer.querySelectorAll(".category-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.category === activePasswordCategory);
      });
      renderPasswords();
    });
  });
}

async function handlePasswordInput(e) {
  const row = e.target.closest("tr");
  if (!row) return;
  const id = row.dataset.id;
  const field = e.target.dataset.field;
  const item = passwords.find(p => p.id === id);
  if (item) {
    item[field] = e.target.value;
    persistPasswords();
    await supabase.from("passwords").update({ [field]: e.target.value }).eq("id", id);
  }
}

async function deletePasswordRow(id) {
  passwords = passwords.filter(p => p.id !== id);
  persistPasswords();
  renderPasswords();
  await supabase.from("passwords").delete().eq("id", id);
}

async function addPasswordRow() {
  const newRow = {
    id: createId(),
    category: activePasswordCategory,
    client: "",
    username: "",
    password: ""
  };
  passwords.push(newRow);
  persistPasswords();
  renderPasswords();
  
  await supabase.from("passwords").insert([{
    id: newRow.id,
    category: newRow.category,
    client: newRow.client,
    username: newRow.username,
    password: newRow.password
  }]);
}

function renderPasswords() {
  const container = document.querySelector("#passwordsTableBody");
  const headerRow = document.querySelector("#passwordTableHeaderRow");
  const tableHeader = document.querySelector("#passwordTableHeader");
  const rowCount = document.querySelector("#passwordRowCount");
  if (!container || !headerRow) return;

  const filtered = passwords.filter(p => p.category === activePasswordCategory);
  const categoryLabel = activePasswordCategory === "kra" ? "KRA PINs" : "Gmail";
  tableHeader.textContent = categoryLabel;
  rowCount.textContent = `${filtered.length} ${filtered.length === 1 ? "row" : "rows"}`;

  if (activePasswordCategory === "kra") {
    headerRow.innerHTML = `
      <th style="width: 35%;">Client</th>
      <th style="width: 35%;">KRA PIN</th>
      <th style="width: 25%;">Password</th>
      <th style="width: 5%;"></th>
    `;
  } else {
    headerRow.innerHTML = `
      <th style="width: 35%;">Client</th>
      <th style="width: 35%;">Gmail Address</th>
      <th style="width: 25%;">Password</th>
      <th style="width: 5%;"></th>
    `;
  }

  container.innerHTML = filtered.map(item => {
    return `
      <tr data-id="${item.id}">
        <td>
          <input list="clientDatalist" data-field="client" value="${escapeHtml(item.client)}" placeholder="Client name" />
        </td>
        <td>
          <input type="text" data-field="username" value="${escapeHtml(item.username)}" placeholder="${activePasswordCategory === 'kra' ? 'e.g. P851234567X' : 'e.g. client@gmail.com'}" />
        </td>
        <td>
          <div class="password-input-wrapper">
            <input type="password" data-field="password" value="${escapeHtml(item.password)}" placeholder="Password" />
            <button type="button" class="password-toggle-btn" title="Toggle visibility">👁</button>
          </div>
        </td>
        <td style="text-align: right;">
          <button type="button" class="row-delete-btn" title="Delete credential">✕</button>
        </td>
      </tr>
    `;
  }).join("");

  container.querySelectorAll("input").forEach(input => {
    input.addEventListener("change", handlePasswordInput);
  });

  container.querySelectorAll(".password-toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = btn.previousElementSibling;
      if (input.type === "password") {
        input.type = "text";
        btn.textContent = "🙈";
      } else {
        input.type = "password";
        btn.textContent = "👁";
      }
    });
  });

  container.querySelectorAll(".row-delete-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.target.closest("tr").dataset.id;
      deletePasswordRow(id);
    });
  });
}

// Initialize passwords manager
initClientDatalist();
initPasswordFilters();
document.querySelector("#addPasswordRowBtn").addEventListener("click", addPasswordRow);

// ── Bootstrap: auth → PIN → app ─────────────────────────────────
setupAuthForm();
setupPinDialog();
initAuth(); // async - shows auth screen or profile picker based on session

})(); // end IIFE
