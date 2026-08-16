// ============================================================
//  scam-detector.js — Cybersecurity Scam Detection Engine
//  ตรวจจับ: Investment Scam, Romance Scam, Phishing, Job Scam
// ============================================================
'use strict';

// ── Scam Categories ──
export const SCAM_TYPES = {
  INVESTMENT:  { id: 'Investment Scam',  icon: '📈', th: 'หลอกลงทุน / Pig Butchering' },
  ROMANCE:     { id: 'Romance Scam',     icon: '💔', th: 'Romance Scam / แอบอ้างความรัก' },
  PHISHING:    { id: 'Phishing',         icon: '🎣', th: 'Phishing / ปลอมแปลงตัวตน' },
  JOB:         { id: 'Job Scam',         icon: '💼', th: 'Job Scam / หลอกสมัครงาน' },
  CRYPTO:      { id: 'Crypto Scam',      icon: '🪙', th: 'Crypto Scam / เหรียญปลอม' },
  IMPERSONATION:{ id: 'Impersonation',   icon: '🎭', th: 'แอบอ้างเป็นหน่วยงาน' },
};

// ── Rule-based Signal Library ──
const SIGNAL_RULES = [

  // ━━━━━━ INVESTMENT / PIG BUTCHERING ━━━━━━
  {
    type: 'INVESTMENT', weight: 3,
    pattern: /guaranteed.{0,20}(profit|return|yield)|การันตี.{0,20}(กำไร|ผลตอบแทน|return)/i,
    signal: 'รับประกันกำไร / Guaranteed Returns',
    detail: 'การลงทุนที่ถูกกฎหมายไม่มีการการันตีกำไร'
  },
  {
    type: 'INVESTMENT', weight: 3,
    pattern: /(\d{2,4}%|สอง|สาม|หลาย).{0,30}(ต่อวัน|per day|daily|ต่อเดือน|per month)/i,
    signal: 'ผลตอบแทนสูงผิดปกติ',
    detail: 'ผลตอบแทนสูงเกินจริง เช่น 20%/วัน หรือ 500%/เดือน'
  },
  {
    type: 'INVESTMENT', weight: 2,
    pattern: /สอนเทรด|trading.{0,15}(course|class|group)|กลุ่มเทรด|signal.{0,15}(vip|group|ฟรี)/i,
    signal: 'กลุ่มเทรด / Trading Signal',
    detail: 'หลอกขายคอร์สเทรดหรือ Signal ที่อ้างว่าแม่นยำ'
  },
  {
    type: 'INVESTMENT', weight: 3,
    pattern: /pig.butcher|หมูถูกเชือด|ชวนลงทุน.{0,30}(แอป|app|platform)|withdraw.{0,20}ไม่ได้/i,
    signal: 'Pig Butchering Pattern',
    detail: 'รูปแบบ Pig Butchering — ชวนลงทุนผ่าน App ปลอม ถอนเงินไม่ได้'
  },
  {
    type: 'INVESTMENT', weight: 2,
    pattern: /copy.?trade|mirror.?trade|auto.?trade|บอท.?เทรด|ai.?เทรด/i,
    signal: 'Copy Trade / Bot เทรดอัตโนมัติ',
    detail: 'อ้างว่ามีระบบ AI เทรดให้โดยอัตโนมัติและได้กำไรทุกวัน'
  },
  {
    type: 'INVESTMENT', weight: 2,
    pattern: /referral.{0,20}(bonus|commission)|แนะนำเพื่อน.{0,20}(ได้|รับ)|ค่าแนะนำ/i,
    signal: 'Referral Pyramid Scheme',
    detail: 'ระบบแนะนำเพื่อนรับค่าคอมมิชชั่น — อาจเป็นแชร์ลูกโซ่'
  },

  // ━━━━━━ ROMANCE SCAM ━━━━━━
  {
    type: 'ROMANCE', weight: 3,
    pattern: /i.{0,10}(love|miss|like).{0,20}you|รัก.{0,10}คุณ|คิดถึง|love.at.first/i,
    signal: 'แสดงความรักเร็วผิดปกติ',
    detail: 'แสดงความรู้สึกรุนแรงในระยะเวลาสั้น ก่อนรู้จักกันจริง'
  },
  {
    type: 'ROMANCE', weight: 3,
    pattern: /ขอยืม.{0,20}(เงิน|บาท|usd)|send.{0,20}(money|transfer)|โอนเงิน.{0,20}(ให้|มา|หน่อย)/i,
    signal: 'ขอเงิน / โอนเงิน',
    detail: 'สัญญาณอันตรายที่สุด — ขอเงินหรือให้โอนเงินโดยอ้างเหตุฉุกเฉิน'
  },
  {
    type: 'ROMANCE', weight: 2,
    pattern: /military|ทหาร.{0,20}(ต่างประเทศ|overseas|deploy)|engineer.{0,20}(oil|rig|offshore)/i,
    signal: 'อ้างอาชีพในต่างประเทศ (ทหาร/วิศวกร)',
    detail: 'Romance Scammer มักอ้างเป็นทหาร วิศวกร หรือหมอในต่างประเทศ'
  },
  {
    type: 'ROMANCE', weight: 2,
    pattern: /ไม่สามารถ.{0,20}(มา|พบ|เจอ)|can.t.{0,20}(meet|come|visit)|อยู่.{0,20}ต่างประเทศ/i,
    signal: 'อ้างไม่สามารถพบกันได้',
    detail: 'มักอ้างว่าอยู่ต่างประเทศและพบกันไม่ได้ตลอดความสัมพันธ์'
  },
  {
    type: 'ROMANCE', weight: 2,
    pattern: /gift.{0,20}(stuck|customs|clearance)|พัสดุ.{0,20}(ติด|ด่าน|ศุลกากร)|ส่งของ.{0,20}ติด/i,
    signal: 'พัสดุติดศุลกากร',
    detail: 'หลอกว่าส่งของขวัญแล้วติดศุลกากร ต้องจ่ายเงินค่าธรรมเนียมก่อน'
  },

  // ━━━━━━ PHISHING ━━━━━━
  {
    type: 'PHISHING', weight: 3,
    pattern: /verify.{0,20}(account|identity|information)|ยืนยัน.{0,20}(บัญชี|ตัวตน|ข้อมูล)/i,
    signal: 'ขอยืนยันตัวตน / Verify Account',
    detail: 'หน้าล็อกอินปลอมหรืออีเมลหลอกให้กรอกข้อมูลส่วนตัว'
  },
  {
    type: 'PHISHING', weight: 3,
    pattern: /account.{0,20}(suspended|blocked|limited)|บัญชี.{0,20}(ถูกระงับ|ถูกล็อก|ปิดกั้น)/i,
    signal: 'บัญชีถูกระงับ / Account Suspended',
    detail: 'หลอกว่าบัญชีมีปัญหาเพื่อดึงให้กรอกข้อมูล'
  },
  {
    type: 'PHISHING', weight: 2,
    pattern: /click.{0,20}(here|link|below)|กด.{0,20}(ที่นี่|ลิงก์|ด้านล่าง).{0,20}(ด่วน|เร็ว|ทันที)/i,
    signal: 'กดลิงก์ด่วน',
    detail: 'สร้างความเร่งรีบให้กด Link โดยไม่ตรวจสอบ'
  },
  {
    type: 'PHISHING', weight: 2,
    pattern: /otp|one.time.password|รหัส.{0,10}(ครั้งเดียว|ชั่วคราว|หมดอายุ)/i,
    signal: 'ขอ OTP / รหัสชั่วคราว',
    detail: 'ไม่มีองค์กรใดที่ถูกกฎหมายจะขอ OTP ที่คุณได้รับ'
  },
  {
    type: 'PHISHING', weight: 3,
    pattern: /password|username|เลขบัตร|หมายเลขบัตร|cvv|รหัสผ่าน.{0,20}(ของคุณ|ใหม่)/i,
    signal: 'ขอรหัสผ่าน / ข้อมูลบัตร',
    detail: 'ไม่ควรกรอก Password หรือหมายเลขบัตรบนหน้าที่ไม่น่าเชื่อถือ'
  },

  // ━━━━━━ JOB SCAM ━━━━━━
  {
    type: 'JOB', weight: 3,
    pattern: /work.from.home|ทำงานที่บ้าน|part.time.{0,20}(รายได้|เงิน|บาท|วัน)/i,
    signal: 'งาน Part-time / Work From Home รายได้สูง',
    detail: 'งานที่อ้างว่าทำที่บ้านได้เงินสูงมักเป็นการหลอกลวง'
  },
  {
    type: 'JOB', weight: 3,
    pattern: /ค่าสมัคร|registration.fee|deposit.{0,20}(before|ก่อน)|จ่าย.{0,20}ก่อน.{0,20}(ทำงาน|เริ่ม)/i,
    signal: 'ต้องจ่ายเงินก่อนทำงาน',
    detail: 'งานที่ถูกกฎหมายไม่มีการเก็บค่าสมัครงานหรือค่ามัดจำ'
  },
  {
    type: 'JOB', weight: 2,
    pattern: /กดไลก์|กดแชร์|รีวิว.{0,20}(สินค้า|ร้าน)|like.{0,20}(task|job|earn)/i,
    signal: 'งานกดไลก์ / รีวิวสินค้า',
    detail: 'งานกดไลก์หรือรีวิวที่อ้างว่าได้เงินจริง มักหลอกเก็บเงินทีหลัง'
  },
  {
    type: 'JOB', weight: 3,
    pattern: /scam.center|call.center.{0,20}(myanmar|cambodia|เมียนมา|กัมพูชา)|trafficking/i,
    signal: 'Scam Call Center / Human Trafficking',
    detail: 'ระวัง! อาจเป็นงานที่เชื่อมโยงกับ Call Center ต้มตุ๋นในต่างประเทศ'
  },

  // ━━━━━━ CRYPTO SCAM ━━━━━━
  {
    type: 'CRYPTO', weight: 3,
    pattern: /new.{0,10}token|ico|presale|pre.sale.{0,20}(exclusive|only|limited)|เหรียญใหม่/i,
    signal: 'ICO / Presale Token ปลอม',
    detail: 'ระวัง ICO หรือ Pre-sale เหรียญคริปโตที่ไม่มีหลักฐานน่าเชื่อถือ'
  },
  {
    type: 'CRYPTO', weight: 3,
    pattern: /elon.musk|celebrity.{0,20}(endorse|recommend)|ดารา.{0,20}(แนะนำ|รับรอง)/i,
    signal: 'อ้างบุคคลดัง / Celebrity Endorsement',
    detail: 'มักอ้าง Elon Musk หรือคนดังเพื่อดึงดูดนักลงทุน'
  },
  {
    type: 'CRYPTO', weight: 2,
    pattern: /double.{0,10}(your|bitcoin|crypto)|ส่งมา.{0,20}(คืน.{0,10}สอง|double|x2)/i,
    signal: 'Giveaway Scam / ส่งมาได้คืนสอง',
    detail: 'หลอกว่าส่ง Crypto มาแล้วจะได้รับคืนสองเท่า'
  },

  // ━━━━━━ IMPERSONATION ━━━━━━
  {
    type: 'IMPERSONATION', weight: 3,
    pattern: /dsi|ดีเอสไอ|ตำรวจ|police|กรมสรรพากร|revenue.department|ธนาคารแห่งชาติ/i,
    signal: 'แอบอ้างหน่วยงานรัฐ',
    detail: 'หน่วยงานรัฐไม่ติดต่อทาง Line/WhatsApp ให้โอนเงินหรือกดลิงก์'
  },
  {
    type: 'IMPERSONATION', weight: 3,
    pattern: /microsoft|apple.support|tech.support|แจ้งเตือน.{0,20}(ไวรัส|virus|hack)/i,
    signal: 'Tech Support Scam',
    detail: 'Microsoft/Apple ไม่โทรมาหรือ Pop-up แจ้งให้โทรกลับเพื่อซ่อมไวรัส'
  },
];

