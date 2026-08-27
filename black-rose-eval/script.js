/* ==========================================================================
   Black Rose Consultancy — Performance Evaluation
   --------------------------------------------------------------------------
   Serverless PDF & WhatsApp Workflow:
   - Evaluator completes ratings and narrative feedback.
   - Form saves local drafts inside browser localStorage per director.
   - On submission, html2canvas & jsPDF generate a branded, publication-ready PDF.
   - Launches WhatsApp with pre-filled message text so the director can attach
     and send their evaluation PDF directly to management/HR.
   ========================================================================== */

const storage = {
  get(key) {
    try {
      const value = localStorage.getItem(key);
      return value ? { value } : null;
    } catch (e) {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }
};

const DIRECTORS = [
  { id: 'wangui-muchiri', name: 'Wangui Muchiri', role: 'Director' },
  { id: 'mercy', name: 'Mercy Waweru', role: 'Director' },
  { id: 'diane-marie', name: 'Diane Meria', role: 'Director' },
  { id: 'greg', name: 'Gregory Nyataige', role: 'Director' }
];

const METRICS = [
  { key: 'quality', title: 'Quality of Work', desc: 'Accuracy, thoroughness and reliability of financial statements, reconciliations and reports produced.' },
  { key: 'compliance', title: 'Compliance & Risk Oversight', desc: 'Adherence to policy, internal controls, audit-readiness and identification of financial risk.' },
  { key: 'communication', title: 'Communication', desc: 'Clarity and timeliness in reporting to management, and responsiveness to queries from the team.' },
  { key: 'timeliness', title: 'Timeliness & Reliability', desc: 'Meeting deadlines for closings, filings and deliverables without prompting.' },
  { key: 'leadership', title: 'Leadership & Initiative', desc: 'Ownership of problems, proactive improvement of processes, and support given to junior staff.' }
];

let currentDirector = null;
let ratings = {};
let freeText = { strengths: '', improvement: '', comments: '' };

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  } else {
    alert(msg);
  }
}

function starRow(container, metricKey) {
  if (!container) return;
  container.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement('button');
    b.className = 'star-btn';
    b.type = 'button';
    b.textContent = '★';
    b.dataset.val = i;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      ratings[metricKey] = i;
      paintStars(container, i);
      saveDraftLocally();
    });
    container.appendChild(b);
  }
  const label = document.createElement('span');
  label.className = 'rating-label';
  label.dataset.roleLabel = metricKey;
  container.appendChild(label);

  if (ratings[metricKey]) {
    paintStars(container, ratings[metricKey]);
  }
}

function paintStars(container, val) {
  if (!container) return;
  container.querySelectorAll('.star-btn').forEach(btn => {
    btn.classList.toggle('filled', Number(btn.dataset.val) <= val);
  });
  const labels = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very Good', 5: 'Excellent' };
  const label = container.querySelector('.rating-label');
  if (label) label.textContent = labels[val] || '';
}

function buildMetrics() {
  const metricsContainer = document.getElementById('metricsContainer');
  const overallStars = document.querySelector('#overallMetric .stars');
  if (metricsContainer) {
    metricsContainer.innerHTML = '';
    METRICS.forEach(m => {
      const div = document.createElement('div');
      div.className = 'metric';
      div.innerHTML = `
        <div class="metric-head"><h3>${m.title}</h3></div>
        <p class="metric-desc">${m.desc}</p>
        <div class="stars" data-metric="${m.key}"></div>
      `;
      metricsContainer.appendChild(div);
      starRow(div.querySelector('.stars'), m.key);
    });
  }
  if (overallStars) {
    starRow(overallStars, 'overall');
  }
}

function buildDirectorGrid() {
  const directorGrid = document.getElementById('directorGrid');
  if (!directorGrid) return;
  directorGrid.innerHTML = '';
  DIRECTORS.forEach(d => {
    const btn = document.createElement('button');
    btn.className = 'director-btn';
    btn.innerHTML = `${d.name}<span class="role-tag">${d.role}</span>`;
    btn.addEventListener('click', () => selectDirector(d));
    directorGrid.appendChild(btn);
  });
  markCompleted();
}

