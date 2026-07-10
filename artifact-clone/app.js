const clients = ["All clients", "AMM Law", "BRC Consultancy", "Briq Consultancy", "Multiplier", "Ultimate", "ADH"];
const today = new Date("2026-07-10T08:00:00");
const storageKey = "gregu-client-tasks";
const profileStorageKey = "blackrose-profiles";
const sessionStorageKey = "blackrose-active-profile";
const defaultProfiles = [
  { id: "diane-marie", name: "Diane Marie", details: "Black Rose team member", image: "./assets/diane marie.jpeg" },
  { id: "greg", name: "Greg", details: "Black Rose team member", image: "./assets/greg.jpeg" },
  { id: "mercy", name: "Mercy", details: "Black Rose team member", image: "./assets/mercy.jpeg" },
  { id: "wangui-muchiri", name: "Wangui Muchiri", details: "Black Rose team member", image: "./assets/wangui muchiri.jpeg" },
  { id: "shadrack", name: "Shadrack", details: "Black Rose team member", image: "./assets/Shadrack.jpeg" },
  { id: "carol-nduta", name: "Carol Nduta", details: "Black Rose team member", image: "" },
];

let selectedClient = "All clients";
let profiles = loadProfiles();
let activeProfileId = localStorage.getItem(sessionStorageKey) || "";
let assignmentFilter = "all";
let activeView = "tasks";
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

let tasks = [
  {
    id: createId(),
    client: "BRC Consultancy",
    title: "Check Payment Vouchers and see if the specific receipts are attached.(Then approve them)",
    details:
      "Ensure that every Payment Voucher has the relevant supporting receipt attached. Where a receipt is not available at the time of payment, the transaction should be processed and recorded as an Advance Voucher until the supporting documentation is provided.",
    due: "2026-07-09T10:00",
    repeat: "",
    status: "open",
  },
  {
    id: createId(),
    client: "BRC Consultancy",
    title: "Monthly Vat Reconciliation",
    details: "Check sales as per Itax to sales as per ledger. Additionally check what has been booked as VAT liability on the QBs",
    due: "2026-07-09T12:00",
    repeat: "monthly",
    status: "open",
  },
  {
    id: createId(),
    client: "BRC Consultancy",
    title: "Generate AR & AP on a monthly basis and deal",
    details:
      "Generate the Accounts Receivable (AR) and Accounts Payable (AP) reports on a monthly basis and review them with Mercy, highlighting any outstanding balances, discrepancies, or items requiring follow-up.",
    due: "2026-07-09T13:00",
    repeat: "monthly",
    status: "open",
  },
  {
    id: createId(),
    client: "BRC Consultancy",
    title: "Regular weekly bookkeeping (Upload docs on QBs)",
    details:
      "Pull the bank statements on a weekly basis and provide them to Shadrack for bookkeeping. Review the entries posted to ensure all transactions are recorded accurately and promptly identify and correct any errors or discrepancies.",
    due: "2026-07-10T09:00",
    repeat: "",
    status: "open",
  },
  {
    id: createId(),
    client: "BRC Consultancy",
    title: "Check that accrual basis is held constant.",
    details:
      "Use a Bill when there is a supplier invoice and payment will be made later (credit purchase). Use an Expense when payment is made immediately and no supplier balance remains outstanding.",
    due: "2026-07-10T11:00",
    repeat: "monthly",
    status: "open",
  },
  {
    id: createId(),
    client: "BRC Consultancy",
    title: "Perform OB Tests",
    details: "Check the OB test that is the Accounts to the 2026 Opening TB",
    due: "2026-07-11T09:00",
    repeat: "monthly",
    status: "open",
  },
  {
    id: createId(),
    client: "BRC Consultancy",
    title: "Raising of etims invoices promptly as soon as the QB Invoicing is out monthly",
    details: "For retainer clients (AMM, Multiplier Vat & ADH) raise etims for the fees earlier to give time for payment.",
    due: "2026-07-15T10:00",
    repeat: "monthly",
    status: "open",
  },
  {
    id: createId(),
    client: "BRC Consultancy",
    title: "VAT Return",
    details:
      "Shadrack is responsible for preparing this in good time for review and approval before filing. Once filed, he should save the PRN in the relevant folder, after which I will process the payment through I&M Bank.",
    due: "2026-08-06T09:00",
    repeat: "monthly",
    status: "open",
  },
  {
    id: createId(),
    client: "BRC Consultancy",
    title: "VAT Return",
    details:
      "Shadrack is responsible for preparing this in good time for review and approval before filing. Once filed, he should save the PRN in the relevant folder.",
    due: "2026-07-07T09:00",
    repeat: "monthly",
    status: "completed",
  },
];

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
const alertBar = document.querySelector("#alertBar");
const alertText = document.querySelector("#alertText");
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

