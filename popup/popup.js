// ============================================================
//  popup.js — Popup UI Controller
//  + Scam Detection Panel
// ============================================================
'use strict';

let currentResult  = null;
let currentUrl     = '';
let analyzing      = false;
let currentScam    = null;

const $ = id => document.getElementById(id);
const states = { idle: $('state-idle'), analyzing: $('state-analyzing'), result: $('state-result'), error: $('state-error') };
let synth = window.speechSynthesis;

document.addEventListener('DOMContentLoaded', async () => { 
  synth.cancel(); // Clear any pending speech when popup opens
  await init(); 
  bindEvents(); 
});

async function init() {
  const tab  = await getActiveTab();
  currentUrl = tab?.url || '';
  updateStatusPill('scanning');

  // ก่อนอื่น เช็ค cache ก่อน
  chrome.runtime.sendMessage({ type: 'GET_PAGE_STATUS' }, response => {
    if (chrome.runtime.lastError) { showState('idle'); updateStatusPill('active'); return; }
    if (response?.hasResult && response.result) {
      currentResult = response.result;
      renderResult(response.result);
      showState('result');
      updateStatusPill('active');
      return;
    }

    // ถ้าไม่มี cache — ถาม content script ว่าหน้านี้เป็น ToS ไหม
    if (isTosUrl(currentUrl)) {
      startAnalysis();
      return;
    }

    // ถาม content script โดยตรง
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) { showState('idle'); updateStatusPill('active'); return; }
      chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' }, csResp => {
        if (chrome.runtime.lastError || !csResp) {
          showState('idle'); updateStatusPill('active'); return;
        }
        if (csResp.isTos) {
          startAnalysis();
        } else {
          showState('idle');
          updateStatusPill('active');
        }
      });
    });
  });
}

function bindEvents() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
      // Auto-run scam scan when tab opened for first time
      if (tab.dataset.tab === 'scam' && !currentScam) runScamScan();
    });
  });

  $('btn-analyze-manual')?.addEventListener('click', () => {
    const val = $('manual-input').value.trim();
    if (!val) return;
    startAnalysis(val);
  });

  $('btn-scam-check')?.addEventListener('click', () => {
    const val = $('manual-input').value.trim();
    startScamCheckFromText(val || null);
  });

  $('btn-open-web')?.addEventListener('click',  () => chrome.tabs.create({ url: currentUrl }));
  $('btn-reanalyze')?.addEventListener('click', () => startAnalysis());
  $('btn-retry')?.addEventListener('click',     () => startAnalysis());
  $('btn-run-scam')?.addEventListener('click',  () => runScamScan(true));
  $('btn-play-tts')?.addEventListener('click',  toggleTTS);

  document.addEventListener('click', e => {
    if (e.target.id === 'settings-link' || e.target.id === 'go-settings') {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    }
  });

  $('chat-send')?.addEventListener('click', handleChatSend);
  $('chat-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleChatSend(); });
}

// ── ToS Analysis ──
async function startAnalysis(manualInput = null) {
  if (analyzing) return;
  analyzing = true;
  showState('analyzing');
  $('analyzing-title').textContent = 'กำลังวิเคราะห์ ToS…';
  updateStatusPill('scanning');
  animateProgress([
    { pct: 20, label: 'Extracting text…' },
    { pct: 45, label: 'Clause Classifier · Running…' },
    { pct: 70, label: 'Summarization Model · Running…' },
    { pct: 90, label: 'Calculating Risk Score…' },
  ]);
  const msgType = manualInput ? 'ANALYZE_TEXT' : 'ANALYZE_URL';
  const payload = manualInput ? { type: msgType, text: manualInput, url: currentUrl } : { type: msgType, url: currentUrl };

  // Timeout guard — ถ้า service worker ไม่ตอบใน 30s ให้แสดง error
  let responded = false;
  const timeout = setTimeout(() => {
    if (!responded) {
      analyzing = false;
      clearProgressAnim();
      showError('หมดเวลา — กรุณาลองอีกครั้ง (Service Worker อาจ restart)');
    }
  }, 30000);

  chrome.runtime.sendMessage(payload, response => {
    responded = true;
    clearTimeout(timeout);
    analyzing = false;
    clearProgressAnim();
    if (chrome.runtime.lastError) { showError(chrome.runtime.lastError.message || 'เกิดข้อผิดพลาด'); return; }
    if (!response?.ok) { showError(response?.error || 'เกิดข้อผิดพลาด'); return; }
    currentResult = response.result;
    if (response.isTestMode) showTestModeBanner(true);
    renderResult(response.result);
    showState('result');
    updateStatusPill('active');
    setProgress(100, 'Done');
  });
}

