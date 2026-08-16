// ============================================================
//  background.js — Arn-Hai Service Worker
//  เชื่อม Google Gemini API สำหรับวิเคราะห์ ToS / Privacy Policy
//  + Scam Detection Engine
// ============================================================

// ── Import Scam Detector (inline to avoid module import in SW) ──
// scam-detector logic is inlined below for MV3 service worker compatibility

const SCAM_TYPES = {
  INVESTMENT:   { id: 'Investment Scam',  icon: '📈', th: 'หลอกลงทุน / Pig Butchering' },
  ROMANCE:      { id: 'Romance Scam',     icon: '💔', th: 'Romance Scam / แอบอ้างความรัก' },
  PHISHING:     { id: 'Phishing',         icon: '🎣', th: 'Phishing / ปลอมแปลงตัวตน' },
  JOB:          { id: 'Job Scam',         icon: '💼', th: 'Job Scam / หลอกสมัครงาน' },
  CRYPTO:       { id: 'Crypto Scam',      icon: '🪙', th: 'Crypto Scam / เหรียญปลอม' },
  IMPERSONATION:{ id: 'Impersonation',    icon: '🎭', th: 'แอบอ้างเป็นหน่วยงาน' },
};

const SIGNAL_RULES = [
  { type: 'INVESTMENT', weight: 3, pattern: /guaranteed.{0,20}(profit|return|yield)|การันตี.{0,20}(กำไร|ผลตอบแทน|return)/i, signal: 'รับประกันกำไร / Guaranteed Returns', detail: 'การลงทุนที่ถูกกฎหมายไม่มีการการันตีกำไร' },
  { type: 'INVESTMENT', weight: 3, pattern: /(\d{2,4}%|สอง|สาม|หลาย).{0,30}(ต่อวัน|per day|daily|ต่อเดือน|per month)/i, signal: 'ผลตอบแทนสูงผิดปกติ', detail: 'ผลตอบแทนสูงเกินจริง เช่น 20%/วัน หรือ 500%/เดือน' },
  { type: 'INVESTMENT', weight: 2, pattern: /สอนเทรด|trading.{0,15}(course|class|group)|กลุ่มเทรด|signal.{0,15}(vip|group|ฟรี)/i, signal: 'กลุ่มเทรด / Trading Signal', detail: 'หลอกขายคอร์สเทรดหรือ Signal ที่อ้างว่าแม่นยำ' },
  { type: 'INVESTMENT', weight: 3, pattern: /pig.butcher|หมูถูกเชือด|ชวนลงทุน.{0,30}(แอป|app|platform)|withdraw.{0,20}ไม่ได้/i, signal: 'Pig Butchering Pattern', detail: 'รูปแบบ Pig Butchering — ชวนลงทุนผ่าน App ปลอม ถอนเงินไม่ได้' },
  { type: 'INVESTMENT', weight: 2, pattern: /copy.?trade|mirror.?trade|auto.?trade|บอท.?เทรด|ai.?เทรด/i, signal: 'Copy Trade / Bot เทรดอัตโนมัติ', detail: 'อ้างว่ามีระบบ AI เทรดให้โดยอัตโนมัติและได้กำไรทุกวัน' },
  { type: 'INVESTMENT', weight: 2, pattern: /referral.{0,20}(bonus|commission)|แนะนำเพื่อน.{0,20}(ได้|รับ)|ค่าแนะนำ/i, signal: 'Referral Pyramid Scheme', detail: 'ระบบแนะนำเพื่อนรับค่าคอมมิชชั่น — อาจเป็นแชร์ลูกโซ่' },
  { type: 'ROMANCE', weight: 3, pattern: /i.{0,10}(love|miss|like).{0,20}you|รัก.{0,10}คุณ|คิดถึง|love.at.first/i, signal: 'แสดงความรักเร็วผิดปกติ', detail: 'แสดงความรู้สึกรุนแรงในระยะเวลาสั้น ก่อนรู้จักกันจริง' },
  { type: 'ROMANCE', weight: 3, pattern: /ขอยืม.{0,20}(เงิน|บาท|usd)|send.{0,20}(money|transfer)|โอนเงิน.{0,20}(ให้|มา|หน่อย)/i, signal: 'ขอเงิน / โอนเงิน', detail: 'สัญญาณอันตรายที่สุด — ขอเงินหรือให้โอนเงินโดยอ้างเหตุฉุกเฉิน' },
  { type: 'ROMANCE', weight: 2, pattern: /military|ทหาร.{0,20}(ต่างประเทศ|overseas|deploy)|engineer.{0,20}(oil|rig|offshore)/i, signal: 'อ้างอาชีพในต่างประเทศ (ทหาร/วิศวกร)', detail: 'Romance Scammer มักอ้างเป็นทหาร วิศวกร หรือหมอในต่างประเทศ' },
  { type: 'ROMANCE', weight: 2, pattern: /ไม่สามารถ.{0,20}(มา|พบ|เจอ)|can.t.{0,20}(meet|come|visit)|อยู่.{0,20}ต่างประเทศ/i, signal: 'อ้างไม่สามารถพบกันได้', detail: 'มักอ้างว่าอยู่ต่างประเทศและพบกันไม่ได้ตลอดความสัมพันธ์' },
  { type: 'ROMANCE', weight: 2, pattern: /gift.{0,20}(stuck|customs|clearance)|พัสดุ.{0,20}(ติด|ด่าน|ศุลกากร)|ส่งของ.{0,20}ติด/i, signal: 'พัสดุติดศุลกากร', detail: 'หลอกว่าส่งของขวัญแล้วติดศุลกากร ต้องจ่ายเงินค่าธรรมเนียมก่อน' },
  { type: 'PHISHING', weight: 3, pattern: /verify.{0,20}(account|identity|information)|ยืนยัน.{0,20}(บัญชี|ตัวตน|ข้อมูล)/i, signal: 'ขอยืนยันตัวตน / Verify Account', detail: 'หน้าล็อกอินปลอมหรืออีเมลหลอกให้กรอกข้อมูลส่วนตัว' },
  { type: 'PHISHING', weight: 3, pattern: /account.{0,20}(suspended|blocked|limited)|บัญชี.{0,20}(ถูกระงับ|ถูกล็อก|ปิดกั้น)/i, signal: 'บัญชีถูกระงับ / Account Suspended', detail: 'หลอกว่าบัญชีมีปัญหาเพื่อดึงให้กรอกข้อมูล' },
  { type: 'PHISHING', weight: 2, pattern: /click.{0,20}(here|link|below)|กด.{0,20}(ที่นี่|ลิงก์|ด้านล่าง).{0,20}(ด่วน|เร็ว|ทันที)/i, signal: 'กดลิงก์ด่วน', detail: 'สร้างความเร่งรีบให้กด Link โดยไม่ตรวจสอบ' },
  { type: 'PHISHING', weight: 2, pattern: /otp|one.time.password|รหัส.{0,10}(ครั้งเดียว|ชั่วคราว|หมดอายุ)/i, signal: 'ขอ OTP / รหัสชั่วคราว', detail: 'ไม่มีองค์กรใดที่ถูกกฎหมายจะขอ OTP ที่คุณได้รับ' },
  { type: 'PHISHING', weight: 3, pattern: /password|username|เลขบัตร|หมายเลขบัตร|cvv|รหัสผ่าน.{0,20}(ของคุณ|ใหม่)/i, signal: 'ขอรหัสผ่าน / ข้อมูลบัตร', detail: 'ไม่ควรกรอก Password หรือหมายเลขบัตรบนหน้าที่ไม่น่าเชื่อถือ' },
  { type: 'JOB', weight: 3, pattern: /work.from.home|ทำงานที่บ้าน|part.time.{0,20}(รายได้|เงิน|บาท|วัน)/i, signal: 'งาน Part-time / Work From Home รายได้สูง', detail: 'งานที่อ้างว่าทำที่บ้านได้เงินสูงมักเป็นการหลอกลวง' },
  { type: 'JOB', weight: 3, pattern: /ค่าสมัคร|registration.fee|deposit.{0,20}(before|ก่อน)|จ่าย.{0,20}ก่อน.{0,20}(ทำงาน|เริ่ม)/i, signal: 'ต้องจ่ายเงินก่อนทำงาน', detail: 'งานที่ถูกกฎหมายไม่มีการเก็บค่าสมัครงานหรือค่ามัดจำ' },
  { type: 'JOB', weight: 2, pattern: /กดไลก์|กดแชร์|รีวิว.{0,20}(สินค้า|ร้าน)|like.{0,20}(task|job|earn)/i, signal: 'งานกดไลก์ / รีวิวสินค้า', detail: 'งานกดไลก์หรือรีวิวที่อ้างว่าได้เงินจริง มักหลอกเก็บเงินทีหลัง' },
  { type: 'JOB', weight: 3, pattern: /scam.center|call.center.{0,20}(myanmar|cambodia|เมียนมา|กัมพูชา)|trafficking/i, signal: 'Scam Call Center / Human Trafficking', detail: 'ระวัง! อาจเป็นงานที่เชื่อมโยงกับ Call Center ต้มตุ๋นในต่างประเทศ' },
  { type: 'CRYPTO', weight: 3, pattern: /new.{0,10}token|ico|presale|pre.sale.{0,20}(exclusive|only|limited)|เหรียญใหม่/i, signal: 'ICO / Presale Token ปลอม', detail: 'ระวัง ICO หรือ Pre-sale เหรียญคริปโตที่ไม่มีหลักฐานน่าเชื่อถือ' },
  { type: 'CRYPTO', weight: 3, pattern: /elon.musk|celebrity.{0,20}(endorse|recommend)|ดารา.{0,20}(แนะนำ|รับรอง)/i, signal: 'อ้างบุคคลดัง / Celebrity Endorsement', detail: 'มักอ้าง Elon Musk หรือคนดังเพื่อดึงดูดนักลงทุน' },
  { type: 'CRYPTO', weight: 2, pattern: /double.{0,10}(your|bitcoin|crypto)|ส่งมา.{0,20}(คืน.{0,10}สอง|double|x2)/i, signal: 'Giveaway Scam / ส่งมาได้คืนสอง', detail: 'หลอกว่าส่ง Crypto มาแล้วจะได้รับคืนสองเท่า' },
  { type: 'IMPERSONATION', weight: 3, pattern: /dsi|ดีเอสไอ|ตำรวจ|police|กรมสรรพากร|revenue.department|ธนาคารแห่งชาติ/i, signal: 'แอบอ้างหน่วยงานรัฐ', detail: 'หน่วยงานรัฐไม่ติดต่อทาง Line/WhatsApp ให้โอนเงินหรือกดลิงก์' },
  { type: 'IMPERSONATION', weight: 3, pattern: /microsoft|apple.support|tech.support|แจ้งเตือน.{0,20}(ไวรัส|virus|hack)/i, signal: 'Tech Support Scam', detail: 'Microsoft/Apple ไม่โทรมาหรือ Pop-up แจ้งให้โทรกลับเพื่อซ่อมไวรัส' },
];

