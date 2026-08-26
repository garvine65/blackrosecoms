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
let selectedCompletedMonth = "";
let searchQuery = "";

const passwordStorageKey = "blackrose-client-passwords";
const defaultPasswords = [
  { id: "pass-1", category: "kra", client: "AMM Law", username: "P051234567X", password: "Password123" },
  { id: "pass-2", category: "gmail", client: "BRC Consultancy", username: "info@blackrose.co.ke", password: "SecretPassword" }
];

let passwords = loadPasswords();
let activePasswordCategory = "all";

// ═══════════════════════════════════════════════════════════════════
//  UTILITY & HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getCurrentTime() {
  return new Date(Date.now() + timeOffset);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sameDay(d1, d2) {
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function formatDue(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function getCountdownLabel(dateStr) {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  if (isNaN(due.getTime())) return null;
  const now = startOfDay(getCurrentTime());
  const dueDay = startOfDay(due);
  const diffDays = Math.round((dueDay - now) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return { label: `${overdueDays}d overdue`, cls: "overdue" };
  } else if (diffDays === 0) {
    return { label: "Due today", cls: "today" };
  } else if (diffDays === 1) {
    return { label: "Due tomorrow", cls: "upcoming" };
  } else {
    return { label: `In ${diffDays} days`, cls: "upcoming" };
  }
}

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return saved;
  } catch {
    return [];
  }
}

function normalizeTask(t) {
  if (!t) return t;
  return {
    id: t.id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    title: t.title || t.task || "Untitled Task",
    client: t.client || "All clients",
    details: t.details || "",
    assignedTo: t.assignedTo || t.assigned_to || "greg",
    assignedBy: t.assignedBy || t.assigned_by || "greg",
    due: t.due || t.due_date || new Date().toISOString().substring(0, 10),
    priority: t.priority || "normal",
    status: t.status || "open",
    repeat: t.repeat || "",
    checklist: t.checklist || [],
    comments: t.comments || [],
    source: t.source || ""
  };
}

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
    if (_event === 'INITIAL_SESSION' || _event === 'TOKEN_REFRESHED') {
      console.log(`[BlackRose Auth] Skipping ${_event} (session remains active).`);
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
  
  try { await loadProfilesFromDB(); } catch (e) { console.warn(e); }
  try { await loadPasswordsFromDB(); } catch (e) { console.warn(e); }
  try { await loadTasksFromDB(); } catch (e) { console.warn(e); }
  try { await loadMeetingsFromDB(); } catch (e) { console.warn(e); }
  try { await loadChecklistsFromDB(); } catch (e) { console.warn(e); }
  try { initChecklistRealtime(); } catch (e) { console.warn(e); }
  try { await loadUnwindMessagesFromDB(); } catch (e) { console.warn(e); }
  try { await loadVibesFromDB(); } catch (e) { console.warn(e); }
  
  showProfilePicker();
}

async function loadProfilesFromDB() {
  try {
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
  } catch (e) {
    console.warn("[BlackRose DB] Load profiles error:", e);
  }
}

async function loadTasksFromDB() {
  try {
    const { data, error } = await supabase.from("tasks").select("*");
    if (!error && data && data.length) {
      tasks = data.map(normalizeTask);
    }
  } catch (e) {
    console.warn("[BlackRose DB] Load tasks error:", e);
  }
}

async function loadPasswordsFromDB() {
  try {
    const { data, error } = await supabase.from("passwords").select("*");
    if (!error && data && data.length) {
      passwords = data;
    }
  } catch (e) {
    console.warn("[BlackRose DB] Load passwords error:", e);
  }
}

async function loadUnwindMessagesFromDB() {
  try {
    const { data, error } = await supabase.from("chat_messages").select("*");
    if (!error && data && data.length) {
      // Loaded chat messages from DB if available
    }
  } catch (e) {
    console.warn("[BlackRose DB] Load chat messages error:", e);
  }
}