// ── Scam Scan ──
async function startScamCheckFromText(text) {
  if (analyzing) return;
  analyzing = true;
  showState('analyzing');
  $('analyzing-title').textContent = 'กำลังตรวจ Scam…';
  updateStatusPill('scanning');
  animateProgress([
    { pct: 25, label: 'กำลังอ่านหน้าเว็บ…' },
    { pct: 55, label: 'ตรวจ Scam Patterns…' },
    { pct: 80, label: 'วิเคราะห์ URL…' },
  ]);

  // Get page info from content script
  let pageInfo = {};
  try {
    const [tab]  = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
    const csResp = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' }, resp => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(resp);
      });
    });
    if (!text && csResp?.text) text = csResp.text;
    pageInfo = csResp?.pageInfo || {};
  } catch {}

  chrome.runtime.sendMessage({ type: 'SCAN_SCAM', text: text || '', url: currentUrl, pageInfo }, response => {
    analyzing = false;
    clearProgressAnim();
    if (chrome.runtime.lastError || !response?.ok) { showError(response?.error || 'เกิดข้อผิดพลาด'); return; }
    currentScam   = response.scam;
    // Create minimal result for display
    if (!currentResult) {
      currentResult = { url: currentUrl, riskScore: 0, riskLevel: 'LOW', clauses: [], redFlags: [], summary: [], scam: response.scam };
    } else {
      currentResult.scam = response.scam;
    }
    renderResult(currentResult);
    showState('result');
    updateStatusPill('active');
    setProgress(100, 'Done');
    switchTab('scam');
  });
}

async function runScamScan(useAI = false) {
  if (!currentResult && !currentUrl) return;
  const btn = $('btn-run-scam');
  if (btn) { btn.textContent = '⏳ กำลังสแกน…'; btn.disabled = true; }

  let text = '';
  let pageInfo = {};
  try {
    const [tab]  = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
    const csResp = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' }, resp => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(resp);
      });
    });
    text     = csResp?.text || '';
    pageInfo = csResp?.pageInfo || {};
  } catch {}

  const msgType = useAI ? 'SCAN_SCAM_AI' : 'SCAN_SCAM';
  chrome.runtime.sendMessage({ type: msgType, text, url: currentUrl, pageInfo }, response => {
    if (btn) { btn.textContent = '⚡ สแกน Scam ด้วย AI'; btn.disabled = false; }
    if (!response?.ok) { renderScamError(response?.error); return; }
    currentScam = response.scam;
    if (currentResult) currentResult.scam = response.scam;
    renderScamPanel(response.scam);
  });
}

// ── Render Result ──
function renderResult(r) {
  try { $('site-url').textContent = new URL(r.url).hostname; }
  catch { $('site-url').textContent = r.url?.slice(0, 30) || 'unknown'; }

  if (r.isTestMode) showTestModeBanner(true);

  const score      = r.riskScore;
  const scoreColor = score >= 70 ? '#E24B4A' : score >= 40 ? '#EF9F27' : '#639922';
  const arc        = $('gauge-arc');
  const offset     = 188.5 - (score / 100) * 188.5;
  arc.style.stroke            = scoreColor;
  arc.style.strokeDashoffset  = offset;
  $('gauge-num').textContent  = score;
  $('gauge-num').style.color  = scoreColor;

  const badge = $('risk-badge');
  badge.className = 'risk-badge' + (r.riskLevel === 'MEDIUM' ? ' medium' : r.riskLevel === 'LOW' ? ' low' : '');
  $('risk-icon').textContent  = r.riskLevel === 'HIGH' ? '⚠' : r.riskLevel === 'MEDIUM' ? '!' : '✓';
  $('risk-label').textContent = r.riskLevel === 'HIGH' ? 'ความเสี่ยงสูง' : r.riskLevel === 'MEDIUM' ? 'ความเสี่ยงกลาง' : 'ความเสี่ยงต่ำ';

  const high = r.clauses.filter(c => c.riskLevel === 'HIGH').length;
  const med  = r.clauses.filter(c => c.riskLevel === 'MEDIUM').length;
  $('risk-desc').textContent = `พบ ${high} clause ความเสี่ยงสูง และ ${med} clause ความเสี่ยงกลาง`;

  if (r.comparison) { $('compare-text').textContent = r.comparison; $('risk-compare').style.display = 'flex'; }

  renderClauses(r.redFlags?.length > 0 ? r.redFlags : r.clauses);
  renderSummary(r.summary || []);

  // Scam tab badge
  const scamTab = document.querySelector('.tab-scam');
  if (r.scam && r.scam.scamLevel !== 'SAFE' && scamTab) {
    const colors = { DANGER: '#E24B4A', WARNING: '#EF9F27', CAUTION: '#F5A623' };
    scamTab.innerHTML = `<span style="color:${colors[r.scam.scamLevel]}">⚠</span> Scam`;
    renderScamPanel(r.scam);
  }
}

