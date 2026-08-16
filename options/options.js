// ============================================================
//  options.js — Options Page Controller
// ============================================================
'use strict';

const defaults = {
  autoAnalyze:   true,
  showOverlay:   true,
  language:      'th',
  threshold:     '60',
  ephemeral:     true,
  analytics:     false
};

const localDefaults = {
  aiProvider: 'openrouter',
  openrouterApiKey: '',
  openrouterModel: 'openrouter/free',
  geminiApiKey: '',
  geminiModel: 'gemini-flash-latest',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'qwen2.5:3b',
  localClassifierEnabled: false,
  localClassifierModel: 'XChava/arn-hai-tos-mdeberta-v1',
  localClassifierDevice: 'wasm',
  localClassifierCloudSummaryEnabled: false,
  localClassifierDebug: false
};

const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  bindEvents();
});

function loadSettings() {
  chrome.storage.sync.get(defaults, settings => {
    $('opt-auto-analyze').checked    = settings.autoAnalyze;
    $('opt-show-overlay').checked    = settings.showOverlay;
    $('opt-language').value          = settings.language;
    $('opt-threshold').value         = settings.threshold;
    $('opt-ephemeral').checked       = settings.ephemeral;
    $('opt-analytics').checked       = settings.analytics;
  });
  chrome.storage.local.get(localDefaults, settings => {
    $('opt-ai-provider').value = settings.aiProvider || localDefaults.aiProvider;
    $('opt-openrouter-key').value = settings.openrouterApiKey || '';
    $('opt-openrouter-model').value = settings.openrouterModel || localDefaults.openrouterModel;
    $('opt-gemini-key').value = settings.geminiApiKey || '';
    $('opt-gemini-model').value = settings.geminiModel || localDefaults.geminiModel;
    $('opt-ollama-base-url').value = settings.ollamaBaseUrl || localDefaults.ollamaBaseUrl;
    $('opt-ollama-model').value = settings.ollamaModel || localDefaults.ollamaModel;
    $('opt-local-classifier-enabled').checked = !!settings.localClassifierEnabled;
    $('opt-local-classifier-model').value = settings.localClassifierModel || localDefaults.localClassifierModel;
    $('opt-local-classifier-device').value = settings.localClassifierDevice || localDefaults.localClassifierDevice;
    $('opt-local-classifier-cloud-summary').checked = !!settings.localClassifierCloudSummaryEnabled;
    $('opt-local-classifier-debug').checked = !!settings.localClassifierDebug;
    updateProviderSections();
  });
}

function saveSettings() {
  const settings = {
    autoAnalyze:   $('opt-auto-analyze').checked,
    showOverlay:   $('opt-show-overlay').checked,
    language:      $('opt-language').value,
    threshold:     $('opt-threshold').value,
    ephemeral:     true,
    analytics:     $('opt-analytics').checked
  };
  const localSettings = collectProviderSettings();

  chrome.storage.sync.set(settings, () => {
    chrome.storage.local.set(localSettings, () => {
      const status = $('save-status');
      status.textContent = '✓ บันทึกแล้ว';
      status.classList.add('visible');
      setTimeout(() => status.classList.remove('visible'), 2500);
    });
  });
}

function collectProviderSettings() {
  return {
    aiProvider: $('opt-ai-provider').value || localDefaults.aiProvider,
    openrouterApiKey: $('opt-openrouter-key').value.trim(),
    openrouterModel: $('opt-openrouter-model').value.trim() || localDefaults.openrouterModel,
    geminiApiKey: $('opt-gemini-key').value.trim(),
    geminiModel: $('opt-gemini-model').value.trim() || localDefaults.geminiModel,
    ollamaBaseUrl: normalizeOllamaBaseUrl($('opt-ollama-base-url').value.trim() || localDefaults.ollamaBaseUrl),
    ollamaModel: $('opt-ollama-model').value.trim() || localDefaults.ollamaModel,
    localClassifierEnabled: $('opt-local-classifier-enabled').checked,
    localClassifierModel: $('opt-local-classifier-model').value.trim() || localDefaults.localClassifierModel,
    localClassifierDevice: $('opt-local-classifier-device').value || localDefaults.localClassifierDevice,
    localClassifierCloudSummaryEnabled: $('opt-local-classifier-cloud-summary').checked,
    localClassifierDebug: $('opt-local-classifier-debug').checked
  };
}

function bindEvents() {
  $('btn-save').addEventListener('click', saveSettings);
  $('opt-ai-provider').addEventListener('change', updateProviderSections);

  $('btn-clear-cache').addEventListener('click', () => {
    chrome.storage.session.clear(() => {
      chrome.storage.local.get(null, data => {
        const aiCacheKeys = Object.keys(data).filter(key => key.startsWith('ai_result_'));
        chrome.storage.local.remove(aiCacheKeys, () => alert('ล้าง Cache เรียบร้อย'));
      });
    });
  });

  $('toggle-key-vis').addEventListener('click', () => toggleInputVisibility('opt-openrouter-key'));
  $('toggle-gemini-key-vis').addEventListener('click', () => toggleInputVisibility('opt-gemini-key'));

  $('btn-test-key').addEventListener('click', testProvider);
  $('btn-test-local-classifier').addEventListener('click', testLocalClassifier);
}

