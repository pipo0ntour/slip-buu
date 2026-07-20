// ── Adapter ของแต่ละค่าย/โมเดล — ทุกตัวคืน "raw JSON ตาม schema PROMPT" ให้ runner เอาไป normalize+ให้คะแนน ──
// key-gated: enabled() คืน true เฉพาะเมื่อมี env key ครบ → ค่ายที่ยังไม่ใส่ key จะถูกข้าม
// type: 'vision' = โมเดลอ่านรูป→JSON ตรง ๆ | 'ocr' = OCR ได้ข้อความดิบ แล้วต่อ hybrid (ข้อความ→LLM→JSON)
import { GoogleGenerativeAI } from '@google/generative-ai'
import { TASKS, hybridPrompt, parseJsonLoose } from './lib.mjs'

// prompt เต็มของงานนั้น ๆ (prompt + hint คีย์ JSON) — ดีฟอลต์ document (สลิป/ใบเสร็จ)
const taskPrompt = (taskId = 'document') => {
  const t = TASKS[taskId] || TASKS.document
  return t.prompt + t.hint
}

const env = (k) => (process.env[k] || '').trim()
const has = (...keys) => keys.every((k) => env(k))

const genAI = new GoogleGenerativeAI(env('GEMINI_API_KEY') || 'missing')

// เรียก Gemini คืน JSON (ใช้ทั้ง provider gemini และขั้น hybrid)
async function geminiJson(model, parts) {
  const m = genAI.getGenerativeModel({ model, generationConfig: { temperature: 0, responseMimeType: 'application/json' } })
  const r = await m.generateContent(parts)
  return parseJsonLoose(r.response.text())
}

// หมุนหลายโมเดลแบบเดียวกับ production (โควต้าฟรีนับแยกต่อโมเดล — ก.ค. 2026 เหลือ ~20 req/วัน/โมเดล)
// โมเดลไหนเจอ 429 quota จะถูกจำว่าตายแล้วข้ามตลอดการรันนี้
const geminiDead = new Set()
async function geminiJsonRotate(parts) {
  // 2.0-flash ถูก Google ตัดสิทธิ์ฟรีถาวรแล้ว (limit: 0) — เหลือ 2.5 สองตัว
  const models = (env('BENCH_GEMINI_MODELS') || env('BENCH_GEMINI_MODEL')
    || 'gemini-2.5-flash,gemini-2.5-flash-lite').split(',').map((s) => s.trim()).filter(Boolean)
  let lastErr
  for (const m of models) {
    if (geminiDead.has(m)) continue
    try { return await geminiJson(m, parts) } catch (e) {
      const msg = e.message || ''
      // blacklist เฉพาะ "โควต้าต่อวัน" หมดจริง (PerDay) — 429 ต่อนาทีให้โยนออกไปให้ชั้น retry รอแล้วลองใหม่
      if (/per.?day/i.test(msg)) { geminiDead.add(m); lastErr = e; continue }
      throw e
    }
  }
  throw lastErr || new Error('gemini: ทุกโมเดลโควต้าหมดวันนี้')
}

// เรียก endpoint แบบ OpenAI-compatible (chat completions + vision) — ใช้ร่วมหลายค่าย
async function openaiVision({ url, apiKey, model, imageBuffer, mime, prompt, jsonMode = false, headers = {}, extraBody = {} }) {
  const dataUri = `data:${mime};base64,${imageBuffer.toString('base64')}`
  const body = {
    model,
    temperature: 0,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt || taskPrompt() },
        { type: 'image_url', image_url: { url: dataUri } },
      ],
    }],
    ...extraBody, // param เฉพาะค่าย เช่น Zhipu thinking:{type:'disabled'}
  }
  if (jsonMode) body.response_format = { type: 'json_object' }
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`)
  const data = await res.json()
  return parseJsonLoose(data.choices?.[0]?.message?.content || '')
}

// Cloudflare Workers AI — llama-3.2 vision ใช้ native endpoint (ai/run): prompt(string) + image(byte array)
// หมายเหตุ: endpoint OpenAI-compat (/ai/v1) ไม่รับ image_url ของโมเดลนี้ (error 3030)
// โมเดลนี้ตอบ JSON ตาม schema ไม่คงเส้นคงวา (บ่อยครั้งตอบร้อยแก้ว/degenerate) → ใช้เป็น "OCR ถอดข้อความ"
// แล้วต่อ hybrid (ข้อความ→LLM→JSON) เพื่อวัดความสามารถ "อ่านไทย" ของ CF อย่างเสถียรและยุติธรรม
async function cloudflareOcrText(imageBuffer) {
  const acc = env('CLOUDFLARE_ACCOUNT_ID')
  const model = env('CLOUDFLARE_MODEL') || '@cf/meta/llama-3.2-11b-vision-instruct'
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/ai/run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('CLOUDFLARE_API_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'อ่านและถอดข้อความทั้งหมดในเอกสารนี้ออกมาตามที่เห็นจริง บรรทัดต่อบรรทัด ห้ามเดา ห้ามเพิ่มคำอธิบาย',
      image: Array.from(new Uint8Array(imageBuffer)),
      max_tokens: 800,
    }),
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`)
  const data = await res.json()
  return data.result?.response || ''
}