function renderClauses(clauses) {
  const list = $('clause-list');
  list.innerHTML = '';
  if (!clauses || clauses.length === 0) {
    list.innerHTML = '<p style="padding:16px;text-align:center;font-size:12px;color:var(--text3)">ไม่พบ Clause ที่น่าเป็นห่วง 🟢</p>';
    return;
  }
  const catTh = { 'Data Sharing':'แชร์ข้อมูลกับ Third Party', 'Location Track':'Location Tracking', 'Data Retention':'เก็บข้อมูลหลังลบบัญชี', 'Arbitration':'ข้อกำหนดอนุญาโตตุลาการ', 'Auto-billing':'ต่ออายุอัตโนมัติ', 'User Rights':'สิทธิ์ผู้ใช้', 'General':'ทั่วไป' };
  clauses.forEach(c => {
    const div = document.createElement('div');
    div.className = 'clause-item';
    div.innerHTML = `
      <div class="risk-dot dot-${c.riskLevel}"></div>
      <div style="flex:1">
        <div class="clause-text">${c.text || ''}</div>
        <div class="clause-cat">${catTh[c.category] || c.category}${c.section ? ' · Section ' + c.section : ''}</div>
      </div>`;
    list.appendChild(div);
  });
}

function renderSummary(items) {
  const list = $('summary-list');
  list.innerHTML = '';
  items.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'summary-item';
    div.innerHTML = `<span class="sum-num">${i + 1}.</span><span>${item}</span>`;
    list.appendChild(div);
  });
}