const URL_RED_FLAGS = [
  { pattern: /\.xyz$|\.top$|\.click$|\.loan$|\.gq$|\.cf$/, label: 'TLD น่าสงสัย (.xyz/.top/.click)' },
  { pattern: /[a-z]{30,}/, label: 'โดเมนยาวผิดปกติ' },
  { pattern: /\d{4,}\.[a-z]+$/, label: 'โดเมนมีตัวเลขยาว' },
  { pattern: /paypa1|g00gle|faceb00k|amaz0n|rnicrosoft|bankk0k/, label: 'โดเมนปลอมแปลง (Typosquatting)' },
  { pattern: /bit\.ly|tinyurl|t\.co|goo\.gl|cutt\.ly/, label: 'URL Shortener ซ่อนปลายทาง' },
  { pattern: /ngrok|\.vercel\.app|\.netlify\.app.*login/, label: 'Hosting ชั่วคราวที่มีหน้า Login' },
];

const SCAM_ADVICE = {
  INVESTMENT:    ['อย่าโอนเงินให้แพลตฟอร์มที่ไม่มีใบอนุญาต ก.ล.ต.', 'ตรวจสอบรายชื่อที่ sec.or.th', 'ไม่มีการลงทุนที่การันตีกำไรแน่นอน', 'แจ้ง ปอท. โทร 1441'],
  ROMANCE:       ['ระวังคนที่รู้จักออนไลน์และไม่เคยพบกันจริง', 'อย่าโอนเงินให้คนที่รู้จักทางออนไลน์', 'ทำ Reverse Image Search รูปโปรไฟล์', 'แจ้ง DSI สายด่วน 1202'],
  PHISHING:      ['ตรวจสอบ URL ให้ถูกต้องก่อนกรอกข้อมูล', 'เปิดใช้ 2FA ทุกบัญชี', 'ไม่กด Link ใน SMS/อีเมลที่ไม่ได้ร้องขอ', 'แจ้ง ETDA Hotline 1212'],
  JOB:           ['งานที่ถูกกฎหมายไม่เก็บค่าสมัครหรือค่ามัดจำ', 'ระวังงานในประเทศเพื่อนบ้านจาก Social Media', 'แจ้งกรมการจัดหางาน โทร 1506', 'ตรวจสอบบริษัทที่ DBD.go.th'],
  CRYPTO:        ['ไม่มี Celebrity ใดให้ส่ง Crypto แล้วได้คืนสองเท่า', 'ตรวจสอบ Whitepaper ก่อนลงทุน Token ใหม่', 'ใช้เฉพาะ Exchange ที่ได้รับอนุญาต ก.ล.ต.'],
  IMPERSONATION: ['หน่วยงานรัฐไม่ติดต่อทาง Line ให้โอนเงิน', 'โทรยืนยันกลับตามเบอร์ทางการ', 'แจ้ง ศูนย์รับแจ้งการทุจริตออนไลน์ โทร 1441'],
};