// ── URL Red Flags ──
const URL_RED_FLAGS = [
  { pattern: /\.xyz$|\.top$|\.click$|\.loan$|\.gq$|\.cf$/, label: 'TLD น่าสงสัย (.xyz/.top/.click)' },
  { pattern: /[a-z]{30,}/, label: 'โดเมนยาวผิดปกติ' },
  { pattern: /\d{4,}\.[a-z]+$/, label: 'โดเมนมีตัวเลขยาว' },
  { pattern: /paypa1|g00gle|faceb00k|amaz0n|rnicrosoft|bankk0k/, label: 'โดเมนปลอมแปลง (Typosquatting)' },
  { pattern: /bit\.ly|tinyurl|t\.co|goo\.gl|cutt\.ly/, label: 'URL Shortener ซ่อนปลายทาง' },
  { pattern: /ngrok|\.vercel\.app|\.netlify\.app.*login/, label: 'Hosting ชั่วคราวที่มีหน้า Login' },
];

// ── Page Structure Red Flags ──
export function analyzePageStructure(pageInfo) {
  const flags = [];

  // Form asking for sensitive data
  if (pageInfo.hasPasswordField && !pageInfo.isKnownSite) {
    flags.push({ severity: 'HIGH', label: 'มีช่องกรอก Password บนหน้าที่ไม่รู้จัก' });
  }
  if (pageInfo.hasCreditCardField) {
    flags.push({ severity: 'HIGH', label: 'มีช่องกรอกข้อมูลบัตรเครดิต' });
  }
  if (pageInfo.isHTTP) {
    flags.push({ severity: 'MEDIUM', label: 'ใช้ HTTP ไม่ใช่ HTTPS — ไม่ปลอดภัย' });
  }
  if (pageInfo.hasUrgencyTimer) {
    flags.push({ severity: 'MEDIUM', label: 'มี Countdown Timer สร้างความเร่งรีบ' });
  }

  return flags;
}