// ── Scam Panel Render ──
function renderScamPanel(scam) {
  if (!scam) return;

  const colors  = { DANGER: '#E24B4A', WARNING: '#EF9F27', CAUTION: '#F5A623', SAFE: '#639922' };
  const levelTh = { DANGER: '🚨 อันตราย', WARNING: '⚠ น่าสงสัย', CAUTION: '⚡ ควรระวัง', SAFE: '✓ ปลอดภัย' };
  const color   = colors[scam.scamLevel] || '#639922';

  // Score ring
  const arc    = $('scam-arc');
  const offset = 150.8 - (scam.scamScore / 100) * 150.8;
  arc.style.stroke           = color;
  arc.style.strokeDashoffset = offset;
  $('scam-score-num').textContent  = scam.scamScore;
  $('scam-score-num').style.color  = color;

  // Level badge
  const badge = $('scam-level-badge');
  badge.textContent   = levelTh[scam.scamLevel] || '–';
  badge.style.color   = color;
  badge.style.background = color + '18';
  badge.style.borderColor = color + '44';

  // Type label
  $('scam-type-label').textContent = scam.dominantType ? scam.dominantType.th : (scam.scamLevel === 'SAFE' ? 'ไม่พบ Scam Pattern' : 'พบหลายประเภท');

  // AI Summary
  if (scam.aiSummary) {
    const el = $('scam-ai-summary');
    el.textContent = scam.aiSummary;
    el.style.display = 'block';
  }

  // Safe / Danger state
  if (scam.scamLevel === 'SAFE' && (!scam.signals || scam.signals.length === 0) && (!scam.urlFlags || scam.urlFlags.length === 0)) {
    $('scam-signals-wrap').style.display = 'none';
    $('scam-url-wrap').style.display     = 'none';
    $('scam-advice-wrap').style.display  = 'none';
    $('scam-safe').style.display         = 'block';
    if (scam.isTosContext) {
      $('scam-safe').innerHTML = '✓ ไม่พบสัญญาณ Scam<br><span style="font-size:11px;color:var(--text2);font-weight:400">หน้านี้เป็นเอกสาร ToS/Privacy Policy — คำศัพท์ด้านความปลอดภัยปกติถูก filter ออกแล้ว</span>';
    }
    return;
  }
  $('scam-safe').style.display = 'none';

  // Signals
  const sigList = $('scam-signals-list');
  sigList.innerHTML = '';
  if (scam.signals && scam.signals.length > 0) {
    $('scam-signals-wrap').style.display = 'block';
    scam.signals.forEach(s => {
      const div = document.createElement('div');
      div.className = 'scam-signal-item';
      const weightColor = s.weight >= 3 ? '#E24B4A' : '#EF9F27';
      const icon = { INVESTMENT:'📈', ROMANCE:'💔', PHISHING:'🎣', JOB:'💼', CRYPTO:'🪙', IMPERSONATION:'🎭' };
      div.innerHTML = `
        <div class="scam-signal-icon">${icon[s.type] || '⚠'}</div>
        <div class="scam-signal-body">
          <div class="scam-signal-title" style="color:${weightColor}">${s.signal}</div>
          <div class="scam-signal-detail">${s.detail}</div>
        </div>`;
      sigList.appendChild(div);
    });
  } else {
    $('scam-signals-wrap').style.display = 'none';
  }

  // URL Flags
  const urlList = $('scam-url-list');
  urlList.innerHTML = '';
  if (scam.urlFlags && scam.urlFlags.length > 0) {
    $('scam-url-wrap').style.display = 'block';
    scam.urlFlags.forEach(f => {
      const div = document.createElement('div');
      div.className = 'scam-url-item';
      div.innerHTML = `<span class="scam-url-dot">●</span><span>${f}</span>`;
      urlList.appendChild(div);
    });
  } else {
    $('scam-url-wrap').style.display = 'none';
  }

  // Advice
  const advList = $('scam-advice-list');
  advList.innerHTML = '';
  if (scam.advice && scam.advice.length > 0) {
    $('scam-advice-wrap').style.display = 'block';
    scam.advice.forEach((a, i) => {
      const div = document.createElement('div');
      div.className = 'scam-advice-item';
      div.innerHTML = `<span class="scam-adv-num">${i + 1}</span><span>${a}</span>`;
      advList.appendChild(div);
    });
  } else {
    $('scam-advice-wrap').style.display = 'none';
  }
}

function renderScamError(msg) {
  const wrap = $('scam-signals-list');
  if (wrap) wrap.innerHTML = `<p style="padding:12px;color:var(--text2);font-size:12px">เกิดข้อผิดพลาด: ${msg || 'ไม่ทราบสาเหตุ'}</p>`;
}

// ── AI Chat ──
async function handleChatSend() {
  const input = $('chat-input');
  const q     = input.value.trim();
  if (!q) return;
  appendChatMsg(q, 'user');
  input.value = '';
  chrome.runtime.sendMessage({ type: 'ASK_AI', question: q, result: currentResult }, response => {
    appendChatMsg(response?.answer || 'กรุณาเชื่อม AI Endpoint ใน Settings', 'ai');
  });
}

