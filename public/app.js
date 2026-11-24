/**
 * Science Diagram Maker Frontend App
 * Udhi Technologies - Technical Assessment
 */

const STATE = {
  results: [],
  reviews: {},
  loading: false
};

// Check labels mapping for clean UI display
const CHECK_TITLES = {
  validParsable: "Valid XML / SVG Parsable",
  withinViewBox: "Contained Within ViewBox",
  titleAndLabels: "Title & 3+ Text Labels",
  hasAnimation: "SMIL / CSS Animation",
  pedagogicalQuality: "Pedagogical Structure & Richness (Custom Check)"
};

// Elements
const tableBody = document.getElementById('tableBody');
const btnGenerate = document.getElementById('btnGenerate');
const conceptSelect = document.getElementById('conceptSelect');
const modelSelect = document.getElementById('modelSelect');
const liveAlertBox = document.getElementById('liveAlertBox');
const alertIcon = document.getElementById('alertIcon');
const alertTitle = document.getElementById('alertTitle');
const alertMessage = document.getElementById('alertMessage');
const alertCloseBtn = document.getElementById('alertCloseBtn');
const totalCostStat = document.getElementById('totalCostStat');
const reviewProgressStat = document.getElementById('reviewProgressStat');
const activeModelLabel = document.getElementById('activeModelLabel');

// Modal Elements
const diagramModal = document.getElementById('diagramModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalBackdrop = document.getElementById('modalBackdrop');

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  loadLocalStorageReviews();
  await Promise.all([loadResults(), loadServerReviews()]);
  renderTable();
  updateTopStats();
});

function setupEventListeners() {
  btnGenerate.addEventListener('click', handleLiveGenerate);
  alertCloseBtn.addEventListener('click', hideAlert);
  modalCloseBtn.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', closeModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !diagramModal.classList.contains('hidden')) {
      closeModal();
    }
  });
}

function showAlert(type, title, message) {
  liveAlertBox.className = `alert-box ${type}`;
  alertTitle.textContent = title;
  alertMessage.textContent = message;
  alertIcon.textContent = type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️');
  liveAlertBox.classList.remove('hidden');
}

function hideAlert() {
  liveAlertBox.classList.add('hidden');
}

// 1. Load the 5 pre-saved results without needing an API call on initial load
async function loadResults() {
  try {
    const res = await fetch('/api/results');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      STATE.results = data.data;
    }
  } catch (err) {
    console.error('Failed to load initial results.json:', err);
    showAlert('error', 'Could not load results.json', 'Please ensure results.json is in the project repository.');
  }
}

// 2. Load reviews from server
async function loadServerReviews() {
  try {
    const res = await fetch('/api/reviews');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.reviews) {
        // Merge server reviews over local storage
        STATE.reviews = { ...STATE.reviews, ...data.reviews };
      }
    }
  } catch (err) {
    console.warn('Server review endpoint not accessible, relying on browser LocalStorage:', err);
  }
}

// 3. LocalStorage fallback ensuring reviewer choices persist offline or between refreshes
function loadLocalStorageReviews() {
  try {
    const saved = localStorage.getItem('udhi_diagram_reviews');
    if (saved) {
      STATE.reviews = JSON.parse(saved);
    }
  } catch (e) {
    console.warn('LocalStorage error:', e);
  }
}

function saveLocalStorageReviews() {
  try {
    localStorage.setItem('udhi_diagram_reviews', JSON.stringify(STATE.reviews));
  } catch (e) {
    console.warn('LocalStorage save error:', e);
  }
}

