// ── สร้าง "ร่างเฉลย" อัตโนมัติด้วย Gemini ทั้ง 4 หมวด — แล้วต้องเปิดรูปตรวจแก้ให้ถูกจริงก่อนใช้ ──
// รัน: node bench/predraft.mjs [--cats receipts,slips]  → เขียน dataset/labels.<cat>.draft.json
// ข้ามรูปที่มีเฉลยจริงแล้ว (labels.<cat>.json) — ⚠️ ร่างต้องตรวจกับรูปจริง ไม่งั้นลำเอียงเข้าข้าง Gemini
import 'dotenv/config'
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'
import { compressImage, OCR_PRESET } from '../src/services/image.js'
import { PROVIDERS } from './providers.mjs'
import { TASKS } from './lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATASET = join(HERE, 'dataset')
const CATS = [
  { id: 'receipts', task: 'document' },
  { id: 'slips', task: 'document' },
  { id: 'products', task: 'product' },
  { id: 'notes', task: 'note' },
]

const args = process.argv.slice(2)
const i = args.indexOf('--cats')
const catsArg = (i >= 0 ? args[i + 1] : '').split(',').map((s) => s.trim()).filter(Boolean)

const gemini = PROVIDERS.find((p) => p.id === 'gemini')
if (!gemini.enabled()) { console.error('ต้องมี GEMINI_API_KEY ใน backend/.env ก่อน'); process.exit(1) }

const IMG_RE = /\.(jpe?g|png|webp|heic|heif)$/i
const mimeOf = (f) => { const e = extname(f).toLowerCase(); return e === '.png' ? 'image/png' : e === '.webp' ? 'image/webp' : (e === '.heic' || e === '.heif') ? 'image/heic' : 'image/jpeg' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// โครงร่างว่างต่อ task (เวลา Gemini อ่านพลาด จะได้มีคีย์ครบให้แก้มือ)
const EMPTY = {
  document: { docKind: 'slip', amount: null, senderName: '', receiverName: '', bankName: '', referenceNo: '', transactionDate: '' },
  product: { name: '', category: '', unitPrice: null },
  note: { items: [] },
}

for (const c of CATS) {
  if (catsArg.length && !catsArg.includes(c.id)) continue
  const dir = join(DATASET, c.id)
  if (!existsSync(dir)) continue
  const labelsPath = join(DATASET, `labels.${c.id}.json`)
  const done = existsSync(labelsPath) ? JSON.parse(readFileSync(labelsPath, 'utf8')) : {}
  const files = readdirSync(dir).filter((f) => IMG_RE.test(f) && !done[f]).sort()
  if (!files.length) { console.log(`${c.id}: มีเฉลยครบแล้ว — ข้าม`); continue }

  console.log(`\n═══ ${c.id} — ร่างเฉลย ${files.length} รูป (มีแล้ว ${Object.keys(done).length}) ═══`)
  const canon = TASKS[c.task].canon
  const draft = {}
  for (const f of files) {
    process.stdout.write(`${f} ... `)
    try {
      const { buffer, mimetype } = await compressImage(readFileSync(join(dir, f)), mimeOf(f), OCR_PRESET)
      const raw = await gemini.run(buffer, mimetype, c.task)
      const cf = canon(raw) || {}
      if (c.task === 'document') {
        draft[f] = {
          docKind: cf.docKind ?? (c.id === 'receipts' ? 'receipt' : 'slip'), amount: cf.amount ?? null,
          senderName: cf.senderName ?? '', receiverName: cf.receiverName ?? '',
          bankName: cf.bankName ?? '', referenceNo: cf.referenceNo ?? '', transactionDate: cf.transactionDate ?? '',
        }
      } else if (c.task === 'product') {
        draft[f] = { name: cf.name ?? '', category: cf.category ?? '', unitPrice: cf.unitPrice ?? null }
      } else {
        draft[f] = { items: cf.items ?? [] }
      }
      console.log('ok')
    } catch (e) {
      draft[f] = structuredClone(EMPTY[c.task])
      console.log('พลาด:', e.message.slice(0, 80))
    }
    await sleep(6500) // Gemini free tier ~10 RPM
  }
  const draftPath = join(DATASET, `labels.${c.id}.draft.json`)
  writeFileSync(draftPath, JSON.stringify(draft, null, 2))
  console.log(`💾 ${draftPath}`)
}
console.log('\n👉 ต่อไป: เปิดรูปตรวจร่างทีละใบ แก้ให้ถูก แล้วรวมเข้า labels.<cat>.json')