document.querySelector("#todayLabel").textContent = "Friday, 10 July 2026";
document.querySelector("#newTaskButton").addEventListener("click", () => openTaskDialog());
document.querySelector("#newMeetingButton").addEventListener("click", () => openMeetingDialog());
document.querySelector("#meetingsScheduleBtn").addEventListener("click", () => openMeetingDialog());
document.querySelector("#switchProfileButton").addEventListener("click", showLogin);
document.querySelector("#dismissButton").addEventListener("click", () => (alertBar.hidden = true));
document.querySelector("#snoozeButton").addEventListener("click", () => {
  alertBar.hidden = true;
  setTimeout(updateAlert, 10 * 60 * 1000);
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

  clientTabs.style.display = isTask ? "" : "none";
  tasksHeading.style.display = isTask ? "" : "none";
  taskBoard.style.display = isTask ? "" : "none";
  newTaskButton.style.display = isTask ? "" : "none";
  document.querySelector("#meetingsView").hidden = !isMeeting;
  document.querySelector("#newMeetingButton").hidden = !isMeeting;
  document.querySelector("#dashboardView").hidden = !isDash;
  document.querySelector("#workloadView").hidden = !isWorkload;

  if (isTask) { renderFilters(); renderTabs(); renderBoard(); injectStatutoryDeadlines(); }
  if (isMeeting) renderMeetings();
  if (isDash) renderDashboard();
  if (isWorkload) renderWorkload();
  
  updateAlert();
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
  const hasActiveProfile = profiles.some((profile) => profile.id === activeProfileId);
  appShell.classList.toggle("locked", !hasActiveProfile);
  loginScreen.hidden = hasActiveProfile;

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
  activeProfileId = profileId;
  localStorage.setItem(sessionStorageKey, activeProfileId);
  assignmentFilter = "all";
  activeView = "tasks";
  render();
}

function showLogin() {
  activeProfileId = "";
  localStorage.removeItem(sessionStorageKey);
  assignmentFilter = "all";
  activeView = "tasks";
  render();
}

function openProfileDialog(profile) {
  document.querySelector("#profileId").value = profile.id;
  document.querySelector("#profileName").value = profile.name;
  document.querySelector("#profileDetails").value = profile.details;
  document.querySelector("#profileImage").value = "";
  profileDialog.showModal();
}

function saveProfile(event) {
  event.preventDefault();
  const id = document.querySelector("#profileId").value;
  const imageInput = document.querySelector("#profileImage");
  const nextProfile = {
    ...profiles.find((profile) => profile.id === id),
    name: document.querySelector("#profileName").value,
    details: document.querySelector("#profileDetails").value,
  };

  const finish = (image) => {
    if (image) nextProfile.image = image;
    profiles = profiles.map((profile) => (profile.id === id ? nextProfile : profile));
    persistProfiles();
    profileDialog.close();
    render();
  };

  if (!imageInput.files.length) {
    finish("");
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => finish(reader.result));
  reader.readAsDataURL(imageInput.files[0]);
}

function renderTabs() {
  clientTabs.innerHTML = clients
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
    <td class="details-cell" data-label="Details">${escapeHtml(task.details)}</td>
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

function handleAction(event) {
  const { action, id } = event.currentTarget.dataset;
  if (action === "edit") return openTaskDialog(tasks.find((task) => task.id === id));
  if (action === "comments") return openCommentsDialog(tasks.find((task) => task.id === id));
  if (action === "delete") tasks = tasks.filter((task) => task.id !== id);
  if (action === "complete") {
    const task = tasks.find((t) => t.id === id);
    if (task && task.repeat && (task.repeat === "monthly" || task.repeat === "weekly")) {
      return openRecurrenceDialog(task);
    }
    updateTask(id, { status: "completed" });
  }
  if (action === "restore") updateTask(id, { status: "open" });
  persistTasks();
  render();
}

function updateTask(id, patch) {
  tasks = tasks.map((task) => (task.id === id ? { ...task, ...patch } : task));
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
  taskDialog.showModal();
}

function saveTask(event) {
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
}

function updateAlert() {
  if (!activeProfileId) {
    alertBar.hidden = true;
    return;
  }

  const openTasks = tasks.filter((task) => task.status === "open");
  const sortedTasks = [...openTasks].sort((a, b) => new Date(a.due) - new Date(b.due));

  const myDueTask = sortedTasks.find((task) => task.assignedTo === activeProfileId);

  if (myDueTask) {
    alertText.textContent = `Due now (Assigned to you): ${myDueTask.client} - ${myDueTask.title}`;
    alertBar.hidden = false;
    return;
  }

  if (sortedTasks.length) {
    const earliestTask = sortedTasks[0];
    const assignee = getProfile(earliestTask.assignedTo);
    alertText.textContent = `Due now (${assignee.name}): ${earliestTask.client} - ${earliestTask.title}`;
    alertBar.hidden = false;
    return;
  }

  alertBar.hidden = true;
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

function handleMeetingAction(event) {
  const { meetingAction, id } = event.currentTarget.dataset;
  if (meetingAction === "edit") {
    return openMeetingDialog(meetings.find((m) => m.id === id));
  }
  if (meetingAction === "delete") {
    meetings = meetings.filter((m) => m.id !== id);
    persistMeetings();
    render();
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

  meetingDialog.showModal();
}

function saveMeeting(event) {
  event.preventDefault();
  const id = document.querySelector("#meetingId").value || createId();
  
  const checkedCheckboxes = document.querySelectorAll('input[name="meeting_participant"]:checked');
  const participants = Array.from(checkedCheckboxes).map(cb => cb.value);
  
  if (participants.length === 0) {
    alert("Please select at least one participant.");
    return;
  }

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
  recurrenceDialog.showModal();
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

// ── Feature 3: Countdown Badges ──────────────────────────────────────────────
function getCountdownLabel(dueStr) {
  const due = new Date(dueStr);
  const now = new Date();
  const diffMs = due - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
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
  commentsDialog.showModal();
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

function postComment() {
  const text = document.querySelector("#commentInput").value.trim();
  if (!text || !_activeCommentTaskId) return;
  const task = tasks.find(t => t.id === _activeCommentTaskId);
  if (!task) return;
  const comment = {
    authorId: activeProfileId || profiles[0].id,
    text,
    timestamp: new Date().toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }),
  };
  const updated = [...(task.comments || []), comment];
  updateTask(_activeCommentTaskId, { comments: updated });
  persistTasks();
  document.querySelector("#commentInput").value = "";
  renderComments(updated);
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
  const now = new Date();
  const yr = now.getFullYear();
  const mo = now.getMonth();
  let changed = false;

  kraCalendar.forEach(item => {
    const dueDate = new Date(yr, mo, item.day, 9, 0);
    const dueDateStr = dueDate.toISOString().slice(0, 16);
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
  const now = new Date().toLocaleDateString("en-KE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
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

render();
