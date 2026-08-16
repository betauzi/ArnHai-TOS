// ============================================================
//  content.js — Content Script v1.2.2
//  Auto-notification: banner เล็กๆ ทันที ไม่ต้องกด extension
//  - ทุกหน้า: rule-based scam scan ทันที
//  - หน้า ToS: แจ้ง + รอผล AI analyze แล้วอัปเดต
// ============================================================

(function () {
  'use strict';

  let bannerEl        = null;
  let overlayInjected = false;
  let currentResult   = null;
  let bannerDismissed = false;

  // ── Known safe domains (ไม่ขึ้น scam banner) ──
  const KNOWN_SAFE = /\b(google|facebook|youtube|twitter|instagram|microsoft|apple|amazon|shopee|lazada|kasikornbank|scb|krungthai|bualuang|grab|line|samsung|sony|lg|netflix|spotify)\b/i;

  // ── Rule-based scam signals (subset, เพื่อให้ run ใน content script ได้เลย) ──
  const QUICK_SIGNAL_RULES = [
    { pattern: /guaranteed.{0,20}(profit|return)|การันตี.{0,20}(กำไร|ผลตอบแทน)/i,               label: 'รับประกันกำไร',           type: 'INVESTMENT', weight: 3 },
    { pattern: /ขอยืม.{0,20}(เงิน|บาท)|send.{0,20}money|โอนเงิน.{0,20}(ให้|มา)/i,              label: 'ขอโอนเงิน',               type: 'ROMANCE',    weight: 3 },
    { pattern: /account.{0,20}(suspended|blocked)|บัญชี.{0,20}(ถูกระงับ|ถูกล็อก)/i,            label: 'บัญชีถูกระงับ',           type: 'PHISHING',   weight: 3 },
    { pattern: /verify.{0,20}(account|identity)|ยืนยัน.{0,20}(บัญชี|ตัวตน)/i,                  label: 'ขอยืนยันตัวตน',           type: 'PHISHING',   weight: 3 },
    { pattern: /pig.butcher|หมูถูกเชือด|ชวนลงทุน.{0,30}(แอป|app)|withdraw.{0,20}ไม่ได้/i,     label: 'Pig Butchering',           type: 'INVESTMENT', weight: 3 },
    { pattern: /work.from.home|ทำงานที่บ้าน.{0,20}(รายได้|เงิน)/i,                              label: 'งาน Part-time รายได้สูง', type: 'JOB',        weight: 3 },
    { pattern: /ค่าสมัคร|registration.fee|จ่าย.{0,20}ก่อน.{0,20}(ทำงาน|เริ่ม)/i,              label: 'ต้องจ่ายเงินก่อนทำงาน',   type: 'JOB',        weight: 3 },
    { pattern: /elon.musk|celebrity.{0,20}(endorse|recommend)|ดารา.{0,20}(แนะนำ|รับรอง)/i,     label: 'อ้างบุคคลดัง',            type: 'CRYPTO',     weight: 3 },
    { pattern: /dsi|ดีเอสไอ|กรมสรรพากร|ตำรวจ.{0,10}โทร|แจ้งความ.{0,10}ออนไลน์/i,             label: 'แอบอ้างหน่วยงานรัฐ',      type: 'IMPERSONATION', weight: 3 },
    { pattern: /(\d{2,4}%).{0,20}(ต่อวัน|per day|daily)/i,                                      label: 'ผลตอบแทนสูงผิดปกติ',      type: 'INVESTMENT', weight: 3 },
  ];

  const TOS_FALSE_POSITIVE = new Set([
    'ขอยืนยันตัวตน', 'บัญชีถูกระงับ',
  ]);

  const SCAM_ICONS  = { INVESTMENT:'📈', ROMANCE:'💔', PHISHING:'🎣', JOB:'💼', CRYPTO:'🪙', IMPERSONATION:'🎭' };
  const SCAM_COLORS = { DANGER:'#E24B4A', WARNING:'#EF9F27', CAUTION:'#F5A623', SAFE:'#639922' };
  const SCAM_LABELS = { DANGER:'🚨 อันตราย', WARNING:'⚠ น่าสงสัย', CAUTION:'⚡ ควรระวัง', SAFE:'✓ ปลอดภัย' };

  // ── ตรวจหน้า ToS/Privacy Policy ──
  function detectTosPage() {
    const pat = /terms.of.service|terms.of.use|terms.and.conditions|privacy.policy|ข้อกำหนด|นโยบายความเป็นส่วนตัว/i;
    const url = location.href;
    const title = document.title || '';
    const h1s = Array.from(document.querySelectorAll('h1,h2')).map(h => h.innerText).join(' ');
    return /\/terms|\/privacy|\/legal|\/tos|\/eula/i.test(url) || pat.test(title) || pat.test(url) || pat.test(h1s);
  }

  // ── ดึง visible text ──
  function extractTosText() {
    const main = document.querySelector('main, article, [role="main"], .content, #content, .terms, #terms');
    return (main || document.body).innerText.trim().slice(0, 20000);
  }

  // ── ตรวจ page structure สำหรับ scam ──
  function inspectPageStructure() {
    const inputs        = Array.from(document.querySelectorAll('input'));
    const hasPassword   = inputs.some(i => i.type === 'password');
    const hasCreditCard = inputs.some(i =>
      /card.number|cardnumber|ccnum|credit.card/i.test(i.name + i.id + i.placeholder + i.autocomplete)
      || i.autocomplete === 'cc-number'
    );
    const isHTTP      = location.protocol === 'http:';
    const hasTimer    = !!document.querySelector('[class*="countdown"],[id*="countdown"],[class*="timer"],[id*="timer"]');
    const isKnownSite = KNOWN_SAFE.test(location.hostname);
    return { hasPasswordField: hasPassword, hasCreditCardField: hasCreditCard, isHTTP, hasUrgencyTimer: hasTimer, isKnownSite };
  }

  // ── Quick rule-based scam check (ไม่ต้องรอ background) ──
  function quickScamCheck(text, isTos) {
    const signals = [];
    for (const rule of QUICK_SIGNAL_RULES) {
      if (isTos && TOS_FALSE_POSITIVE.has(rule.label)) continue;
      if (rule.pattern.test(text)) signals.push(rule);
    }
    const totalWeight = signals.reduce((s, r) => s + r.weight, 0);
    const score = Math.min(100, totalWeight * 12);
    const level = score >= 60 ? 'DANGER' : score >= 30 ? 'WARNING' : score > 0 ? 'CAUTION' : 'SAFE';
    const dominant = signals.length > 0 ? signals.sort((a,b) => b.weight - a.weight)[0] : null;
    return { score, level, signals, dominant };
  }

  // ═══════════════════════════════════════════════════
  //  BANNER — notification เล็กๆ ที่ขึ้นอัตโนมัติ
  // ═══════════════════════════════════════════════════

  function injectBannerCSS() {
    if (document.getElementById('ah-banner-css')) return;
    const style = document.createElement('style');
    style.id = 'ah-banner-css';
    style.textContent = `
      #ah-banner {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483647;
        font-family: 'Sarabun','IBM Plex Sans Thai',-apple-system,sans-serif;
        font-size: 13px;
        animation: ah-banner-in 0.3s cubic-bezier(0.34,1.56,0.64,1);
        pointer-events: auto;
      }
      @keyframes ah-banner-in {
        from { opacity:0; transform:translateY(20px) scale(0.95); }
        to   { opacity:1; transform:translateY(0)    scale(1); }
      }
      @keyframes ah-banner-out {
        from { opacity:1; transform:translateY(0) scale(1); }
        to   { opacity:0; transform:translateY(12px) scale(0.95); }
      }
      #ah-banner.ah-dismissing { animation: ah-banner-out 0.2s ease forwards; }

      /* ─ pill (collapsed) ─ */
      #ah-pill {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 8px 13px 8px 10px;
        border-radius: 999px;
        background: #1A1A2E;
        color: #fff;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(0,0,0,0.22);
        user-select: none;
        transition: background 0.15s, box-shadow 0.15s;
        white-space: nowrap;
      }
      #ah-pill:hover { background: #2d2d4e; box-shadow: 0 6px 24px rgba(0,0,0,0.28); }
      #ah-pill-icon { font-size: 15px; line-height:1; }
      #ah-pill-text { font-size: 12px; font-weight: 600; letter-spacing: 0.01em; }
      #ah-pill-badge {
        font-size: 10px; font-weight: 700;
        padding: 2px 7px; border-radius: 999px;
        background: rgba(255,255,255,0.15); color: #fff;
        margin-left: 2px;
      }
      #ah-pill-close {
        background: none; border: none; color: rgba(255,255,255,0.45);
        font-size: 16px; cursor: pointer; padding: 0; margin-left: 4px;
        line-height: 1; transition: color 0.1s;
      }
      #ah-pill-close:hover { color: #fff; }

      /* ─ card (expanded) ─ */
      #ah-card {
        width: 300px;
        background: #fff;
        border: 0.5px solid rgba(0,0,0,0.1);
        border-radius: 14px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08);
        overflow: hidden;
        display: none;
      }
      #ah-card.ah-open { display: block; margin-bottom: 8px; animation: ah-banner-in 0.25s cubic-bezier(0.34,1.56,0.64,1); }
      .ah-card-header {
        padding: 10px 12px;
        background: #1A1A2E;
        display: flex; align-items: center; gap: 8px;
        cursor: grab; user-select: none;
      }
      .ah-card-logo {
        width: 20px; height: 20px;
        background: rgba(255,255,255,0.1);
        border-radius: 5px; display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .ah-card-title { font-size: 11px; font-weight: 600; color: #fff; flex: 1; }
      .ah-card-close {
        background: none; border: none; color: rgba(255,255,255,0.45);
        font-size: 17px; cursor: pointer; padding: 0; line-height: 1;
        transition: color 0.1s;
      }
      .ah-card-close:hover { color: #fff; }

      /* scanning state */
      .ah-scanning-row {
        padding: 14px 14px;
        display: flex; align-items: center; gap: 10px;
        font-size: 12px; color: #555;
      }
      .ah-spinner {
        width: 16px; height: 16px; border: 2px solid #e0e0e0;
        border-top-color: #5DCAA5; border-radius: 50%;
        animation: ah-spin 0.7s linear infinite; flex-shrink: 0;
      }
      @keyframes ah-spin { to { transform: rotate(360deg); } }

      /* result rows */
      .ah-result-rows { padding: 4px 0; }
      .ah-result-row {
        display: flex; align-items: center; gap: 9px;
        padding: 8px 13px;
        border-bottom: 0.5px solid rgba(0,0,0,0.06);
        font-size: 12px;
      }
      .ah-result-row:last-child { border-bottom: none; }
      .ah-row-icon { font-size: 14px; width: 18px; text-align: center; flex-shrink: 0; }
      .ah-row-body { flex: 1; min-width: 0; }
      .ah-row-title { font-weight: 600; color: #111; font-size: 12px; }
      .ah-row-sub   { font-size: 10px; color: #777; margin-top: 1px; }
      .ah-row-badge {
        font-size: 10px; font-weight: 700;
        padding: 2px 7px; border-radius: 5px; flex-shrink: 0;
      }

      /* footer */
      .ah-card-footer {
        padding: 8px 12px;
        display: flex; gap: 6px;
        border-top: 0.5px solid rgba(0,0,0,0.08);
        background: #fafafa;
      }
      .ah-f-btn {
        flex: 1; padding: 7px 0; border-radius: 7px;
        font-size: 12px; font-weight: 500; font-family: inherit;
        cursor: pointer; border: 0.5px solid rgba(0,0,0,0.14);
        background: #fff; color: #333;
        transition: background 0.12s;
      }
      .ah-f-btn:hover { background: #f0f0f0; }
      .ah-f-btn-primary { background: #1A1A2E; color: #fff; border-color: #1A1A2E; }
      .ah-f-btn-primary:hover { background: #2d2d4e; }

      /* dark mode */
      @media (prefers-color-scheme: dark) {
        #ah-card { background: #1e1e2e; border-color: rgba(255,255,255,0.1); }
        .ah-result-row { border-color: rgba(255,255,255,0.07); }
        .ah-row-title { color: #eee; }
        .ah-row-sub   { color: #888; }
        .ah-card-footer { background: #18182a; border-color: rgba(255,255,255,0.08); }
        .ah-f-btn { background: #2a2a3e; color: #ddd; border-color: rgba(255,255,255,0.15); }
        .ah-f-btn:hover { background: #333350; }
        .ah-scanning-row { color: #aaa; }
      }
    `;
    document.head.appendChild(style);
  }

  function buildPillLabel(type, level, isTos) {
    if (isTos) return { icon: '📋', text: 'ToS · กำลังวิเคราะห์…', badge: null, color: '#5DCAA5' };
    const icons = { DANGER:'🚨', WARNING:'⚠', CAUTION:'⚡' };
    const texts = { DANGER:'พบสัญญาณอันตราย', WARNING:'น่าสงสัย', CAUTION:'ควรระวัง' };
    const typeIcon = type ? (SCAM_ICONS[type] || '⚠') : '⚠';
    return {
      icon: icons[level] || '⚠',
      text: texts[level] || 'ตรวจพบสัญญาณ',
      badge: typeIcon,
      color: SCAM_COLORS[level] || '#EF9F27',
    };
  }

  function showBanner(isTos, quickResult) {
    if (bannerEl || bannerDismissed) return;
    injectBannerCSS();

    const level   = quickResult?.level || (isTos ? 'CAUTION' : null);
    const domType = quickResult?.dominant?.type || null;
    const pill    = buildPillLabel(domType, level, isTos && !quickResult?.signals?.length);

    bannerEl = document.createElement('div');
    bannerEl.id = 'ah-banner';
    bannerEl.innerHTML = `
      <div id="ah-card">
        <div class="ah-card-header">
          <div class="ah-card-logo">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L2 5.5V10.5L8 14L14 10.5V5.5L8 2Z" stroke="#5DCAA5" stroke-width="1.5" stroke-linejoin="round"/>
              <circle cx="8" cy="8" r="1.5" fill="#5DCAA5"/>
            </svg>
          </div>
          <span class="ah-card-title">อ่านให้ · Arn-Hai</span>
          <button class="ah-card-close" id="ah-card-close">×</button>
        </div>
        <div id="ah-card-body">
          <div class="ah-scanning-row">
            <div class="ah-spinner"></div>
            <span>${isTos ? 'กำลังวิเคราะห์ข้อกำหนด ToS…' : 'กำลังสแกนหน้าเว็บ…'}</span>
          </div>
        </div>
        <div class="ah-card-footer" id="ah-card-footer" style="display:none">
          <button class="ah-f-btn" id="ah-f-dismiss">ปิด</button>
          <button class="ah-f-btn ah-f-btn-primary" id="ah-f-detail">ดูรายละเอียด →</button>
        </div>
      </div>
      <div id="ah-pill">
        <span id="ah-pill-icon">${pill.icon}</span>
        <span id="ah-pill-text">${pill.text}</span>
        ${pill.badge ? `<span id="ah-pill-badge">${pill.badge}</span>` : '<span id="ah-pill-badge" style="display:none"></span>'}
        <button id="ah-pill-close">×</button>
      </div>`;

    document.body.appendChild(bannerEl);

    // pill click → toggle card
    document.getElementById('ah-pill').addEventListener('click', e => {
      if (e.target.id === 'ah-pill-close') return;
      const card = document.getElementById('ah-card');
      card.classList.toggle('ah-open');
    });

    // close buttons
    document.getElementById('ah-pill-close').addEventListener('click', e => {
      e.stopPropagation();
      dismissBanner();
    });
    document.getElementById('ah-card-close').addEventListener('click', () => {
      document.getElementById('ah-card').classList.remove('ah-open');
    });

    // if we already have quick scam results, show them immediately
    if (quickResult && quickResult.signals.length > 0) {
      updateBannerWithQuickResult(quickResult);
    }
  }

  function dismissBanner() {
    if (!bannerEl) return;
    bannerDismissed = true;
    bannerEl.classList.add('ah-dismissing');
    setTimeout(() => { bannerEl?.remove(); bannerEl = null; }, 200);
  }

  function updatePill(icon, text, badge, color) {
    if (!bannerEl) return;
    const pillIcon  = document.getElementById('ah-pill-icon');
    const pillText  = document.getElementById('ah-pill-text');
    const pillBadge = document.getElementById('ah-pill-badge');
    if (pillIcon) pillIcon.textContent = icon;
    if (pillText) pillText.textContent = text;
    if (pillBadge) {
      if (badge) { pillBadge.textContent = badge; pillBadge.style.display = ''; }
      else pillBadge.style.display = 'none';
    }
  }

  function updateBannerWithQuickResult(result) {
    if (!bannerEl) return;
    const body   = document.getElementById('ah-card-body');
    const footer = document.getElementById('ah-card-footer');
    if (!body) return;

    const color = SCAM_COLORS[result.level] || '#EF9F27';
    const label = SCAM_LABELS[result.level] || '';

    // update pill
    const domType = result.dominant?.type;
    const icon    = result.level === 'SAFE' ? '✓' : (SCAM_ICONS[domType] || '⚠');
    updatePill(
      result.level === 'DANGER' ? '🚨' : result.level === 'WARNING' ? '⚠' : '⚡',
      label.replace(/^[^ ]+ /, ''),
      icon,
      color
    );

    const rows = result.signals.slice(0, 3).map(s => `
      <div class="ah-result-row">
        <span class="ah-row-icon">${SCAM_ICONS[s.type] || '⚠'}</span>
        <div class="ah-row-body">
          <div class="ah-row-title">${s.label}</div>
        </div>
        <span class="ah-row-badge" style="background:${color}18;color:${color}">${s.type}</span>
      </div>`).join('');

    body.innerHTML = `
      <div style="padding:10px 13px 6px;display:flex;align-items:center;gap:8px;border-bottom:0.5px solid rgba(0,0,0,0.07)">
        <span style="font-size:20px">${SCAM_ICONS[result.dominant?.type] || '⚠'}</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:${color}">${label}</div>
          <div style="font-size:10px;color:#888">พบ ${result.signals.length} สัญญาณ · rule-based scan</div>
        </div>
      </div>
      <div class="ah-result-rows">${rows}</div>`;

    if (footer) {
      footer.style.display = 'flex';
      document.getElementById('ah-f-dismiss')?.addEventListener('click', dismissBanner);
      document.getElementById('ah-f-detail')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
      });
    }
  }

  function updateBannerWithFullResult(result) {
    if (!bannerEl) return;
    const body   = document.getElementById('ah-card-body');
    const footer = document.getElementById('ah-card-footer');
    if (!body) return;

    const lvlColor = { HIGH:'#E24B4A', MEDIUM:'#EF9F27', LOW:'#639922' };
    const color    = lvlColor[result.riskLevel] || '#639922';
    const catIcon  = { 'Data Sharing':'⇄', 'Location Track':'📍', 'Data Retention':'🗄', 'Arbitration':'⚖', 'Auto-billing':'💳', 'User Rights':'👤', 'General':'📄' };
    const catTh    = { 'Data Sharing':'แชร์ข้อมูลกับ Third Party', 'Location Track':'Location Tracking', 'Data Retention':'เก็บข้อมูลหลังลบบัญชี', 'Arbitration':'ข้อกำหนดอนุญาโตตุลาการ', 'Auto-billing':'ต่ออายุอัตโนมัติ', 'User Rights':'สิทธิ์ผู้ใช้', 'General':'ทั่วไป' };

    const topFlags = (result.redFlags || []).slice(0, 3);
    const rows = topFlags.map(f => `
      <div class="ah-result-row">
        <span class="ah-row-icon">${catIcon[f.category] || '•'}</span>
        <div class="ah-row-body">
          <div class="ah-row-title">${catTh[f.category] || f.category}</div>
          <div class="ah-row-sub">${(f.text || '').slice(0, 60)}…</div>
        </div>
        <span class="ah-row-badge" style="background:${f.riskLevel==='HIGH'?'#FCEBEB':'#FAEEDA'};color:${lvlColor[f.riskLevel]}">${f.riskLevel}</span>
      </div>`).join('');

    const scoreLabel = result.riskLevel === 'HIGH' ? '🔴 ความเสี่ยงสูง' : result.riskLevel === 'MEDIUM' ? '🟡 ความเสี่ยงกลาง' : '🟢 ความเสี่ยงต่ำ';

    body.innerHTML = `
      <div style="padding:10px 13px 6px;display:flex;align-items:center;gap:8px;border-bottom:0.5px solid rgba(0,0,0,0.07)">
        <span style="font-size:22px;font-family:monospace;font-weight:800;color:${color}">${result.riskScore}</span>
        <div>
          <div style="font-size:12px;font-weight:700;color:${color}">${scoreLabel}</div>
          <div style="font-size:10px;color:#888">พบ ${(result.redFlags||[]).length} red flags</div>
        </div>
      </div>
      <div class="ah-result-rows">${rows || '<div style="padding:12px 13px;font-size:11px;color:#888">ไม่พบ red flags</div>'}</div>`;

    // update pill
    updatePill(
      result.riskLevel === 'HIGH' ? '🔴' : result.riskLevel === 'MEDIUM' ? '🟡' : '🟢',
      `ToS · ${result.riskScore} คะแนน`,
      null, color
    );

    if (footer) {
      footer.style.display = 'flex';
      // re-attach (clone to clear old listeners)
      const newFooter = footer.cloneNode(true);
      footer.parentNode.replaceChild(newFooter, footer);
      newFooter.querySelector('#ah-f-dismiss')?.addEventListener('click', dismissBanner);
      newFooter.querySelector('#ah-f-detail')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
      });
    }
  }

  // ════════════════════════════════════
  //  Legacy full overlay (ยังใช้ได้)
  // ════════════════════════════════════

  function injectOverlay(result) {
    if (overlayInjected) return;
    overlayInjected = true;
    // ถ้ามี banner อยู่แล้วให้ update แทนสร้างใหม่
    if (bannerEl) { updateBannerWithFullResult(result); return; }
    // fallback: สร้าง full card เดิม
    const el = document.createElement('div');
    el.id    = 'arn-hai-overlay';
    el.innerHTML = buildOverlayHTML(result);
    document.body.appendChild(el);
    el.querySelector('#ah-close')?.addEventListener('click',  () => el.remove());
    el.querySelector('#ah-detail')?.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPEN_POPUP' }));
    el.querySelector('#ah-ignore')?.addEventListener('click', () => el.remove());
  }

  function buildOverlayHTML(result) {
    const r = result;
    const lvlColor = { HIGH:'#E24B4A', MEDIUM:'#EF9F27', LOW:'#639922' };
    const high   = r.clauses.filter(c => c.riskLevel === 'HIGH').length;
    const medium = r.clauses.filter(c => c.riskLevel === 'MEDIUM').length;
    const low    = r.clauses.filter(c => c.riskLevel === 'LOW').length;
    const scam   = r.scam;
    const scamColors = { DANGER:'#E24B4A', WARNING:'#EF9F27', CAUTION:'#F5A623', SAFE:'#639922' };
    const scamTh     = { DANGER:'⚠ พบสัญญาณ Scam', WARNING:'⚠ น่าสงสัย', CAUTION:'⚡ ระวังไว้', SAFE:'✓ ไม่พบสัญญาณ Scam' };
    const scamBadge = scam && scam.scamLevel !== 'SAFE'
      ? `<div class="ah-scam-strip" style="background:${scamColors[scam.scamLevel]}18;border-top:1px solid ${scamColors[scam.scamLevel]}33;padding:6px 12px;font-size:11px;color:${scamColors[scam.scamLevel]};display:flex;align-items:center;gap:6px;">
          <span style="font-size:13px">${scam.dominantType?.icon||'⚠'}</span>
          <span><b>${scamTh[scam.scamLevel]}</b>${scam.dominantType?` — ${scam.dominantType.th}`:''}</span>
         </div>` : '';
    const catIcon = { 'Data Sharing':'⇄','Location Track':'📍','Data Retention':'🗄','Arbitration':'⚖','Auto-billing':'💳','User Rights':'👤','General':'📄' };
    const catTh   = { 'Data Sharing':'แชร์ข้อมูลกับ Third Party','Location Track':'Location Tracking','Data Retention':'เก็บข้อมูลหลังลบบัญชี','Arbitration':'ข้อกำหนดอนุญาโตตุลาการ','Auto-billing':'ต่ออายุอัตโนมัติ','User Rights':'สิทธิ์ผู้ใช้','General':'ทั่วไป' };
    const flagRows = r.redFlags.slice(0,3).map(f=>`
      <div class="ah-flag-row">
        <span class="ah-flag-icon" style="color:${lvlColor[f.riskLevel]}">${catIcon[f.category]||'•'}</span>
        <div class="ah-flag-body">
          <div class="ah-flag-title">${catTh[f.category]||f.category}</div>
          <div class="ah-flag-desc">${f.text.slice(0,80)}…</div>
        </div>
        <span class="ah-badge" style="background:${f.riskLevel==='HIGH'?'#FCEBEB':'#FAEEDA'};color:${lvlColor[f.riskLevel]}">${f.riskLevel}</span>
      </div>`).join('');
    return `
      <div id="ah-card" class="ah-card">
        <div class="ah-header">
          <div class="ah-logo"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2L2 5.5V10.5L8 14L14 10.5V5.5L8 2Z" stroke="#5DCAA5" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.5" fill="#5DCAA5"/></svg></div>
          <span class="ah-header-title">อ่านให้ · Risk Summary</span>
          <button id="ah-close" class="ah-close" title="ปิด">×</button>
        </div>
        <div class="ah-tl-strip">
          <div class="ah-tl-cell"><div class="ah-tl-num" style="color:#E24B4A">${high}</div><div class="ah-tl-sub">🔴 สูง</div></div>
          <div class="ah-tl-cell"><div class="ah-tl-num" style="color:#EF9F27">${medium}</div><div class="ah-tl-sub">🟡 กลาง</div></div>
          <div class="ah-tl-cell"><div class="ah-tl-num" style="color:#639922">${low}</div><div class="ah-tl-sub">🟢 ต่ำ</div></div>
          <div class="ah-tl-cell"><div class="ah-tl-num" style="color:${lvlColor[r.riskLevel]}">${r.riskScore}</div><div class="ah-tl-sub">Risk Score</div></div>
        </div>
        <div class="ah-flags">${flagRows}</div>
        ${scamBadge}
        <div class="ah-footer">
          <button id="ah-ignore" class="ah-btn">ละเว้น</button>
          <button id="ah-detail" class="ah-btn ah-btn-primary">ดูรายละเอียด</button>
        </div>
      </div>`;
  }

  // ════════════════════════════════════
  //  Message Listener
  // ════════════════════════════════════

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SHOW_OVERLAY' && msg.result) {
      currentResult = msg.result;
      injectOverlay(msg.result);
    }
    if (msg.type === 'ANALYSIS_DONE' && msg.result) {
      currentResult = msg.result;
      updateBannerWithFullResult(msg.result);
    }
    if (msg.type === 'GET_PAGE_TEXT') {
      sendResponse({ text: extractTosText(), isTos: detectTosPage() });
      return true;
    }
    if (msg.type === 'GET_PAGE_INFO') {
      sendResponse({ text: extractTosText(), isTos: detectTosPage(), pageInfo: inspectPageStructure(), url: location.href });
      return true;
    }
    if (msg.type === 'HIGHLIGHT_CLAUSES' && Array.isArray(msg.clauses)) {
      highlightClausesOnPage(msg.clauses);
      sendResponse({ ok: true, highlighted: msg.clauses.length });
      return true;
    }
    sendResponse({ ok: true });
  });

  // ── Visual Clause Highlighting on Page ──
  const CLAUSE_CAT_TH = {
    'Data Sharing':'แชร์ข้อมูลกับ Third Party', 'Location Track':'Location Tracking',
    'Data Retention':'เก็บข้อมูลหลังลบบัญชี', 'Arbitration':'อนุญาโตตุลาการ',
    'Auto-billing':'ต่ออายุอัตโนมัติ', 'User Rights':'สิทธิ์ผู้ใช้', 'General':'ทั่วไป'
  };

  function highlightClausesOnPage(clauses) {
    // Remove existing highlights
    document.querySelectorAll('.ah-highlight').forEach(el => {
      const parent = el.parentNode;
      if (parent) { parent.replaceChild(document.createTextNode(el.textContent), el); parent.normalize(); }
    });
    document.querySelectorAll('.ah-tooltip').forEach(el => el.remove());
    if (!clauses || clauses.length === 0) return;

    const root = document.querySelector('main, article, [role="main"], .content, #content, .terms, #terms') || document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    while (walker.nextNode()) { if (walker.currentNode.textContent.trim().length > 20) textNodes.push(walker.currentNode); }

    const lvlColors = {
      HIGH:   { bg: 'rgba(226,75,74,0.15)', border: '#E24B4A', text: '#A32D2D' },
      MEDIUM: { bg: 'rgba(239,159,39,0.12)', border: '#EF9F27', text: '#854F0B' }
    };

    for (const clause of clauses) {
      if (!clause.text || clause.text.length < 15) continue;
      const searchText = clause.text.slice(0, 100).toLowerCase().trim();
      const colors = lvlColors[clause.riskLevel] || lvlColors.MEDIUM;

      for (const node of textNodes) {
        const matchLen = Math.min(searchText.length, 80);
        const idx = node.textContent.toLowerCase().indexOf(searchText.slice(0, matchLen));
        if (idx === -1) continue;

        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, Math.min(idx + matchLen, node.textContent.length));

        const mark = document.createElement('mark');
        mark.className = 'ah-highlight';
        mark.style.cssText = 'background:' + colors.bg + ';border-bottom:2px solid ' + colors.border + ';padding:1px 2px;border-radius:2px;cursor:help;';

        mark.addEventListener('mouseenter', function(e) {
          document.querySelector('.ah-tooltip')?.remove();
          const tip = document.createElement('div');
          tip.className = 'ah-tooltip';
          tip.style.cssText = 'position:fixed;z-index:2147483646;background:#1A1A2E;color:#fff;padding:8px 12px;border-radius:8px;font-size:12px;max-width:300px;box-shadow:0 4px 16px rgba(0,0,0,0.3);pointer-events:none;line-height:1.5;';
          const badge = document.createElement('span');
          badge.textContent = clause.riskLevel;
          badge.style.cssText = 'display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-right:6px;background:' + colors.bg + ';color:' + colors.text + ';';
          const label = document.createElement('span');
          label.textContent = CLAUSE_CAT_TH[clause.category] || clause.category;
          label.style.fontWeight = '600';
          tip.append(badge, label);
          document.body.appendChild(tip);
          const rect = e.target.getBoundingClientRect();
          tip.style.left = Math.min(rect.left, window.innerWidth - 320) + 'px';
          tip.style.top = (rect.top - tip.offsetHeight - 8) + 'px';
          if (parseFloat(tip.style.top) < 0) tip.style.top = (rect.bottom + 8) + 'px';
        });
        mark.addEventListener('mouseleave', function() { document.querySelector('.ah-tooltip')?.remove(); });

        try { range.surroundContents(mark); } catch(e) {}
        break;
      }
    }
  }

  // ════════════════════════════════════
  //  Main — auto-run on page load
  // ════════════════════════════════════

  function main() {
    const isTos     = detectTosPage();
    const text      = extractTosText();
    const pageInfo  = inspectPageStructure();
    const isSafeSite = KNOWN_SAFE.test(location.hostname);

    if (isTos) {
      // ── ToS page: แสดง banner ทันที แล้วส่ง background ไป analyze ──
      showBanner(true, null);
      chrome.runtime.sendMessage({ type: 'CONTENT_FOUND_TOS', text, url: location.href });

    } else if (!isSafeSite) {
      // ── ทุกหน้าอื่น: quick rule-based check ──
      const quick = quickScamCheck(text, false);

      // เพิ่ม structure flags เข้าไปในการคำนวณ
      let score = quick.score;
      if (pageInfo.hasPasswordField && !pageInfo.isKnownSite) score += 15;
      if (pageInfo.hasCreditCardField) score += 15;
      if (pageInfo.isHTTP) score += 8;
      if (pageInfo.hasUrgencyTimer) score += 8;
      score = Math.min(100, score);

      const finalLevel = score >= 60 ? 'DANGER' : score >= 30 ? 'WARNING' : score > 0 ? 'CAUTION' : 'SAFE';

      if (finalLevel !== 'SAFE') {
        quick.level = finalLevel;
        quick.score = score;
        showBanner(false, quick);
        // ส่ง background ทำ AI scan ด้วยถ้า DANGER/WARNING
        if (finalLevel === 'DANGER' || finalLevel === 'WARNING') {
          chrome.runtime.sendMessage({ type: 'SCAN_SCAM', text, url: location.href, pageInfo }, resp => {
            if (resp?.ok && resp.scam && bannerEl) {
              // อัปเดต badge บน pill ด้วย AI score
              const aiLevel = resp.scam.scamLevel;
              const aiColor = SCAM_COLORS[aiLevel] || '#EF9F27';
              updatePill(
                aiLevel==='DANGER'?'🚨':aiLevel==='WARNING'?'⚠':'⚡',
                SCAM_LABELS[aiLevel]?.replace(/^[^ ]+ /,'') || 'ตรวจพบสัญญาณ',
                resp.scam.dominantType ? SCAM_ICONS[Object.keys(SCAM_ICONS).find(k=>SCAM_ICONS[k]===resp.scam.dominantType.icon)||''] || '⚠' : '⚠',
                aiColor
              );
            }
          });
        }
      }
    }
  }

  // รอ DOM พร้อม
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }

})();