// 4. Render Table with 5 rows
function renderTable() {
  tableBody.innerHTML = '';

  if (!STATE.results || STATE.results.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 3rem; color: #94a3b8;">No diagram results available. Please run Part A generation.</td></tr>`;
    return;
  }

  STATE.results.forEach((item, index) => {
    const row = document.createElement('tr');
    row.id = `row-${item.conceptId}`;

    const subjectClass = `subject-${(item.subject || 'maths').toLowerCase()}`;
    const review = STATE.reviews[item.conceptId] || { status: 'pending', note: '' };
    const checks = item.validation?.checks || {};

    // Render checks list
    const checksHtml = Object.entries(CHECK_TITLES).map(([key, label]) => {
      const check = checks[key] || { pass: false, message: 'Check not run' };
      const passClass = check.pass ? 'pass' : 'fail';
      const icon = check.pass ? '✓' : '✗';
      return `
        <div class="check-item ${passClass}" title="${escapeHtml(check.message)}">
          <span class="check-icon">${icon}</span>
          <div class="check-text">
            <strong>${escapeHtml(label)}</strong>
            <span>${escapeHtml(check.message)}</span>
          </div>
        </div>
      `;
    }).join('');

    row.innerHTML = `
      <!-- Column 1: Concept & Diagram -->
      <td>
        <div class="concept-header">
          <div class="concept-title">
            <span>${index + 1}. ${escapeHtml(item.concept)}</span>
            <span class="subject-badge ${subjectClass}">${escapeHtml(item.subject)}</span>
          </div>
          <div class="concept-prompt-text">
            <em>"${escapeHtml(item.text)}"</em>
          </div>
        </div>
        <div class="svg-preview-container" onclick="openDiagramModal('${item.conceptId}')" title="Click to view full screen">
          ${item.svg || '<span style="color:red">No SVG rendered</span>'}
          <span class="zoom-hint">🔍 Expand</span>
        </div>
      </td>

      <!-- Column 2: Code Checks -->
      <td>
        <div class="checks-list">
          ${checksHtml}
        </div>
      </td>

      <!-- Column 3: Metrics & Cost -->
      <td>
        <div class="metrics-stack">
          <div class="metric-row">
            <span class="metric-name">Model</span>
            <span class="metric-val" title="${escapeHtml(item.modelName)}">${escapeHtml(truncate(item.modelName, 18))}</span>
          </div>
          <div class="metric-row">
            <span class="metric-name">Retries</span>
            <span class="metric-val" style="color: ${item.retries > 0 ? '#f59e0b' : '#10b981'}">${item.retries}</span>
          </div>
          <div class="metric-row">
            <span class="metric-name">In Tokens</span>
            <span class="metric-val">${item.inputTokens?.toLocaleString() || 0}</span>
          </div>
          <div class="metric-row">
            <span class="metric-name">Out Tokens</span>
            <span class="metric-val">${item.outputTokens?.toLocaleString() || 0}</span>
          </div>
          <div class="metric-row">
            <span class="metric-name">Est. Cost</span>
            <span class="metric-val" style="color: #38bdf8;">$${Number(item.costUSD || 0).toFixed(6)}</span>
          </div>
        </div>
      </td>

      <!-- Column 4: Reviewer Actions & Notes -->
      <td>
        <div class="review-box">
          <div class="review-actions">
            <button class="btn btn-sm btn-approve ${review.status === 'approved' ? 'active' : ''}" 
                    onclick="handleReviewDecision('${item.conceptId}', 'approved')">
              ✓ Approve
            </button>
            <button class="btn btn-sm btn-reject ${review.status === 'rejected' ? 'active' : ''}" 
                    onclick="handleReviewDecision('${item.conceptId}', 'rejected')">
              ✗ Reject
            </button>
          </div>
          <textarea class="review-textarea" 
                    id="note-${item.conceptId}" 
                    placeholder="Add reviewer notes for GCSE pedagogy, animation timing, or visual clarity..."
                    oninput="handleNoteChange('${item.conceptId}')">${escapeHtml(review.note || '')}</textarea>
          <div class="review-footer">
            <span class="save-status" id="status-${item.conceptId}">
              ${review.status !== 'pending' ? `Marked ${review.status.toUpperCase()} & saved` : 'Awaiting review'}
            </span>
          </div>
        </div>
      </td>
    `;

    tableBody.appendChild(row);
  });
}

// 5. Update top dashboard metrics
function updateTopStats() {
  const totalCost = STATE.results.reduce((acc, curr) => acc + (Number(curr.costUSD) || 0), 0);
  totalCostStat.textContent = `$${totalCost.toFixed(6)}`;

  const reviewedCount = Object.values(STATE.reviews).filter(r => r.status === 'approved' || r.status === 'rejected').length;
  reviewProgressStat.textContent = `${reviewedCount} / 5 Reviewed`;
  reviewProgressStat.style.color = reviewedCount === 5 ? '#34d399' : (reviewedCount > 0 ? '#38bdf8' : '#a78bfa');

  if (STATE.results.length > 0) {
    activeModelLabel.textContent = STATE.results[0].modelName || 'gemini-2.5-flash';
  }
}

