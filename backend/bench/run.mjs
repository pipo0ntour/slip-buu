// ── ตัวรัน benchmark 4 ฟังก์ชันของแอป: ใบเสร็จ/สลิป/สินค้า/โน้ต — ยิงทุกค่ายที่มี key → ให้คะแนนเทียบเฉลย → รายงาน ──
// รัน: node bench/run.mjs [--cats receipts,slips,products,notes] [--only gemini,groq] [--limit 5]
// โครง: วนขนาน "ต่อค่าย" (แต่ละค่ายไล่รูปของตัวเองตามลำดับ + เว้นจังหวะตาม rate limit ของค่ายนั้น)
import 'dotenv/config'
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'
import { compressImage, OCR_PRESET } from '../src/services/image.js'
import { PROVIDERS } from './providers.mjs'
import {
  TASKS, canonFields, canonProduct, canonNote,
  scoreField, SCORE_FIELDS, WEIGHTS,
  scoreProduct, PRODUCT_FIELDS, PRODUCT_WEIGHTS,
  scoreNote, PRICING, pct,
} from './lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATASET = join(HERE, 'dataset')
const OUT_DIR = join(HERE, 'out')

// 4 หมวด = 4 ฟังก์ชันของแอป (สลิป/ใบเสร็จใช้ task document ร่วมกัน แต่รายงานแยก)
const CATS = [
  { id: 'receipts', label: 'ใบเสร็จ', task: 'document' },
  { id: 'slips', label: 'สลิปโอนเงิน', task: 'document' },
  { id: 'products', label: 'รูปสินค้า', task: 'product' },
  { id: 'notes', label: 'โน้ตลายมือ', task: 'note' },
]

// จังหวะขั้นต่ำระหว่าง call ต่อค่าย (ms) — กัน rate limit รายค่าย
// groq 7000: ลิมิตจริงคือ 30k token/นาที (ภาพละ ~3k token → ~8-9 ใบ/นาทีพอดีเพดาน)
// gemini 13000: free tier ใหม่ RPM ต่ำมาก (~5/นาที) — ช้าแต่ไม่โดน 429 กลางคัน
const PACE = { gemini: 13000, github: 6500, groq: 7000, ocrspace: 4000, cloudflare: 2000, default: 400 }

// ── args ──
const args = process.argv.slice(2)
const getArg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null }
const only = (getArg('--only') || '').split(',').map((s) => s.trim()).filter(Boolean)
const catsArg = (getArg('--cats') || '').split(',').map((s) => s.trim()).filter(Boolean)
const limit = Number(getArg('--limit')) || Infinity
// --resume <raw.json เดิม>: ใบที่ค่ายนั้นเคย "ผ่าน" แล้วจะถูกคัดลอกมาเลย ไม่ยิงซ้ำ (ไว้เก็บตกหลังโควต้ารีเซ็ต)
const resumePath = getArg('--resume')
const prevResults = resumePath && existsSync(resumePath)
  ? JSON.parse(readFileSync(resumePath, 'utf8')).results
  : null
if (resumePath && !prevResults) { console.error(`ไม่พบไฟล์ resume: ${resumePath}`); process.exit(1) }

// หมายเหตุ: ไม่รับ .avif — sharp (libheif ที่ bundle มา) ถอดบาง bitstream ไม่ได้ → จะพังทุกค่ายอย่างไม่แฟร์
const IMG_RE = /\.(jpe?g|png|webp|heic|heif)$/i
const mimeOf = (f) => { const e = extname(f).toLowerCase(); return e === '.png' ? 'image/png' : e === '.webp' ? 'image/webp' : (e === '.heic' || e === '.heif') ? 'image/heic' : 'image/jpeg' }

// ── โหลดรูป + เฉลยรายหมวด ──
const cats = CATS.filter((c) => (catsArg.length ? catsArg.includes(c.id) : true)).map((c) => {
  const dir = join(DATASET, c.id)
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => IMG_RE.test(f)).sort().slice(0, limit) : []
  const labelsPath = join(DATASET, `labels.${c.id}.json`)
  const labels = existsSync(labelsPath) ? JSON.parse(readFileSync(labelsPath, 'utf8')) : {}
  return { ...c, dir, files, labels, nLabeled: files.filter((f) => labels[f]).length }
})
if (!cats.some((c) => c.files.length)) { console.error('ไม่มีรูปเลย — วางรูปใน bench/dataset/{receipts,slips,products,notes}/'); process.exit(1) }

