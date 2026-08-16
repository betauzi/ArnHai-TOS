// ============================================================
//  risk-engine.js — Core Analysis Engine
//  ส่วน AI ถูกทำเป็น slot พร้อม connect Backend / Fine-tuned Model
// ============================================================

export class RiskEngine {

  // ============================================================
  //  🤖 AI SLOT #1 — Clause Classifier
  //  เชื่อม: DeBERTa-v3 / mDeBERTa Fine-tuned endpoint
  //  Input:  string (clause text)
  //  Output: { category, riskLevel, confidence }
  // ============================================================
  async classifyClause(clauseText) {
    const settings = await this._getSettings();

    if (settings.aiEndpoint) {
      // --- เชื่อม Fine-tuned Model ---
      const resp = await fetch(`${settings.aiEndpoint}/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
        body: JSON.stringify({ text: clauseText })
      });
      if (!resp.ok) throw new Error(`Classifier error: ${resp.status}`);
      return await resp.json();
      // Expected response: { category: string, riskLevel: 'HIGH'|'MEDIUM'|'LOW', confidence: number }
    }

    // Fallback: Rule-based heuristic (ใช้ระหว่างพัฒนา)
    return this._ruleBasedClassify(clauseText);
  }

  // ============================================================
  //  🤖 AI SLOT #2 — Thai Summarization Model
  //  เชื่อม: LLaMA 3.1 8B / Qwen2.5-7B Fine-tuned endpoint
  //  Input:  string (full ToS text)
  //  Output: string[] (5-10 bullet points in Thai)
  // ============================================================
  async summarizeThai(fullText) {
    const settings = await this._getSettings();

    if (settings.aiEndpoint) {
      // --- เชื่อม Fine-tuned Summarization Model ---
      const resp = await fetch(`${settings.aiEndpoint}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
        body: JSON.stringify({ text: fullText, language: 'th', max_points: 10 })
      });
      if (!resp.ok) throw new Error(`Summarizer error: ${resp.status}`);
      const data = await resp.json();
      return data.summary; // string[]
    }