function markCompleted() {
  const directorGrid = document.getElementById('directorGrid');
  if (!directorGrid) return;
  const buttons = directorGrid.querySelectorAll('.director-btn');
  for (let i = 0; i < DIRECTORS.length; i++) {
    const res = storage.get('eval:' + DIRECTORS[i].id);
    if (res && res.value) {
      try {
        const parsed = JSON.parse(res.value);
        if (parsed.submittedAt && buttons[i]) {
          buttons[i].classList.add('done');
        }
      } catch (e) {}
    }
  }
}

function selectDirector(d, hideSwitch) {
  currentDirector = d;
  const evaluatorName = document.getElementById('evaluatorName');
  if (evaluatorName) evaluatorName.textContent = d.name;

  const gate = document.getElementById('gate');
  if (gate) gate.style.display = 'none';

  const formWrap = document.getElementById('formWrap');
  if (formWrap) formWrap.classList.add('active');

  const switchBtn = document.getElementById('switchBtn');
  if (switchBtn) switchBtn.style.display = hideSwitch ? 'none' : '';

  ratings = {};
  freeText = { strengths: '', improvement: '', comments: '' };
  buildMetrics();

  const res = storage.get('eval:' + d.id);
  if (res && res.value) {
    try {
      const data = JSON.parse(res.value);
      ratings = data.ratings || {};
      freeText = data.freeText || freeText;
      const overallStars = document.querySelector('#overallMetric .stars');
      Object.keys(ratings).forEach(key => {
        const container = key === 'overall' 
          ? overallStars 
          : document.querySelector(`.stars[data-metric="${key}"]`);
        if (container) paintStars(container, ratings[key]);
      });
      document.querySelectorAll('textarea[data-field]').forEach(ta => {
        ta.value = freeText[ta.dataset.field] || '';
      });
    } catch (e) {}
  } else {
    document.querySelectorAll('textarea[data-field]').forEach(ta => ta.value = '');
  }
}

function saveDraftLocally() {
  if (!currentDirector) return;
  const payload = {
    director: currentDirector.name,
    ratings: ratings,
    freeText: freeText,
    updatedAt: new Date().toISOString()
  };
  storage.set('eval:' + currentDirector.id, JSON.stringify(payload));
}

function ensureActiveDirector() {
  if (currentDirector) return currentDirector;

  try {
    let pId = "";
    if (typeof activeProfileId !== "undefined" && activeProfileId) {
      pId = activeProfileId;
    } else {
      pId = sessionStorage.getItem('blackrose-active-profile') || 
            localStorage.getItem('blackrose-active-profile') || '';
    }
    if (pId) {
      const found = DIRECTORS.find(d => d.id === pId);
      if (found) {
        currentDirector = found;
        return found;
      }
    }
  } catch (e) {}

  const evName = document.getElementById('evaluatorName');
  const nameText = evName ? evName.textContent.trim() : '';
  if (nameText) {
    const found = DIRECTORS.find(d => d.name.toLowerCase() === nameText.toLowerCase());
    if (found) {
      currentDirector = found;
      return found;
    }
  }

  return null;
}

// Textareas input
document.addEventListener('input', (e) => {
  if (e.target && e.target.matches('textarea[data-field]')) {
    freeText[e.target.dataset.field] = e.target.value;
    saveDraftLocally();
  }
});

