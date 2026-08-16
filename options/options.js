// ============================================================
//  options.js — Options Page Controller
// ============================================================
'use strict';

const defaults = {
  geminiApiKey:  '',
  autoAnalyze:   true,
  showOverlay:   true,
  language:      'th',
  threshold:     '60',
  ephemeral:     true,
  analytics:     false,
  fastapiEnabled: false,
  fastapiUrl:    'http://127.0.0.1:8000/classify',
  fastapiCloudSummaryEnabled: true
};

const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  bindEvents();
});

function loadSettings() {
  chrome.storage.sync.get(defaults, settings => {
    $('opt-gemini-key').value        = settings.geminiApiKey;
    $('opt-auto-analyze').checked    = settings.autoAnalyze;
    $('opt-show-overlay').checked    = settings.showOverlay;
    $('opt-language').value          = settings.language;
    $('opt-threshold').value         = settings.threshold;
    $('opt-ephemeral').checked       = settings.ephemeral;
    $('opt-analytics').checked       = settings.analytics;
    
    $('opt-fastapi-enabled').checked = settings.fastapiEnabled;
    $('opt-fastapi-url').value       = settings.fastapiUrl;
    $('opt-fastapi-cloud-summary').checked = settings.fastapiCloudSummaryEnabled;
    
    $('fastapi-config-card').style.display = settings.fastapiEnabled ? 'block' : 'none';
  });
}

function saveSettings() {
  const settings = {
    geminiApiKey:  $('opt-gemini-key').value.trim(),
    autoAnalyze:   $('opt-auto-analyze').checked,
    showOverlay:   $('opt-show-overlay').checked,
    language:      $('opt-language').value,
    threshold:     $('opt-threshold').value,
    ephemeral:     true,
    analytics:     $('opt-analytics').checked,
    fastapiEnabled: $('opt-fastapi-enabled').checked,
    fastapiUrl:    $('opt-fastapi-url').value.trim(),
    fastapiCloudSummaryEnabled: $('opt-fastapi-cloud-summary').checked
  };

  chrome.storage.sync.set(settings, () => {
    const status = $('save-status');
    status.textContent = '✓ บันทึกแล้ว';
    status.classList.add('visible');
    setTimeout(() => status.classList.remove('visible'), 2500);
  });
}

function bindEvents() {
  $('btn-save').addEventListener('click', saveSettings);

  $('btn-clear-cache').addEventListener('click', () => {
    chrome.storage.session.clear(() => alert('ล้าง Cache เรียบร้อย'));
  });

  $('toggle-key-vis').addEventListener('click', () => {
    const input = $('opt-gemini-key');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  $('btn-test-key').addEventListener('click', testApiKey);
  
  $('opt-fastapi-enabled').addEventListener('change', e => {
    $('fastapi-config-card').style.display = e.target.checked ? 'block' : 'none';
  });
  
  $('btn-test-fastapi').addEventListener('click', testFastapi);
}

async function testApiKey() {
  const key = $('opt-gemini-key').value.trim();
  if (!key) {
    showTestResult('กรุณาใส่ Gemini API Key ก่อน', 'error');
    return;
  }

  $('btn-test-key').textContent = 'กำลังทดสอบ…';
  $('btn-test-key').disabled = true;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Say "OK" only.' }] }],
        generationConfig: { maxOutputTokens: 5 }
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (resp.ok) {
      showTestResult('✓ API Key ถูกต้อง — พร้อมใช้งาน Gemini 2.0 Flash', 'success');
    } else {
      const data = await resp.json().catch(() => ({}));
      const msg = data?.error?.message || `HTTP ${resp.status}`;
      if (resp.status === 400 || resp.status === 403) {
        showTestResult(`✗ API Key ไม่ถูกต้อง: ${msg}`, 'error');
      } else {
        showTestResult(`✗ ${msg}`, 'error');
      }
    }
  } catch (err) {
    if (err.name === 'TimeoutError') {
      showTestResult('✗ Connection timeout — ตรวจสอบ Network', 'error');
    } else {
      showTestResult(`✗ ${err.message}`, 'error');
    }
  } finally {
    $('btn-test-key').textContent = '⚡ ทดสอบ API Key';
    $('btn-test-key').disabled = false;
  }
}

function showTestResult(msg, type) {
  const el = $('key-test-result');
  el.textContent = msg;
  el.className = `test-result ${type}`;
  el.classList.remove('hidden');
}

function showFastapiTestResult(msg, type) {
  const el = $('fastapi-test-result');
  el.textContent = msg;
  el.className = `test-result ${type}`;
  el.classList.remove('hidden');
}

async function testFastapi() {
  const btn = $('btn-test-fastapi');
  const url = $('opt-fastapi-url').value.trim() || 'http://127.0.0.1:8000/classify';
  
  btn.textContent = '⏳ Testing...';
  btn.disabled = true;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: ["This is a test."] }),
      signal: AbortSignal.timeout(5000)
    });
    
    if (resp.ok) {
      showFastapiTestResult('✓ Connected to FastAPI successfully', 'success');
    } else {
      showFastapiTestResult(`✗ Server returned HTTP ${resp.status}`, 'error');
    }
  } catch (err) {
    showFastapiTestResult(`✗ Connection failed: ${err.message}`, 'error');
  } finally {
    btn.textContent = '⚡ Test Connection';
    btn.disabled = false;
  }
}