    // Fallback placeholder
    return ['กำลังรอเชื่อม Summarization Model — configure endpoint ใน Settings'];
  }

  // ============================================================
  //  🤖 AI SLOT #3 — Q&A / Clause Explanation
  //  เชื่อม: LLM endpoint สำหรับ interactive Q&A
  //  Input:  { question, clauseContext, fullText }
  //  Output: string (answer in Thai)
  // ============================================================
  async askAboutClause({ question, clauseContext, fullText }) {
    const settings = await this._getSettings();

    if (settings.aiEndpoint) {
      const resp = await fetch(`${settings.aiEndpoint}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
        body: JSON.stringify({ question, context: clauseContext, full_document: fullText })
      });
      if (!resp.ok) throw new Error(`Chat error: ${resp.status}`);
      const data = await resp.json();
      return data.answer;
    }

    return 'กรุณาเชื่อม AI Model Endpoint ใน Settings ก่อนใช้ฟีเจอร์นี้';
  }

  // ============================================================
  //  📊 Risk Score Calculator (Rule-based — ทำงานได้ทันที)
  //  คำนวณจาก Weighted Sum ของ Clause-level Risk
  // ============================================================
  calculateRiskScore(clauses) {
    const weights = { HIGH: 20, MEDIUM: 8, LOW: 2 };
    const categoryBonus = {
      'Data Sharing':    1.4,
      'Location Track':  1.3,
      'Data Retention':  1.1,
      'Arbitration':     1.2,
      'Auto-billing':    1.1,
      'User Rights':     1.0
    };

    let rawScore = 0;
    for (const c of clauses) {
      const base = weights[c.riskLevel] || 0;
      const bonus = categoryBonus[c.category] || 1.0;
      rawScore += base * bonus;
    }

    // Normalize to 0-100
    const maxPossible = clauses.length * weights.HIGH * 1.4;
    const score = maxPossible > 0 ? Math.min(100, Math.round((rawScore / maxPossible) * 100)) : 0;

    return {
      score,
      level: score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW'
    };
  }

  // ── Full analysis pipeline ──
  async analyzeFromText(text, url) {
    const clauses = this._extractClauses(text);
    const classified = await Promise.all(clauses.map(c => this.classifyClause(c)));
    const { score, level } = this.calculateRiskScore(classified);
    const summary = await this.summarizeThai(text);
    const redFlags = classified.filter(c => c.riskLevel !== 'LOW');
    const industry = this._getIndustryBaseline(url);

    return {
      url,
      analyzedAt: Date.now(),
      riskScore: score,
      riskLevel: level,
      clauses: classified,
      redFlags,
      summary,
      industryBaseline: industry,
      comparison: industry ? `${industry.name} เฉลี่ยอยู่ที่ ${industry.avg} — บริการนี้${score > industry.avg ? `สูงกว่า ${score - industry.avg} คะแนน` : `ต่ำกว่า ${industry.avg - score} คะแนน`}` : null
    };
  }

  // ── Text extraction from URL via content script ──
  async analyzeFromUrl(url) {
    // สั่งให้ content script ดึง text แล้วส่งกลับ
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result: text }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body.innerText
    });
    return this.analyzeFromText(text, url);
  }

  // ── Rule-based classifier (fallback) ──
  _ruleBasedClassify(text) {
    const t = text.toLowerCase();
    const rules = [
      { pattern: /third.party|third party|ผู้ให้บริการภายนอก|พาร์ทเนอร์/, category: 'Data Sharing',   risk: 'HIGH' },
      { pattern: /location|ตำแหน่ง|gps|พิกัด/,                            category: 'Location Track',  risk: 'HIGH' },
      { pattern: /sell.*data|ขายข้อมูล|data broker/,                       category: 'Data Sharing',   risk: 'HIGH' },
      { pattern: /arbitration|อนุญาโตตุลาการ|class action/,               category: 'Arbitration',    risk: 'MEDIUM' },
      { pattern: /retain|เก็บข้อมูล.*ลบ|after.*delet/,                    category: 'Data Retention', risk: 'MEDIUM' },
      { pattern: /auto.renew|ต่ออายุอัตโนมัติ|automatic.*charg/,         category: 'Auto-billing',   risk: 'MEDIUM' },
      { pattern: /right to erasure|ลบข้อมูล|data portab/,                 category: 'User Rights',    risk: 'LOW' }
    ];

    for (const rule of rules) {
      if (rule.pattern.test(t)) {
        return { category: rule.category, riskLevel: rule.risk, confidence: 0.7, text };
      }
    }
    return { category: 'General', riskLevel: 'LOW', confidence: 0.5, text };
  }

  // ── Simple clause extractor ──
  _extractClauses(text) {
    // แบ่งด้วย newline / numbered list / section header
    return text
      .split(/\n{2,}|\d+\.\s+|(?:Section|ข้อ)\s+\d+/i)
      .map(s => s.trim())
      .filter(s => s.length > 40 && s.length < 2000)
      .slice(0, 50); // สูงสุด 50 clauses
  }

  // ── Industry baseline comparison ──
  _getIndustryBaseline(url) {
    const baselines = [
      { pattern: /facebook|instagram|twitter|tiktok|social/, name: 'Social Media', avg: 52 },
      { pattern: /netflix|spotify|youtube|streaming/,        name: 'Streaming',    avg: 38 },
      { pattern: /shopee|lazada|amazon|ecommerce|shop/,      name: 'E-Commerce',   avg: 45 },
      { pattern: /google|microsoft|apple/,                   name: 'Big Tech',     avg: 60 },
      { pattern: /bank|banking|finance|ธนาคาร/,              name: 'Finance',      avg: 55 }
    ];
    const u = (url || '').toLowerCase();
    return baselines.find(b => b.pattern.test(u)) || null;
  }

  // ── Mock result for development ──
  getMockResult(url) {
    const baseline = this._getIndustryBaseline(url);
    return {
      url,
      analyzedAt: Date.now(),
      riskScore: 75,
      riskLevel: 'HIGH',
      clauses: [
        { category: 'Data Sharing',   riskLevel: 'HIGH',   confidence: 0.91, text: 'We may share your data with third-party partners without explicit notification', section: '4.2' },
        { category: 'Location Track', riskLevel: 'HIGH',   confidence: 0.88, text: 'We collect your location data even when the app is running in the background',   section: '6.1' },
        { category: 'Data Retention', riskLevel: 'MEDIUM', confidence: 0.82, text: 'Your data may be retained for up to 90 days after account deletion',             section: '8' },
        { category: 'Arbitration',    riskLevel: 'MEDIUM', confidence: 0.79, text: 'Any disputes will be resolved through binding arbitration, waiving your right to class action', section: '11.3' },
        { category: 'Auto-billing',   riskLevel: 'LOW',    confidence: 0.75, text: 'Subscription renews automatically unless cancelled 48 hours before renewal date', section: '3.1' }
      ],
      redFlags: [
        { category: 'Data Sharing',   riskLevel: 'HIGH',   confidence: 0.91, text: 'We may share your data with third-party partners without explicit notification', section: '4.2' },
        { category: 'Location Track', riskLevel: 'HIGH',   confidence: 0.88, text: 'We collect your location data even when the app is running in the background',   section: '6.1' },
        { category: 'Data Retention', riskLevel: 'MEDIUM', confidence: 0.82, text: 'Your data may be retained for up to 90 days after account deletion',             section: '8' },
        { category: 'Arbitration',    riskLevel: 'MEDIUM', confidence: 0.79, text: 'Any disputes will be resolved through binding arbitration',                      section: '11.3' }
      ],
      summary: [
        'บริษัทสามารถใช้รูปถ่ายและเนื้อหาของคุณเพื่อโฆษณาได้โดยไม่ต้องจ่ายค่าตอบแทน',
        'ข้อมูลส่วนตัวถูกแชร์กับพาร์ทเนอร์โฆษณาทั่วโลก โดยไม่ระบุชื่อบริษัท',
        'ติดตาม Location แม้ปิดแอปแล้ว และรวบรวมข้อมูลพฤติกรรมการใช้งาน',
        'ข้อมูลถูกเก็บไว้ 90 วันหลังลบบัญชี ไม่ได้ลบทันที',
        'สิทธิ์ฟ้องร้องถูกจำกัดโดยข้อกำหนดอนุญาโตตุลาการ'
      ],
      industryBaseline: baseline,
      comparison: baseline
        ? `${baseline.name} เฉลี่ยอยู่ที่ ${baseline.avg} — บริการนี้สูงกว่า ${75 - baseline.avg} คะแนน`
        : null
    };
  }

  async _getSettings() {
    return new Promise(resolve => {
      chrome.storage.sync.get({ aiEndpoint: '', apiKey: '' }, resolve);
    });
  }
}