// Populate hidden printable template DOM
function populatePDFTemplate() {
  ensureActiveDirector();
  const ratingLabels = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very Good', 5: 'Excellent' };
  
  const pdfLogoImg = document.getElementById('pdfLogoImg');
  if (pdfLogoImg && typeof LOGO_BASE64 !== 'undefined') {
    pdfLogoImg.src = LOGO_BASE64;
  }

  const subjectVal = document.getElementById('evalSubjectName')?.value.trim() || 'Employee Name';
  const roleVal = document.getElementById('evalSubjectRole')?.value.trim() || 'Senior Oversight Accountant';
  const typeVal = document.getElementById('evalTypeSelect')?.value || 'Performance Evaluation';
  const periodVal = document.getElementById('evalPeriodSelect')?.value.trim() || 'Last 3 Months';

  const pSubject = document.getElementById('pdfMetaSubject');
  if (pSubject) pSubject.textContent = subjectVal;

  const pRole = document.getElementById('pdfMetaRole');
  if (pRole) pRole.textContent = roleVal;

  const pType = document.getElementById('pdfMetaEvalType');
  if (pType) pType.textContent = typeVal;

  const pPeriod = document.getElementById('pdfMetaPeriod');
  if (pPeriod) pPeriod.textContent = periodVal;

  const pDirector = document.getElementById('pdfMetaDirector');
  if (pDirector) pDirector.textContent = currentDirector ? currentDirector.name : '';

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const pDate = document.getElementById('pdfMetaDate');
  if (pDate) pDate.textContent = dateStr;

  const pSign = document.getElementById('pdfSignName');
  if (pSign) pSign.textContent = currentDirector ? currentDirector.name : '';

  const yearElem = document.getElementById('pdfYear');
  if (yearElem) yearElem.textContent = now.getFullYear();

  const tbody = document.getElementById('pdfTableBody');
  if (tbody) {
    tbody.innerHTML = '';
    METRICS.forEach(m => {
      const val = ratings[m.key] || 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${m.title}</b><br><small style="color:#666;line-height:1.3;display:block;margin-top:2px;">${m.desc}</small></td>
        <td style="text-align:center;" class="stars-val">${'★'.repeat(val)}${'☆'.repeat(5 - val)}</td>
        <td style="text-align:center;"><b>${ratingLabels[val] || 'Not Rated'}</b></td>
      `;
      tbody.appendChild(tr);
    });

    const ovVal = ratings.overall || 0;
    const ovTr = document.createElement('tr');
    ovTr.style.background = '#f0ebe1';
    ovTr.innerHTML = `
      <td><b style="color:#8a6f36;">OVERALL EVALUATION SCORE</b></td>
      <td style="text-align:center;" class="stars-val">${'★'.repeat(ovVal)}${'☆'.repeat(5 - ovVal)}</td>
      <td style="text-align:center;"><b style="color:#8a6f36;">${ratingLabels[ovVal] || 'Not Rated'}</b></td>
    `;
    tbody.appendChild(ovTr);
  }

  const pStrengths = document.getElementById('pdfStrengthsText');
  const pImprovement = document.getElementById('pdfImprovementText');
  const pComments = document.getElementById('pdfCommentsText');
  if (pStrengths) pStrengths.textContent = (freeText.strengths || '').trim() || 'No specific strengths noted.';
  if (pImprovement) pImprovement.textContent = (freeText.improvement || '').trim() || 'No specific areas for improvement noted.';
  if (pComments) pComments.textContent = (freeText.comments || '').trim() || 'None.';
}

// Generate PDF File using direct html2canvas + jsPDF
async function generatePDFBlobAndSave(filename) {
  populatePDFTemplate();
  const element = document.getElementById('pdfTemplate');
  const previewModal = document.getElementById('previewModal');

  const wasModalOpen = previewModal && previewModal.classList.contains('active');
  if (previewModal && !wasModalOpen) {
    previewModal.classList.add('active');
  }

  await new Promise(r => setTimeout(r, 120));

  try {
    if (typeof html2canvas === 'undefined') {
      throw new Error('html2canvas library is not loaded.');
    }

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollY: 0,
      scrollX: 0
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.98);

    const JsPdfClass = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
    if (!JsPdfClass) {
      throw new Error('jsPDF library is not loaded.');
    }

    const pdf = new JsPdfClass({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 8;
    const imgWidth = pageWidth - (margin * 2);
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
    pdf.save(filename);

  } finally {
    if (previewModal && !wasModalOpen) {
      previewModal.classList.remove('active');
    }
  }
}

// Validation helper
function validateForm() {
  ensureActiveDirector();
  if (!currentDirector) {
    showToast('Please select your evaluator name to proceed.');
    return false;
  }

  const subjectName = document.getElementById('evalSubjectName')?.value.trim();
  if (!subjectName) {
    showToast('Please enter the name of the person being reviewed.');
    const el = document.getElementById('evalSubjectName');
    if (el) el.focus();
    return false;
  }

  const allKeys = METRICS.map(m => m.key).concat(['overall']);
  const missing = allKeys.filter(k => !ratings[k]);
  if (missing.length) {
    showToast('Please rate all 5 performance metrics and the Overall Rating before proceeding.');
    return false;
  }
  return true;
}

// History storage implementation
const EVAL_HISTORY_STORAGE_KEY = 'blackrose_eval_history_records';

function getEvaluationHistory() {
  try {
    const raw = localStorage.getItem(EVAL_HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveEvaluationRecord(record) {
  try {
    const history = getEvaluationHistory();
    history.unshift(record);
    localStorage.setItem(EVAL_HISTORY_STORAGE_KEY, JSON.stringify(history));
    if (window.supabase && typeof window.supabase.from === 'function') {
      window.supabase.from('evaluations').insert([record]).catch(console.error);
    }
  } catch (e) {
    console.error('Failed to save evaluation record:', e);
  }
}

function openHistoryDrawer() {
  const panel = document.getElementById('historyPanel');
  const overlay = document.getElementById('historyOverlay');
  if (panel) {
    panel.classList.add('active');
    panel.setAttribute('aria-hidden', 'false');
  }
  if (overlay) overlay.classList.add('active');
  loadAndRenderHistory();
}

function closeHistoryDrawer() {
  const panel = document.getElementById('historyPanel');
  const overlay = document.getElementById('historyOverlay');
  if (panel) {
    panel.classList.remove('active');
    panel.setAttribute('aria-hidden', 'true');
  }
  if (overlay) overlay.classList.remove('active');
}

function loadAndRenderHistory() {
  const listEl = document.getElementById('historyList');
  if (!listEl) return;

  const history = getEvaluationHistory();
  const dirFilter = document.getElementById('historyDirectorFilter')?.value || '';
  const periodFilter = document.getElementById('historyPeriodFilter')?.value || '';
  const searchText = (document.getElementById('historySearchInput')?.value || '').toLowerCase();

  const filtered = history.filter(item => {
    if (dirFilter && item.evaluatorId !== dirFilter) return false;
    if (periodFilter && item.period !== periodFilter) return false;
    if (searchText) {
      const combined = `${item.subjectName || ''} ${item.roleName || ''} ${item.evaluatorName || ''}`.toLowerCase();
      if (!combined.includes(searchText)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    listEl.innerHTML = '<div class="history-empty">No previous evaluations saved yet.</div>';
    return;
  }

  listEl.innerHTML = '';
  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'history-card';
    const ovVal = item.ratings ? (item.ratings.overall || 0) : 0;
    const ratingLabels = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very Good', 5: 'Excellent' };

    card.innerHTML = `
      <div class="history-card-head">
        <div>
          <div class="history-card-title">${item.subjectName || 'Evaluation Subject'}</div>
          <div style="font-size:0.75rem;color:#aaa;">${item.roleName || ''}</div>
        </div>
        <div class="history-card-date">${item.dateStr || ''}</div>
      </div>
      <div class="history-card-meta">
        <div><span>Evaluator:</span> <b>${item.evaluatorName || ''}</b></div>
        <div><span>Period:</span> <b>${item.period || ''}</b></div>
      </div>
      <div class="history-card-score">
        <span>Overall Rating:</span>
        <b>${'★'.repeat(ovVal)}${'☆'.repeat(5 - ovVal)} (${ratingLabels[ovVal] || 'N/A'})</b>
      </div>
      <div class="history-card-actions">
        <button type="button" class="history-load-btn" data-id="${item.id}">📋 Load Form</button>
        <button type="button" class="history-pdf-btn" data-id="${item.id}">📄 Download PDF</button>
        <button type="button" class="history-del-btn" data-id="${item.id}">🗑️ Delete</button>
      </div>
    `;
    listEl.appendChild(card);
  });
}

// Global button click delegation
document.addEventListener('click', async (e) => {
  const target = e.target.closest('button, a');
  if (!target) return;

  // Switch Director button
  if (target.id === 'switchBtn' || target.closest('#switchBtn')) {
    e.preventDefault();
    const formWrap = document.getElementById('formWrap');
    const gate = document.getElementById('gate');
    if (formWrap) formWrap.classList.remove('active');
    if (gate) gate.style.display = 'block';
    currentDirector = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  // 1. Submit & Send WhatsApp button
  if (target.id === 'submitBtn' || target.closest('#submitBtn')) {
    e.preventDefault();
    if (!validateForm()) return;

    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Generating PDF...';
    }

    const cleanName = currentDirector.name.replace(/[^a-zA-Z0-9]/g, '_');
    const dateStamp = new Date().toISOString().slice(0, 10);
    const pdfFilename = `BlackRose_Evaluation_${cleanName}_${dateStamp}.pdf`;

    try {
      const payload = {
        director: currentDirector.name,
        ratings: ratings,
        freeText: freeText,
        submittedAt: new Date().toISOString()
      };
      storage.set('eval:' + currentDirector.id, JSON.stringify(payload));
      buildDirectorGrid();

      await generatePDFBlobAndSave(pdfFilename);

      const waPhoneEl = document.getElementById('waPhone');
      const rawPhone = waPhoneEl ? waPhoneEl.value.trim() : '';
      const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
      
      const messageText = `Hello, I have completed the Performance Evaluation for ${document.getElementById('evalSubjectName')?.value.trim() || 'the Senior Oversight Accountant'} as Director (${currentDirector.name}).\n\nPlease find my attached evaluation PDF file: ${pdfFilename}`;
      const encodedText = encodeURIComponent(messageText);

      let waUrl = `https://api.whatsapp.com/send?text=${encodedText}`;
      if (cleanPhone.length >= 7) {
        waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
      }

      const waPdfName = document.getElementById('waPdfName');
      const waLaunchLink = document.getElementById('waLaunchLink');
      const waModal = document.getElementById('waModal');

      if (waPdfName) waPdfName.textContent = pdfFilename;
      if (waLaunchLink) waLaunchLink.href = waUrl;
      if (waModal) waModal.classList.add('active');

      setTimeout(() => {
        try {
          window.open(waUrl, '_blank');
        } catch (err) {
          console.warn('WhatsApp window popup blocked:', err);
        }
      }, 800);

      showToast('PDF downloaded! Opening WhatsApp...');

    } catch (err) {
      console.error('PDF Generation Error:', err);
      showToast('PDF Error: ' + (err.message || err));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px;vertical-align:-3px;"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
          Generate PDF & Send via WhatsApp
        `;
      }
    }
    return;
  }

  // 2. Preview PDF Sheet button
  if (target.id === 'previewBtn' || target.closest('#previewBtn')) {
    e.preventDefault();
    if (!validateForm()) return;
    populatePDFTemplate();
    const previewModal = document.getElementById('previewModal');
    if (previewModal) previewModal.classList.add('active');
    return;
  }

  // 3. Modal close button
  if (target.id === 'modalCloseBtn' || target.closest('#modalCloseBtn')) {
    e.preventDefault();
    const previewModal = document.getElementById('previewModal');
    if (previewModal) previewModal.classList.remove('active');
    return;
  }

  // 4. Modal Download PDF button
  if (target.id === 'modalDownloadBtn' || target.closest('#modalDownloadBtn')) {
    e.preventDefault();
    if (!validateForm()) return;
    target.disabled = true;
    target.textContent = 'Downloading...';
    const cleanName = currentDirector.name.replace(/[^a-zA-Z0-9]/g, '_');
    const pdfFilename = `BlackRose_Evaluation_${cleanName}.pdf`;
    try {
      await generatePDFBlobAndSave(pdfFilename);
      showToast('PDF downloaded successfully.');
    } catch (err) {
      showToast('Error saving PDF: ' + err.message);
    } finally {
      target.disabled = false;
      target.textContent = 'Download PDF';
    }
    return;
  }

  // 5. Modal Send via WhatsApp button
  if (target.id === 'modalWaBtn' || target.closest('#modalWaBtn')) {
    e.preventDefault();
    const previewModal = document.getElementById('previewModal');
    if (previewModal) previewModal.classList.remove('active');
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) submitBtn.click();
    return;
  }

  // 6. History Toggle Button
  if (target.id === 'historyToggleBtn' || target.closest('#historyToggleBtn')) {
    e.preventDefault();
    openHistoryDrawer();
    return;
  }

  // 7. History Close Button or Overlay
  if (target.id === 'historyCloseBtn' || target.id === 'historyOverlay' || target.closest('#historyCloseBtn')) {
    e.preventDefault();
    closeHistoryDrawer();
    return;
  }

  // 8. History Item Action: Load into Form
  if (target.classList.contains('history-load-btn') || target.closest('.history-load-btn')) {
    e.preventDefault();
    const id = target.dataset.id || target.closest('.history-load-btn').dataset.id;
    const history = getEvaluationHistory();
    const item = history.find(h => h.id === id);
    if (item) {
      if (item.ratings) ratings = { ...item.ratings };
      if (item.freeText) freeText = { ...item.freeText };

      const subEl = document.getElementById('evalSubjectName');
      if (subEl && item.subjectName) subEl.value = item.subjectName;

      const roleEl = document.getElementById('evalSubjectRole');
      if (roleEl && item.roleName) roleEl.value = item.roleName;

      const typeEl = document.getElementById('evalTypeSelect');
      if (typeEl && item.evalType) typeEl.value = item.evalType;

      const perEl = document.getElementById('evalPeriodSelect');
      if (perEl && item.period) perEl.value = item.period;

      document.querySelectorAll('textarea[data-field]').forEach(ta => {
        const field = ta.dataset.field;
        if (freeText[field]) ta.value = freeText[field];
      });

      if (item.evaluatorName) {
        const evName = document.getElementById('evaluatorName');
        if (evName) evName.textContent = item.evaluatorName;
      }
      buildMetrics();
      closeHistoryDrawer();
      showToast(`Loaded evaluation record for ${item.subjectName}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }

  // 9. History Item Action: Download PDF
  if (target.classList.contains('history-pdf-btn') || target.closest('.history-pdf-btn')) {
    e.preventDefault();
    const id = target.dataset.id || target.closest('.history-pdf-btn').dataset.id;
    const history = getEvaluationHistory();
    const item = history.find(h => h.id === id);
    if (item) {
      const tempRatings = { ...ratings };
      const tempFreeText = { ...freeText };
      ratings = item.ratings || {};
      freeText = item.freeText || {};

      const cleanName = (item.subjectName || 'Evaluation').replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `BlackRose_Evaluation_${cleanName}.pdf`;

      try {
        await generatePDFBlobAndSave(filename);
        showToast('Historical PDF downloaded.');
      } catch (err) {
        showToast('Error generating PDF: ' + err.message);
      } finally {
        ratings = tempRatings;
        freeText = tempFreeText;
      }
    }
    return;
  }

  // 10. History Item Action: Delete
  if (target.classList.contains('history-del-btn') || target.closest('.history-del-btn')) {
    e.preventDefault();
    const id = target.dataset.id || target.closest('.history-del-btn').dataset.id;
    if (confirm('Delete this evaluation record from history?')) {
      let history = getEvaluationHistory();
      history = history.filter(h => h.id !== id);
      localStorage.setItem(EVAL_HISTORY_STORAGE_KEY, JSON.stringify(history));

      if (window.supabase && typeof window.supabase.from === 'function') {
        window.supabase.from('evaluations').delete().eq('id', id).catch(console.error);
      }

      loadAndRenderHistory();
      showToast('Evaluation record deleted.');
    }
    return;
  }

  // 11. WhatsApp Guidance Modal Close button
  if (target.id === 'waCloseBtn' || target.closest('#waCloseBtn')) {
    e.preventDefault();
    const waModal = document.getElementById('waModal');
    if (waModal) waModal.classList.remove('active');
    return;
  }
});

// History filter inputs change listeners
document.addEventListener('change', (e) => {
  if (e.target && (e.target.id === 'historyDirectorFilter' || e.target.id === 'historyPeriodFilter')) {
    loadAndRenderHistory();
  }
});

document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'historySearchInput') {
    loadAndRenderHistory();
  }
});