// ── Main text analysis ──
// ── Known legitimate domains ──
export const KNOWN_SAFE_DOMAINS = /\b(samsung|apple|google|microsoft|amazon|facebook|meta|instagram|twitter|tiktok|netflix|spotify|shopee|lazada|grab|line|truemoney|kasikornbank|scb|krungthai|bualuang|krungsri|bangkokbank|dtac|ais|true|ntplc|gov\.th|or\.th)\b/i;

// ── ToS page detection ──
export const TOS_PAGE_SIGNALS = /terms.of.service|terms.of.use|privacy.policy|terms.and.conditions|ข้อกำหนด|นโยบายความเป็นส่วนตัว|เงื่อนไขการใช้บริการ/i;

export function isTosContext(text, url) {
  return TOS_PAGE_SIGNALS.test(text ? text.slice(0, 2000) : '') || /\/terms|\/privacy|\/legal|\/tos|\/eula/i.test(url || '');
}

export function isKnownSafeDomain(url) {
  try { return KNOWN_SAFE_DOMAINS.test(new URL(url).hostname); } catch { return false; }
}

// Phishing signals that commonly false-positive inside ToS documents
export const TOS_FALSE_POSITIVE_SIGNALS = new Set([
  'ขอรหัสผ่าน / ข้อมูลบัตร',
  'ขอยืนยันตัวตน / Verify Account',
  'บัญชีถูกระงับ / Account Suspended',
  'กดลิงก์ด่วน',
  'ขอ OTP / รหัสชั่วคราว',
]);