function updateProviderSections() {
  const provider = $('opt-ai-provider').value;
  $('provider-openrouter').classList.toggle('hidden', provider !== 'openrouter');
  $('provider-gemini').classList.toggle('hidden', provider !== 'gemini');
  $('provider-ollama').classList.toggle('hidden', provider !== 'ollama');
}

function toggleInputVisibility(id) {
  const input = $(id);
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function testProvider() {
  const settings = collectProviderSettings();
  const providerLabel = {
    openrouter: 'OpenRouter',
    gemini: 'Gemini',
    ollama: 'Ollama'
  }[settings.aiProvider] || 'Provider';

  if (settings.aiProvider === 'openrouter' && !settings.openrouterApiKey) {
    showTestResult('กรุณาใส่ OpenRouter API Key ก่อน', 'error');
    return;
  }
  if (settings.aiProvider === 'gemini' && !settings.geminiApiKey) {
    showTestResult('กรุณาใส่ Gemini API Key ก่อน', 'error');
    return;
  }

  $('btn-test-key').textContent = 'กำลังทดสอบ…';
  $('btn-test-key').disabled = true;

  try {
    if (settings.aiProvider === 'openrouter') await testOpenRouter(settings);
    else if (settings.aiProvider === 'gemini') await testGemini(settings);
    else await testOllama(settings);

    showTestResult(`✓ ${providerLabel} พร้อมใช้งาน`, 'success');
  } catch (err) {
    showTestResult(`✗ ${err.message}`, 'error');
  } finally {
    $('btn-test-key').textContent = '⚡ ทดสอบ Provider';
    $('btn-test-key').disabled = false;
  }
}

async function testLocalClassifier() {
  const settings = collectProviderSettings();
  $('btn-test-local-classifier').textContent = 'Testing…';
  $('btn-test-local-classifier').disabled = true;

  try {
    await new Promise(resolve => chrome.storage.local.set(settings, resolve));
    const response = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'TEST_LOCAL_CLASSIFIER' }, resolve);
    });
    const result = response?.result || {};
    if (response?.ok) {
      showTestResult(
        `✓ Local Classifier พร้อมใช้งาน — ${result.label || 'no label'}${result.score !== null && result.score !== undefined ? ` (${Number(result.score).toFixed(3)})` : ''}`,
        'success'
      );
    } else {
      showTestResult(`✗ Local Classifier ล้มเหลว — ${result.error || 'unknown error'}`, 'error');
    }
  } catch (err) {
    showTestResult(`✗ Local Classifier ล้มเหลว — ${err.message}`, 'error');
  } finally {
    $('btn-test-local-classifier').textContent = 'Test Local Classifier';
    $('btn-test-local-classifier').disabled = false;
  }
}

async function testOpenRouter(settings) {
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.openrouterApiKey}`,
      'HTTP-Referer': chrome.runtime.getURL(''),
      'X-OpenRouter-Title': 'Arn-Hai'
    },
    body: JSON.stringify({
      model: settings.openrouterModel,
      messages: [{ role: 'user', content: 'Say OK only.' }],
      max_tokens: 8,
      temperature: 0
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!resp.ok) throw new Error(await providerErrorMessage(resp, 'OpenRouter'));
}

async function testGemini(settings) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.geminiModel)}:generateContent`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': settings.geminiApiKey
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Say OK only.' }] }],
      generationConfig: { maxOutputTokens: 8, temperature: 0 }
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!resp.ok) throw new Error(await providerErrorMessage(resp, 'Gemini'));
}

async function testOllama(settings) {
  let resp;
  try {
    resp = await fetch(`${settings.ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.ollamaModel,
        messages: [{ role: 'user', content: 'Say OK only.' }],
        stream: false
      }),
      signal: AbortSignal.timeout(8000)
    });
  } catch (err) {
    throw new Error('เชื่อมต่อ Ollama ไม่ได้ กรุณาตรวจว่า Ollama กำลังรันอยู่ที่ localhost:11434 และ model ถูก pull แล้ว');
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    if (resp.status === 404 || /model/i.test(text)) {
      throw new Error(`ไม่พบโมเดล Ollama นี้ กรุณารัน ollama pull ${settings.ollamaModel} ก่อน`);
    }
    throw new Error('เชื่อมต่อ Ollama ไม่ได้ กรุณาตรวจว่า Ollama กำลังรันอยู่ที่ localhost:11434 และ model ถูก pull แล้ว');
  }
}

async function providerErrorMessage(resp, provider) {
  const data = await resp.json().catch(() => ({}));
  return data?.error?.message || `${provider} HTTP ${resp.status}`;
}

function normalizeOllamaBaseUrl(url) {
  return String(url || localDefaults.ollamaBaseUrl).replace(/\/+$/, '');
}

function showTestResult(msg, type) {
  const el = $('key-test-result');
  el.textContent = msg;
  el.className = `test-result ${type}`;
  el.classList.remove('hidden');
}