function analyzeTextForScam(text) {
  if (!text || text.length < 20) return { scamScore: 0, scamLevel: 'SAFE', signals: [], dominantType: null };
  const signals = [];
  const typeCounts = {};
  for (const rule of SIGNAL_RULES) {
    if (rule.pattern.test(text)) {
      signals.push({ type: rule.type, weight: rule.weight, signal: rule.signal, detail: rule.detail, scamType: SCAM_TYPES[rule.type] });
      typeCounts[rule.type] = (typeCounts[rule.type] || 0) + rule.weight;
    }
  }
  if (signals.length === 0) return { scamScore: 0, scamLevel: 'SAFE', signals: [], dominantType: null };
  const totalWeight  = signals.reduce((s, x) => s + x.weight, 0);
  const scamScore    = Math.min(100, Math.round(totalWeight * 12));
  const scamLevel    = scamScore >= 60 ? 'DANGER' : scamScore >= 30 ? 'WARNING' : 'CAUTION';
  const dominantKey  = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const dominantType = dominantKey ? SCAM_TYPES[dominantKey] : null;
  return { scamScore, scamLevel, signals, dominantType, typeCounts };
}

function analyzeUrl(url) {
  const flags = [];
  try {
    const u    = new URL(url);
    const host = u.hostname.toLowerCase();
    for (const rf of URL_RED_FLAGS) {
      if (rf.pattern.test(host) || rf.pattern.test(url)) flags.push(rf.label);
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) flags.push('ใช้ IP Address แทนโดเมน — น่าสงสัยมาก');
    if ((host.match(/\./g) || []).length >= 4)  flags.push('มี Subdomain หลายชั้น — อาจซ่อนโดเมนจริง');
  } catch {}
  return flags;
}