// ── providers ──
const active = PROVIDERS.filter((p) => (only.length ? only.includes(p.id) : true) && p.enabled())
const skipped = PROVIDERS.filter((p) => !active.includes(p))
console.log(`\n📁 ${cats.map((c) => `${c.id} ${c.files.length} (เฉลย ${c.nLabeled})`).join(' · ')}`)
console.log(`✅ รัน ${active.length} ค่าย: ${active.map((p) => p.id).join(', ') || '(ไม่มี)'}`)
if (skipped.length) console.log(`⏭️  ข้าม: ${skipped.map((p) => p.id).join(', ')}`)
if (!active.length) { console.error('ไม่มีค่ายให้รัน — ใส่ key ใน backend/.env'); process.exit(1) }
console.log(`⚠️  ค่าย OCR (${PROVIDERS.filter((p) => p.type === 'ocr').map((p) => p.id).join(', ')}) ข้ามหมวด products อัตโนมัติ (ระบุสินค้าจากภาพต้องใช้ vision)\n`)

// ── เตรียมรูป (บีบครั้งเดียว ใช้ร่วมทุกค่าย) ──
const prepped = new Map() // key `${cat}/${file}` → {buffer, mimetype}
for (const c of cats) {
  for (const f of c.files) {
    const raw = readFileSync(join(c.dir, f))
    prepped.set(`${c.id}/${f}`, await compressImage(raw, mimeOf(f), OCR_PRESET))
  }
}

// ── รันขนานต่อค่าย ──
// results[provider][cat][file] = { canon, latencyMs, error, raw }
const results = Object.fromEntries(active.map((p) => [p.id, Object.fromEntries(cats.map((c) => [c.id, {}]))]))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let doneCalls = 0
const totalCalls = active.reduce((a, p) => a + cats.reduce((b, c) => b + (p.type === 'ocr' && !TASKS[c.task].ocrHybrid ? 0 : c.files.length), 0), 0)

// 429 ชั่วคราว (ต่อนาที เช่น Groq TPM / Gemini RPM) → รอแล้วลองใหม่ | เพดานวัน/เดือน → ไม่ต้องลอง เปลืองเวลา
// หมายเหตุ: ห้าม exclude คำว่า 'quota' เฉย ๆ — ข้อความ 429 ต่อนาทีของ Gemini ก็มีคำว่า quota
const isRetriable429 = (msg) =>
  /429|rate limit|too many/i.test(msg) && !/per.?day|monthly|depleted/i.test(msg)
const retryWaitMs = (msg, attempt) => {
  const m = msg.match(/try again in (\d+(?:\.\d+)?)\s*(m?s)/i) // groq บอกมาเลยว่ารอกี่วินาที
  if (m) return Math.min(Math.ceil(parseFloat(m[1]) * (m[2].toLowerCase() === 'ms' ? 1 : 1000)) + 500, 60000)
  return 15000 * attempt
}

await Promise.all(active.map(async (p) => {
  const pace = PACE[p.id] ?? PACE.default
  for (const c of cats) {
    if (p.type === 'ocr' && !TASKS[c.task].ocrHybrid) continue // OCR ทำงานหมวดสินค้าไม่ได้
    const canon = TASKS[c.task].canon
    for (const f of c.files) {
      // resume: เคยผ่านแล้ว → ใช้ผลเดิม ไม่ยิงซ้ำ
      const prev = prevResults?.[p.id]?.[c.id]?.[f]
      if (prev && !prev.error) {
        results[p.id][c.id][f] = prev
        doneCalls++
        continue
      }
      const { buffer, mimetype } = prepped.get(`${c.id}/${f}`)
      const t0 = Date.now()
      for (let attempt = 0; ; attempt++) {
        try {
          const raw = await p.run(buffer, mimetype, c.task)
          results[p.id][c.id][f] = { canon: canon(raw), latencyMs: Date.now() - t0, raw }
          break
        } catch (e) {
          const msg = e.message || ''
          if (attempt < 3 && isRetriable429(msg)) { await sleep(retryWaitMs(msg, attempt + 1)); continue }
          results[p.id][c.id][f] = { error: msg, latencyMs: Date.now() - t0 }
          break
        }
      }
      doneCalls++
      if (doneCalls % 25 === 0 || doneCalls === totalCalls) process.stdout.write(`\r⏳ ${doneCalls}/${totalCalls} calls`)
      const spent = Date.now() - t0
      if (spent < pace) await sleep(pace - spent)
    }
  }
}))
console.log('\n')