async function loadVibesFromDB() {
  try {
    const { data, error } = await supabase.from("vibe_votes").select("*");
    if (!error && data && data.length) {
      // Loaded vibes from DB if available
    }
  } catch (e) {
    console.warn("[BlackRose DB] Load vibes error:", e);
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

// Sidebar nav buttons
document.querySelectorAll(".sidebar-nav-item[data-sidebar-view]").forEach((button) => {
  button.addEventListener("click", (e) => {
    const view = button.dataset.sidebarView;
    if (view) {
      activeView = view;
      closeMobileSidebar();
      render();
    }
  });
});

// ── Mobile hamburger sidebar toggle ──────────────────────────────
function openMobileSidebar() {
  const sidebar = document.getElementById("appSidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const btn = document.getElementById("hamburgerBtn");
  if (sidebar) sidebar.classList.add("sidebar-open");
  if (overlay) overlay.classList.add("active");
  if (btn) btn.setAttribute("aria-expanded", "true");
  document.body.classList.add("sidebar-is-open");
}

function closeMobileSidebar() {
  const sidebar = document.getElementById("appSidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const btn = document.getElementById("hamburgerBtn");
  if (sidebar) sidebar.classList.remove("sidebar-open");
  if (overlay) overlay.classList.remove("active");
  if (btn) btn.setAttribute("aria-expanded", "false");
  document.body.classList.remove("sidebar-is-open");
}

const hamburgerBtnEl = document.getElementById("hamburgerBtn");
if (hamburgerBtnEl) {
  hamburgerBtnEl.addEventListener("click", (e) => {
    e.stopPropagation();
    const sidebar = document.getElementById("appSidebar");
    const isOpen = sidebar && sidebar.classList.contains("sidebar-open");
    isOpen ? closeMobileSidebar() : openMobileSidebar();
  });
}

// Tap the overlay backdrop to close sidebar
const sidebarOverlayEl = document.getElementById("sidebarOverlay");
if (sidebarOverlayEl) {
  sidebarOverlayEl.addEventListener("click", closeMobileSidebar);
}

// Also close sidebar when Files link is clicked on mobile
const sidebarFilesLink = document.getElementById("sidebarFiles");
if (sidebarFilesLink) {
  sidebarFilesLink.addEventListener("click", closeMobileSidebar);
}



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

  if (searchQuery) {
    filtered = filtered.filter((task) => {
      const client = (task.client || "").toLowerCase();
      const title = (task.task || "").toLowerCase();
      const details = (task.details || "").toLowerCase();
      const assignee = getProfile(task.assignedTo).name.toLowerCase();
      const assigner = getProfile(task.assignedBy).name.toLowerCase();
      return (
        client.includes(searchQuery) ||
        title.includes(searchQuery) ||
        details.includes(searchQuery) ||
        assignee.includes(searchQuery) ||
        assigner.includes(searchQuery)
      );
    });
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

  // Sync sidebar active state
  document.querySelectorAll(".sidebar-nav-item[data-sidebar-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.sidebarView === activeView);
  });


  const isTask = activeView === "tasks";
  const isMeeting = activeView === "meetings";
  const isDash = activeView === "dashboard";
  const isWorkload = activeView === "workload";
  const isUnwind = activeView === "unwind";
  const isChecklist = activeView === "checklist";
  const isPasswords = activeView === "passwords";

  clientTabs.style.display = isTask ? "" : "none";
  tasksHeading.style.display = isTask ? "" : "none";
  taskBoard.style.display = isTask ? "" : "none";
  newTaskButton.style.display = isTask ? "" : "none";
  
  const passwordsHeading = document.querySelector("#passwordsHeading");
  const passwordsView = document.querySelector("#passwordsView");
  if (passwordsHeading) {
    passwordsHeading.hidden = !isPasswords;
    passwordsHeading.style.display = isPasswords ? "" : "none";
  }
  if (passwordsView) {
    passwordsView.hidden = !isPasswords;
    passwordsView.style.display = isPasswords ? "" : "none";
  }

  const meetingsViewEl = document.querySelector("#meetingsView");
  if (meetingsViewEl) {
    meetingsViewEl.hidden = !isMeeting;
    meetingsViewEl.style.display = isMeeting ? "" : "none";
  }
  const newMeetingButtonEl = document.querySelector("#newMeetingButton");
  if (newMeetingButtonEl) {
    newMeetingButtonEl.hidden = !isMeeting;
    newMeetingButtonEl.style.display = isMeeting ? "" : "none";
  }
  const dashboardViewEl = document.querySelector("#dashboardView");
  if (dashboardViewEl) {
    dashboardViewEl.hidden = !isDash;
    dashboardViewEl.style.display = isDash ? "" : "none";
  }
  const workloadViewEl = document.querySelector("#workloadView");
  if (workloadViewEl) {
    workloadViewEl.hidden = !isWorkload;
    workloadViewEl.style.display = isWorkload ? "" : "none";
  }
  const unwindViewEl = document.querySelector("#unwindView");
  if (unwindViewEl) {
    unwindViewEl.hidden = !isUnwind;
    unwindViewEl.style.display = isUnwind ? "" : "none";
  }
  const checklistViewEl = document.getElementById("checklistView");
  if (checklistViewEl) {
    checklistViewEl.hidden = !isChecklist;
    checklistViewEl.style.display = isChecklist ? "" : "none";
  }

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
  if (isChecklist) renderChecklists();
  
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

  // Update sidebar profile area
  const sidebarName = document.getElementById("sidebarProfileName");
  const sidebarAvatar = document.getElementById("sidebarProfileAvatar");
  if (sidebarName && activeProfile) {
    sidebarName.textContent = activeProfile.name.split(" ")[0]; // first name only
  }
  if (sidebarAvatar && activeProfile) {
    if (activeProfile.image) {
      sidebarAvatar.innerHTML = `<img src="${activeProfile.image}" alt="${escapeHtml(activeProfile.name)}" />`;
    } else {
      sidebarAvatar.innerHTML = escapeHtml(activeProfile.name[0] || "?");
    }
  }
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
  const isAlreadyActive = (activeProfileId === profileId);
  activeProfileId = profileId;
  localStorage.setItem(sessionStorageKey, profileId);
  localStorage.setItem(sessionStorageKey + "-time", Date.now().toString());
  
  if (!isAlreadyActive) {
    assignmentFilter = "all";
    activeView = "tasks";
  }
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
  const tabList = [...clients];
  clientTabs.innerHTML = tabList
    .map((client) => {
      const active = client === selectedClient ? " active" : "";
      const count = openTasksFor(client);
      return `<button class="tab${active}" data-client="${client}">
        ${count ? '<span class="dot"></span>' : ""}
        <span>${client}</span>
        <span class="count">${count}</span>
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

function getTaskMonthKey(task) {
  const dateStr = task.completedAt || task.completed_at || task.due;
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getTaskMonthLabel(task) {
  const dateStr = task.completedAt || task.completed_at || task.due;
  if (!dateStr) return "Unknown Month";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Unknown Month";
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
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

  const monthSelect = taskBoard.querySelector("#completedMonthSelect");
  if (monthSelect) {
    monthSelect.addEventListener("change", (e) => {
      selectedCompletedMonth = e.target.value;
      renderBoard();
    });
  }
}

function renderSection(key, title, empty, scoped) {
  const priorityOrder = { urgent: 0, normal: 1, low: 2 };
  let rows = scoped.filter((task) => classifyTask(task) === key);
  let monthDropdownHtml = "";

  if (key === "completed") {
    const monthMap = new Map();
    const now = getCurrentTime();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const currentLabel = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    monthMap.set(currentKey, currentLabel);

    rows.forEach((task) => {
      const k = getTaskMonthKey(task);
      const lbl = getTaskMonthLabel(task);
      if (k && !monthMap.has(k)) {
        monthMap.set(k, lbl);
      }
    });

    const sortedMonths = Array.from(monthMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));

    if (!selectedCompletedMonth) {
      selectedCompletedMonth = currentKey;
    }

    const optionsHtml = sortedMonths
      .map(([k, label]) => `<option value="${k}" ${k === selectedCompletedMonth ? "selected" : ""}>${escapeHtml(label)}</option>`)
      .join("");

    const allSelectedHtml = selectedCompletedMonth === "all" ? "selected" : "";
    monthDropdownHtml = `
      <select id="completedMonthSelect" class="completed-month-select" title="Filter completed tasks by month">
        ${optionsHtml}
        <option value="all" ${allSelectedHtml}>All Months</option>
      </select>
    `;

    if (selectedCompletedMonth !== "all") {
      rows = rows.filter((task) => getTaskMonthKey(task) === selectedCompletedMonth);
    }

    rows.sort((a, b) => new Date(b.due) - new Date(a.due));
  } else {
    rows.sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 1;
      const pb = priorityOrder[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return new Date(a.due) - new Date(b.due);
    });
  }

  const clientColumn = selectedClient === "All clients";

  return `<article class="task-section">
    <header class="section-header ${key}">
      <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
        <h3>${title}</h3>
        ${monthDropdownHtml}
      </div>
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
    if (!task) return;
    if (task.repeat && (task.repeat === "monthly" || task.repeat === "weekly")) {
      return openRecurrenceDialog(task);
    }
    showMandatoryWhatsAppCompletionModal(task, () => {
      updateTask(id, { status: "completed" });
    });
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

async function executeSaveTask(id, existingTask, nextTask) {
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

  // Trigger optional WhatsApp notification for NEW tasks assigned to someone else
  const isNewTask = !existingTask;
  const isAssignedToOther = nextTask.assignedTo !== activeProfileId;
  if (isNewTask && isAssignedToOther && nextTask.status === "open") {
    const assignee = getProfile(nextTask.assignedTo);
    if (assignee && assignee.phone) {
      showWhatsAppPrompt(assignee, nextTask);
    }
  }
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

  // If status is changed to "completed", require WhatsApp alert to assigner
  if (nextTask.status === "completed" && (!existingTask || existingTask.status !== "completed")) {
    showMandatoryWhatsAppCompletionModal(nextTask, () => {
      executeSaveTask(id, existingTask, nextTask);
    });
    return;
  }

  executeSaveTask(id, existingTask, nextTask);
}



// ── Mandatory WhatsApp Completion Modal ───────────────────────────────────────
function showMandatoryWhatsAppCompletionModal(task, onConfirmedComplete) {
  const assigner = getProfile(task.assignedBy);
  const completer = profiles.find((p) => p.id === activeProfileId) || getProfile(task.assignedTo);

  let phoneNum = assigner && assigner.phone ? assigner.phone.trim() : "";

  // Remove existing overlay if any
  const existingOverlay = document.getElementById("whatsapp-completion-overlay");
  if (existingOverlay) existingOverlay.remove();

  const overlay = document.createElement("div");
  overlay.id = "whatsapp-completion-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(0,0,0,0.65); backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 1rem;
    animation: fadeIn 0.2s ease;
  `;

  overlay.innerHTML = `
    <div style="
      background: var(--bg-dialog, #fffdf9); color: var(--ink, #14233b);
      border: 1px solid var(--border-surface, rgba(201,149,42,0.3));
      border-radius: 18px; padding: 24px;
      max-width: 440px; width: 100%;
      box-shadow: 0 24px 70px rgba(0,0,0,0.45);
      font-family: inherit;
    ">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px; border-bottom:1.5px solid var(--line, #e4ded3); padding-bottom:12px;">
        <span style="font-size: 28px;">✅</span>
        <div>
          <h3 style="margin: 0; font-size: 1.1rem; color: var(--primary, #14233b);">Task Completion Notification Required</h3>
          <p style="margin: 2px 0 0; font-size: 0.8rem; color: var(--muted, #897f73);">Mandatory WhatsApp alert to task assigner</p>
        </div>
      </div>

      <p style="font-size: 0.9rem; line-height: 1.5; margin: 0 0 14px;">
        To mark <strong>"${escapeHtml(task.title)}"</strong> as completed, you must notify the assigner (<strong>${escapeHtml(assigner ? assigner.name : "Assigner")}</strong>) via WhatsApp so they know it is done.
      </p>

      <div style="margin-bottom: 14px;">
        <label style="display:block; font-size: 0.82rem; font-weight:700; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.04em;">
          ${escapeHtml(assigner ? assigner.name : "Assigner")}'s WhatsApp Phone Number
        </label>
        <input type="tel" id="wa-assigner-phone" value="${escapeHtml(phoneNum)}" placeholder="+254712345678" style="
          width: 100%; padding: 10px 12px; border-radius: 8px;
          border: 1px solid var(--border-input, #ccc);
          background: var(--bg-input, #fff); color: var(--ink, #14233b);
          font-size: 0.95rem; box-sizing: border-box;
        " />
        <p id="wa-phone-err" style="color:var(--red, #b33a3a); font-size:0.8rem; margin:4px 0 0; display:none;">Please enter a valid phone number for ${escapeHtml(assigner ? assigner.name : "Assigner")}.</p>
      </div>

      <div style="
        background: var(--paper, #f8f6f0); border: 1px dashed var(--line, #ddd);
        border-radius: 10px; padding: 12px; font-size: 0.82rem; line-height: 1.55;
        margin-bottom: 20px; color: var(--ink, #333); font-family: monospace; max-height: 110px; overflow-y: auto;
      ">
        <strong>Message Preview:</strong><br/>
        ✅ *Task Completed! — Black Rose Tracker*<br/>
        Hi *${escapeHtml(assigner ? assigner.name : "Assigner")}*,<br/>
        I have completed the task:<br/>
        📋 *Task:* ${escapeHtml(task.title)}<br/>
        🏢 *Client:* ${escapeHtml(task.client)}<br/>
        📅 *Due:* ${formatDue(task.due)}<br/>
        👤 *Completed by:* ${escapeHtml(completer ? completer.name : "Assignee")}
      </div>

      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button id="wa-cancel-complete-btn" class="outline-button compact-button" style="padding: 9px 16px;">Cancel (Keep Open)</button>
        <button id="wa-send-complete-btn" class="primary-button compact-button" style="background:#25D366; border-color:#25D366; color:#fff; font-weight:700; padding: 9px 18px; display:flex; align-items:center; gap:6px;">
          Send &amp; Complete Task 💬
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const phoneInput = overlay.querySelector("#wa-assigner-phone");
  const phoneErr = overlay.querySelector("#wa-phone-err");
  const cancelBtn = overlay.querySelector("#wa-cancel-complete-btn");
  const sendBtn = overlay.querySelector("#wa-send-complete-btn");

  cancelBtn.addEventListener("click", () => {
    overlay.remove();
  });

  sendBtn.addEventListener("click", async () => {
    let rawPhone = phoneInput.value.trim().replace(/[\s\-()]/g, "");
    if (!rawPhone) {
      phoneErr.style.display = "block";
      return;
    }
    phoneErr.style.display = "none";

    let cleanPhone = rawPhone;
    if (!cleanPhone.startsWith("+") && cleanPhone.length === 9) cleanPhone = `+254${cleanPhone}`;
    else if (!cleanPhone.startsWith("+") && cleanPhone.startsWith("0")) cleanPhone = `+254${cleanPhone.substring(1)}`;

    if (assigner && assigner.phone !== rawPhone) {
      assigner.phone = rawPhone;
      profiles = profiles.map(p => p.id === assigner.id ? assigner : p);
      persistProfiles();
      supabase.from("profiles").update({ phone: rawPhone }).eq("id", assigner.id).catch(console.error);
    }

    const message =
      `✅ *Task Completed! — Black Rose Tracker*\n\n` +
      `Hi *${assigner ? assigner.name : "Assigner"}*,\n` +
      `The task assigned has been completed:\n\n` +
      `📋 *Task:* ${task.title}\n` +
      `🏢 *Client:* ${task.client}\n` +
      `📅 *Due:* ${formatDue(task.due)}\n` +
      (task.details ? `📝 *Details:* ${task.details}\n` : "") +
      `👤 *Completed by:* ${completer ? completer.name : "Assignee"}\n\n` +
      `🔗 Open tracker: ${window.location.origin}/`;

    const waUrl = `https://wa.me/${cleanPhone.replace("+", "")}?text=${encodeURIComponent(message)}`;

    window.open(waUrl, "_blank");
    overlay.remove();

    onConfirmedComplete();
  });
}



// ── WhatsApp Notification Prompt ──────────────────────────────────────────────
function showWhatsAppPrompt(assignee, task) {
  // Build the WhatsApp message
  const priorityIcon = task.priority === "urgent" ? "🔴 URGENT\n" : "";
  const message =
    `🔔 *Task Alert — Black Rose Tracker*\n` +
    `${priorityIcon}\n` +
    `*You have been assigned a task:*\n` +
    `*Task:* ${task.title}\n` +
    `*Client:* ${task.client}\n` +
    `*Due:* ${formatDue(task.due)}\n` +
    (task.details ? `*Details:* ${task.details}\n` : "") +
    `\n🔗 Open the app to view & complete it: ${window.location.origin}/`;

  // Normalise phone number
  let phoneNum = assignee.phone.trim().replace(/[\s\-()]/g, "");
  if (!phoneNum.startsWith("+") && phoneNum.length === 9) phoneNum = `+254${phoneNum}`;
  else if (!phoneNum.startsWith("+") && phoneNum.startsWith("0")) phoneNum = `+254${phoneNum.substring(1)}`;

  const waUrl = `https://wa.me/${phoneNum.replace("+", "")}?text=${encodeURIComponent(message)}`;

  // Create in-page overlay prompt
  const overlay = document.createElement("div");
  overlay.id = "whatsapp-prompt-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.2s ease;
  `;

  overlay.innerHTML = `
    <div style="
      background: #fff; border-radius: 16px; padding: 28px 24px;
      max-width: 380px; width: 90%; text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      font-family: 'Outfit', sans-serif;
    ">
      <div style="font-size: 40px; margin-bottom: 12px;">💬</div>
      <h3 style="margin: 0 0 8px; font-size: 18px; color: #1a1a2e;">
        Notify ${assignee.name}?
      </h3>
      <p style="margin: 0 0 20px; font-size: 14px; color: #555; line-height: 1.5;">
        Send a WhatsApp message with the task details so they know what to do.
      </p>
      <div style="display: flex; gap: 12px; justify-content: center;">
        <button id="wa-skip-btn" style="
          flex: 1; padding: 12px 16px; border-radius: 10px;
          border: 1.5px solid #ddd; background: #f5f5f5;
          font-size: 14px; font-weight: 600; color: #555;
          cursor: pointer; transition: all 0.2s;
        ">Skip</button>
        <a href="${waUrl}" id="wa-send-btn" style="
          flex: 1; padding: 12px 16px; border-radius: 10px;
          border: none; background: #25D366; color: #fff;
          font-size: 14px; font-weight: 600; text-decoration: none;
          cursor: pointer; transition: all 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        ">Send ✉️</a>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Skip button — just close the prompt
  document.getElementById("wa-skip-btn").addEventListener("click", () => {
    overlay.remove();
  });

  // Send button — the <a> tag handles navigation naturally, then clean up
  document.getElementById("wa-send-btn").addEventListener("click", () => {
    setTimeout(() => overlay.remove(), 300);
  });

  // Also close on clicking the dark background
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
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
  let list = meetings;
  if (searchQuery) {
    list = list.filter((m) => {
      const title = (m.title || "").toLowerCase();
      const desc = (m.description || "").toLowerCase();
      return title.includes(searchQuery) || desc.includes(searchQuery);
    });
  }
  openMeetingCount.textContent = `${list.length} upcoming ${list.length === 1 ? "meeting" : "meetings"}`;
  const sorted = [...list].sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));

  if (sorted.length === 0) {
    // Render an intentional empty placeholder card so the view doesn't look broken
    meetingsGrid.innerHTML = `
      <div class="meeting-empty-wrapper" style="grid-column:1 / -1">
        <div class="meeting-empty-card">
          <div style="font-size:2.2rem">📅</div>
          <h3>No meetings scheduled</h3>
          <p>Looks quiet — book a meeting to get things moving.</p>
          <div style="display:flex;justify-content:center;gap:0.5rem;margin-top:0.75rem;">
            <button class="primary-button" id="bookMeetingBtn">Book one</button>
            <button class="outline-button" id="learnMoreMeetings">How meetings work</button>
          </div>
        </div>
      </div>`;

    // Shrink the brand watermark to keep the empty card tidy
    const bm = document.querySelector('.brand-watermark');
    if (bm) bm.style.backgroundSize = 'min(48vw,480px)';

    // Wire up the book button to open the schedule dialog
    setTimeout(() => {
      const b = document.getElementById('bookMeetingBtn');
      if (b) b.addEventListener('click', () => openMeetingDialog());
      const l = document.getElementById('learnMoreMeetings');
      if (l) l.addEventListener('click', () => alert('Schedule meetings to coordinate tasks and attendees.'));
    }, 0);

    return;
  }
  // restore watermark sizing when meetings exist
  const bm = document.querySelector('.brand-watermark');
  if (bm) { bm.style.backgroundSize = ''; bm.style.opacity = ''; }

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

  const nextDate = document.querySelector("#recurrenceDate").value;
  const nextTime = document.querySelector("#recurrenceTime").value;

  showMandatoryWhatsAppCompletionModal(task, () => {
    updateTask(id, { status: "completed" });

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

    supabase.from("tasks").insert([{
      id: nextTask.id,
      client: nextTask.client,
      title: nextTask.title,
      details: nextTask.details,
      assigned_by: nextTask.assignedBy,
      assigned_to: nextTask.assignedTo,
      due_date: nextDate,
      due_time: nextTime,
      priority: nextTask.priority || "normal",
      repeat: nextTask.repeat,
      status: "open"
    }]).catch(console.error);
  });
}

function skipRecurrence() {
  const id = document.querySelector("#recurrenceTaskId").value;
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  showMandatoryWhatsAppCompletionModal(task, () => {
    updateTask(id, { status: "completed" });
    recurrenceDialog.close();
  });
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
    // Vacant profile detection (no email or labelled as vacant)
    const isVacant = !profile.email || (profile.details && profile.details.toLowerCase().includes('vacant'));
    const photo = profile.image
      ? `<img src="${profile.image}" alt="${escapeHtml(profile.name)}" class="workload-avatar" />`
      : isVacant
        ? `<button class="invite-slot-btn" data-profile-id="${profile.id}">+ Invite</button>`
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
      ${mine.length === 0 ? `
        <div class="all-clear-badge">✓ All clear</div>
      ` : `
        <div class="workload-bar-track"><div class="workload-bar ${barCls}" style="width:${pct}%"></div></div>
      `}
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
    category: activePasswordCategory === "all" ? "kra" : activePasswordCategory,
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

  const isAll = activePasswordCategory === "all" || !activePasswordCategory;
  let filtered = isAll
    ? passwords
    : passwords.filter(p => (p.category || "").toLowerCase() === activePasswordCategory.toLowerCase());

  if (searchQuery) {
    filtered = filtered.filter(p => {
      const client = (p.client || "").toLowerCase();
      const user = (p.username || "").toLowerCase();
      const cat = (p.category || "").toLowerCase();
      return client.includes(searchQuery) || user.includes(searchQuery) || cat.includes(searchQuery);
    });
  }

  const categoryLabel = isAll
    ? "All Passwords"
    : activePasswordCategory.toLowerCase() === "kra"
    ? "KRA PINs"
    : "Gmail";

  tableHeader.textContent = categoryLabel;
  rowCount.textContent = `${filtered.length} ${filtered.length === 1 ? "row" : "rows"}`;

  if (isAll) {
    headerRow.innerHTML = `
      <th style="width: 25%;">Client</th>
      <th style="width: 20%;">Category</th>
      <th style="width: 25%;">Username / PIN / Email</th>
      <th style="width: 25%;">Password</th>
      <th style="width: 5%;"></th>
    `;
  } else if (activePasswordCategory === "kra") {
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
    const cat = item.category || "kra";
    if (isAll) {
      return `
        <tr data-id="${item.id}">
          <td>
            <input list="clientDatalist" data-field="client" value="${escapeHtml(item.client)}" placeholder="Client name" />
          </td>
          <td>
            <select data-field="category" class="category-select">
              <option value="kra" ${cat === "kra" ? "selected" : ""}>KRA PIN</option>
              <option value="gmail" ${cat === "gmail" ? "selected" : ""}>Gmail</option>
              <option value="other" ${cat === "other" ? "selected" : ""}>Other</option>
            </select>
          </td>
          <td>
            <input type="text" data-field="username" value="${escapeHtml(item.username)}" placeholder="Username / PIN / Email" />
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
    }
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

  container.querySelectorAll("input, select").forEach(input => {
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

// ═══════════════════════════════════════════════════════════════════
//  MONTHLY CLIENT CHECKLISTS
// ═══════════════════════════════════════════════════════════════════

const clStorageKey = "blackrose-checklists";

// Section colour palette cycling
const CL_SECTION_COLORS = [
  "#e74c3c","#3498db","#2ecc71","#f39c12","#9b59b6",
  "#1abc9c","#e67e22","#e91e63","#607d8b","#795548","#00bcd4","#c9952a"
];
const CL_ROW_CLASSES = [
  "cl-row-billing","cl-row-trust","cl-row-cash","cl-row-expense","cl-row-advances",
  "cl-row-receivables","cl-row-payables","cl-row-payroll","cl-row-tax","cl-row-budget",
  "cl-row-governance","cl-row-default"
];

// ── Pre-built Templates ───────────────────────────────────────────
const CL_TEMPLATES = [
  {
    "id": "tpl-adh",
    "name": "ADH Monthly Checklist",
    "clientTypes": [
      "ADH"
    ],
    "sections": [
      {
        "name": "Income (Statement of Activities)",
        "subCategories": [
          "Post donation and fundraising income, confirm against receipts",
          "Accrue any earned but uninvoiced income (e.g. milestone-based grants)",
          "Record interest income and any forex gains on foreign currency receipts",
          "Reconcile income by programme/project code to grant agreements",
          "Confirm restricted vs unrestricted income split is correctly coded"
        ],
        "items": [
          "Pending",
          "Pending",
          "Pending",
          "Pending",
          "Pending"
        ]
      },
      {
        "name": "Expenditure (Statement of Activities)",
        "subCategories": [
          "Ensure all invoices and payment vouchers are posted and approved",
          "Verify payroll and staff costs allocated correctly to programme/admin",
          "Post accruals for goods/services received but not yet invoiced",
          "Review prepayments and release appropriate portion to expense",
          "Confirm shared costs (rent, utilities) are apportioned across cost centres",
          "Check for duplicate payments or unapproved expenditure",
          "Compare expenditure to budget line items; document variances above 10%",
          "Check for accuracy in coding for each expenditure per grant",
          "Have you done an FX valuation",
          "Have you submitted payment vouchers for signing to Chao"
        ],
        "items": [
          "Complete",
          "Pending",
          "Pending",
          "Pending",
          "Pending",
          "Pending",
          "Pending",
          "Pending",
          "Pending",
          "Pending"
        ]
      },
      {
        "name": "Balance Sheet Items",
        "subCategories": [
          "Reconcile all bank accounts and confirm closing cash balances",
          "Submit bank reconciliations to Chao for signature",
          "Update fixed asset register — additions, disposals, monthly depreciation",
          "Confirm petty cash count matches petty cash ledger balance",
          "Verify deferred income balance reflects unspent restricted grant funds",
          "Review fund balances — restricted, unrestricted, designated",
          "Prepare and review trial balance; confirm it is in balance"
        ],
        "items": [
          "Pending",
          "Pending",
          "Pending",
          "Pending",
          "Pending",
          "Pending",
          "Pending"
        ]
      },
      {
        "name": "Advances",
        "subCategories": [
          "Print advances register and confirm all open balances per staff/partner",
          "Follow up on all advances outstanding beyond the approved clearance period",
          "Review and post retirement/liquidation documents submitted this month",
          "Confirm no new advance issued to staff with an unretired prior advance",
          "Reconcile advances to implementing partners against sub-grant agreements",
          "Flag advances older than 90 days to management for escalation",
          "Ensure advances ledger balance agrees to balance sheet advances line"
        ],
        "items": [
          "Pending",
          "Pending",
          "Pending",
          "Pending",
          "Pending",
          "Pending",
          "Pending"
        ]
      },
      {
        "name": "Receivables",
        "subCategories": [
          "Generate aged receivables report and review balances by donor/partner",
          "Follow up on overdue grant reimbursements and donor invoices",
          "Post all cash received against open receivable items",
          "Identify any receivables at risk of non-collection; flag for provision",
          "Confirm interproject or inter-fund receivables are matched and will clear",
          "Reconcile receivables ledger total to balance sheet receivables line"
        ],
        "items": [
          "Pending",
          "Pending",
          "Pending",
          "Pending",
          "Pending",
          "Pending"
        ]
      },
      {
        "name": "Payables",
        "subCategories": [
          "Generate aged payables report; review all balances by vendor/creditor",
          "Confirm all approved invoices due this month are paid or accrued",
          "Reconcile supplier statements to the payables ledger for key vendors",
          "Review statutory payables — VAT, WHT — and confirm remittance",
          "Check for any disputed invoices or items on hold; document reason",
          "Reconcile payables ledger total to balance sheet payables line"
        ],
        "items": [
          "Pending",
          "Pending",
          "Pending",
          "Pending",
          "Pending",
          "Pending"
        ]
      },
      {
        "name": "ALL",
        "subCategories": [
          "Have you done an FX valuation",
          "Have you locked the accounting period"
        ],
        "items": [
          "Pending",
          "Pending"
        ]
      },
      {
        "name": "Programme & Grants",
        "subCategories": [
          "Submit interim financial reports due to funders this month",
          "Update grant tracking register with receipts and expenditures",
          "Review burn rates per active grant and flag underspend or overspend",
          "Confirm invoices from implementing partners are received and approved",
          "Archive supporting documents for all grant transactions",
          "Update cash flow forecast and pipeline tracker",
          "Update grant report with expenditure"
        ],
        "items": [
          "Pending",
          "Pending",
          "Pending",
          "Pending",
          "Pending",
          "Pending",
          "Pending"
        ]
      },
      {
        "name": "Governance & Compliance",
        "subCategories": [
          "Review outstanding statutory filings or compliance deadlines",
          "Review risk register and flag new financial risks to management",
          "Ensure board/committee decisions from last meeting are actioned",
          "Distribute monthly finance report to management and relevant board members"
        ],
        "items": [
          "Pending",
          "Pending",
          "Pending",
          "Pending"
        ]
      },
      {
        "name": "HR & Operations",
        "subCategories": [
          "Review vendor contracts expiring in the next 60 days"
        ],
        "items": [
          "Pending"
        ]
      },
      {
        "name": "Archival & filing",
        "subCategories": [
          "Confirm if you have you uploaded the signed PVs alongside invoices to the files",
          "Confirm if you have you uploaded the signed Bank recs alongside invoices to the files"
        ],
        "items": [
          "Pending",
          "Pending"
        ]
      }
    ]
  },
  {
    "id": "tpl-amm",
    "name": "AMM Law Monthly Checklist",
    "clientTypes": [
      "AMM Law",
      "AMM"
    ],
    "sections": [
      {
        "name": "Billing & Revenue",
        "subCategories": [
          "Time recording",
          "Time recording",
          "Time recording",
          "Time recording",
          "Disbursements",
          "Disbursements",
          "Disbursements",
          "Invoice generation",
          "Invoice generation",
          "Invoice generation",
          "Invoice generation",
          "Revenue recognition",
          "Revenue recognition",
          "Revenue recognition"
        ],
        "items": [
          "Confirm all fee earners have submitted time records for the month",
          "Review and approve unbilled time entries; chase outstanding timesheets from fee earners",
          "Identify and write off time entries that will not be recoverable; obtain partner approval",
          "Reconcile total hours recorded to expected billing capacity by fee earner",
          "Confirm all client disbursements (court fees, counsel fees, searches, stamps) are captured",
          "Ensure disbursements are correctly coded to client/matter and supported by receipts",
          "Reconcile disbursements ledger to supporting invoices and receipts",
          "Raise all invoices for time and disbursements billed this month",
          "Confirm invoices are approved by the responsible partner before dispatch",
          "Confirm invoice terms, client reference, and VAT treatment are correct on each invoice",
          "Issue invoices to clients and record in the billing register against each matter",
          "Post revenue for invoices raised in the billing ledger",
          "Accrue unbilled time for matters where work is substantially complete but not yet invoiced",
          "Reconcile total fees billed vs fees collected vs WIP movement for the month"
        ]
      },
      {
        "name": "Client Trust / Ledger Accounts",
        "subCategories": [
          "Trust reconciliation",
          "Trust reconciliation",
          "Trust reconciliation",
          "Trust compliance",
          "Trust compliance",
          "Trust compliance",
          "Trust compliance",
          "Trust compliance",
          "Matter closure",
          "Matter closure",
          "Matter closure"
        ],
        "items": [
          "Reconcile each client trust/ledger account balance to the trust bank statement",
          "Confirm aggregate of all individual client ledger balances equals the trust bank balance",
          "Investigate and resolve any differences in client ledger reconciliations immediately",
          "Confirm no client trust funds have been used for office/firm purposes",
          "Confirm all client funds received are deposited into the trust account on the same day",
          "Review all disbursements from trust; confirm each has client authority and matter reference",
          "Confirm trust account does not have a debit balance on any individual client ledger",
          "Ensure any interest earned on trust accounts is allocated per policy and regulatory rules",
          "Identify matters closed this month; confirm all trust funds are returned or applied",
          "Confirm final bills are raised and any residual trust balances cleared before matter closure",
          "Archive closed matter financial records per the firm's document retention policy"
        ]
      },
      {
        "name": "Cash & Bank",
        "subCategories": [
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Petty cash",
          "Petty cash",
          "Petty cash",
          "Cash management",
          "Cash management",
          "Cash management",
          "Cash forecasting",
          "Cash forecasting",
          "Cash forecasting"
        ],
        "items": [
          "Obtain month-end bank statements for all office/firm bank accounts",
          "Reconcile each office bank account closing balance to the general ledger cash book",
          "List all outstanding deposits in transit at month-end; confirm expected clearance dates",
          "List all outstanding cheques and unpresented payments; investigate items over 30 days",
          "Confirm all bank charges, interest, and fees are posted in the cash book",
          "Review bank statement for any unusual or unauthorised transactions; escalate immediately",
          "Confirm no stale cheques (older than 6 months) remain uncleared",
          "Perform physical petty cash count; confirm balance agrees to cashbook",
          "Reconcile petty cash to the petty cash ledger; confirm all vouchers are approved and filed",
          "Replenish petty cash to the approved float level and post replenishment journal",
          "Confirm all inter-account transfers are posted in both accounts and reconciled",
          "Confirm trust and office bank accounts are clearly segregated in the ledger at all times",
          "Prepare month-end actual cash flow statement (office account receipts and payments)",
          "Update rolling 3-month cash flow forecast with latest billing and cost data",
          "Identify any projected cash shortfalls; flag to management with proposed mitigations",
          "Confirm adequate cash is available for next payroll and major payment obligations"
        ]
      },
      {
        "name": "Expenditure & Cost Control",
        "subCategories": [
          "Invoice processing",
          "Invoice processing",
          "Accruals & prepayments",
          "Accruals & prepayments",
          "Accruals & prepayments",
          "Cost control",
          "Cost control",
          "Cost control",
          "Cost control"
        ],
        "items": [
          "Confirm all supplier invoices are coded, approved, and posted to the correct cost centre",
          "Confirm counsel and expert witness fees are approved and posted against the correct matter",
          "Post accruals for costs incurred but not yet invoiced (counsel, searches, utilities)",
          "Release prepayments proportionately; confirm remaining balances are valid",
          "Accrue office costs — rent, insurance, software licences, library subscriptions",
          "Compare actual costs to budget by department and practice group; flag variances above 10%",
          "Review professional indemnity insurance and other firm insurance costs are correctly posted",
          "Confirm depreciation on office equipment, IT, and leasehold improvements is posted",
          "Review and approve any unbudgeted expenditure above the delegated authority threshold"
        ]
      },
      {
        "name": "Advances & Disbursement Float",
        "subCategories": [
          "Staff advances",
          "Staff advances",
          "Staff advances",
          "Staff advances",
          "Disbursement float",
          "Disbursement float",
          "Disbursement float",
          "Reconciliation"
        ],
        "items": [
          "Review advances register; confirm all open balances per fee earner and support staff",
          "Follow up on all advances outstanding beyond the approved clearance period (30 days)",
          "Post retirement documents for advances liquidated this month",
          "Confirm no new advance is issued to staff with an unretired prior advance",
          "Reconcile disbursement float advances to actual disbursements incurred per matter",
          "Confirm client disbursement floats are correctly recorded as client liabilities",
          "Follow up on disbursement floats where matters are substantially complete",
          "Confirm advances ledger balance agrees to balance sheet advances line"
        ]
      },
      {
        "name": "Receivables",
        "subCategories": [
          "Aged analysis",
          "Aged analysis",
          "Collections",
          "Collections",
          "Collections",
          "Credit risk",
          "Credit risk",
          "Reconciliation"
        ],
        "items": [
          "Generate aged receivables report; review all balances by client and matter",
          "Identify invoices overdue by 30, 60, and 90+ days; escalate 90+ day items to partners",
          "Issue payment reminders to clients with overdue invoices",
          "Post all cash receipts; confirm correct allocation to client invoices and matters",
          "Follow up on disputed fee notes with the responsible partner; document resolution plan",
          "Assess recoverability of aged balances; raise bad debt provision where required",
          "Review credit terms for clients with persistently late payment patterns",
          "Reconcile receivables ledger total to balance sheet receivables line"
        ]
      },
      {
        "name": "Payables",
        "subCategories": [
          "Aged analysis",
          "Aged analysis",
          "Payments",
          "Payments",
          "Payments",
          "Statutory payables",
          "Statutory payables",
          "Reconciliation",
          "Reconciliation"
        ],
        "items": [
          "Generate aged payables report; review all balances by supplier",
          "Identify invoices due for payment this month; prepare payment run schedule",
          "Process approved payment run; confirm bank transfers are authorised per policy",
          "Confirm counsel, expert witness, and agent fee payments are made per agreed terms",
          "Reconcile supplier statements to the payables ledger for key vendors",
          "Confirm PAYE, NSSF, NHIF remittances are processed and receipts filed",
          "Confirm VAT payable is correctly calculated on firm fee income",
          "Reconcile payables ledger total to balance sheet payables line",
          "Review long-outstanding creditor balances for continued validity"
        ]
      },
      {
        "name": "Payroll & HR Costs",
        "subCategories": [
          "Payroll processing",
          "Payroll processing",
          "Payroll processing",
          "Payroll processing",
          "Statutory deductions",
          "Statutory deductions",
          "Cost allocation",
          "Cost allocation",
          "Cost allocation"
        ],
        "items": [
          "Confirm approved headcount, new starters, leavers, and salary changes for the month",
          "Process monthly payroll for partners/directors, fee earners, and support staff",
          "Reconcile gross pay to approved salary and drawings schedule",
          "Issue payslips to all staff; confirm net pay agrees to bank transfer total",
          "Confirm PAYE, NSSF, NHIF deductions are correctly computed and remitted",
          "File statutory remittance returns by due dates and retain receipts",
          "Allocate payroll costs to practice groups and cost centres",
          "Post partner drawings and profit distributions per the partnership/shareholder agreement",
          "Reconcile total payroll cost to the general ledger posting"
        ]
      },
      {
        "name": "Tax & Regulatory Compliance",
        "subCategories": [
          "VAT",
          "VAT",
          "VAT",
          "Withholding tax",
          "Withholding tax",
          "Regulatory",
          "Regulatory"
        ],
        "items": [
          "Reconcile output VAT on fee notes and input VAT on approved supplier invoices",
          "Prepare and file monthly VAT return by statutory deadline",
          "Confirm VAT treatment on disbursements — distinguish principal vs agent disbursements",
          "Confirm withholding tax deducted on advocate/counsel fees and professional payments",
          "File withholding tax return and remit deducted amounts by due date",
          "Confirm practising certificates and Law Society membership fees are current for all advocates",
          "Review any upcoming LSK, regulatory, or court compliance deadlines"
        ]
      },
      {
        "name": "Budget & Management Reporting",
        "subCategories": [
          "Budget vs actuals",
          "Budget vs actuals",
          "KPIs",
          "KPIs",
          "KPIs"
        ],
        "items": [
          "Prepare monthly budget vs actuals report by practice group and firm-wide",
          "Document and present all material fee and cost variances to partners",
          "Prepare monthly fee earner KPI report — fees billed, fees collected, utilisation, realisations",
          "Review lock-up days (WIP days + debtor days) by practice group and fee earner",
          "Update full-year revenue forecast based on current pipeline and billing run-rate"
        ]
      },
      {
        "name": "Governance & Operations",
        "subCategories": [
          "Governance",
          "Governance",
          "Governance",
          "Governance",
          "Operations",
          "Operations"
        ],
        "items": [
          "Review and action any outstanding internal control or compliance findings",
          "Confirm all financial authorisations and delegated authority limits are being observed",
          "Update the financial risk register with any new risks identified this month",
          "Circulate monthly management accounts to partners within agreed reporting deadline",
          "Review vendor contracts expiring in the next 60 days; flag for renewal or renegotiation",
          "File all month-end working papers and supporting documents per retention policy"
        ]
      }
    ]
  },
  {
    "id": "tpl-brc",
    "name": "BRC Consultancy Monthly Checklist",
    "clientTypes": [
      "BRC Consultancy",
      "Black Rose Communications"
    ],
    "sections": [
      {
        "name": "Billing, Revenue & WIP",
        "subCategories": [
          "Timesheet review",
          "Timesheet review",
          "Timesheet review",
          "Timesheet review",
          "WIP management",
          "WIP management",
          "Invoice generation",
          "Invoice generation",
          "Invoice generation",
          "Invoice generation",
          "Revenue recognition",
          "Revenue recognition",
          "Revenue recognition",
          "Revenue recognition"
        ],
        "items": [
          "Confirm all professional staff have submitted timesheets for every working day of the month",
          "Review and approve timesheets; confirm hours are coded to the correct client/engagement",
          "Identify non-chargeable time (training, admin, BD, leave) and post to correct internal codes",
          "Reconcile total hours recorded to expected capacity by service line (audit, accounting, tax)",
          "Update WIP register for all active audit, accounting, and tax compliance engagements",
          "Write down WIP for any engagement where recovery is doubtful; obtain partner approval",
          "Raise invoices for all completed milestones, monthly retainer fees, and ad hoc work billed this month",
          "Confirm all invoices are approved by the responsible partner before dispatch to clients",
          "Confirm invoice amounts, VAT treatment, and client reference agree to the engagement letter",
          "Issue invoices and record in the billing register against each client and engagement",
          "Recognise revenue for work done this month per engagement (% completion or milestone basis)",
          "Post deferred income for fees received in advance of work being performed",
          "Reconcile recognised revenue to invoices raised and WIP movements for the month",
          "Prepare monthly fee income report by service line (audit, accounting, tax compliance)"
        ]
      },
      {
        "name": "Audit Engagements — Monthly Progress",
        "subCategories": [
          "Engagement management",
          "Engagement management",
          "Engagement management",
          "Engagement management",
          "Audit file management",
          "Audit file management",
          "Audit file management",
          "Audit file management",
          "Reporting",
          "Reporting",
          "Reporting",
          "Billing"
        ],
        "items": [
          "Update audit engagement tracker with current status of all active audit assignments",
          "Confirm all audit fieldwork scheduled for the month is completed or rescheduled with client agreement",
          "Confirm engagement letters are in place for all audits starting this month",
          "Confirm audit planning materiality and risk assessments are up to date on active engagements",
          "Confirm audit working paper files for all active engagements are being updated and reviewed",
          "Confirm all significant audit findings and issues are documented and escalated to partners",
          "Confirm outstanding client information requests (PBC lists) are followed up and tracked",
          "Confirm all review notes are cleared or carried forward with documented responses",
          "Confirm all audit reports due for issue this month are completed and issued on time",
          "Confirm management letters for completed audits are prepared and issued to clients",
          "Confirm all regulatory submission deadlines (e.g. filing with registrar) for audit clients are met",
          "Confirm audit fee invoices raised match the engagement letter fee schedule or agreed variations"
        ]
      },
      {
        "name": "Accounting & Bookkeeping Engagements",
        "subCategories": [
          "Bookkeeping",
          "Bookkeeping",
          "Bookkeeping",
          "Bookkeeping",
          "Bookkeeping",
          "Management accounts",
          "Management accounts",
          "Management accounts",
          "Management accounts",
          "Reconciliations",
          "Reconciliations",
          "Reconciliations",
          "Billing"
        ],
        "items": [
          "Confirm all client bookkeeping data (bank statements, invoices, receipts) is received on time",
          "Post all client transactions — sales, purchases, payroll, bank — for the month",
          "Reconcile client bank accounts to the cash book for the month",
          "Process client payroll and confirm payroll journals are posted for the month",
          "Confirm all client accounts payable and receivable ledgers are updated and reconciled",
          "Prepare monthly management accounts for all accounting clients due this month",
          "Confirm management accounts are reviewed by the responsible manager before client delivery",
          "Deliver management accounts to clients within agreed turnaround times",
          "Follow up with clients on any queries arising from management accounts delivered",
          "Perform month-end reconciliations for all client accounts — bank, debtors, creditors, payroll",
          "Confirm all client trial balances are in balance and free from unexplained items",
          "Post month-end journals — accruals, prepayments, depreciation — for all accounting clients",
          "Confirm accounting/bookkeeping fee invoices raised agree to engagement letter fee schedules"
        ]
      },
      {
        "name": "Tax Compliance Engagements",
        "subCategories": [
          "VAT",
          "VAT",
          "VAT",
          "VAT",
          "Withholding Tax",
          "Withholding Tax",
          "Withholding Tax",
          "Compliance tracker",
          "Compliance tracker",
          "Billing"
        ],
        "items": [
          "Confirm client sales and purchase data is received for VAT computation",
          "Confirm VAT computations are prepared, reviewed, and approved before filing",
          "Confirm VAT 3 returns are filed on iTax by the 20th for all VAT clients",
          "Confirm VAT payment E-slips are generated and shared with clients for payment",
          "Confirm WHT schedules are prepared for all applicable client payments this month",
          "Confirm WHT returns are filed on iTax by the 20th for all WHT clients",
          "Confirm WHT certificates are generated and distributed to suppliers on behalf of clients",
          "Update tax compliance tracker with filing status for each client and obligation",
          "Flag any overdue filings or pending payments; escalate to engagement manager",
          "Confirm tax compliance fee invoices raised agree to engagement letter fee schedules"
        ]
      },
      {
        "name": "Cash & Bank",
        "subCategories": [
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Petty cash",
          "Petty cash",
          "Petty cash",
          "Cash management",
          "Cash management",
          "Cash management",
          "Cash forecasting",
          "Cash forecasting",
          "Cash forecasting"
        ],
        "items": [
          "Obtain month-end bank statements for all firm bank accounts",
          "Reconcile each firm bank account closing balance to the general ledger cash book",
          "List all outstanding deposits in transit at month-end; confirm expected clearance dates",
          "List all outstanding cheques and unpresented payments; investigate items over 30 days",
          "Confirm all bank charges, interest, and fees are posted in the firm cash book",
          "Review bank statement for unusual or unauthorised transactions; escalate immediately",
          "Confirm no stale cheques (older than 6 months) remain uncleared on the reconciliation",
          "Perform physical petty cash count; confirm balance agrees to the cashbook",
          "Reconcile petty cash to the petty cash ledger; confirm all vouchers are approved and filed",
          "Replenish petty cash to the approved float level and post replenishment journal",
          "Confirm all inter-bank transfers are posted in both accounts and reconciled",
          "Review month-end cash position against minimum operating balance requirements",
          "Prepare month-end actual cash flow statement (firm receipts and payments)",
          "Update rolling 3-month cash flow forecast with latest billing and cost data",
          "Identify projected cash shortfalls; flag to managing partner with proposed mitigations",
          "Confirm adequate cash is available for next payroll run and major payment obligations"
        ]
      },
      {
        "name": "Advances",
        "subCategories": [
          "Staff advances",
          "Staff advances",
          "Staff advances",
          "Staff advances",
          "Client disbursements",
          "Client disbursements",
          "Client disbursements",
          "Reconciliation"
        ],
        "items": [
          "Review advances register; confirm all open balances per staff member",
          "Follow up on all advances outstanding beyond the approved clearance period (30 days)",
          "Post retirement documents for advances liquidated this month",
          "Confirm no new advance is issued to staff with an unretired prior advance",
          "Reconcile any out-of-pocket client disbursements to approved engagement budgets",
          "Confirm all client disbursements are invoiced and recoverable per engagement letter",
          "Confirm firm funds advanced for client disbursements are correctly recorded as receivables",
          "Confirm advances ledger balance agrees to balance sheet advances line"
        ]
      },
      {
        "name": "Receivables",
        "subCategories": [
          "Aged analysis",
          "Aged analysis",
          "Collections",
          "Collections",
          "Collections",
          "Credit risk",
          "Credit risk",
          "Reconciliation"
        ],
        "items": [
          "Generate aged receivables report; review all balances by client and engagement",
          "Identify invoices overdue by 30, 60, and 90+ days; escalate 90+ day items to partners",
          "Issue payment reminders to clients with overdue invoices",
          "Post all cash receipts; confirm correct allocation to client invoices and engagements",
          "Follow up on disputed fee notes with the responsible partner; document resolution plan",
          "Assess recoverability of aged balances; raise bad debt provision where required",
          "Review credit terms for clients with persistently late payment patterns",
          "Reconcile receivables ledger total to balance sheet receivables line"
        ]
      },
      {
        "name": "Payables",
        "subCategories": [
          "Aged analysis",
          "Aged analysis",
          "Payments",
          "Payments",
          "Payments",
          "Statutory payables",
          "Statutory payables",
          "Reconciliation",
          "Reconciliation"
        ],
        "items": [
          "Generate aged payables report; review all balances by supplier",
          "Identify invoices due for payment this month; prepare payment run schedule",
          "Process approved payment run; confirm bank transfers are authorised per policy",
          "Confirm specialist sub-contractor and expert fee payments are made per agreed terms",
          "Reconcile supplier statements to the payables ledger for key vendors",
          "Confirm firm PAYE, NSSF, NHIF remittances are processed and receipts are filed",
          "Confirm firm VAT and WHT obligations are met and receipts are retained",
          "Reconcile payables ledger total to balance sheet payables line",
          "Review long-outstanding creditor balances for continued validity"
        ]
      },
      {
        "name": "Payroll & Staff Costs",
        "subCategories": [
          "Payroll processing",
          "Payroll processing",
          "Payroll processing",
          "Payroll processing",
          "Statutory deductions",
          "Statutory deductions",
          "Cost allocation",
          "Cost allocation",
          "Cost allocation"
        ],
        "items": [
          "Confirm approved headcount, new starters, leavers, and salary changes for the month",
          "Process monthly payroll for partners, managers, seniors, and support staff",
          "Reconcile gross pay to approved salary schedule",
          "Issue payslips; confirm net pay agrees to bank transfer total before release",
          "Confirm firm PAYE, NSSF, NHIF deductions are correctly computed and remitted",
          "File firm statutory remittance returns by due dates; retain receipts",
          "Allocate payroll costs to service lines (audit, accounting, tax) per timesheet data",
          "Post partner drawings and profit distributions per the partnership/shareholder agreement",
          "Reconcile total payroll cost to the general ledger posting"
        ]
      },
      {
        "name": "Lock-up, Utilisation & Engagement Profitability",
        "subCategories": [
          "Lock-up",
          "Lock-up",
          "Lock-up",
          "Utilisation",
          "Utilisation",
          "Engagement profitability",
          "Engagement profitability",
          "Engagement profitability"
        ],
        "items": [
          "Calculate month-end WIP days by engagement and service line",
          "Calculate month-end debtor days by client and service line",
          "Calculate total lock-up days (WIP days + debtor days) for the firm",
          "Calculate chargeable utilisation rates per staff member (chargeable hours / available hours)",
          "Flag fee earners with utilisation below target to the relevant manager/partner",
          "Prepare month-end engagement profitability report — fees vs cost per engagement",
          "Identify engagements with negative margins or cost overruns; report to partners",
          "Calculate realisation rates (fees billed / WIP generated) by service line and partner"
        ]
      },
      {
        "name": "Quality Control & Professional Compliance",
        "subCategories": [
          "QC review",
          "QC review",
          "QC review",
          "Independence",
          "Independence",
          "CPD & licensing",
          "CPD & licensing",
          "Risk",
          "Risk"
        ],
        "items": [
          "Confirm all audit, accounting, and tax deliverables issued this month have been reviewed at the correct level (manager/partner)",
          "Confirm second partner review (cold review) has been completed where required by firm policy",
          "Confirm engagement quality control reviews (EQCR) are in progress for applicable audits",
          "Confirm no new independence threats or conflicts of interest have arisen for any active engagement",
          "Confirm all new client acceptance and conflict checks are completed and documented this month",
          "Confirm all professional staff CPD hours are being recorded and are on track for the year",
          "Confirm all practising certificates and professional memberships (ICPAK, ICPAS, etc.) are current",
          "Review the firm risk register; flag any new risks arising from active client engagements",
          "Confirm professional indemnity insurance is current and adequate for the firm's engagements"
        ]
      },
      {
        "name": "Management Reporting & Governance",
        "subCategories": [
          "Reports",
          "Reports",
          "Reports",
          "Reports",
          "Governance",
          "Governance",
          "Governance",
          "Governance"
        ],
        "items": [
          "Prepare monthly management accounts — P&L by service line, balance sheet, cash flow",
          "Prepare monthly engagement dashboard — WIP, billings, lock-up, utilisation, realisations",
          "Prepare tax compliance dashboard — filing status per client and obligation for the month",
          "Circulate management pack to partners within the agreed reporting deadline",
          "Review and action any outstanding regulatory, ICPAK, or internal quality findings",
          "Confirm all financial authorisations and delegated authority limits are being observed",
          "Update the firm risk register with any new risks identified this month",
          "File all month-end working papers and supporting documents per retention policy"
        ]
      }
    ]
  },
  {
    "id": "tpl-briq",
    "name": "Briq Consultancy Monthly Checklist",
    "clientTypes": [
      "Briq Consultancy",
      "BRIQ"
    ],
    "sections": [
      {
        "name": "Revenue & Billing",
        "subCategories": [
          "Timesheet review",
          "Timesheet review",
          "Timesheet review",
          "Invoice generation",
          "Invoice generation",
          "Invoice generation",
          "Invoice generation",
          "Revenue recognition",
          "Revenue recognition",
          "Revenue recognition",
          "Revenue recognition"
        ],
        "items": [
          "Collect and approve all staff timesheets; confirm hours allocated to correct project codes",
          "Reconcile billable hours logged against project plans and engagement letters",
          "Identify and document non-billable hours by category (admin, training, BD)",
          "Raise invoices for all billable milestones, time-and-materials, and retainer fees due this month",
          "Confirm invoice amounts, payment terms, and client PO references before issuing",
          "Issue invoices to clients and log dispatch date in the billing register",
          "Record all invoices raised in the accounts receivable ledger against the correct project",
          "Determine revenue to be recognised this month per project (% completion or milestone basis)",
          "Post revenue recognition journals; defer income for work not yet earned",
          "Reconcile recognised revenue to invoices raised and WIP movements",
          "Confirm contract modifications or scope changes are reflected in revenue schedules"
        ]
      },
      {
        "name": "Project Accounting & WIP",
        "subCategories": [
          "WIP review",
          "WIP review",
          "WIP review",
          "WIP review",
          "Cost allocation",
          "Cost allocation",
          "Cost allocation",
          "Project profitability",
          "Project profitability",
          "Project profitability",
          "Project profitability",
          "Contract registry"
        ],
        "items": [
          "Update work-in-progress (WIP) register for all active projects",
          "Reconcile WIP: opening balance + costs incurred − revenue recognised = closing WIP",
          "Review WIP for projects nearing or exceeding budget; escalate to project managers",
          "Write down WIP for any projects where recovery is doubtful; obtain management approval",
          "Allocate direct project costs (labour, subconsultants, materials, site costs) to correct project codes",
          "Confirm subconsultant invoices are approved and posted against the correct project",
          "Allocate indirect overhead costs to projects per the agreed apportionment methodology",
          "Prepare month-end project profitability report (revenue vs cost per project)",
          "Identify projects with negative margins or cost overruns; report to management",
          "Update project completion estimates and revised budget-at-completion (BAC) where needed",
          "Confirm all project opening and closing phases are correctly reflected in the system",
          "Confirm if all contracts have been updated here"
        ]
      },
      {
        "name": "Expenditure & Cost Control",
        "subCategories": [
          "Invoice processing",
          "Invoice processing",
          "Invoice processing",
          "Invoice processing",
          "Accruals & prepayments",
          "Accruals & prepayments",
          "Accruals & prepayments",
          "Cost control",
          "Cost control",
          "Cost control",
          "Cost control",
          "Cost control"
        ],
        "items": [
          "Ensure all supplier invoices received are coded, approved, and posted",
          "Ensure a payment voucher is raised signed by initiator and approver and attached to the appropriate invoice",
          "Confirm subconsultant and specialist contractor invoices match purchase orders or agreements",
          "Review and post staff expense claims; confirm receipts and project codes are correct",
          "Post accruals for costs incurred but not yet invoiced (subconsultants, site costs, utilities)",
          "Release prepayments proportionately; confirm remaining prepayment balances are valid",
          "Accrue monthly office costs — rent, insurance, software licences, professional subscriptions",
          "Compare actual costs to budget by department and project; flag variances above 10%",
          "Review travel and accommodation expenditure against policy and project budgets",
          "Confirm depreciation on engineering equipment, vehicles, and office assets is posted",
          "Review and approve any unbudgeted expenditure above the delegated authority threshold",
          "Review if details in the accounting system are adequately documented (date, payee, invoice number, invoice amount, details, PV number)"
        ]
      },
      {
        "name": "Advances",
        "subCategories": [
          "Staff advances",
          "Director advances",
          "Staff advances",
          "Director advances",
          "Staff advances",
          "Project advances",
          "Project advances",
          "Project advances",
          "Project advances"
        ],
        "items": [
          "Review advances register; confirm all open balances per staff member",
          "Review advances register; confirm all open balances per staff member",
          "Follow up on all staff advances outstanding beyond the approved clearance period (30 days)",
          "Follow up on all staff advances outstanding beyond the approved clearance period (30 days)",
          "Confirm no new advance is issued to staff with an unretired prior advance",
          "Reconcile project mobilisation advances against costs incurred to date",
          "Confirm client advances received are correctly recorded as deferred income / liability",
          "Flag advances to subconsultants pending liquidation; obtain retirement documentation",
          "Confirm advances ledger balance agrees to balance sheet advances line"
        ]
      },
      {
        "name": "Receivables",
        "subCategories": [
          "Aged analysis",
          "Aged analysis",
          "Collections",
          "Collections",
          "Collections",
          "Credit risk",
          "Credit risk",
          "Reconciliation"
        ],
        "items": [
          "Generate aged receivables report; review all balances by client and project",
          "Identify invoices overdue by 30, 60, and 90+ days; escalate 90+ day items to management",
          "Issue payment reminders to clients with overdue invoices",
          "Follow up outstanding retainer and milestone payments with client contacts",
          "Post all cash receipts against open receivable items; confirm correct allocation by project",
          "Assess recoverability of aged receivables; raise or adjust bad debt provision where required",
          "Confirm disputed invoice items are documented and being actively resolved",
          "Reconcile receivables ledger total to balance sheet receivables line"
        ]
      },
      {
        "name": "Payables",
        "subCategories": [
          "Aged analysis",
          "Aged analysis",
          "Payments",
          "Payments",
          "Payments",
          "Statutory payables",
          "Statutory payables",
          "Reconciliation",
          "Reconciliation"
        ],
        "items": [
          "Generate aged payables report; review all balances by vendor",
          "Identify invoices due for payment this month; prepare payment run schedule",
          "Process approved payment run; confirm bank transfers are authorised per policy",
          "Confirm subconsultant payments are made per agreed milestones or payment schedules",
          "Reconcile supplier statements to the payables ledger for key vendors",
          "Confirm PAYE, NSSF, NHIF remittances are processed and receipts filed",
          "Confirm VAT and withholding tax on subconsultant/professional fees is correctly handled",
          "Reconcile payables ledger total to balance sheet payables line",
          "Review long-outstanding creditor balances for continued validity"
        ]
      },
      {
        "name": "Payroll & Staff Costs",
        "subCategories": [
          "Payroll processing",
          "Payroll processing",
          "Payroll processing",
          "Payroll processing",
          "Statutory deductions",
          "Statutory deductions",
          "Staff costs allocation",
          "Staff costs allocation",
          "Staff costs allocation"
        ],
        "items": [
          "Confirm approved headcount and any new starters, leavers, or salary changes for the month",
          "Process monthly payroll; cross-check gross pay to approved salary schedule",
          "Issue payslips to all staff",
          "Reconcile net pay to bank transfer total before release",
          "Confirm PAYE, NSSF, NHIF deductions are correctly computed and remitted",
          "File statutory remittance returns by due dates and retain payment receipts",
          "Allocate payroll costs to projects and cost centres per approved timesheet data",
          "Post employer pension and benefit contributions to the correct expense lines",
          "Reconcile total payroll cost per payroll report to the general ledger posting"
        ]
      },
      {
        "name": "Cash & Bank",
        "subCategories": [
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Petty cash",
          "Petty cash",
          "Petty cash",
          "Petty cash",
          "Cash management",
          "Cash management",
          "Cash management",
          "Cash management",
          "Cash forecasting",
          "Cash forecasting",
          "Cash forecasting"
        ],
        "items": [
          "Obtain month-end bank statements for all bank accounts",
          "Reconcile each bank account closing balance to the general ledger cash book balance",
          "List all outstanding deposits in transit at month-end; confirm expected clearance dates",
          "List all outstanding cheques and unpresented payments at month-end",
          "Investigate and resolve all reconciling items older than 30 days",
          "Confirm all bank charges, interest, and fees are posted in the cash book",
          "Review bank statement for any unusual or unauthorised transactions; escalate immediately",
          "Confirm no stale cheques (older than 6 months) remain uncleared on the reconciliation",
          "Perform physical petty cash count; confirm notes and coins tally with the cashbook",
          "Reconcile petty cash physical balance to the petty cash ledger",
          "Confirm all petty cash vouchers are approved, complete, and filed with supporting receipts",
          "Replenish petty cash to the approved float level; post replenishment journal",
          "Confirm all inter-bank transfers for the month are posted in both accounts and reconciled",
          "Review month-end cash position against minimum operating balance requirements",
          "Confirm client retainer receipts and milestone payments are posted to correct project accounts",
          "Prepare month-end actual cash flow statement (receipts and payments)",
          "Update rolling 3-month cash flow forecast with latest billing and cost data",
          "Identify any projected cash shortfalls; flag to management with proposed mitigations",
          "Confirm adequate cash is available for next payroll run and major payment obligations"
        ]
      },
      {
        "name": "Balance Sheet Integrity",
        "subCategories": [
          "Fixed assets",
          "Fixed assets",
          "Fixed assets",
          "Other BS items",
          "Other BS items",
          "Other BS items",
          "FX revaluation"
        ],
        "items": [
          "Update fixed asset register for any new engineering equipment, vehicles, or IT assets acquired",
          "Confirm monthly depreciation is posted for all asset categories",
          "Remove any fully depreciated or disposed assets from the register",
          "Confirm intercompany/inter-branch balances are reconciled and in agreement",
          "Verify deferred income balance reflects client advances and uninvoiced completed work",
          "Prepare and review the monthly trial balance; confirm it is in balance",
          "Have you revalued the FX assets"
        ]
      },
      {
        "name": "Tax & Regulatory Compliance",
        "subCategories": [
          "VAT",
          "VAT",
          "VAT",
          "VAT",
          "Withholding tax",
          "Withholding tax",
          "Other compliance",
          "Other compliance"
        ],
        "items": [
          "Reconcile output VAT on invoices raised and input VAT on approved supplier invoices",
          "Prepare and file monthly VAT return by statutory deadline",
          "Retain all VAT invoices and confirm they meet statutory requirements",
          "Deferred revenue declaration",
          "Confirm withholding tax deducted on professional fees and subconsultant payments",
          "File withholding tax return and remit deducted amounts by due date",
          "Review any upcoming regulatory or licensing renewal deadlines",
          "Confirm all staff operating licences and professional memberships are current"
        ]
      },
      {
        "name": "Budget & Forecasting",
        "subCategories": [
          "Budget vs actuals",
          "Budget vs actuals",
          "Budget vs actuals",
          "Pipeline"
        ],
        "items": [
          "Prepare monthly budget vs actuals report by department and project",
          "Document and explain all material variances to management",
          "Update full-year revenue and cost forecast based on current project pipeline",
          "Review business development pipeline; assess probability-weighted revenue for next 3 months"
        ]
      },
      {
        "name": "Management Reporting & Governance",
        "subCategories": [
          "Reports",
          "Reports",
          "Reports",
          "Governance",
          "Governance",
          "Governance",
          "Governance"
        ],
        "items": [
          "Prepare monthly management accounts pack (P&L, balance sheet, cash flow, project summary)",
          "Prepare project status dashboard — WIP, billings, collections, profitability by project",
          "Circulate management accounts to directors/partners within agreed reporting deadline",
          "Review and action any outstanding internal audit or management review findings",
          "Confirm all financial authorisations and delegated authority limits are being observed",
          "Update the financial risk register with any new risks identified this month",
          "File all month-end working papers and supporting documents per document retention policy"
        ]
      },
      {
        "name": "TZ Company",
        "subCategories": [
          "Outside investment",
          "Outside investment"
        ],
        "items": [
          "Do payments corroborate to the invoices provided",
          "Is the inter-company reconciliation signed"
        ]
      },
      {
        "name": "Archival & filing",
        "subCategories": [
          "Expenditure",
          "Cash & bank",
          "Contracts",
          "Staff files",
          "Management reports"
        ],
        "items": [
          "Confirm if you have you uploaded the signed PVs alongside invoices to the files",
          "Confirm if you have you uploaded the signed Bank recs and petty cash counts alongside invoices to the files",
          "Confirm if you have you uploaded the signed contracts to the files including rent agreements, client contracts etc",
          "Confirm if you have you uploaded the staff files and each staff file has ( a signed contract, contract matches the payroll, KRA PIN, NSSF, NHIF, Next of kin data)",
          "Confirm if you have you uploaded the signed managementto the files"
        ]
      }
    ]
  },
  {
    "id": "tpl-ultimate",
    "name": "Ultimate Monthly Checklist",
    "clientTypes": [
      "Ultimate"
    ],
    "sections": [
      {
        "name": "Revenue & Sales",
        "subCategories": [
          "Sales invoicing",
          "Sales invoicing",
          "Sales invoicing",
          "Sales invoicing",
          "Revenue recognition",
          "Revenue recognition",
          "Sales analysis",
          "Sales analysis",
          "Sales analysis"
        ],
        "items": [
          "Confirm all sales orders dispatched this month are invoiced",
          "Verify invoice values match approved price lists and customer contracts",
          "Confirm credit notes raised are authorised and correctly posted",
          "Reconcile total invoices issued to the dispatch/delivery register",
          "Confirm revenue is recognised on delivery or per contractual terms",
          "Post accruals for goods dispatched but not yet invoiced at month-end",
          "Prepare monthly sales report by product line and customer segment",
          "Compare actual sales volume and value to monthly budget; document variances",
          "Review sales returns and rejections; confirm quality/warranty costs are captured"
        ]
      },
      {
        "name": "Cost of Goods Sold & Production",
        "subCategories": [
          "Direct materials",
          "Direct materials",
          "Direct materials",
          "Direct labour",
          "Direct labour",
          "Manufacturing overhead",
          "Manufacturing overhead",
          "Manufacturing overhead",
          "COGS close",
          "COGS close"
        ],
        "items": [
          "Confirm all raw material issues to production are posted against correct jobs/batches",
          "Reconcile materials consumed to bills of materials (BOM) for production runs this month",
          "Investigate and document significant BOM usage variances",
          "Confirm production labour hours are recorded and allocated to jobs/cost centres",
          "Reconcile direct labour cost to payroll; confirm overtime is approved and posted",
          "Post monthly overhead absorption to production (machine time, floor space, utilities)",
          "Reconcile actual vs absorbed overhead; record over/under-absorption",
          "Confirm factory utility costs — electricity, water, maintenance — are posted",
          "Post cost of goods sold journal for units sold; match to revenue recognised",
          "Prepare gross margin report by product line; compare to standard margins"
        ]
      },
      {
        "name": "Inventory Management",
        "subCategories": [
          "Raw materials",
          "Raw materials",
          "Raw materials",
          "WIP",
          "WIP",
          "WIP",
          "Finished goods",
          "Finished goods",
          "Finished goods",
          "Inventory valuation"
        ],
        "items": [
          "Reconcile raw materials ledger to physical bin cards or warehouse system",
          "Review slow-moving or excess raw materials; flag for management action",
          "Confirm goods received notes (GRNs) are matched to supplier invoices and posted",
          "Update work-in-progress (WIP) for all jobs in production at month-end",
          "Reconcile WIP: opening balance + materials + labour + overhead − completed = closing WIP",
          "Identify and investigate WIP jobs with costs significantly above standard",
          "Perform or review perpetual inventory count for finished goods",
          "Reconcile finished goods ledger to physical warehouse count",
          "Identify slow-moving, obsolete, or damaged finished goods; assess write-down",
          "Confirm inventory is valued at the lower of cost and net realisable value (NRV)"
        ]
      },
      {
        "name": "Overheads & Operating Expenditure",
        "subCategories": [
          "Invoice processing",
          "Invoice processing",
          "Accruals & prepayments",
          "Accruals & prepayments",
          "Accruals & prepayments",
          "Cost control",
          "Cost control",
          "Depreciation"
        ],
        "items": [
          "Confirm all supplier invoices are coded, approved, and posted to the correct cost centre",
          "Confirm utilities, maintenance, and service contracts are invoiced and posted",
          "Post accruals for costs incurred but not yet invoiced",
          "Release prepayments proportionately; confirm remaining balances are valid",
          "Accrue factory rent, insurance, and lease payments not yet invoiced",
          "Compare actual overheads to budget by cost centre; flag variances above 10%",
          "Review maintenance and repair costs; confirm capital vs revenue split is correct",
          "Confirm monthly depreciation on plant, machinery, and factory equipment is posted"
        ]
      },
      {
        "name": "Advances",
        "subCategories": [
          "Staff advances",
          "Staff advances",
          "Staff advances",
          "Staff advances",
          "Supplier advances",
          "Supplier advances",
          "Supplier advances",
          "Reconciliation"
        ],
        "items": [
          "Review advances register; confirm all open balances per staff member",
          "Follow up on all advances outstanding beyond the approved clearance period",
          "Post retirement documents for advances liquidated this month",
          "Confirm no new advance is issued to staff with an unretired prior advance",
          "Reconcile advances to suppliers against purchase orders and delivery schedules",
          "Confirm supplier advances are recorded as prepayments on the balance sheet",
          "Follow up on supplier advances where goods/services are overdue for delivery",
          "Confirm advances ledger balance agrees to balance sheet advances line"
        ]
      },
      {
        "name": "Receivables",
        "subCategories": [
          "Aged analysis",
          "Aged analysis",
          "Collections",
          "Collections",
          "Collections",
          "Credit risk",
          "Credit risk",
          "Reconciliation"
        ],
        "items": [
          "Generate aged receivables report; review all balances by customer",
          "Identify invoices overdue by 30, 60, and 90+ days; escalate 90+ day items",
          "Issue payment reminders to customers with overdue invoices",
          "Post all cash receipts; confirm correct allocation to customer invoices",
          "Follow up on disputed invoices; document reason and expected resolution date",
          "Review credit limits for customers with growing or overdue balances",
          "Assess recoverability of aged balances; raise bad debt provision where required",
          "Reconcile receivables ledger total to balance sheet receivables line"
        ]
      },
      {
        "name": "Payables",
        "subCategories": [
          "Aged analysis",
          "Aged analysis",
          "Payments",
          "Payments",
          "Payments",
          "Statutory payables",
          "Statutory payables",
          "Reconciliation",
          "Reconciliation"
        ],
        "items": [
          "Generate aged payables report; review all balances by supplier",
          "Identify invoices due for payment this month; prepare payment run schedule",
          "Process approved payment run; confirm bank transfers are authorised per policy",
          "Confirm key supplier payments (raw materials, packaging) are made per agreed terms",
          "Reconcile supplier statements to the payables ledger for key vendors",
          "Confirm PAYE, NSSF, NHIF remittances are processed and receipts are filed",
          "Confirm VAT payable is calculated correctly on purchases and sales",
          "Reconcile payables ledger total to balance sheet payables line",
          "Review long-outstanding creditor balances for continued validity"
        ]
      },
      {
        "name": "Payroll & Staff Costs",
        "subCategories": [
          "Payroll processing",
          "Payroll processing",
          "Payroll processing",
          "Payroll processing",
          "Statutory deductions",
          "Statutory deductions",
          "Labour allocation",
          "Labour allocation"
        ],
        "items": [
          "Confirm approved headcount, new starters, leavers, and salary changes for the month",
          "Process monthly payroll for factory, warehouse, and office staff",
          "Reconcile gross pay to approved salary and wage schedule",
          "Issue payslips to all staff; confirm net pay agrees to bank transfer total",
          "Confirm PAYE, NSSF, NHIF deductions are correctly computed and remitted",
          "File statutory remittance returns by due dates and retain receipts",
          "Allocate direct labour costs to production jobs and cost centres",
          "Reconcile total payroll cost to the general ledger posting"
        ]
      },
      {
        "name": "Cash & Bank",
        "subCategories": [
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Bank reconciliation",
          "Petty cash",
          "Petty cash",
          "Petty cash",
          "Petty cash",
          "Cash management",
          "Cash management",
          "Cash management",
          "Cash management",
          "Cash forecasting",
          "Cash forecasting",
          "Cash forecasting"
        ],
        "items": [
          "Obtain month-end bank statements for all bank accounts",
          "Reconcile each bank account closing balance to the general ledger cash book balance",
          "Identify and list all outstanding deposits in transit at month-end",
          "Identify and list all outstanding cheques/payments not yet cleared",
          "Investigate and clear all reconciling items older than 30 days",
          "Confirm bank charges and interest debited are posted in the cash book",
          "Ensure no unusual or unauthorised transactions appear on the bank statement",
          "Perform physical petty cash count; confirm notes and coins tally with the cashbook",
          "Reconcile petty cash physical balance to the petty cash ledger",
          "Confirm all petty cash vouchers are approved, complete, and filed",
          "Replenish petty cash to the approved float level; post replenishment journal",
          "Confirm all inter-bank transfers are posted in both accounts and reconciled",
          "Review month-end cash position against minimum operating balance requirements",
          "Confirm no cheques have been presented but are older than 6 months (stale cheques)",
          "Prepare month-end cash flow statement (actual receipts and payments)",
          "Update rolling 3-month cash flow forecast with latest sales and cost data",
          "Identify any projected cash shortfalls; flag to management with proposed mitigations",
          "Confirm adequate cash is available for next payroll run and major payment obligations"
        ]
      },
      {
        "name": "Fixed Assets & Capital Expenditure",
        "subCategories": [
          "Fixed assets",
          "Fixed assets",
          "Fixed assets",
          "Capex review",
          "Capex review"
        ],
        "items": [
          "Update fixed asset register for any new plant, machinery, or equipment acquired",
          "Confirm assets disposed or written off are removed from the register",
          "Confirm monthly depreciation is posted for all asset categories",
          "Review capital expenditure against approved capex budget for the month",
          "Confirm all capex items are properly capitalised and not expensed"
        ]
      },
      {
        "name": "Tax & Regulatory Compliance",
        "subCategories": [
          "VAT",
          "VAT",
          "VAT",
          "Withholding tax",
          "Other compliance"
        ],
        "items": [
          "Reconcile output VAT on sales invoices and input VAT on approved purchase invoices",
          "Prepare and file monthly VAT return by statutory deadline",
          "Confirm VAT on imports and customs duties is correctly accounted for",
          "Confirm withholding tax on professional fees and relevant payments is deducted and remitted",
          "Review any upcoming regulatory, environmental, or licensing compliance deadlines"
        ]
      },
      {
        "name": "Budget Management",
        "subCategories": [
          "Budget vs actuals",
          "Budget vs actuals",
          "Budget vs actuals",
          "Working capital"
        ],
        "items": [
          "Prepare monthly budget vs actuals report — revenue, COGS, overheads, and EBITDA",
          "Document and present all material budget variances to management",
          "Update full-year production volume and revenue forecast",
          "Review working capital position — inventory days, debtor days, creditor days"
        ]
      },
      {
        "name": "Management Reporting & Governance",
        "subCategories": [
          "Reports",
          "Reports",
          "Reports",
          "Reports",
          "Governance",
          "Governance",
          "Governance"
        ],
        "items": [
          "Prepare monthly management accounts — P&L, balance sheet, and cash flow",
          "Prepare production KPI report — output, yield, scrap rate, unit cost",
          "Prepare gross margin analysis by product line",
          "Circulate management accounts to directors within agreed reporting deadline",
          "Review and action any outstanding internal control findings",
          "Confirm all financial authorisations and approval limits are being observed",
          "File all month-end working papers and supporting documents per retention policy"
        ]
      }
    ]
  },
  {
    "id": "tpl-general",
    "name": "General Monthly Checklist",
    "clientTypes": [
      "Multiplier"
    ],
    "sections": [
      {
        "name": "Billing & Revenue",
        "subCategories": [
          "Invoicing",
          "Revenue recognition",
          "Revenue recognition"
        ],
        "items": [
          "Raise and dispatch all invoices for the month",
          "Post all revenue to the correct ledger accounts",
          "Reconcile revenue to collections and bank"
        ]
      },
      {
        "name": "Cash & Bank",
        "subCategories": [
          "Bank reconciliation",
          "Petty cash"
        ],
        "items": [
          "Prepare and sign off monthly bank reconciliation",
          "Reconcile petty cash and replenish float"
        ]
      },
      {
        "name": "Payables & Receivables",
        "subCategories": [
          "Creditors",
          "Debtors"
        ],
        "items": [
          "Prepare creditors aging and process approved payment run",
          "Prepare debtors aging and follow up on overdue accounts"
        ]
      },
      {
        "name": "Payroll & Tax",
        "subCategories": [
          "Payroll",
          "PAYE",
          "VAT"
        ],
        "items": [
          "Process and approve payroll",
          "File PAYE returns by the 9th",
          "File VAT return by the 20th"
        ]
      },
      {
        "name": "Reporting",
        "subCategories": [
          "Management accounts"
        ],
        "items": [
          "Prepare month-end management accounts and circulate to management"
        ]
      }
    ]
  }
];

// ── State ─────────────────────────────────────────────────────────
let monthlyChecklists = [];
let clActiveView = "list";   // "list" | "detail"
let clActiveId = null;       // active checklist id
let clActiveTab = "checklist"; // "checklist" | "summary"
let clFilterClient = "all";
let clFilterMonth = "all";

// ── Persistence ───────────────────────────────────────────────────
function loadChecklists() {
  try {
    const saved = JSON.parse(localStorage.getItem(clStorageKey) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

function persistChecklists() {
  localStorage.setItem(clStorageKey, JSON.stringify(monthlyChecklists));
}

async function loadChecklistsFromDB() {
  try {
    const { data, error } = await supabase.from("monthly_checklists").select("*");
    if (!error && data) {
      if (data.length > 0) {
        monthlyChecklists = data.map(row => (typeof row.data === "string" ? JSON.parse(row.data) : row.data));
        persistChecklists();
      } else {
        monthlyChecklists = loadChecklists();
      }
      renderChecklists();
    } else {
      if (error) {
        console.warn("[BlackRose DB] Load checklists error:", error.message || error);
      }
      monthlyChecklists = loadChecklists();
      renderChecklists();
    }
  } catch (e) {
    console.warn("[BlackRose DB] Load checklists exception:", e);
    monthlyChecklists = loadChecklists();
    renderChecklists();
  }
}

async function saveChecklistToDB(cl) {
  try {
    const { error } = await supabase.from("monthly_checklists").upsert([{ id: cl.id, data: JSON.stringify(cl) }]);
    if (error) {
      console.error("[BlackRose DB] Save checklist error:", error.message || error);
    } else {
      console.log("[BlackRose DB] Saved checklist to Supabase:", cl.id);
    }
  } catch (e) {
    console.error("[BlackRose DB] Save checklist exception:", e);
  }
}

async function deleteChecklistFromDB(id) {
  try {
    const { error } = await supabase.from("monthly_checklists").delete().eq("id", id);
    if (error) {
      console.error("[BlackRose DB] Delete checklist error:", error.message || error);
    }
  } catch (e) {
    console.error("[BlackRose DB] Delete checklist exception:", e);
  }
}

function initChecklistRealtime() {
  try {
    supabase
      .channel("monthly_checklists_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "monthly_checklists" },
        (payload) => {
          console.log("[BlackRose DB] Realtime event on monthly_checklists:", payload);
          loadChecklistsFromDB();
        }
      )
      .subscribe();
  } catch (e) {
    console.warn("[BlackRose DB] Realtime subscription error:", e);
  }
}

// ── Template helper ───────────────────────────────────────────────
function clCreateFromTemplate(client, monthLabel, templateId) {
  let tpl = null;
  if (templateId) {
    tpl = CL_TEMPLATES.find(t => t.id === templateId);
  }
  if (!tpl && client) {
    const clientLower = client.trim().toLowerCase();
    tpl = CL_TEMPLATES.find(t => t.clientTypes.some(ct => ct.toLowerCase() === clientLower || clientLower.includes(ct.toLowerCase())));
  }
  if (!tpl) {
    tpl = CL_TEMPLATES.find(t => t.id === "tpl-general") || CL_TEMPLATES[0];
  }
  const id = createId();
  const sections = tpl.sections.map((s, si) => ({
    id: createId(),
    name: s.name,
    color: CL_SECTION_COLORS[si % CL_SECTION_COLORS.length],
    collapsed: false,
    items: s.items.map((text, ii) => ({
      id: createId(),
      text,
      subCategory: s.subCategories ? (s.subCategories[ii] || "") : "",
      status: "pending",
      completedBy: null, completedAt: null,
      hodStatus: "pending",
      hodConfirmedBy: null, hodConfirmedAt: null,
      notes: ""
    }))
  }));
  return { id, client, month: monthLabel, templateId: tpl.id, templateName: tpl.name, sections, createdAt: new Date().toISOString(), createdBy: activeProfileId };
}

function clDuplicateToNextMonth(cl) {
  const [yr, mo] = cl.month.split("-").map(Number);
  const next = new Date(yr, mo, 1);
  const nextLabel = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  const exists = monthlyChecklists.some(c => c.client === cl.client && c.month === nextLabel);
  if (exists) { alert(`A checklist for ${cl.client} — ${nextLabel} already exists.`); return; }
  const newCl = {
    ...clCreateFromTemplate(cl.client, nextLabel, cl.templateId),
    sections: cl.sections.map(s => ({
      ...s,
      id: createId(),
      items: s.items.map(item => ({
        ...item,
        id: createId(),
        status: "pending", completedBy: null, completedAt: null,
        hodStatus: "pending", hodConfirmedBy: null, hodConfirmedAt: null,
        notes: ""
      }))
    }))
  };
  monthlyChecklists.push(newCl);
  persistChecklists();
  saveChecklistToDB(newCl);
  alert(`Checklist copied to ${nextLabel} successfully!`);
  openChecklistDetail(newCl.id);
}

// ── Utility: month label → display ───────────────────────────────
function clFormatMonth(monthStr) {
  if (!monthStr || monthStr === "all") return "All Months";
  const [yr, mo] = monthStr.split("-");
  return new Date(+yr, +mo - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function clCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ── Main render dispatcher ────────────────────────────────────────
function renderChecklists() {
  const view = document.getElementById("checklistView");
  if (!view || view.hidden) return;
  populateClFilters();
  if (clActiveView === "list") {
    document.getElementById("clListView").hidden = false;
    document.getElementById("clDetailView").hidden = true;
    renderChecklistList();
  } else {
    document.getElementById("clListView").hidden = true;
    document.getElementById("clDetailView").hidden = false;
    renderChecklistDetail(clActiveId);
  }
}

// ── Filter helpers ────────────────────────────────────────────────
function populateClFilters() {
  // Client filter
  const cSel = document.getElementById("clClientFilter");
  const curC = cSel.value;
  const clClients = [...new Set(monthlyChecklists.map(c => c.client))].sort();
  cSel.innerHTML = `<option value="all">All Clients</option>` +
    clients.filter(c => c !== "All clients").map(c => `<option value="${c}">${c}</option>`).join("");
  cSel.value = clClients.includes(curC) ? curC : "all";

  // Month filter
  const mSel = document.getElementById("clMonthFilter");
  const curM = mSel.value;
  const months = [...new Set(monthlyChecklists.map(c => c.month))].sort().reverse();
  mSel.innerHTML = `<option value="all">All Months</option>` +
    months.map(m => `<option value="${m}">${clFormatMonth(m)}</option>`).join("");
  if (months.includes(curM)) mSel.value = curM;
}

// ── List view ─────────────────────────────────────────────────────
function renderChecklistList() {
  const grid = document.getElementById("clCardsGrid");
  let filtered = monthlyChecklists;
  if (clFilterClient !== "all") filtered = filtered.filter(c => c.client === clFilterClient);
  if (clFilterMonth !== "all") filtered = filtered.filter(c => c.month === clFilterMonth);
  filtered = filtered.slice().sort((a, b) => b.month.localeCompare(a.month) || a.client.localeCompare(b.client));

  if (!filtered.length) {
    grid.innerHTML = `<div class="cl-empty-state">
      <div class="cl-empty-icon">📋</div>
      <h3>No checklists yet</h3>
      <p>Click <strong>+ New Checklist</strong> to create one from a template.</p>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(cl => {
    const allItems = cl.sections.flatMap(s => s.items);
    const total = allItems.length;
    const done = allItems.filter(i => i.status === "complete").length;
    const hod = allItems.filter(i => i.hodStatus === "confirmed").length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const circumference = 2 * Math.PI * 22;
    // Determine ring offset and color class so 0% still shows a small red arc
    let ringOffset;
    let ringClass = "";
    if (pct === 0) {
      ringClass = "danger"; // red small arc
      ringOffset = circumference - 6; // show a small hint arc
    } else {
      ringOffset = circumference - (pct / 100) * circumference;
      if (pct < 50) ringClass = "warn"; // amber/gold for partial
      else ringClass = "ok"; // green for healthy
    }

    return `<div class="cl-card" data-cl-id="${cl.id}">
      <div class="cl-card-top">
        <div class="cl-card-info">
          <div class="cl-card-client">${escapeHtml(cl.client)}</div>
          <div class="cl-card-month">${clFormatMonth(cl.month)}</div>
          <div class="cl-card-template">${escapeHtml(cl.templateName || "")}</div>
        </div>
        <div class="cl-ring-wrap">
          <svg width="56" height="56" viewBox="0 0 56 56">
            <circle class="cl-ring-bg" cx="28" cy="28" r="22"/>
            <circle class="cl-ring-fill ${ringClass}" cx="28" cy="28" r="22"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${ringOffset}"/>
          </svg>
          <div class="cl-ring-label">${pct}%</div>
        </div>
      </div>
      <div class="cl-card-stats">
        <span class="cl-stat-chip done">✓ ${done} done</span>
        <span class="cl-stat-chip pending">⏳ ${total - done} pending</span>
        ${hod ? `<span class="cl-stat-chip hod">★ ${hod} HOD</span>` : ""}
      </div>
      <div class="cl-card-footer">
        <span>${cl.sections.length} sections · ${total} items</span>
        <button class="cl-card-open-btn" data-cl-id="${cl.id}">Open →</button>
      </div>
    </div>`;
  }).join("");

  grid.querySelectorAll(".cl-card, .cl-card-open-btn").forEach(el => {
    el.addEventListener("click", () => openChecklistDetail(el.closest("[data-cl-id]").dataset.clId));
  });
}

function openChecklistDetail(id) {
  clActiveId = id;
  clActiveView = "detail";
  clActiveTab = "checklist";
  renderChecklists();
}

// ── Detail view ───────────────────────────────────────────────────
function renderChecklistDetail(id) {
  const cl = monthlyChecklists.find(c => c.id === id);
  if (!cl) { clActiveView = "list"; renderChecklists(); return; }

  document.getElementById("clDetailTitle").textContent = `${cl.client} — ${clFormatMonth(cl.month)}`;
  document.getElementById("clDetailHeading").textContent = `${cl.client}`;
  document.getElementById("clDetailSubheading").textContent = `${clFormatMonth(cl.month)} · ${cl.templateName}`;

  // Inner tab state
  document.querySelectorAll(".cl-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.clTab === clActiveTab);
  });
  document.getElementById("clItemsTab").hidden = clActiveTab !== "checklist";
  document.getElementById("clSummaryTab").hidden = clActiveTab !== "summary";

  if (clActiveTab === "checklist") renderChecklistItems(cl);
  else renderChecklistSummary(cl);
}

// ── Items view ────────────────────────────────────────────────────
function renderChecklistItems(cl) {
  const container = document.getElementById("clSectionsContainer");
  container.innerHTML = cl.sections.map((section, si) => {
    const total = section.items.length;
    const done = section.items.filter(i => i.status === "complete").length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return `
    <div class="cl-section" data-section-id="${section.id}">
      <div class="cl-section-header">
        <span class="cl-section-color-dot" style="background:${section.color}"></span>
        <span class="cl-section-name" data-rename="${section.id}">${escapeHtml(section.name)}</span>
        <span class="cl-section-meta">
          <span>${done}/${total}</span>
          <span class="cl-section-progress-text">${pct}%</span>
        </span>
        <button class="cl-section-collapse-btn ${section.collapsed ? "collapsed" : ""}" data-collapse="${section.id}" title="Collapse">▾</button>
        <button class="cl-section-delete-btn" data-del-section="${section.id}" title="Delete section">✕</button>
      </div>
      ${section.collapsed ? "" : `
      <div class="cl-items-body" data-items-body="${section.id}">
        ${section.items.map((item, ii) => renderClItemRow(item, ii + 1, section.id)).join("")}
        <div class="cl-add-item-row">
          <input class="cl-add-item-input" type="text" placeholder="Add a new checklist item…" data-add-input="${section.id}" />
          <button class="cl-add-item-btn" data-add-item="${section.id}">+ Add</button>
        </div>
      </div>`}
    </div>`;
  }).join("");

  bindChecklistItemEvents(cl);
}

function renderClItemRow(item, num, sectionId) {
  const isComplete = item.status === "complete";
  const isHod = item.hodStatus === "confirmed";
  const completedByName = item.completedBy ? (getProfile(item.completedBy)?.name || "—") : "";
  const completedAt = item.completedAt ? new Date(item.completedAt).toLocaleDateString("en-GB", { day:"numeric", month:"short" }) : "";
  const hodByName = item.hodConfirmedBy ? (getProfile(item.hodConfirmedBy)?.name || "—") : "";

  return `<div class="cl-item-row ${isComplete ? "item-complete" : ""}" data-item-id="${item.id}" data-section-id="${sectionId}">
    <span class="cl-item-num">${num}</span>
    <div class="cl-item-text-wrap">
      <div class="cl-item-text ${isComplete ? "complete-text" : ""}">${escapeHtml(item.text)}</div>
      ${item.subCategory ? `<div class="cl-item-subcategory">${escapeHtml(item.subCategory)}</div>` : ""}
      ${item.notes ? `<div class="cl-item-subcategory" style="color:var(--primary);margin-top:2px;">📝 ${escapeHtml(item.notes)}</div>` : ""}
    </div>
    <div class="cl-item-meta">
      ${completedByName ? `<span>${completedByName}</span><span>${completedAt}</span>` : ""}
      ${isHod && hodByName ? `<span style="color:var(--primary)">★ ${hodByName}</span>` : ""}
    </div>
    <button class="cl-status-btn ${isComplete ? "complete" : ""}" data-toggle-status="${item.id}" data-section-id="${sectionId}">
      ${isComplete ? "✓ Complete" : "Pending"}
    </button>
    <button class="cl-hod-btn ${isHod ? "confirmed" : ""}" data-toggle-hod="${item.id}" data-section-id="${sectionId}" title="HOD Confirmation">
      ${isHod ? "★ HOD ✓" : "HOD"}
    </button>
    <div class="cl-item-actions">
      <button class="cl-item-del-btn" data-del-item="${item.id}" data-section-id="${sectionId}" title="Delete item">✕</button>
      <button class="cl-item-del-btn" data-notes-item="${item.id}" data-section-id="${sectionId}" title="Add note" style="font-size:0.9rem;">📝</button>
    </div>
  </div>`;
}

function bindChecklistItemEvents(cl) {
  const container = document.getElementById("clSectionsContainer");

  // Status toggle
  container.querySelectorAll("[data-toggle-status]").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = clFindItem(cl, btn.dataset.sectionId, btn.dataset.toggleStatus);
      if (!item) return;
      item.status = item.status === "complete" ? "pending" : "complete";
      item.completedBy = item.status === "complete" ? (activeProfileId || null) : null;
      item.completedAt = item.status === "complete" ? new Date().toISOString() : null;
      persistChecklists(); saveChecklistToDB(cl);
      renderChecklistDetail(cl.id);
    });
  });

  // HOD toggle
  container.querySelectorAll("[data-toggle-hod]").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = clFindItem(cl, btn.dataset.sectionId, btn.dataset.toggleHod);
      if (!item) return;
      item.hodStatus = item.hodStatus === "confirmed" ? "pending" : "confirmed";
      item.hodConfirmedBy = item.hodStatus === "confirmed" ? (activeProfileId || null) : null;
      item.hodConfirmedAt = item.hodStatus === "confirmed" ? new Date().toISOString() : null;
      persistChecklists(); saveChecklistToDB(cl);
      renderChecklistDetail(cl.id);
    });
  });

  // Delete item
  container.querySelectorAll("[data-del-item]").forEach(btn => {
    btn.addEventListener("click", () => {
      const sec = cl.sections.find(s => s.id === btn.dataset.sectionId);
      if (!sec) return;
      if (!confirm("Delete this checklist item?")) return;
      sec.items = sec.items.filter(i => i.id !== btn.dataset.delItem);
      persistChecklists(); saveChecklistToDB(cl);
      renderChecklistDetail(cl.id);
    });
  });

  // Notes toggle
  container.querySelectorAll("[data-notes-item]").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = clFindItem(cl, btn.dataset.sectionId, btn.dataset.notesItem);
      if (!item) return;
      const note = prompt("Add/edit note for this item:", item.notes || "");
      if (note === null) return;
      item.notes = note.trim();
      persistChecklists(); saveChecklistToDB(cl);
      renderChecklistDetail(cl.id);
    });
  });

  // Collapse section
  container.querySelectorAll("[data-collapse]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const sec = cl.sections.find(s => s.id === btn.dataset.collapse);
      if (sec) { sec.collapsed = !sec.collapsed; persistChecklists(); renderChecklistDetail(cl.id); }
    });
  });

  // Rename section (double-click)
  container.querySelectorAll("[data-rename]").forEach(span => {
    span.addEventListener("dblclick", () => {
      const sec = cl.sections.find(s => s.id === span.dataset.rename);
      if (!sec) return;
      const inp = document.createElement("input");
      inp.className = "cl-section-name-input";
      inp.value = sec.name;
      span.replaceWith(inp);
      inp.focus();
      inp.addEventListener("blur", () => {
        sec.name = inp.value.trim() || sec.name;
        persistChecklists(); saveChecklistToDB(cl); renderChecklistDetail(cl.id);
      });
      inp.addEventListener("keydown", e => { if (e.key === "Enter") inp.blur(); });
    });
  });

  // Delete section
  container.querySelectorAll("[data-del-section]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      if (!confirm("Delete this entire section and all its items?")) return;
      cl.sections = cl.sections.filter(s => s.id !== btn.dataset.delSection);
      persistChecklists(); saveChecklistToDB(cl); renderChecklistDetail(cl.id);
    });
  });

  // Add item (+ button)
  container.querySelectorAll("[data-add-item]").forEach(btn => {
    btn.addEventListener("click", () => {
      const sectionId = btn.dataset.addItem;
      const input = container.querySelector(`[data-add-input="${sectionId}"]`);
      const text = input ? input.value.trim() : "";
      if (!text) return;
      const sec = cl.sections.find(s => s.id === sectionId);
      if (!sec) return;
      sec.items.push({ id: createId(), text, subCategory: "", status: "pending", completedBy: null, completedAt: null, hodStatus: "pending", hodConfirmedBy: null, hodConfirmedAt: null, notes: "" });
      persistChecklists(); saveChecklistToDB(cl); renderChecklistDetail(cl.id);
    });
  });

  // Add item on Enter key
  container.querySelectorAll("[data-add-input]").forEach(input => {
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") container.querySelector(`[data-add-item="${input.dataset.addInput}"]`)?.click();
    });
  });
}