// ── hybrid: ข้อความจาก OCR → text-LLM แตกเป็นฟิลด์ตามงาน ──
// เลือกลำดับ backend ผ่าน env BENCH_HYBRID (เช่น 'zhipu,groq') — ดีฟอลต์ไม่เอา Gemini นำ
// เพราะโควต้าฟรี Gemini เหลือ 20 req/วัน/โมเดล (ก.ค. 2026) ตายง่าย แล้วลากค่าย OCR ตายตาม
const HYBRID_BACKENDS = {
  async zhipu(prompt) {
    if (!has('ZHIPU_API_KEY')) throw new Error('no zhipu key')
    const res = await fetch(`${env('ZHIPU_BASE_URL') || 'https://open.bigmodel.cn/api/paas/v4'}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('ZHIPU_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env('BENCH_HYBRID_ZHIPU_MODEL') || 'glm-4-flash', // text ฟรี โควต้ากว้าง
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`hybrid zhipu ${res.status} ${(await res.text().catch(() => '')).slice(0, 120)}`)
    const data = await res.json()
    return parseJsonLoose(data.choices?.[0]?.message?.content || '')
  },
  async groq(prompt) {
    const key = env('GROQ_API_KEYS').split(',')[0]?.trim()
    if (!key) throw new Error('no groq key')
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env('GROQ_MODELS').split(',')[0]?.trim() || 'llama-3.3-70b-versatile',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`hybrid groq ${res.status}`)
    const data = await res.json()
    return parseJsonLoose(data.choices?.[0]?.message?.content || '')
  },
  async gemini(prompt) {
    if (!has('GEMINI_API_KEY')) throw new Error('no gemini key')
    return geminiJson('gemini-2.5-flash-lite', [{ text: prompt }])
  },
}

async function hybridExtract(ocrText, taskId = 'document') {
  if (!ocrText || !ocrText.trim()) return null
  const prompt = hybridPrompt(ocrText, taskId)
  const order = (env('BENCH_HYBRID') || 'zhipu,groq,gemini').split(',').map((s) => s.trim()).filter((s) => HYBRID_BACKENDS[s])
  let lastErr
  for (const name of order) {
    try { return await HYBRID_BACKENDS[name](prompt) } catch (e) { lastErr = e }
  }
  throw lastErr || new Error('hybrid: ไม่มี backend ที่ใช้ได้ (ต้องมีคีย์ Zhipu/Groq/Gemini อย่างน้อยหนึ่ง)')
}

// ════════════════════ OCR ธรรมดา: คืน "ข้อความดิบ" (แล้ว runner/adapter ต่อ hybrid) ════════════════════

async function ocrSpaceText(imageBuffer, mime) {
  const form = new FormData()
  form.append('base64Image', `data:${mime};base64,${imageBuffer.toString('base64')}`)
  form.append('OCREngine', '2') // engine 2 auto-detect หลายภาษา
  form.append('scale', 'true')
  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { apikey: env('OCR_SPACE_API_KEY') },
    body: form,
  })
  if (!res.ok) throw new Error(`ocrspace ${res.status}`)
  const data = await res.json()
  if (data.IsErroredOnProcessing) throw new Error(data.ErrorMessage?.[0] || 'ocrspace error')
  return data.ParsedResults?.map((r) => r.ParsedText).join('\n') || ''
}

async function googleVisionText(imageBuffer) {
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${env('GOOGLE_VISION_API_KEY')}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        image: { content: imageBuffer.toString('base64') },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        imageContext: { languageHints: ['th', 'en'] },
      }],
    }),
  })
  if (!res.ok) throw new Error(`googlevision ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const data = await res.json()
  const r = data.responses?.[0]
  if (r?.error) throw new Error(r.error.message)
  return r?.fullTextAnnotation?.text || ''
}

async function azureReadText(imageBuffer) {
  const endpoint = env('AZURE_DI_ENDPOINT').replace(/\/$/, '')
  const url = `${endpoint}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-11-30`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': env('AZURE_DI_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Source: imageBuffer.toString('base64') }),
  })
  if (res.status !== 202) throw new Error(`azure submit ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const opUrl = res.headers.get('operation-location')
  if (!opUrl) throw new Error('azure: ไม่มี operation-location')
  // poll จนกว่าจะเสร็จ (Read มัก < 5 วิ)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    const p = await fetch(opUrl, { headers: { 'Ocp-Apim-Subscription-Key': env('AZURE_DI_KEY') } })
    const j = await p.json()
    if (j.status === 'succeeded') return j.analyzeResult?.content || ''
    if (j.status === 'failed') throw new Error('azure analyze failed')
  }
  throw new Error('azure: timeout รอผลนานเกินไป')
}

// ════════════════════ Registry ════════════════════
// ทุก run() รับ (buf, mime, task) — task = 'document' | 'note' | 'product' (ดีฟอลต์ document)
// ค่าย type:'ocr' ทำงาน product ไม่ได้ (ระบุสินค้าจากภาพต้องใช้ vision) — runner ข้ามให้ตาม TASKS[task].ocrHybrid
export const PROVIDERS = [
  // ── vision-LLM (รูป → JSON ตรง) ──
  {
    id: 'gemini', label: 'Google Gemini', type: 'vision',
    enabled: () => has('GEMINI_API_KEY'),
    // หมุน flash→flash-lite→2.0-flash เหมือน production (เพราะโควต้าฟรีต่อโมเดลต่ำมาก)
    run: (buf, mime, task) => geminiJsonRotate(
      [{ text: taskPrompt(task) }, { inlineData: { data: buf.toString('base64'), mimeType: mime } }]),
  },
  {
    id: 'groq', label: 'Groq (Llama 4 Scout)', type: 'vision',
    enabled: () => has('GROQ_API_KEYS'),
    run: (buf, mime, task) => openaiVision({
      url: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: env('GROQ_API_KEYS').split(',')[0].trim(),
      model: env('BENCH_GROQ_MODEL') || 'meta-llama/llama-4-scout-17b-16e-instruct',
      imageBuffer: buf, mime, prompt: taskPrompt(task), jsonMode: true,
    }),
  },
  {
    id: 'cloudflare', label: 'Cloudflare (Llama Vision+hybrid)', type: 'ocr',
    enabled: () => has('CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'),
    run: async (buf, _mime, task) => hybridExtract(await cloudflareOcrText(buf), task),
  },
  {
    id: 'openrouter', label: 'OpenRouter (free VLM)', type: 'vision',
    enabled: () => has('OPENROUTER_API_KEY'),
    run: (buf, mime, task) => openaiVision({
      url: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: env('OPENROUTER_API_KEY'),
      model: env('OPENROUTER_MODEL') || 'google/gemma-4-26b-a4b-it:free', // โมเดลฟรีหมุนเวียน—เช็ค /models; สำรอง: nvidia/nemotron-nano-12b-v2-vl:free
      imageBuffer: buf, mime, prompt: taskPrompt(task),
      headers: { 'HTTP-Referer': 'https://slip-buu.local', 'X-Title': 'slip-buu-bench' },
    }),
  },
  {
    id: 'nvidia', label: 'NVIDIA NIM', type: 'vision',
    enabled: () => has('NVIDIA_API_KEY'),
    run: (buf, mime, task) => openaiVision({
      url: 'https://integrate.api.nvidia.com/v1/chat/completions',
      apiKey: env('NVIDIA_API_KEY'),
      model: env('NVIDIA_MODEL') || 'meta/llama-3.2-11b-vision-instruct', // 90b แม่นกว่าแต่ช้ามาก (~100s/ใบ บน free) — override ได้
      imageBuffer: buf, mime, prompt: taskPrompt(task),
    }),
  },
  {
    id: 'mistral', label: 'Mistral (Small)', type: 'vision',
    enabled: () => has('MISTRAL_API_KEY'),
    run: (buf, mime, task) => openaiVision({
      url: 'https://api.mistral.ai/v1/chat/completions',
      apiKey: env('MISTRAL_API_KEY'),
      model: env('MISTRAL_MODEL') || 'mistral-small-latest', // multimodal; pixtral-12b ไม่มีในลิสต์แล้ว
      imageBuffer: buf, mime, prompt: taskPrompt(task), jsonMode: true,
    }),
  },
  {
    id: 'github', label: 'GitHub Models (GPT-4o)', type: 'vision',
    enabled: () => has('GITHUB_TOKEN'),
    run: (buf, mime, task) => openaiVision({
      url: 'https://models.github.ai/inference/chat/completions',
      apiKey: env('GITHUB_TOKEN'),
      model: env('GITHUB_MODEL') || 'openai/gpt-4o', // เปลี่ยนได้ เช่น openai/gpt-4o-mini, microsoft/Phi-4-multimodal-instruct
      imageBuffer: buf, mime, prompt: taskPrompt(task), jsonMode: true,
    }),
  },
  {
    id: 'huggingface', label: 'HuggingFace (Qwen3-VL)', type: 'vision',
    enabled: () => has('HF_TOKEN'),
    run: (buf, mime, task) => openaiVision({
      url: 'https://router.huggingface.co/v1/chat/completions',
      apiKey: env('HF_TOKEN'),
      model: env('HF_MODEL') || 'Qwen/Qwen3-VL-30B-A3B-Instruct', // HF Inference Providers routes ให้; ดูตัวอื่นได้จาก /v1/models
      imageBuffer: buf, mime, prompt: taskPrompt(task),
    }),
  },
  {
    id: 'zhipu', label: 'Zhipu (GLM-5V-Turbo)', type: 'vision',
    enabled: () => has('ZHIPU_API_KEY'),
    run: (buf, mime, task) => openaiVision({
      // OpenAI-compatible v4 — default = open.bigmodel.cn (แพลตฟอร์มที่ออกคีย์นี้ + เป็นที่มี glm-5v-turbo)
      url: `${env('ZHIPU_BASE_URL') || 'https://open.bigmodel.cn/api/paas/v4'}/chat/completions`,
      apiKey: env('ZHIPU_API_KEY'),
      // vision: glm-4v-flash(ฟรี) < glm-4v-plus < glm-4.5v < glm-4.6v < glm-5v-turbo(ใหม่สุด)
      model: env('ZHIPU_MODEL') || 'glm-5v-turbo',
      imageBuffer: buf, mime, prompt: taskPrompt(task), jsonMode: true,
      // ปิด thinking: latency 83s→11s (7.5×) โดยความแม่นไม่ลด — reasoning ไม่ช่วยฟิลด์พวกนี้
      extraBody: { thinking: { type: 'disabled' } },
    }),
  },
  // ── OCR ธรรมดา → hybrid (ข้อความ → LLM → JSON) ──
  {
    id: 'ocrspace', label: 'OCR.space + hybrid', type: 'ocr',
    enabled: () => has('OCR_SPACE_API_KEY'),
    run: async (buf, mime, task) => hybridExtract(await ocrSpaceText(buf, mime), task),
  },
  {
    id: 'googlevision', label: 'Google Vision + hybrid', type: 'ocr',
    enabled: () => has('GOOGLE_VISION_API_KEY'),
    run: async (buf, _mime, task) => hybridExtract(await googleVisionText(buf), task),
  },
  {
    id: 'azure', label: 'Azure Doc Intelligence + hybrid', type: 'ocr',
    enabled: () => has('AZURE_DI_ENDPOINT', 'AZURE_DI_KEY'),
    run: async (buf, _mime, task) => hybridExtract(await azureReadText(buf), task),
  },
]
