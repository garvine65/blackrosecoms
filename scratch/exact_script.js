/* ==========================================================================
   Black Rose Consultancy — Performance Evaluation
   --------------------------------------------------------------------------
   Serverless PDF & WhatsApp Workflow:
   - Evaluator completes ratings and narrative feedback.
   - Form saves local drafts inside browser localStorage per director.
   - On submission, html2pdf generates a branded, publication-ready PDF.
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
  { id: 'wangui', name: 'Wangui Muchiri', role: 'Director' },
  { id: 'mercy', name: 'Mercy Waweru', role: 'Director' },
  { id: 'diane', name: 'Diane Meria', role: 'Director' }
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

const gate = document.getElementById('gate');
const directorGrid = document.getElementById('directorGrid');
const formWrap = document.getElementById('formWrap');
const evaluatorName = document.getElementById('evaluatorName');
const metricsContainer = document.getElementById('metricsContainer');
const overallStars = document.querySelector('#overallMetric .stars');
const toast = document.getElementById('toast');
const submitBtn = document.getElementById('submitBtn');
const previewBtn = document.getElementById('previewBtn');
const switchBtn = document.getElementById('switchBtn');
const waModal = document.getElementById('waModal');
const waPdfName = document.getElementById('waPdfName');
const waLaunchLink = document.getElementById('waLaunchLink');
const waCloseBtn = document.getElementById('waCloseBtn');

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function starRow(container, metricKey) {
  container.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement('button');
    b.className = 'star-btn';
    b.type = 'button';
    b.textContent = '★';
    b.dataset.val = i;
    b.addEventListener('click', () => {
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
}

function paintStars(container, val) {
  container.querySelectorAll('.star-btn').forEach(btn => {
    btn.classList.toggle('filled', Number(btn.dataset.val) <= val);
  });
  const labels = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very Good', 5: 'Excellent' };
  const label = container.querySelector('.rating-label');
  if (label) label.textContent = labels[val] || '';
}

function buildMetrics() {
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
  starRow(overallStars, 'overall');
}

function buildDirectorGrid() {
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
  const buttons = directorGrid.querySelectorAll('.director-btn');
  for (let i = 0; i < DIRECTORS.length; i++) {
    const res = storage.get('eval:' + DIRECTORS[i].id);
    if (res && res.value) {
      try {
        const parsed = JSON.parse(res.value);
        if (parsed.submittedAt) {
          buttons[i].classList.add('done');
        }
      } catch (e) {}
    }
  }
}

function selectDirector(d) {
  currentDirector = d;
  evaluatorName.textContent = d.name;
  gate.style.display = 'none';
  formWrap.classList.add('active');
  ratings = {};
  freeText = { strengths: '', improvement: '', comments: '' };
  buildMetrics();

  // Load existing draft if present
  const res = storage.get('eval:' + d.id);
  if (res && res.value) {
    try {
      const data = JSON.parse(res.value);
      ratings = data.ratings || {};
      freeText = data.freeText || freeText;
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

  window.scrollTo({ top: formWrap.offsetTop - 20, behavior: 'smooth' });
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

switchBtn.addEventListener('click', () => {
  formWrap.classList.remove('active');
  gate.style.display = 'block';
  currentDirector = null;
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.querySelectorAll('textarea[data-field]').forEach(ta => {
  ta.addEventListener('input', () => { 
    freeText[ta.dataset.field] = ta.value; 
    saveDraftLocally();
  });
});

// Interactive Preview Modal Elements
const previewModal = document.getElementById('previewModal');
const modalDownloadBtn = document.getElementById('modalDownloadBtn');
const modalWaBtn = document.getElementById('modalWaBtn');
const modalCloseBtn = document.getElementById('modalCloseBtn');


// Populate hidden printable template DOM
function populatePDFTemplate() {
  const ratingLabels = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very Good', 5: 'Excellent' };
  
  // CORS-safe base64 logo for html2canvas
  const pdfLogoImg = document.getElementById('pdfLogoImg');
  if (pdfLogoImg && typeof LOGO_BASE64 !== 'undefined') {
    pdfLogoImg.src = LOGO_BASE64;
  }

  document.getElementById('pdfMetaDirector').textContent = currentDirector ? currentDirector.name : '';
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('pdfMetaDate').textContent = dateStr;
  document.getElementById('pdfSignName').textContent = currentDirector ? currentDirector.name : '';
  const yearElem = document.getElementById('pdfYear');
  if (yearElem) yearElem.textContent = now.getFullYear();

  const tbody = document.getElementById('pdfTableBody');
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

  // Overall metric row
  const ovVal = ratings.overall || 0;
  const ovTr = document.createElement('tr');
  ovTr.style.background = '#f0ebe1';
  ovTr.innerHTML = `
    <td><b style="color:#8a6f36;">OVERALL EVALUATION SCORE</b></td>
    <td style="text-align:center;" class="stars-val">${'★'.repeat(ovVal)}${'☆'.repeat(5 - ovVal)}</td>
    <td style="text-align:center;"><b style="color:#8a6f36;">${ratingLabels[ovVal] || 'Not Rated'}</b></td>
  `;
  tbody.appendChild(ovTr);

  // Free text fields
  document.getElementById('pdfStrengthsText').textContent = freeText.strengths.trim() || 'No specific strengths noted.';
  document.getElementById('pdfImprovementText').textContent = freeText.improvement.trim() || 'No specific areas for improvement noted.';
  document.getElementById('pdfCommentsText').textContent = freeText.comments.trim() || 'None.';
}

// Generate PDF File using direct html2canvas + jsPDF
async function generatePDFBlobAndSave(filename) {
  populatePDFTemplate();
  const element = document.getElementById('pdfTemplate');

  // Ensure modal container is active during canvas capture so dimensions are accurate
  const wasModalOpen = previewModal.classList.contains('active');
  if (!wasModalOpen) {
    previewModal.classList.add('active');
  }

  // Allow browser layout engine to render
  await new Promise(r => setTimeout(r, 80));

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
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const imgWidth = pageWidth - (margin * 2);
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
    pdf.save(filename);

  } finally {
    if (!wasModalOpen) {
      previewModal.classList.remove('active');
    }
  }
}

// Validation helper
function validateForm() {
  if (!currentDirector) return false;
  const allKeys = METRICS.map(m => m.key).concat(['overall']);
  const missing = allKeys.filter(k => !ratings[k]);
  if (missing.length) {
    showToast('Please rate every metric (including Overall Rating) before proceeding.');
    return false;
  }
  return true;
}

// Main Submit Action: PDF Export + WhatsApp launch
submitBtn.addEventListener('click', async () => {
  if (!validateForm()) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Generating PDF...';

  const cleanName = currentDirector.name.replace(/[^a-zA-Z0-9]/g, '_');
  const dateStamp = new Date().toISOString().slice(0, 10);
  const pdfFilename = `BlackRose_Evaluation_${cleanName}_${dateStamp}.pdf`;

  try {
    // Save completion timestamp
    const payload = {
      director: currentDirector.name,
      ratings: ratings,
      freeText: freeText,
      submittedAt: new Date().toISOString()
    };
    storage.set('eval:' + currentDirector.id, JSON.stringify(payload));
    buildDirectorGrid();

    // 1. Generate & download PDF
    await generatePDFBlobAndSave(pdfFilename);

    // 2. Prepare WhatsApp URL
    const rawPhone = document.getElementById('waPhone').value.trim();
    const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
    
    const messageText = `Hello, I have completed the Performance Evaluation for the Senior Oversight Accountant as Director (${currentDirector.name}).\n\nPlease find my attached evaluation PDF file: ${pdfFilename}`;
    const encodedText = encodeURIComponent(messageText);

    let waUrl = `https://api.whatsapp.com/send?text=${encodedText}`;
    if (cleanPhone.length >= 7) {
      waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
    }

    // 3. Show Guidance Modal
    waPdfName.textContent = pdfFilename;
    waLaunchLink.href = waUrl;
    waModal.classList.add('active');

    // Auto-open WhatsApp after a brief delay so download registers
    setTimeout(() => {
      window.open(waUrl, '_blank');
    }, 1200);

    showToast('PDF downloaded! Opening WhatsApp...');

  } catch (err) {
    console.error('PDF Generation Error:', err);
    showToast('PDF Error: ' + (err.message || err));
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px;vertical-align:-3px;"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
      Generate PDF & Send via WhatsApp
    `;
  }
});

// Preview PDF Sheet button
previewBtn.addEventListener('click', () => {
  if (!validateForm()) return;
  populatePDFTemplate();
  previewModal.classList.add('active');
});

// Modal Actions
modalCloseBtn.addEventListener('click', () => {
  previewModal.classList.remove('active');
});

modalDownloadBtn.addEventListener('click', async () => {
  if (!validateForm()) return;
  modalDownloadBtn.disabled = true;
  modalDownloadBtn.textContent = 'Downloading...';
  const cleanName = currentDirector.name.replace(/[^a-zA-Z0-9]/g, '_');
  const pdfFilename = `BlackRose_Evaluation_${cleanName}.pdf`;
  try {
    await generatePDFBlobAndSave(pdfFilename);
    showToast('PDF downloaded successfully.');
  } catch (e) {
    showToast('Error saving PDF: ' + e.message);
  } finally {
    modalDownloadBtn.disabled = false;
    modalDownloadBtn.textContent = 'Download PDF';
  }
});

modalWaBtn.addEventListener('click', () => {
  submitBtn.click();
  previewModal.classList.remove('active');
});

waCloseBtn.addEventListener('click', () => {
  waModal.classList.remove('active');
});

buildDirectorGrid();
buildMetrics();

index.html