function clFindItem(cl, sectionId, itemId) {
  const sec = cl.sections.find(s => s.id === sectionId);
  return sec ? sec.items.find(i => i.id === itemId) : null;
}

// ── Summary view ──────────────────────────────────────────────────
function renderChecklistSummary(cl) {
  const allItems = cl.sections.flatMap(s => s.items);
  const grandTotal = allItems.length;
  const grandDone = allItems.filter(i => i.status === "complete").length;
  const grandHod = allItems.filter(i => i.hodStatus === "confirmed").length;
  const grandPct = grandTotal ? Math.round((grandDone / grandTotal) * 100) : 0;
  const grandHodPct = grandTotal ? Math.round((grandHod / grandTotal) * 100) : 0;

  document.getElementById("clSummaryMonth").textContent = clFormatMonth(cl.month);
  document.getElementById("clSummaryClient").textContent = cl.client;

  document.getElementById("clSummaryTotals").innerHTML = `
    <div class="cl-total-chip"><span class="num">${grandTotal}</span><span class="lbl">Total Items</span></div>
    <div class="cl-total-chip done"><span class="num">${grandDone}</span><span class="lbl">Complete</span></div>
    <div class="cl-total-chip pending"><span class="num">${grandTotal - grandDone}</span><span class="lbl">Pending</span></div>
    <div class="cl-total-chip hod"><span class="num">${grandHod}</span><span class="lbl">HOD Confirmed</span></div>
    <div class="cl-total-chip"><span class="num">${grandPct}%</span><span class="lbl">Progress</span></div>
  `;

  const subCatCounts = (items) => {
    const map = {};
    items.forEach(i => { const k = i.subCategory || "—"; if (!map[k]) map[k] = 0; map[k]++; });
    return Object.keys(map).length;
  };

  const tbody = document.getElementById("clSummaryBody");
  tbody.innerHTML = cl.sections.map((sec, si) => {
    const total = sec.items.length;
    const done = sec.items.filter(i => i.status === "complete").length;
    const hod = sec.items.filter(i => i.hodStatus === "confirmed").length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const hodPct = total ? Math.round((hod / total) * 100) : 0;
    const subCats = subCatCounts(sec.items);
    const rowCls = CL_ROW_CLASSES[si % CL_ROW_CLASSES.length];

    return `<tr class="${rowCls}">
      <td>${escapeHtml(sec.name)}</td>
      <td>${subCats}</td>
      <td>${total}</td>
      <td class="${done ? "cl-val-done" : "cl-val-zero"}">${done}</td>
      <td class="${total - done ? "cl-val-pending" : "cl-val-zero"}">${total - done}</td>
      <td>
        <div class="cl-mini-bar-wrap">
          <div class="cl-mini-bar-track"><div class="cl-mini-bar-fill" style="width:${pct}%"></div></div>
          <span class="cl-mini-bar-pct">${pct}%</span>
        </div>
      </td>
      <td class="${hod ? "cl-val-hod" : "cl-val-zero"}">${hod}</td>
      <td class="${total - hod ? "cl-val-pending" : "cl-val-zero"}">${total - hod}</td>
      <td>
        <div class="cl-mini-bar-wrap">
          <div class="cl-mini-bar-track"><div class="cl-mini-bar-fill hod-bar" style="width:${hodPct}%"></div></div>
          <span class="cl-mini-bar-pct">${hodPct}%</span>
        </div>
      </td>
    </tr>`;
  }).join("");

  document.getElementById("clSummaryFoot").innerHTML = `<tr>
    <td>TOTAL</td>
    <td></td>
    <td>${grandTotal}</td>
    <td>${grandDone}</td>
    <td>${grandTotal - grandDone}</td>
    <td>
      <div class="cl-mini-bar-wrap">
        <div class="cl-mini-bar-track"><div class="cl-mini-bar-fill" style="width:${grandPct}%;background:#fff"></div></div>
        <span class="cl-mini-bar-pct" style="color:inherit">${grandPct}%</span>
      </div>
    </td>
    <td>${grandHod}</td>
    <td>${grandTotal - grandHod}</td>
    <td>
      <div class="cl-mini-bar-wrap">
        <div class="cl-mini-bar-track"><div class="cl-mini-bar-fill hod-bar" style="width:${grandHodPct}%;background:#fff"></div></div>
        <span class="cl-mini-bar-pct" style="color:inherit">${grandHodPct}%</span>
      </div>
    </td>
  </tr>`;
}