// ── สรุปคะแนน ──
// document: คะแนนรายฟิลด์ + overall ถ่วงน้ำหนัก | product: name/category/price | note: items/amount/desc/type
function summarizeDocument(cat, perFile) {
  const { files, labels } = cat
  const field = {}
  for (const fld of SCORE_FIELDS) {
    const scores = files.flatMap((f) => {
      const truth = labels[f]?.[fld]
      if (truth == null || truth === '') return []
      return [scoreField(fld, perFile[f]?.canon?.[fld], truth) ?? 0]
    })
    field[fld] = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  }
  const perImg = files.flatMap((f) => {
    if (!labels[f]) return []
    let w = 0, s = 0
    for (const fld of SCORE_FIELDS) {
      const truth = labels[f][fld]
      if (truth == null || truth === '') continue
      w += WEIGHTS[fld]; s += WEIGHTS[fld] * (scoreField(fld, perFile[f]?.canon?.[fld], truth) ?? 0)
    }
    return w > 0 ? [s / w] : []
  })
  return { field, overall: avg(perImg) }
}

function summarizeProduct(cat, perFile) {
  const { files, labels } = cat
  const field = {}
  for (const fld of PRODUCT_FIELDS) {
    const scores = files.flatMap((f) => {
      if (!labels[f]) return []
      const s = scoreProduct(fld, perFile[f]?.canon?.[fld], labels[f][fld])
      return s == null ? [] : [s]
    })
    field[fld] = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  }
  const perImg = files.flatMap((f) => {
    if (!labels[f]) return []
    let w = 0, s = 0
    for (const fld of PRODUCT_FIELDS) {
      const sc = scoreProduct(fld, perFile[f]?.canon?.[fld], labels[f][fld])
      if (sc == null) continue
      w += PRODUCT_WEIGHTS[fld]; s += PRODUCT_WEIGHTS[fld] * sc
    }
    return w > 0 ? [s / w] : []
  })
  return { field, overall: avg(perImg) }
}

function summarizeNote(cat, perFile) {
  const { files, labels } = cat
  const per = files.flatMap((f) => {
    if (!labels[f]?.items?.length) return []
    const s = scoreNote(perFile[f]?.canon, canonNote(labels[f]))
    return s == null ? [] : [s]
  })
  const mean = (k) => avg(per.map((s) => s[k]))
  return {
    field: { countAcc: mean('countAcc'), amount: mean('amount'), description: mean('description'), type: mean('type') },
    overall: mean('overall'),
  }
}

const SUMMARIZERS = { document: summarizeDocument, product: summarizeProduct, note: summarizeNote }

// summaries[cat.id] = [{id,label,type,done,errors,avgMs,field,overall}] เรียงตาม overall
const summaries = {}
for (const c of cats) {
  const rows = active
    .filter((p) => !(p.type === 'ocr' && !TASKS[c.task].ocrHybrid))
    .map((p) => {
      const perFile = results[p.id][c.id]
      const done = c.files.filter((f) => perFile[f] && !perFile[f].error)
      const lats = c.files.map((f) => perFile[f]?.latencyMs).filter((x) => x != null)
      return {
        id: p.id, label: p.label, type: p.type,
        done: done.length, errors: c.files.length - done.length,
        avgMs: lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : null,
        ...SUMMARIZERS[c.task](c, perFile),
      }
    })
  rows.sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1))
  summaries[c.id] = rows
}

// ── ตาราง console ──
const COLS = {
  document: [['amount', 'amount'], ['referenceNo', 'ref'], ['bankName', 'bank'], ['transactionDate', 'date'], ['__name', 'name']],
  product: [['name', 'name'], ['category', 'categ'], ['unitPrice', 'price']],
  note: [['countAcc', 'items'], ['amount', 'amount'], ['description', 'desc'], ['type', 'type']],
}
for (const c of cats) {
  const cols = COLS[c.task]
  console.log(`══════ ${c.label} (${c.id}) — ${c.files.length} รูป, เฉลย ${c.nLabeled} ══════`)
  const header = [pad('ค่าย', 22), pad('ok', 7), ...cols.map(([, h]) => pad(h, 7)), pad('overall', 8), pad('ms', 7)].join('')
  console.log(header); console.log('─'.repeat(header.length))
  for (const s of summaries[c.id]) {
    const vals = cols.map(([k]) => pct(k === '__name' ? avg([s.field.senderName, s.field.receiverName]) : s.field[k]))
    console.log([pad(s.label, 22), pad(`${s.done}/${c.files.length}`, 7), ...vals.map((v) => pad(v, 7)), pad(s.overall == null ? '-' : pct(s.overall), 8), pad(s.avgMs ?? '-', 7)].join(''))
  }
  console.log('')
}