// 6. Reviewer Actions: Approve / Reject and Notes with immediate Dual Persistence
window.handleReviewDecision = async function(conceptId, status) {
  const current = STATE.reviews[conceptId] || { status: 'pending', note: '' };
  const newStatus = (current.status === status) ? 'pending' : status;
  const noteVal = document.getElementById(`note-${conceptId}`)?.value || current.note || '';

  STATE.reviews[conceptId] = {
    status: newStatus,
    note: noteVal,
    updatedAt: new Date().toISOString()
  };

  saveLocalStorageReviews();
  renderTable();
  updateTopStats();

  const statusEl = document.getElementById(`status-${conceptId}`);
  if (statusEl) statusEl.textContent = 'Saving...';

  // Save to server
  try {
    await fetch(`/api/reviews/${conceptId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, note: noteVal })
    });
    if (statusEl) {
      statusEl.textContent = newStatus === 'pending' ? 'Reset to Pending' : `Saved as ${newStatus.toUpperCase()}`;
    }
  } catch (err) {
    console.warn('Server review save failed, saved locally:', err);
    if (statusEl) statusEl.textContent = `Saved in browser (${newStatus.toUpperCase()})`;
  }
};

let noteTimeout = null;
window.handleNoteChange = function(conceptId) {
  const noteVal = document.getElementById(`note-${conceptId}`)?.value || '';
  const current = STATE.reviews[conceptId] || { status: 'pending', note: '' };
  current.note = noteVal;
  STATE.reviews[conceptId] = current;
  saveLocalStorageReviews();

  const statusEl = document.getElementById(`status-${conceptId}`);
  if (statusEl) statusEl.textContent = 'Unsaved changes...';

  clearTimeout(noteTimeout);
  noteTimeout = setTimeout(async () => {
    try {
      await fetch(`/api/reviews/${conceptId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: current.status, note: noteVal })
      });
      if (statusEl) statusEl.textContent = 'Note saved ✓';
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Note saved in browser ✓';
    }
  }, 600);
};

// 7. Live Diagram Generation Button Handler (Part B requirement)
async function handleLiveGenerate() {
  const conceptId = conceptSelect.value;
  const model = modelSelect.value;
  const conceptName = conceptSelect.options[conceptSelect.selectedIndex].text;

  btnGenerate.disabled = true;
  btnGenerate.innerHTML = `<span class="btn-icon">⏳</span><span class="btn-text">Generating & Validating...</span>`;
  showAlert('info', 'Live Generation In Progress', `Sending prompt to ${model} for "${conceptName}". Executing AST code validation & retrying if needed...`);

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conceptId, model })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      const errMsg = data.error || data.message || `HTTP error ${res.status}`;
      showAlert('error', 'Generation Failed', errMsg);
      return;
    }

    const newResult = data.result;
    
    // Update local state table
    const index = STATE.results.findIndex(r => r.conceptId === newResult.conceptId);
    if (index !== -1) {
      STATE.results[index] = newResult;
    } else {
      STATE.results.push(newResult);
    }

    renderTable();
    updateTopStats();

    // Scroll smoothly to updated row
    const targetRow = document.getElementById(`row-${newResult.conceptId}`);
    if (targetRow) {
      targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetRow.style.backgroundColor = 'rgba(79, 70, 229, 0.2)';
      setTimeout(() => { targetRow.style.backgroundColor = ''; }, 2500);
    }

    const checksPass = newResult.validation?.allPassed;
    showAlert(
      checksPass ? 'success' : 'info',
      checksPass ? 'Diagram Generated & Passed All Checks!' : 'Diagram Generated with Warnings',
      `Model: ${newResult.modelName} | Retries: ${newResult.retries} | Cost: $${newResult.costUSD} | Tokens: ${newResult.outputTokens}`
    );
  } catch (err) {
    showAlert('error', 'Network / Server Error', `Could not reach the generation endpoint: ${err.message}`);
  } finally {
    btnGenerate.disabled = false;
    btnGenerate.innerHTML = `<span class="btn-icon">⚡</span><span class="btn-text">Generate Diagram Live</span>`;
  }
}

// 8. Modal Zoom Inspection
window.openDiagramModal = function(conceptId) {
  const item = STATE.results.find(r => r.conceptId === conceptId);
  if (!item) return;

  modalTitle.textContent = `${item.concept} (${item.subject}) - Interactive SVG Preview`;
  modalBody.innerHTML = item.svg || '<p>No SVG available</p>';
  diagramModal.classList.remove('hidden');
};

function closeModal() {
  diagramModal.classList.add('hidden');
  modalBody.innerHTML = '';
}

// Utilities
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.substring(0, max) + '...' : str;
}