// ── ToS-aware wrapper for analyzeTextForScam ──
export function analyzeTextForScamWithContext(text, url) {
  const result    = analyzeTextForScam(text);
  const tosCtx    = isTosContext(text, url);
  const safeDomain = isKnownSafeDomain(url);

  if (!result) return { scamScore: 0, scamLevel: 'SAFE', signals: [], dominantType: null };

  let { signals, scamScore, scamLevel, dominantType, typeCounts } = result;

  if (tosCtx) {
    signals = signals.filter(s => !TOS_FALSE_POSITIVE_SIGNALS.has(s.signal));
    const totalWeight = signals.reduce((s, x) => s + x.weight, 0);
    scamScore = Math.min(100, Math.round(totalWeight * 12));
    if (signals.length === 0) { scamLevel = 'SAFE'; dominantType = null; }
    else scamLevel = scamScore >= 60 ? 'DANGER' : scamScore >= 30 ? 'WARNING' : 'CAUTION';
  }

  if (safeDomain) scamScore = Math.round(scamScore * 0.5);

  return { scamScore, scamLevel, signals, dominantType, typeCounts, isTosContext: tosCtx };
}


  if (!text || text.length < 20) return null;

  const signals = [];
  const typeCounts = {};

  for (const rule of SIGNAL_RULES) {
    if (rule.pattern.test(text)) {
      signals.push({
        type:    rule.type,
        weight:  rule.weight,
        signal:  rule.signal,
        detail:  rule.detail,
        scamType: SCAM_TYPES[rule.type]
      });
      typeCounts[rule.type] = (typeCounts[rule.type] || 0) + rule.weight;
    }
  }

  if (signals.length === 0) return { scamScore: 0, scamLevel: 'SAFE', signals: [], dominantType: null };

  // Calculate score
  const totalWeight = signals.reduce((s, x) => s + x.weight, 0);
  const scamScore   = Math.min(100, Math.round(totalWeight * 12));
  const scamLevel   = scamScore >= 60 ? 'DANGER' : scamScore >= 30 ? 'WARNING' : 'CAUTION';

  // Dominant scam type
  const dominantKey  = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const dominantType = dominantKey ? SCAM_TYPES[dominantKey] : null;

  return { scamScore, scamLevel, signals, dominantType, typeCounts };
}