// ── Add Section ───────────────────────────────────────────────────
function clAddSection(cl) {
  const name = prompt("Section name:");
  if (!name || !name.trim()) return;
  cl.sections.push({
    id: createId(),
    name: name.trim(),
    color: CL_SECTION_COLORS[cl.sections.length % CL_SECTION_COLORS.length],
    collapsed: false,
    items: []
  });
  persistChecklists(); saveChecklistToDB(cl); renderChecklistDetail(cl.id);
}

// ── New Checklist modal ───────────────────────────────────────────
function openNewChecklistModal() {
  const existing = document.getElementById("cl-new-modal-overlay");
  if (existing) existing.remove();

  const now = clCurrentMonth();
  const clientOpts = clients.filter(c => c !== "All clients").map(c => `<option value="${c}">${c}</option>`).join("");

  const overlay = document.createElement("div");
  overlay.className = "cl-new-modal-overlay";
  overlay.id = "cl-new-modal-overlay";
  overlay.innerHTML = `
    <div class="cl-new-modal">
      <h3>📋 New Monthly Checklist</h3>
      <div class="cl-modal-field">
        <label class="cl-modal-label">Company</label>
        <select class="cl-modal-select" id="clNewClient">${clientOpts}</select>
      </div>
      <div class="cl-modal-field">
        <label class="cl-modal-label">Month</label>
        <input class="cl-modal-input" type="month" id="clNewMonth" value="${now}" />
      </div>
      <div class="cl-modal-field" style="margin-top: 0.5rem;">
        <div id="clTemplateInfoBadge" style="background: var(--bg-surface-2, rgba(255,255,255,0.06)); padding: 0.6rem 0.8rem; border-radius: 6px; border: 1px solid var(--border-color, rgba(255,255,255,0.1)); font-size: 0.85rem; color: var(--text-secondary, #aaa);">
        </div>
      </div>
      <p id="clNewError" style="color:var(--red);font-size:0.82rem;margin:0.5rem 0 0;display:none;">A checklist for this company and month already exists.</p>
      <div class="cl-modal-actions">
        <button class="outline-button compact-button" id="clNewCancel">Cancel</button>
        <button class="primary-button compact-button" id="clNewCreate">Create Checklist</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const clientSel = overlay.querySelector("#clNewClient");
  const badgeEl = overlay.querySelector("#clTemplateInfoBadge");

  function updateTemplateBadge() {
    const client = clientSel.value;
    const clientLower = client.trim().toLowerCase();
    const best = CL_TEMPLATES.find(t => t.clientTypes.some(ct => ct.toLowerCase() === clientLower || clientLower.includes(ct.toLowerCase()))) || CL_TEMPLATES.find(t => t.id === "tpl-general");
    const totalItems = best.sections.reduce((acc, s) => acc + s.items.length, 0);
    badgeEl.innerHTML = `<span style="font-weight:600; color:var(--text-main, #fff);">Auto-assigned Template:</span> ${escapeHtml(best.name)} <span style="font-size:0.8rem; opacity:0.8;">(${best.sections.length} sections, ${totalItems} tasks)</span>`;
  }

  clientSel.addEventListener("change", updateTemplateBadge);
  updateTemplateBadge();

  overlay.querySelector("#clNewCancel").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#clNewCreate").addEventListener("click", () => {
    const client = clientSel.value;
    const month = overlay.querySelector("#clNewMonth").value;
    const errEl = overlay.querySelector("#clNewError");
    if (monthlyChecklists.some(c => c.client === client && c.month === month)) {
      errEl.style.display = "block"; return;
    }
    const cl = clCreateFromTemplate(client, month);
    monthlyChecklists.push(cl);
    persistChecklists();
    saveChecklistToDB(cl);
    overlay.remove();
    openChecklistDetail(cl.id);
  });
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
}

// ── Checklist event wiring ────────────────────────────────────────
document.getElementById("newChecklistBtn").addEventListener("click", openNewChecklistModal);

document.getElementById("clBackBtn").addEventListener("click", () => {
  clActiveView = "list"; renderChecklists();
});

document.getElementById("clClientFilter").addEventListener("change", e => {
  clFilterClient = e.target.value; renderChecklistList();
});

document.getElementById("clMonthFilter").addEventListener("change", e => {
  clFilterMonth = e.target.value; renderChecklistList();
});

document.querySelectorAll(".cl-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    clActiveTab = btn.dataset.clTab;
    document.querySelectorAll(".cl-tab").forEach(b => b.classList.toggle("active", b === btn));
    const cl = monthlyChecklists.find(c => c.id === clActiveId);
    if (!cl) return;
    document.getElementById("clItemsTab").hidden = clActiveTab !== "checklist";
    document.getElementById("clSummaryTab").hidden = clActiveTab !== "summary";
    if (clActiveTab === "checklist") renderChecklistItems(cl);
    else renderChecklistSummary(cl);
  });
});

document.getElementById("clAddSectionBtn").addEventListener("click", () => {
  const cl = monthlyChecklists.find(c => c.id === clActiveId);
  if (cl) clAddSection(cl);
});

document.getElementById("clDuplicateBtn").addEventListener("click", () => {
  const cl = monthlyChecklists.find(c => c.id === clActiveId);
  if (cl) clDuplicateToNextMonth(cl);
});

document.getElementById("clPrintBtn").addEventListener("click", () => {
  window.print();
});

document.getElementById("clDeleteChecklistBtn").addEventListener("click", () => {
  const cl = monthlyChecklists.find(c => c.id === clActiveId);
  if (!cl) return;
  if (!confirm(`Delete the checklist for ${cl.client} — ${clFormatMonth(cl.month)}? This cannot be undone.`)) return;
  monthlyChecklists = monthlyChecklists.filter(c => c.id !== clActiveId);
  persistChecklists();
  deleteChecklistFromDB(clActiveId);
  clActiveView = "list"; clActiveId = null;
  renderChecklists();
});

// ── Load checklists on startup ────────────────────────────────────
monthlyChecklists = loadChecklists();

})(); // end IIFE