// ── Message Router ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'ANALYZE_URL':       handleAnalyzeUrl(msg.url, sendResponse);                          return true;
    case 'ANALYZE_TEXT':      handleAnalyzeText(msg.text, msg.url, sendResponse);               return true;
    case 'GET_PAGE_STATUS':   getPageStatus(sender.tab?.id, sendResponse);                      return true;
    case 'CONTENT_FOUND_TOS': handleTosDetected(sender.tab, msg.text); sendResponse({ ok: true }); break;
    case 'GET_CACHED_RESULT': getCachedResult(msg.url, sendResponse);                           return true;
    case 'ASK_AI':            handleAskAI(msg.question, msg.result, sendResponse);              return true;
    case 'SCAN_SCAM':         handleScanScam(msg.text, msg.url, msg.pageInfo, sendResponse);    return true;
    case 'SCAN_SCAM_AI':      handleScanScamAI(msg.text, msg.url, sendResponse);                return true;
    default:                  sendResponse({ error: 'Unknown message type' });
  }
});

// ── Scam Handlers ──
// ── Known legitimate domains — skip/heavily discount scam scoring ──
const KNOWN_SAFE_DOMAINS = /\b(samsung|apple|google|microsoft|amazon|facebook|meta|instagram|twitter|tiktok|netflix|spotify|shopee|lazada|grab|line|truemoney|kasikornbank|scb|krungthai|bualuang|krungsri|bangkokbank|dtac|ais|true|ntplc|gov\.th|or\.th)\b/i;

// ── ToS page keywords — reduce weight of Phishing rules that fire on normal ToS text ──
const TOS_PAGE_SIGNALS = /terms.of.service|terms.of.use|privacy.policy|terms.and.conditions|ข้อกำหนด|นโยบายความเป็นส่วนตัว|เงื่อนไขการใช้บริการ/i;

function isTosContext(text, url) {
  return TOS_PAGE_SIGNALS.test(text ? text.slice(0, 2000) : '') || /\/terms|\/privacy|\/legal|\/tos|\/eula/i.test(url || '');
}

function isKnownSafeDomain(url) {
  try { return KNOWN_SAFE_DOMAINS.test(new URL(url).hostname); } catch { return false; }
}

// Phishing signal IDs that commonly false-positive inside ToS documents
const TOS_FALSE_POSITIVE_SIGNALS = new Set([
  'ขอรหัสผ่าน / ข้อมูลบัตร',
  'ขอยืนยันตัวตน / Verify Account',
  'บัญชีถูกระงับ / Account Suspended',
  'กดลิงก์ด่วน',
  'ขอ OTP / รหัสชั่วคราว',
]);