// ── URL analysis ──
export function analyzeUrl(url) {
  const flags = [];
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    for (const rf of URL_RED_FLAGS) {
      if (rf.pattern.test(host) || rf.pattern.test(url)) {
        flags.push(rf.label);
      }
    }
    // IP as hostname
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      flags.push('ใช้ IP Address แทนโดเมน — น่าสงสัยมาก');
    }
    // Many subdomains
    if ((host.match(/\./g) || []).length >= 4) {
      flags.push('มี Subdomain หลายชั้น — เป็นเทคนิคซ่อนโดเมนจริง');
    }
  } catch {}
  return flags;
}

// ── Advice generator ──
export function getScamAdvice(dominantType) {
  const advice = {
    INVESTMENT: [
      'อย่าโอนเงินให้แพลตฟอร์มที่ไม่มีใบอนุญาต ก.ล.ต.',
      'ตรวจสอบรายชื่อผู้ประกอบการที่ได้รับอนุญาตที่ sec.or.th',
      'ไม่มีการลงทุนใดที่การันตีกำไรแน่นอน',
      'หากถูกหลอก แจ้ง ปอท. โทร 1441',
    ],
    ROMANCE: [
      'ระวังคนที่รู้จักออนไลน์และไม่เคยพบกันจริง',
      'อย่าโอนเงินให้คนที่รู้จักทางออนไลน์ไม่ว่ากรณีใด',
      'ทำ Reverse Image Search รูปโปรไฟล์ก่อนเชื่อใจ',
      'ปรึกษาคนใกล้ชิดหรือแจ้ง สายด่วน DSI 1202',
    ],
    PHISHING: [
      'ตรวจสอบ URL ให้ถูกต้องก่อนกรอกข้อมูลใดๆ',
      'เปิดใช้ 2FA (Two-Factor Authentication) ทุกบัญชี',
      'ไม่กด Link ในอีเมลหรือ SMS ที่ไม่ได้ร้องขอ',
      'แจ้ง ETDA Hotline 1212 หากพบ Phishing',
    ],
    JOB: [
      'งานที่ถูกกฎหมายไม่เก็บค่าสมัครหรือค่ามัดจำ',
      'ระวังงานในประเทศเพื่อนบ้านที่ติดต่อผ่าน Social Media',
      'แจ้งกรมการจัดหางาน โทร 1506 หากสงสัย',
      'ตรวจสอบบริษัทที่ DBD.go.th ก่อนสมัคร',
    ],
    CRYPTO: [
      'ไม่มี Celebrity ใดที่ให้ส่ง Crypto แล้วได้คืนสองเท่า',
      'ตรวจสอบ Whitepaper และทีมงานก่อนลงทุน Token ใหม่',
      'ระวัง Pump & Dump — ราคาพุ่งแรงในเวลาสั้น',
      'ใช้เฉพาะ Exchange ที่ได้รับอนุญาตจาก ก.ล.ต.',
    ],
    IMPERSONATION: [
      'หน่วยงานรัฐไม่ติดต่อทาง Line ให้โอนเงินหรือกดลิงก์',
      'โทรยืนยันกลับตามเบอร์ทางการบนเว็บไซต์หน่วยงาน',
      'แจ้ง ศูนย์รับแจ้งการทุจริตออนไลน์ โทร 1441',
    ],
  };
  return advice[dominantType] || [];
}