// ── ตารางรวมท้าย: provider × หมวด (overall) ──
console.log(`══════ ภาพรวมทุกฟังก์ชัน (overall ต่อหมวด) ══════`)
const ovHeader = [pad('ค่าย', 22), ...cats.map((c) => pad(c.id, 10)), pad('เฉลี่ย', 8), pad('$/1000', 16)].join('')
console.log(ovHeader); console.log('─'.repeat(ovHeader.length))
const ovRows = active.map((p) => {
  const per = cats.map((c) => summaries[c.id].find((s) => s.id === p.id)?.overall ?? null)
  return { p, per, mean: avg(per.filter((x) => x != null)) }
}).sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1))
for (const { p, per, mean } of ovRows) {
  console.log([pad(p.label, 22), ...per.map((v) => pad(v == null ? '-' : pct(v), 10)), pad(mean == null ? '-' : pct(mean), 8), pad(PRICING[p.id]?.per1000 || '-', 16)].join(''))
}

// ── เขียนไฟล์ ──
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(join(OUT_DIR, 'raw.json'), JSON.stringify({
  cats: cats.map(({ id, task, files, labels }) => ({ id, task, files, labels })), results,
}, null, 2))
writeFileSync(join(OUT_DIR, 'summary.csv'), toCsv())
writeFileSync(join(OUT_DIR, 'report.html'), toHtml())
console.log(`\n💾 ผลลัพธ์: bench/out/summary.csv · report.html · raw.json\n`)

// ── helpers ──
function avg(arr) { const v = arr.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
function pad(s, w) { s = String(s); return s.length >= w ? s.slice(0, w - 1) + ' ' : s + ' '.repeat(w - s.length) }

function toCsv() {
  const lines = [['category', 'provider', 'type', 'ok', 'field', 'score'].join(',')]
  for (const c of cats) {
    for (const s of summaries[c.id]) {
      for (const [k, label] of COLS[c.task]) {
        const v = k === '__name' ? avg([s.field.senderName, s.field.receiverName]) : s.field[k]
        lines.push([c.id, `"${s.label}"`, s.type, `${s.done}/${c.files.length}`, label, v == null ? '' : pct(v)].join(','))
      }
      lines.push([c.id, `"${s.label}"`, s.type, `${s.done}/${c.files.length}`, 'overall', s.overall == null ? '' : pct(s.overall)].join(','))
      lines.push([c.id, `"${s.label}"`, s.type, `${s.done}/${c.files.length}`, 'avg_ms', s.avgMs ?? ''].join(','))
    }
  }
  return lines.join('\n')
}

function toHtml() {
  const table = (c) => {
    const cols = COLS[c.task]
    const rows = summaries[c.id].map((s) => `<tr><td class="l">${s.label}</td><td>${s.done}/${c.files.length}${s.errors ? ` <span class="e">(${s.errors} err)</span>` : ''}</td>
      ${cols.map(([k]) => `<td>${pct(k === '__name' ? avg([s.field.senderName, s.field.receiverName]) : s.field[k])}</td>`).join('')}
      <td class="b">${s.overall == null ? '-' : pct(s.overall)}</td><td>${s.avgMs ?? '-'}</td></tr>`).join('')
    return `<h2>${c.label} (${c.id}) — ${c.files.length} รูป, เฉลย ${c.nLabeled}</h2>
<table><tr><th>ค่าย</th><th>ok</th>${cols.map(([, h]) => `<th>${h}</th>`).join('')}<th>overall</th><th>ms</th></tr>${rows}</table>`
  }
  const matrix = `<h2>ภาพรวมทุกฟังก์ชัน</h2><table><tr><th>ค่าย</th>${cats.map((c) => `<th>${c.id}</th>`).join('')}<th>เฉลี่ย</th><th>$/1000</th><th>free tier</th></tr>
    ${ovRows.map(({ p, per, mean }) => `<tr><td class="l">${p.label}</td>${per.map((v) => `<td>${v == null ? '-' : pct(v)}</td>`).join('')}
      <td class="b">${mean == null ? '-' : pct(mean)}</td><td class="l">${PRICING[p.id]?.per1000 || '-'}</td><td class="l sm">${PRICING[p.id]?.free || '-'}</td></tr>`).join('')}</table>`
  return `<!doctype html><meta charset="utf-8"><title>Slip-BUU OCR Benchmark — 4 ฟังก์ชัน</title>
<style>body{font:14px system-ui,sans-serif;margin:24px;color:#111}h1{font-size:20px}h2{font-size:16px;margin-top:28px}
table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:center}
th{background:#f4f4f5}td.l{text-align:left}td.b{font-weight:700;background:#f0fdf4}td.sm{font-size:12px;color:#555}.e{color:#b91c1c;font-size:12px}</style>
<h1>Slip-BUU OCR Benchmark — เทียบ ${active.length} ค่าย × 4 ฟังก์ชัน</h1>
${matrix}${cats.map(table).join('')}`
}