function handleScanScam(text, url, pageInfo, sendResponse) {
  try {
    const tosContext  = isTosContext(text, url);
    const safeDomain  = isKnownSafeDomain(url) || pageInfo?.isKnownSite;

    let textResult = analyzeTextForScam(text || '');

    // ── Filter false-positive signals when we're on a ToS page ──
    if (tosContext) {
      textResult.signals = textResult.signals.filter(s => !TOS_FALSE_POSITIVE_SIGNALS.has(s.signal));
      // Recompute score after filtering
      const totalWeight = textResult.signals.reduce((s, x) => s + x.weight, 0);
      textResult.scamScore = Math.min(100, Math.round(totalWeight * 12));
      if (textResult.signals.length === 0) {
        textResult.scamLevel  = 'SAFE';
        textResult.dominantType = null;
      }
    }

    const urlFlags   = analyzeUrl(url || '');

    // ── Skip URL flags for known-safe domains ──
    const filteredUrlFlags = safeDomain ? [] : urlFlags;

    // Page structure flags from content script
    const structureFlags = [];
    if (pageInfo?.hasPasswordField && !pageInfo?.isKnownSite) structureFlags.push({ severity: 'HIGH', label: 'มีช่องกรอก Password บนหน้าที่ไม่รู้จัก' });
    if (pageInfo?.hasCreditCardField) structureFlags.push({ severity: 'HIGH', label: 'มีช่องกรอกข้อมูลบัตรเครดิต' });
    if (pageInfo?.isHTTP) structureFlags.push({ severity: 'MEDIUM', label: 'ใช้ HTTP ไม่ใช่ HTTPS — ไม่ปลอดภัย' });
    if (pageInfo?.hasUrgencyTimer) structureFlags.push({ severity: 'MEDIUM', label: 'มี Countdown Timer สร้างความเร่งรีบ' });

    // Boost score for URL/structure flags
    let finalScore = textResult.scamScore;
    finalScore += filteredUrlFlags.length * 8;
    finalScore += structureFlags.filter(f => f.severity === 'HIGH').length * 15;
    finalScore += structureFlags.filter(f => f.severity === 'MEDIUM').length * 8;
    // Known-safe domain: apply 50% discount on final score
    if (safeDomain) finalScore = Math.round(finalScore * 0.5);
    finalScore = Math.min(100, finalScore);

    const finalLevel = finalScore >= 60 ? 'DANGER' : finalScore >= 30 ? 'WARNING' : finalScore > 0 ? 'CAUTION' : 'SAFE';

    // ── Fix: correct key lookup for SCAM_ADVICE ──
    const dominantKey = textResult.dominantType
      ? Object.keys(SCAM_TYPES).find(k => SCAM_TYPES[k].id === textResult.dominantType.id) || null
      : null;
    // ── Fix: no fallback to PHISHING when there are no signals ──
    const advice = dominantKey ? (SCAM_ADVICE[dominantKey] || []) : [];

    sendResponse({
      ok: true,
      scam: {
        scamScore:      finalScore,
        scamLevel:      finalLevel,
        signals:        textResult.signals,
        dominantType:   textResult.dominantType,
        urlFlags:       filteredUrlFlags,
        structureFlags,
        advice,
        isTosContext:   tosContext,
      }
    });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleScanScamAI(text, url, sendResponse) {
  try {
    const settings = await getSettings();
    if (!settings.geminiApiKey) {
      // Fallback to rule-based only
      handleScanScam(text, url, {}, sendResponse);
      return;
    }

    const truncated = (text || '').slice(0, 8000);
    const prompt = `คุณคือผู้เชี่ยวชาญด้านความปลอดภัยไซเบอร์และการป้องกันการหลอกลวงออนไลน์ วิเคราะห์ข้อความต่อไปนี้และตอบใน JSON เท่านั้น

ข้อความ:
"""
${truncated}
"""

URL: ${url || 'unknown'}

ตอบกลับด้วย JSON นี้เท่านั้น (ไม่มี markdown):
{
  "scamScore": <0-100>,
  "scamLevel": "<DANGER|WARNING|CAUTION|SAFE>",
  "scamType": "<Investment Scam|Romance Scam|Phishing|Job Scam|Crypto Scam|Impersonation|null>",
  "signals": [
    { "signal": "<ชื่อสัญญาณ>", "detail": "<คำอธิบายสั้น ภาษาไทย>" }
  ],
  "summary": "<สรุปความเสี่ยงด้านไซเบอร์ 1-2 ประโยค ภาษาไทย>",
  "advice": ["<คำแนะนำ 1>", "<คำแนะนำ 2>", "<คำแนะนำ 3>"]
}

กฎ: ถ้าไม่พบสัญญาณการหลอกลวง ให้ scamScore=0 และ scamLevel="SAFE"`;

    const responseText = await callGeminiAPI(settings.geminiApiKey, prompt);
    let parsed;
    try {
      const cleaned = safeParseJSON(responseText);
      parsed = JSON.parse(cleaned);
    } catch {
      // fallback to rule-based
      handleScanScam(text, url, {}, sendResponse);
      return;
    }

    const tosContext  = isTosContext(text, url);
    const safeDomain  = isKnownSafeDomain(url);

    // Apply known-safe discount to AI score as well
    let aiScore = parsed.scamScore || 0;
    if (safeDomain) aiScore = Math.round(aiScore * 0.5);
    const aiLevel = aiScore >= 60 ? 'DANGER' : aiScore >= 30 ? 'WARNING' : aiScore > 0 ? 'CAUTION' : 'SAFE';

    // Map AI scamType string to SCAM_TYPES key for advice lookup
    const aiDominantKey = parsed.scamType
      ? Object.keys(SCAM_TYPES).find(k => SCAM_TYPES[k].id === parsed.scamType) || null
      : null;

    // Skip URL flags for known-safe domains
    const urlFlags = safeDomain ? [] : analyzeUrl(url || '');

    sendResponse({
      ok: true,
      scam: {
        scamScore:    aiScore,
        scamLevel:    aiLevel,
        dominantType: parsed.scamType ? { id: parsed.scamType, th: parsed.scamType } : null,
        signals:      (parsed.signals || []).map(s => ({ signal: s.signal, detail: s.detail, type: parsed.scamType })),
        urlFlags,
        structureFlags: [],
        aiSummary:    parsed.summary || '',
        advice:       parsed.advice && parsed.advice.length > 0
                        ? parsed.advice
                        : (aiDominantKey ? (SCAM_ADVICE[aiDominantKey] || []) : []),
        isTosContext: tosContext,
      }
    });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

// ── ToS Analysis Handlers (unchanged) ──
async function handleAnalyzeUrl(url, sendResponse) {
  try {
    const cached = await getCachedResultAsync(url);
    if (cached) { sendResponse({ ok: true, result: cached, fromCache: true }); return; }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let pageText = '';

    try {
      const csResp = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' }, resp => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(resp);
        });
      });
      if (csResp?.text && csResp.text.length > 200) pageText = csResp.text;
    } catch (e) { console.warn('Content script not ready, falling back:', e.message); }

    if (pageText.length <= 200) {
      try {
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const main = document.querySelector('main, article, [role="main"], .content, #content, .terms, #terms');
            return (main || document.body).innerText.trim().slice(0, 20000);
          }
        });
        pageText = result || '';
      } catch (e) { console.warn('Cannot extract page text:', e.message); }
    }

    if (pageText.length > 200) {
      const result = await analyze(pageText, url);
      await cacheResult(url, result);
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'ANALYSIS_DONE', result }).catch(() => {});
      }
      sendResponse({ ok: true, result });
    } else {
      sendResponse({ ok: false, error: 'ไม่พบข้อความบนหน้านี้ กรุณาวาง URL หรือข้อความ ToS โดยตรง' });
    }
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleAnalyzeText(text, url, sendResponse) {
  try {
    if (text.trim().toLowerCase() === 'test') {
      const result = getMockResult(url || 'unknown');
      sendResponse({ ok: true, result, isTestMode: true });
      return;
    }
    const result = await analyze(text, url || 'unknown');
    sendResponse({ ok: true, result });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleAskAI(question, currentResult, sendResponse) {
  try {
    const settings = await getSettings();
    if (!settings.geminiApiKey) { sendResponse({ answer: '⚠️ กรุณาใส่ Gemini API Key ใน Settings ก่อนใช้งาน' }); return; }
    const context = currentResult
      ? `ข้อมูล ToS ที่วิเคราะห์แล้ว:\n- Risk Score: ${currentResult.riskScore}/100\n- Risk Level: ${currentResult.riskLevel}\n- Red Flags: ${(currentResult.redFlags || []).map(f => f.category).join(', ')}\n- สรุป: ${(currentResult.summary || []).join(' | ')}`
      : 'ยังไม่มีข้อมูล ToS ที่วิเคราะห์';
    const prompt = `คุณคือผู้เชี่ยวชาญด้านนโยบายความเป็นส่วนตัวและ Terms of Service ตอบเป็นภาษาไทยอย่างกระชับและเป็นประโยชน์\n\n${context}\n\nคำถามของผู้ใช้: ${question}\n\nตอบอย่างกระชับ ชัดเจน และเป็นภาษาที่เข้าใจง่าย`;
    const answer = await callGeminiAPI(settings.geminiApiKey, prompt);
    sendResponse({ answer });
  } catch (err) {
    sendResponse({ answer: `เกิดข้อผิดพลาด: ${err.message}` });
  }
}

async function analyzeWithGemini(text, url) {
  const settings = await getSettings();
  if (!settings.geminiApiKey) throw new Error('กรุณาใส่ Gemini API Key ใน Settings ก่อนใช้งาน');

  const truncatedText = text.slice(0, 8000);
  const prompt = `คุณคือผู้เชี่ยวชาญด้าน Terms of Service วิเคราะห์และตอบ JSON เท่านั้น

ข้อความ:
"""
${truncatedText}
"""

ตอบ JSON รูปแบบนี้เท่านั้น:
{"riskScore":0-100,"riskLevel":"HIGH|MEDIUM|LOW","clauses":[{"category":"Data Sharing|Location Track|Data Retention|Arbitration|Auto-billing|User Rights|General","riskLevel":"HIGH|MEDIUM|LOW","confidence":0.0-1.0,"text":"สรุปสั้นภาษาไทยไม่เกิน 40 ตัว","section":"x.x หรือ null"}],"summary":["ประเด็น 1","ประเด็น 2","ประเด็น 3"]}

กฎเข้ม: clauses สูงสุด 8 รายการ, summary 3-5 รายการ, text ใน clause ห้ามมี double-quote`;

  const responseText = await callGeminiAPI(settings.geminiApiKey, prompt);
  let parsed;
  try {
    const cleaned = safeParseJSON(responseText);
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // Log raw response to help debug, then throw meaningful error
    console.error('[ArnHai] Raw Gemini response:', responseText);
    console.error('[ArnHai] Parse error:', e.message);
    throw new Error('Gemini ตอบกลับในรูปแบบที่ไม่ถูกต้อง\n\nDebug: เปิด Extension background page console แล้วดู [ArnHai] log');
  }

  const redFlags = (parsed.clauses || []).filter(c => c.riskLevel !== 'LOW');
  const baseline = getIndustryBaseline(url);

  return {
    url, analyzedAt: Date.now(),
    riskScore: parsed.riskScore || 0,
    riskLevel: parsed.riskLevel || 'LOW',
    clauses:   parsed.clauses || [],
    redFlags,
    summary:   parsed.summary || [],
    industryBaseline: baseline,
    comparison: baseline
      ? `${baseline.name} เฉลี่ยอยู่ที่ ${baseline.avg} — บริการนี้${parsed.riskScore > baseline.avg ? `สูงกว่า ${parsed.riskScore - baseline.avg} คะแนน` : `ต่ำกว่า ${baseline.avg - parsed.riskScore} คะแนน`}`
      : null
  };
}

// ── JSON Parse Helper ──
function safeParseJSON(text) {
  if (!text) return '{}';
  let s = text.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```\s*$/i,'').trim();
  try { JSON.parse(s); return s; } catch(_) {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { JSON.parse(m[0]); return m[0]; } catch(_) {} }
  return patchTruncatedJSON(m ? m[0] : s);
}

function patchTruncatedJSON(s) {
  // Walk string tracking open brackets; checkpoint after every complete value
  let inStr = false, esc = false;
  const stack = [];
  const checkpoints = [{pos:0}];

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') {
      inStr = !inStr;
      if (!inStr) checkpoints.push({pos: i + 1});
      continue;
    }
    if (inStr) continue;
    if (c === '{' || c === '[') { stack.push(c); continue; }
    if (c === '}' || c === ']') {
      stack.pop();
      checkpoints.push({pos: i + 1});
      continue;
    }
    if (/[0-9tf]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9a-z.\-]/.test(s[j])) j++;
      if (s[j] === ',' || s[j] === '}' || s[j] === ']') checkpoints.push({pos: j});
      i = j - 1;
    }
  }

  // Try each checkpoint from end, return first one that yields valid JSON
  for (let k = checkpoints.length - 1; k >= 0; k--) {
    const pos = checkpoints[k].pos;
    const stk = [];
    let is2 = false, es2 = false;
    for (let i = 0; i < pos; i++) {
      const c = s[i];
      if (es2) { es2 = false; continue; }
      if (c === '\\' && is2) { es2 = true; continue; }
      if (c === '"') { is2 = !is2; continue; }
      if (is2) continue;
      if (c === '{' || c === '[') stk.push(c);
      if (c === '}' || c === ']') stk.pop();
    }
    let candidate = s.slice(0, pos).trimEnd()
      .replace(/,\s*"[^"]*"\s*$/, '')
      .replace(/,\s*$/, '');
    for (let j = stk.length - 1; j >= 0; j--) candidate += stk[j] === '{' ? '}' : ']';
    try { JSON.parse(candidate); return candidate; } catch(_) { continue; }
  }
  return '{}';
}

async function callGeminiAPI(apiKey, prompt) {
  const model    = 'gemini-flash-latest';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const response = await fetch(endpoint, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body:    JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json'
      }
    })
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errMsg  = errData?.error?.message || `HTTP ${response.status}`;
    if (response.status === 400) throw new Error(`API Key ไม่ถูกต้อง: ${errMsg}`);
    if (response.status === 403) throw new Error('API Key ไม่มีสิทธิ์ใช้งาน Gemini API');
    if (response.status === 429) throw new Error('เกิน Rate Limit กรุณารอสักครู่แล้วลองใหม่');
    throw new Error(`Gemini API Error: ${errMsg}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini ไม่ได้ส่งข้อความกลับมา');
  return text;
}

async function getPageStatus(tabId, sendResponse) {
  try {
    const tab    = await chrome.tabs.get(tabId);
    const cached = await getCachedResultAsync(tab.url);
    sendResponse({ url: tab.url, hasResult: !!cached, result: cached || null });
  } catch { sendResponse({ hasResult: false }); }
}

async function handleTosDetected(tab, text) {
  if (!tab) return;
  chrome.action.setBadgeText({ text: '!', tabId: tab.id });
  chrome.action.setBadgeBackgroundColor({ color: '#E24B4A', tabId: tab.id });
  const settings = await getSettings();
  if (settings.autoAnalyze && settings.geminiApiKey) {
    try {
      const result = await analyze(text, tab.url);
      await cacheResult(tab.url, result);
      chrome.action.setBadgeText({ text: String(result.riskScore), tabId: tab.id });
      const color = result.riskLevel === 'HIGH' ? '#E24B4A' : result.riskLevel === 'MEDIUM' ? '#EF9F27' : '#639922';
      chrome.action.setBadgeBackgroundColor({ color, tabId: tab.id });
      // ── แจ้ง content script ว่า analyze เสร็จแล้ว → อัปเดต banner ──
      chrome.tabs.sendMessage(tab.id, { type: 'ANALYSIS_DONE', result }).catch(() => {});
    } catch (e) { console.warn('Auto-analyze failed:', e.message); }
  }
}

function getIndustryBaseline(url) {
  const baselines = [
    { pattern: /facebook|instagram|twitter|tiktok|social/, name: 'Social Media', avg: 52 },
    { pattern: /netflix|spotify|youtube|streaming/,        name: 'Streaming',    avg: 38 },
    { pattern: /shopee|lazada|amazon|ecommerce|shop/,      name: 'E-Commerce',   avg: 45 },
    { pattern: /google|microsoft|apple/,                   name: 'Big Tech',     avg: 60 },
    { pattern: /bank|banking|finance|ธนาคาร/,              name: 'Finance',      avg: 55 },
  ];
  const u = (url || '').toLowerCase();
  return baselines.find(b => b.pattern.test(u)) || null;
}

function getMockResult(url) {
  const baseline = getIndustryBaseline(url);
  return {
    url, analyzedAt: Date.now(), isTestMode: true,
    riskScore: 75, riskLevel: 'HIGH',
    clauses: [
      { category: 'Data Sharing',   riskLevel: 'HIGH',   confidence: 0.91, text: 'We may share your data with third-party partners without explicit notification', section: '4.2' },
      { category: 'Location Track', riskLevel: 'HIGH',   confidence: 0.88, text: 'We collect your location data even when the app is running in the background',   section: '6.1' },
      { category: 'Data Retention', riskLevel: 'MEDIUM', confidence: 0.82, text: 'Your data may be retained for up to 90 days after account deletion',             section: '8' },
      { category: 'Arbitration',    riskLevel: 'MEDIUM', confidence: 0.79, text: 'Any disputes will be resolved through binding arbitration, waiving class action', section: '11.3' },
      { category: 'Auto-billing',   riskLevel: 'LOW',    confidence: 0.75, text: 'Subscription renews automatically unless cancelled 48 hours before renewal date', section: '3.1' },
    ],
    redFlags: [
      { category: 'Data Sharing',   riskLevel: 'HIGH',   confidence: 0.91, text: 'We may share your data with third-party partners without explicit notification', section: '4.2' },
      { category: 'Location Track', riskLevel: 'HIGH',   confidence: 0.88, text: 'We collect your location data even when the app is running in the background',   section: '6.1' },
      { category: 'Data Retention', riskLevel: 'MEDIUM', confidence: 0.82, text: 'Your data may be retained for up to 90 days after account deletion',             section: '8' },
      { category: 'Arbitration',    riskLevel: 'MEDIUM', confidence: 0.79, text: 'Any disputes will be resolved through binding arbitration',                      section: '11.3' },
    ],
    summary: [
      'บริษัทสามารถใช้รูปถ่ายและเนื้อหาของคุณเพื่อโฆษณาได้โดยไม่ต้องจ่ายค่าตอบแทน',
      'ข้อมูลส่วนตัวถูกแชร์กับพาร์ทเนอร์โฆษณาทั่วโลก โดยไม่ระบุชื่อบริษัท',
      'ติดตาม Location แม้ปิดแอปแล้ว และรวบรวมข้อมูลพฤติกรรมการใช้งาน',
      'ข้อมูลถูกเก็บไว้ 90 วันหลังลบบัญชี ไม่ได้ลบทันที',
      'สิทธิ์ฟ้องร้องถูกจำกัดโดยข้อกำหนดอนุญาโตตุลาการ',
    ],
    industryBaseline: baseline,
    comparison: baseline ? `${baseline.name} เฉลี่ยอยู่ที่ ${baseline.avg} — บริการนี้สูงกว่า ${75 - baseline.avg} คะแนน` : 'Social Media เฉลี่ยอยู่ที่ 52 — บริการนี้สูงกว่า 23 คะแนน',
  };
}

async function getCachedResultAsync(url) {
  return new Promise(resolve => {
    const key = 'result_' + btoa(unescape(encodeURIComponent(url))).slice(0, 40);
    chrome.storage.session.get(key, data => resolve(data[key] || null));
  });
}

function getCachedResult(url, sendResponse) {
  getCachedResultAsync(url).then(r => sendResponse({ result: r }));
}

async function cacheResult(url, result) {
  const key = 'result_' + btoa(unescape(encodeURIComponent(url))).slice(0, 40);
  return new Promise(resolve => chrome.storage.session.set({ [key]: result }, resolve));
}

async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get({ 
      geminiApiKey: '', 
      autoAnalyze: true, 
      showOverlay: true, 
      language: 'th', 
      riskThreshold: 60,
      fastapiEnabled: false,
      fastapiUrl: 'http://127.0.0.1:8000/classify',
      fastapiCloudSummaryEnabled: true
    }, resolve);
  });
}