function appendChatMsg(text, role) {
  const log = $('chat-log');
  const div = document.createElement('div');
  div.className   = `chat-msg ${role}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// ── Text-to-Speech (TTS) ──
let currentTtsText = '';
let currentTtsIndex = 0;
let isPlayingTTS = false;
let isPausedTTS = false;

function toggleTTS() {
  if (!currentResult) return;
  const btn = $('btn-play-tts');
  const icon = $('tts-icon');
  const label = $('tts-label');

  if (isPlayingTTS) {
    // สั่งหยุดทันที (ใช้ cancel แทน pause เพื่อลดความหน่วง)
    isPausedTTS = true;
    isPlayingTTS = false;
    synth.cancel(); 
    
    btn.classList.remove('tts-playing');
    icon.textContent = '▶';
    label.textContent = 'เล่นต่อ';
    return;
  }

  if (isPausedTTS) {
    // เล่นต่อจากคำที่ค้างไว้
    isPausedTTS = false;
    playFromIndex(currentTtsIndex);
    return;
  }

  // เริ่มอ่านใหม่ตั้งแต่ต้น
  const textToRead = currentResult.ttsText || (currentResult.summary ? currentResult.summary.join(' ') : 'ไม่มีข้อมูลสรุป');
  if (!textToRead) return;
  
  currentTtsText = textToRead;
  currentTtsIndex = 0;
  playFromIndex(0);
}

function playFromIndex(startIndex) {
  if (!currentTtsText) return;
  
  const textToRead = currentTtsText.substring(startIndex);
  if (!textToRead.trim()) {
    resetTTSState();
    return;
  }

  synth.cancel(); // รีเซ็ตเอนจินก่อน

  const utterance = new SpeechSynthesisUtterance(textToRead);
  utterance.lang = 'th-TH';
  utterance.rate = 1.1;
  
  const voices = synth.getVoices();
  const thaiVoice = voices.find(v => v.lang.includes('th') && v.localService) || voices.find(v => v.lang.includes('th'));
  if (thaiVoice) utterance.voice = thaiVoice;

  // จำตำแหน่งคำล่าสุด (คำนวณจาก text ที่ถูกตัด + index เดิม)
  utterance.onboundary = (e) => {
    currentTtsIndex = startIndex + e.charIndex;
  };

  utterance.onstart = () => {
    isPlayingTTS = true;
    const btn = $('btn-play-tts');
    btn.classList.add('tts-playing');
    $('tts-icon').textContent = '⏸';
    $('tts-label').textContent = 'กำลังพูด...';
  };

  utterance.onend = () => {
    if (isPausedTTS) return; // ถ้าเราตั้งใจหยุดเอง (pause) ไม่ต้องเคลียร์สถานะ
    resetTTSState();
  };

  utterance.onerror = () => {
    if (isPausedTTS) return;
    resetTTSState();
  };

  synth.speak(utterance);
}

function resetTTSState() {
  isPlayingTTS = false;
  isPausedTTS = false;
  currentTtsIndex = 0;
  const btn = $('btn-play-tts');
  if (btn) {
    btn.classList.remove('tts-playing');
    $('tts-icon').textContent = '🔊';
    $('tts-label').textContent = 'ฟังเสียงสรุป';
  }
}

// ── UI Helpers ──
function showState(name) {
  Object.values(states).forEach(s => s?.classList.add('hidden'));
  states[name]?.classList.remove('hidden');
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  ['flags','summary','scam','ai'].forEach(p => {
    const el = $('panel-' + p);
    if (el) el.classList.toggle('hidden', p !== name);
  });
}

function updateStatusPill(state) {
  const pill = $('status-pill'), text = $('status-text');
  pill.className = 'status-pill';
  if (state === 'scanning')      { pill.classList.add('scanning'); text.textContent = 'Scanning…'; }
  else if (state === 'error')    { pill.classList.add('error');    text.textContent = 'Error'; }
  else                            text.textContent = 'Active';
}

function showTestModeBanner(show) {
  const b = $('test-mode-banner');
  if (b) b.style.display = show ? 'flex' : 'none';
}

function showError(msg) {
  $('error-desc').textContent = msg;
  if (msg.includes('API Key') || msg.includes('Gemini')) {
    $('error-desc').innerHTML = msg + '<br><br><a href="#" id="go-settings" style="color:#5DCAA5;text-decoration:underline">→ ไปที่ Settings เพื่อใส่ API Key</a>';
    setTimeout(() => {
      $('go-settings')?.addEventListener('click', e => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
    }, 50);
  }
  showState('error');
  updateStatusPill('error');
}

let _progTimer = null, _progIdx = 0;
function animateProgress(steps) {
  _progIdx = 0;
  function next() {
    if (_progIdx >= steps.length) return;
    const s = steps[_progIdx++];
    setProgress(s.pct, s.label);
    _progTimer = setTimeout(next, 600 + Math.random() * 400);
  }
  next();
}
function setProgress(pct, label) {
  const fill = $('progress-fill'), lbl = $('progress-label');
  if (fill) fill.style.width = pct + '%';
  if (lbl)  lbl.textContent  = label;
}
function clearProgressAnim() { if (_progTimer) clearTimeout(_progTimer); }
function isTosUrl(url)       { return /terms|privacy|policy|tos|ข้อกำหนด/i.test(url); }
function getActiveTab()      { return new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, tabs => r(tabs[0]))); }