// Auto-save submitted evaluations into history
const _origGeneratePDF = generatePDFBlobAndSave;
generatePDFBlobAndSave = async function(filename) {
  if (typeof saveEvaluationRecord === 'function') {
    const record = {
      id: 'eval-' + Date.now(),
      evaluatorId: currentDirector ? currentDirector.id : 'greg',
      evaluatorName: currentDirector ? currentDirector.name : 'Gregory Nyataige',
      subjectName: document.getElementById('evalSubjectName')?.value.trim() || 'Senior Oversight Accountant',
      roleName: document.getElementById('evalSubjectRole')?.value.trim() || 'Senior Oversight Accountant',
      evalType: document.getElementById('evalTypeSelect')?.value || 'Performance Evaluation',
      period: document.getElementById('evalPeriodSelect')?.value.trim() || 'Last 3 Months',
      ratings: { ...ratings },
      freeText: { ...freeText },
      createdAt: new Date().toISOString(),
      dateStr: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    };
    saveEvaluationRecord(record);
  }
  return _origGeneratePDF(filename);
};

// Initialize on page load — auto-select the logged-in director
function initEvaluation() {
  buildDirectorGrid();
  const dir = ensureActiveDirector();
  if (dir) {
    selectDirector(dir, false);
  } else {
    const gate = document.getElementById('gate');
    if (gate) gate.style.display = 'block';
    const formWrap = document.getElementById('formWrap');
    if (formWrap) formWrap.classList.remove('active');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEvaluation);
} else {
  initEvaluation();
}
