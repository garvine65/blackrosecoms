import json
import re

app_js_path = r'c:\Users\olwal\gregu\artifact-clone\app.js'
templates_json_path = r'c:\Users\olwal\gregu\scratch\templates.json'

with open(templates_json_path, 'r', encoding='utf-8') as f:
    templates_data = json.load(f)

templates_js = "const CL_TEMPLATES = " + json.dumps(templates_data, indent=2, ensure_ascii=False) + ";"

with open(app_js_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace CL_TEMPLATES
pattern_templates = re.compile(r'// ── Pre-built Templates ───────────────────────────────────────────\nconst CL_TEMPLATES = \[.*?\];\n', re.DOTALL)

if not pattern_templates.search(content):
    print("Error: Could not find CL_TEMPLATES block in app.js")
    exit(1)

content = pattern_templates.sub("// ── Pre-built Templates ───────────────────────────────────────────\n" + templates_js + "\n", content)

# Replace clCreateFromTemplate
new_cl_create = """// ── Template helper ───────────────────────────────────────────────
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
}"""

pattern_cl_create = re.compile(r'// ── Template helper ───────────────────────────────────────────────\nfunction clCreateFromTemplate\(client, monthLabel, templateId\) \{.*?\n\}', re.DOTALL)
content = pattern_cl_create.sub(new_cl_create, content)

# Replace openNewChecklistModal
new_modal_func = """// ── New Checklist modal ───────────────────────────────────────────
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
}"""

pattern_modal = re.compile(r'// ── New Checklist modal ───────────────────────────────────────────\nfunction openNewChecklistModal\(\) \{.*?\n\}', re.DOTALL)
content = pattern_modal.sub(new_modal_func, content)

with open(app_js_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully updated app.js!")