// ── FastAPI Integration ──
async function classifyClausesWithFastapi(texts, settings) {
  try {
    const response = await fetch(settings.fastapiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts })
    });
    if (!response.ok) throw new Error(`FastAPI returned HTTP ${response.status}`);
    const data = await response.json();
    return data.results || [];
  } catch (err) {
    console.error('FastAPI Error:', err);
    return null;
  }
}

async function analyzeWithFastapiOnly(text, url, settings) {
  const rawParts = text.replace(/([.?!])\s+/g, "$1\n").split('\n');
  const clausesText = [];
  
  for (const part of rawParts) {
    if (part.length > 400) {
      const subparts = part.split(' ');
      let currentChunk = '';
      for (const sp of subparts) {
        if (currentChunk.length + sp.length > 250) {
          if (currentChunk.length > 20) clausesText.push(currentChunk.trim());
          currentChunk = sp + ' ';
        } else {
          currentChunk += sp + ' ';
        }
      }
      if (currentChunk.trim().length > 20) clausesText.push(currentChunk.trim());
    } else {
      if (part.trim().length > 20) clausesText.push(part.trim());
    }
  }
  
  const finalTexts = clausesText.slice(0, 40);
  
  if (finalTexts.length === 0) {
    throw new Error('ไม่พบประโยคที่สามารถวิเคราะห์ได้');
  }

  const results = await classifyClausesWithFastapi(finalTexts, settings);
  
  if (!results) {
    throw new Error('เชื่อมต่อ FastAPI ไม่สำเร็จ กรุณาตรวจสอบ Server หรือกด Test Connection ในหน้า Settings');
  }

  const clauses = [];
  results.forEach((r, i) => {
    // Only process if it's not a generic/safe label and confidence is somewhat reasonable (> 0.2)
    if (!r.label.includes('SAFE') && !r.label.startsWith('Other') && r.score > 0.2) {
      const parts = r.label.split('__');
      const category = parts[0] || 'General';
      const riskLevel = parts[1] || 'LOW';
      
      // Only show MEDIUM or HIGH risk clauses in the UI
      if (riskLevel !== 'LOW') {
        clauses.push({
          category: category.replace(/_/g, ' '),
          riskLevel,
          confidence: r.score,
          text: finalTexts[i].slice(0, 300),
          section: null
        });
      }
    }
  });

  const redFlags = clauses;
  
  // Calculate score
  let riskScore = 0;
  let riskLevel = 'LOW';
  if (redFlags.length > 0) {
    const highCount = clauses.filter(c => c.riskLevel === 'HIGH').length;
    const medCount = clauses.filter(c => c.riskLevel === 'MEDIUM').length;
    riskScore = Math.min(100, (highCount * 25) + (medCount * 10));
    riskLevel = riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW';
  }

  const baseline = getIndustryBaseline(url);
  
  return {
    url, analyzedAt: Date.now(),
    riskScore,
    riskLevel,
    clauses,
    redFlags,
    summary: clauses.length > 0 ? ['พบประเด็นความเสี่ยง (ประมวลผลด้วย Local AI)'] : ['ไม่พบความเสี่ยงที่ชัดเจน'],
    industryBaseline: baseline,
    comparison: baseline ? `${baseline.name} เฉลี่ยอยู่ที่ ${baseline.avg} — บริการนี้ได้ ${riskScore} คะแนน` : null,
    fastapi: { status: 'used' }
  };
}

async function analyze(text, url) {
  const settings = await getSettings();
  if (settings.fastapiEnabled) {
    return await analyzeWithFastapiOnly(text, url, settings);
  }
  return await analyzeWithGemini(text, url);
}
