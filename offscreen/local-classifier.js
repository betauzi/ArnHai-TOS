import { pipeline, env } from '../vendor/transformers/transformers.bundle.js';

const DEFAULT_DTYPE = 'q8';
const DEFAULT_DEVICE = 'wasm';
const DEFAULT_ONNX_FILE = 'onnx/model_quantized.onnx';
const ONNX_SUBFOLDER = 'onnx';
const MODEL_FILE_NAME = 'model';
const WASM_BASE_URL = 'vendor/transformers/';

const classifierCache = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target !== 'offscreen-local-classifier' || msg?.type !== 'LOCAL_CLASSIFY') return false;

  handleLocalClassify(msg)
    .then(result => sendResponse(result))
    .catch(err => sendResponse(buildFailureResponse(msg, err)));
  return true;
});

async function handleLocalClassify(msg) {
  const model = msg.model;
  const device = msg.device || DEFAULT_DEVICE;
  const dtype = msg.dtype || DEFAULT_DTYPE;
  const attemptedOnnxPath = msg.attemptedOnnxPath || DEFAULT_ONNX_FILE;
  const clauses = Array.isArray(msg.clauses) ? msg.clauses : [];
  const classifier = await getClassifier({ model, device, dtype, attemptedOnnxPath, debug: !!msg.debug });

  const classified = [];
  let firstPrediction = null;
  for (const clause of clauses.slice(0, 25)) {
    const text = String(clause?.text || '').trim();
    if (!text) continue;

    const prediction = await classifier(text, { top_k: 1 });
    const best = getBestPrediction(prediction);
    if (!firstPrediction) firstPrediction = best;

    const parsed = parseClassifierLabel(best?.label);
    if (!parsed) continue;
    classified.push({
      category: parsed.category,
      riskLevel: parsed.riskLevel,
      confidence: clampNumber(best?.score, 0, 1),
      text: text.slice(0, 180),
      section: 'local-classifier'
    });
  }

  return {
    ok: true,
    clauses: classified,
    metadata: {
      enabled: true,
      model,
      device,
      dtype,
      status: 'used',
      classifiedClauses: classified.length,
      label: firstPrediction?.label || null,
      score: Number.isFinite(Number(firstPrediction?.score)) ? Number(firstPrediction.score) : null,
      attemptedOnnxPath,
      loadMethod: 'offscreen-bundled',
      loadError: null
    }
  };
}

async function getClassifier({ model, device, dtype, attemptedOnnxPath, debug }) {
  configureTransformersEnv();
  const cacheKey = `${model}::${device}::${dtype}`;
  if (classifierCache.has(cacheKey)) {
    debugLog(debug, 'Using cached classifier', { model, device, dtype });
    return classifierCache.get(cacheKey);
  }

  const options = {
    device,
    dtype,
    subfolder: ONNX_SUBFOLDER,
    model_file_name: MODEL_FILE_NAME
  };
  const fallbackOptions = {
    device,
    subfolder: ONNX_SUBFOLDER,
    model_file_name: MODEL_FILE_NAME
  };

  try {
    debugLog(debug, 'Loading classifier', { model, ...options, attemptedOnnxPath });
    const classifier = await pipeline('text-classification', model, options);
    classifierCache.set(cacheKey, classifier);
    return classifier;
  } catch (err) {
    if (!isDtypeUnsupportedError(err)) throw err;
    debugLog(debug, 'Retrying classifier without dtype option', { model, ...fallbackOptions, error: err.message });
    const classifier = await pipeline('text-classification', model, fallbackOptions);
    classifierCache.set(cacheKey, classifier);
    return classifier;
  }
}

function configureTransformersEnv() {
  env.allowRemoteModels = true;
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  if (env.backends?.onnx?.wasm) {
    const wasmBase = chrome.runtime.getURL(WASM_BASE_URL);
    env.backends.onnx.wasm.wasmPaths = {
      mjs: `${wasmBase}ort-wasm-simd-threaded.jsep.mjs`,
      wasm: `${wasmBase}ort-wasm-simd-threaded.jsep.wasm`
    };
    env.backends.onnx.wasm.proxy = false;
  }
}

function buildFailureResponse(msg, err) {
  const error = normalizeLoadError(err);
  return {
    ok: false,
    clauses: [],
    error,
    metadata: {
      enabled: true,
      model: msg?.model || null,
      device: msg?.device || DEFAULT_DEVICE,
      dtype: msg?.dtype || DEFAULT_DTYPE,
      status: 'failed',
      classifiedClauses: 0,
      label: null,
      score: null,
      attemptedOnnxPath: msg?.attemptedOnnxPath || DEFAULT_ONNX_FILE,
      loadMethod: 'offscreen-bundled',
      loadError: error,
      localClassifierError: error
    }
  };
}

function getBestPrediction(prediction) {
  if (Array.isArray(prediction?.[0])) return prediction[0][0];
  if (Array.isArray(prediction)) return prediction[0];
  return prediction || null;
}

function parseClassifierLabel(label) {
  const raw = String(label || '').trim();
  if (!raw) return null;
  const [categoryPart, riskPart] = raw.split('__');
  const category = (categoryPart || 'General').trim() || 'General';
  const riskLevel = normalizeRiskLevel(riskPart);
  if (!riskLevel) return null;
  return { category, riskLevel };
}

function normalizeRiskLevel(value) {
  const level = String(value || '').trim().toUpperCase();
  if (['LOW', 'MEDIUM', 'HIGH'].includes(level)) return level;
  return null;
}

function clampNumber(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
}

function isDtypeUnsupportedError(err) {
  const message = String(err?.message || err || '').toLowerCase();
  return message.includes('dtype')
    && (
      message.includes('unsupported')
      || message.includes('unknown')
      || message.includes('invalid')
      || message.includes('unexpected')
      || message.includes('not supported')
    );
}

function normalizeLoadError(err) {
  const message = String(err?.message || err || '');
  const lower = message.toLowerCase();
  const missingOnnx = lower.includes('onnx')
    && (
      lower.includes('404')
      || lower.includes('not found')
      || lower.includes('could not locate')
      || lower.includes('no file')
      || lower.includes('model file')
      || lower.includes('model_quantized')
      || lower.includes('model.onnx')
    );

  if (missingOnnx) {
    return 'ไม่พบ ONNX model ใน Hugging Face repo กรุณา export ONNX ไปยังโฟลเดอร์ onnx/ ก่อนใช้งาน Local Classifier';
  }
  return message || 'Local classifier unavailable';
}

function debugLog(enabled, message, details = {}) {
  if (!enabled) return;
  console.debug('[Arn-Hai Offscreen Local Classifier]', message, details);
}
