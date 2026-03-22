// --- Global State ---
let activeTab = 'normalizer';
let currentJobId = null;
let poller = null;
let configMode = 'parser';

// --- UI Helpers ---
function showTab(tabId) {
  activeTab = tabId;
  document.getElementById('section-normalizer').style.display = tabId === 'normalizer' ? 'grid' : 'none';
  document.getElementById('section-config').style.display = tabId === 'config' ? 'grid' : 'none';
  
  document.getElementById('nav-normalizer').classList.toggle('active', tabId === 'normalizer');
  document.getElementById('nav-config').classList.toggle('active', tabId === 'config');
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// --- Report Normalizer Logic ---
async function startNormalizer() {
  const fileInput = document.getElementById('zipInput');
  if (!fileInput.files.length) return;

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  const btn = document.getElementById('startBtn');
  btn.disabled = true;
  document.getElementById('formMsg').textContent = 'Launching Mission...';

  try {
    const resp = await fetch('/api/start', { method: 'POST', body: formData });
    const data = await resp.json();
    currentJobId = data.job_id;
    
    if (poller) clearInterval(poller);
    poller = setInterval(() => pollProgress(currentJobId), 1000);
  } catch (err) {
    document.getElementById('formMsg').textContent = 'Error: ' + err.message;
    btn.disabled = false;
  }
}

async function pollProgress(jobId) {
  try {
    const resp = await fetch(`/api/progress/${jobId}`);
    const p = await resp.json();

    const badge = document.getElementById('statusBadge');
    badge.textContent = p.status.toUpperCase();
    badge.className = `badge-celestial ${p.status}`;

    document.getElementById('phaseText').textContent = `Sector: ${p.phase}`;
    document.getElementById('messageText').textContent = p.message || 'Scanning...';
    
    const pct = p.total_phases > 0 ? (p.current_phase / p.total_phases) * 100 : 0;
    document.getElementById('meterBar').style.width = `${pct}%`;
    document.getElementById('countText').textContent = `${Math.round(pct)}%`;

    if (p.summary) {
      document.getElementById('totalTests').textContent = p.summary.total || 0;
      document.getElementById('passedTests').textContent = p.summary.passed || 0;
      document.getElementById('failedTests').textContent = p.summary.failed || 0;
      document.getElementById('passRate').textContent = `${p.summary.pass_rate || 0}%`;
      document.getElementById('totalSteps').textContent = p.summary.steps || 0;
    }

    if (p.status === 'completed') {
      clearInterval(poller);
      document.getElementById('formMsg').textContent = 'Mission Complete.';
      const dl = document.getElementById('downloadBtn');
      dl.classList.remove('disabled');
      dl.href = `/api/download/${jobId}`;
      document.getElementById('previewBtn').disabled = false;
      document.getElementById('startBtn').disabled = false;
    }
  } catch (e) {}
}

async function previewArtifact() {
  if (!currentJobId) return;
  const resp = await fetch(`/api/result/${currentJobId}`);
  const data = await resp.json();
  document.getElementById('jsonPreview').textContent = JSON.stringify(data, null, 2);
  document.getElementById('copyMainBtn').disabled = false;
}

// --- Config Generator Logic ---
function switchConfigTab(mode) {
  configMode = mode;
  document.getElementById('tabParser').classList.toggle('active', mode === 'parser');
  document.getElementById('tabWeightage').classList.toggle('active', mode === 'weightage');
  document.getElementById('tabPythonWeightage').classList.toggle('active', mode === 'python-weightage');

  const strategyContainer = document.getElementById('strategyContainer');
  if (mode === 'weightage' || mode === 'python-weightage') {
    strategyContainer.style.display = 'flex';
    document.getElementById('inputLabel').textContent = mode === 'python-weightage' ? 'Python Test Script' : 'Source JSON Feed';
    document.getElementById('rawInput').placeholder = mode === 'python-weightage' ? '// Paste Python (pytest) code here...' : '// Paste source JSON...';
  } else {
    strategyContainer.style.display = 'none';
    document.getElementById('inputLabel').textContent = 'Raw Input Terminal';
    document.getElementById('rawInput').placeholder = '// Paste Playwright logs...';
  }
}


async function processConfig() {
  const input = document.getElementById('rawInput').value;
  if (!input) return;

  const btn = document.getElementById('configProcessBtn');
  btn.disabled = true;
  btn.textContent = 'Scanning...';

  try {
    let endpoint = '/api/config/parse';
    let body = { data: input };

    if (configMode === 'weightage') {
        endpoint = '/api/config/weightage';
    } else if (configMode === 'python-weightage') {
        endpoint = '/api/config/python-weightage';
        body.strategy = document.getElementById('weightageStrategy').value;
    }

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await resp.json();

    let outputForDisplay = result.output;
    if (configMode === 'python-weightage' && document.getElementById('weightageStrategy').value === 'intelligent') {
      outputForDisplay = (result.output || []).map(group => ({
        ...group,
        testcases: (group.testcases || []).map(test => ({
          name: test.name,
          weightage: test.weightage
        }))
      }));
    }

    const jsonStr = JSON.stringify(outputForDisplay, null, 2);
    document.getElementById('configOutput').textContent = jsonStr;
    
    // --- INTELLIGENT REASONING DISPLAY ---
    const reasoningContainer = document.getElementById('reasoningContainer');
    const reasoningContent = document.getElementById('reasoningContent');
    
    if (configMode === 'python-weightage' && document.getElementById('weightageStrategy').value === 'intelligent') {
      const tests = result.output?.[0]?.testcases || [];
      if (tests.length > 0) {
        reasoningContent.innerHTML = tests.map(t => `
          <div style="margin-bottom: 0.8rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.5rem;">
            <div style="display:flex; justify-content:space-between; margin-bottom: 0.2rem;">
              <span style="color: #fff; font-weight: 700; font-size: 0.75rem;">${t.name}</span>
              <span style="color: var(--ion-cyan); font-family: 'JetBrains Mono'; font-size: 0.7rem;">${t.weightage}</span>
            </div>
            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5); font-style: italic;">
              ${t.reason || 'No analysis available.'}
            </div>
          </div>
        `).join('');
        reasoningContainer.style.display = 'block';
      } else {
        reasoningContainer.style.display = 'none';
      }
    } else {
      reasoningContainer.style.display = 'none';
    }

    // History
    let history = JSON.parse(localStorage.getItem('nova_vortex_history') || '[]');
    history.unshift({ id: Date.now(), data: jsonStr, mode: configMode, time: new Date().toLocaleTimeString() });
    if (history.length > 5) history.pop();
    localStorage.setItem('nova_vortex_history', JSON.stringify(history));

    let count = configMode === 'parser' ? (result.output.tests?.length || 0) : (result.output[0]?.testcases?.length || 0);
    document.getElementById('configCount').textContent = count.toString().padStart(2, '0');
  } catch (e) {}
  finally {
    btn.disabled = false;
    btn.textContent = configMode === 'parser' ? 'Initiate Scan' : 'Calibrate Weightage';
  }
}

function openHistory() {
  const history = JSON.parse(localStorage.getItem('nova_vortex_history') || '[]');
  const content = document.getElementById('historyContent');
  if (!history.length) { content.innerHTML = '<p style="text-align:center; opacity:0.5; padding:2rem;">Archive Empty.</p>'; }
  else {
    content.innerHTML = history.map(item => `
      <div style="background:rgba(255,255,255,0.03); border:1px solid var(--glass-border); padding:1rem; border-radius:12px; margin-bottom:1rem;">
        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem; font-size:0.7rem; font-weight:800;">
          <span style="color:var(--nebula-pink);">${item.mode.toUpperCase()}</span>
          <span style="opacity:0.4;">${item.time}</span>
        </div>
        <pre style="font-size:0.65rem; color:var(--ion-cyan); max-height:60px; overflow:hidden; opacity:0.6;">${item.data.substring(0, 150)}...</pre>
        <button class="btn-ion" onclick="restoreHistory('${item.id}')" style="margin-top:0.75rem; padding:0.4rem; font-size:0.6rem;">Restore</button>
      </div>
    `).join('');
  }
  openModal('historyOverlay');
}

function restoreHistory(id) {
  const history = JSON.parse(localStorage.getItem('nova_vortex_history') || '[]');
  const item = history.find(h => String(h.id) === String(id));
  if (item) {
    document.getElementById('configOutput').textContent = item.data;
    closeModal('historyOverlay');
  }
}

async function copyToClipboard(elementId, btnId) {
  const content = document.getElementById(elementId).textContent;
  if (content.startsWith('//') || content.startsWith('No result')) return;
  
  try {
    await navigator.clipboard.writeText(content);
    const btn = document.getElementById(btnId);
    const oldText = btn.innerHTML;
    btn.innerHTML = 'Copied ✔';
    btn.style.background = '#10b981';
    btn.style.color = '#000';
    setTimeout(() => {
      btn.innerHTML = oldText;
      btn.style.background = '';
      btn.style.color = '';
    }, 2000);
  } catch (e) {}
}





