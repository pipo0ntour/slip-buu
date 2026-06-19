import express from 'express'
import multer from 'multer'
import { ocrSlip, ocrNote } from '../services/gemini.js'
import { compressImage, OCR_PRESET, STORAGE_PRESET } from '../services/image.js'
import { hashBuffer, checkByHash, checkByRefNo } from '../services/duplicate.js'
import { supabase } from '../services/supabase.js'
import { attachSignedImageUrls, storagePathOf } from '../services/storage.js'
import { upsertUser } from '../services/users.js'
import { rateLimitByUser } from '../services/rateLimit.js'

const router = express.Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})

// ข้อความบอกว่าซ้ำกับรายการไหน — ร้านค้าจะได้เช็คย้อนได้ว่าบันทึกไปเมื่อไหร่ ยอดเท่าไร
function describeDuplicate(row, reason = '') {
  const parts = []
  if (row?.created_at) {
    const when = new Date(row.created_at).toLocaleDateString('th-TH', {
      timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit',
    })
    parts.push(`เคยบันทึกเมื่อ ${when}`)
  }
  if (row?.amount != null) parts.push(`ยอด ${Number(row.amount).toLocaleString('th-TH')} บาท`)
  const detail = parts.length ? ` (${parts.join(' · ')})` : ''
  return `สลิปซ้ำ${reason}${detail}`
}

/**
 * ประมวลผลสลิป 1 ไฟล์: ตรวจซ้ำ → OCR → กรอง → อัพโหลด → บันทึก
 * คืนค่า object สำหรับตอบกลับ client (มี status + data)
 * @param {'income'|'expense'} type ทิศทางเงินของสลิปชุดนี้ (ผู้ใช้เลือกตอนอัปโหลด)
 */
async function processSlip(file, lineUserId, type = 'income') {
  // 1. ตรวจซ้ำด้วย image hash ของไฟล์ต้นฉบับ (จับการอัปโหลดรูปเดิมซ้ำได้แม่นสุด)
  const imageHash = hashBuffer(file.buffer)
  const dupByHash = await checkByHash(imageHash, lineUserId)
  if (dupByHash) {
    return { status: 'duplicate', message: describeDuplicate(dupByHash) }
  }

  // 2. บีบอัด + หมุนรูปตาม EXIF แยก 2 เวอร์ชัน (ทำพร้อมกัน):
  //    - ocrBuffer: คมชัด สำหรับให้ OCR อ่านชื่อแม่นขึ้น (ไม่เก็บ)
  //    - imageBuffer: เล็ก สำหรับเก็บลง Storage เป็นหลักฐาน
  const [{ buffer: ocrBuffer }, { buffer: imageBuffer, mimetype }] = await Promise.all([
    compressImage(file.buffer, file.mimetype, OCR_PRESET),
    compressImage(file.buffer, file.mimetype, STORAGE_PRESET),
  ])

  // 3. OCR ด้วย Gemini — ถ้า fail ทั้งหมดให้แจ้ง error ไม่บันทึก record เปล่า
  let ocr
  try {
    ocr = await ocrSlip(ocrBuffer, mimetype)
  } catch (err) {
    console.error('OCR error:', err.message)
    // แยกเคสโควต้า Gemini เต็ม (429/quota) ออกจากอ่านไม่ออกจริง — ให้ผู้ใช้รู้ว่าควรรอ ไม่ใช่ถ่ายใหม่
    const quota = /429|quota|too many requests/i.test(err.message || '')
    return {
      status: 'error',
      message: quota
        ? 'คิวอ่านสลิปเต็มชั่วคราว กรุณารอสักครู่แล้วส่งใบนี้ใหม่'
        : 'อ่านสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
    }
  }

  // 3. กรองรูปที่ไม่ใช่สลิป (ไม่ใช่สลิป และอ่านยอดเงินไม่ได้)
  if (!ocr.isSlip && ocr.amount == null) {
    return { status: 'error', message: 'ไม่พบข้อมูลสลิปในรูปนี้ กรุณาถ่ายใหม่ให้ชัดเจน' }
  }

  // 4. ตรวจซ้ำด้วยเลขอ้างอิง
  if (ocr.referenceNo) {
    const dupByRef = await checkByRefNo(ocr.referenceNo, lineUserId)
    if (dupByRef) {
      return { status: 'duplicate', message: describeDuplicate(dupByRef, ' — เลขอ้างอิงตรงกัน') }
    }
  }

  // 5. อัพโหลดรูป (ที่บีบอัดแล้ว) ไป Supabase Storage — บักเก็ตเป็น private
  //    เก็บเฉพาะ path ใน DB แล้วออก signed URL ตอนอ่าน (กันคนนอกเปิดดูรูปด้วยลิงก์เปล่า ๆ)
  const filename = `${lineUserId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  let imagePath = null
  const { data: uploaded, error: uploadErr } = await supabase.storage
    .from('slips')
    .upload(filename, imageBuffer, { contentType: mimetype })
  if (uploaded && !uploadErr) {
    imagePath = filename
  } else if (uploadErr) {
    console.error('Storage upload error:', uploadErr.message)
  }

  // 6. บันทึกลงฐานข้อมูล — ลองจากชุดคอลัมน์ครบสุดก่อน แล้วถอยทีละขั้นถ้า DB ยังไม่ migrate
  const baseRow = {
    line_user_id: lineUserId,
    amount: ocr.amount,
    sender_name: ocr.senderName,
    receiver_name: ocr.receiverName,
    bank_name: ocr.bankName,
    reference_no: ocr.referenceNo,
    transaction_at: ocr.transactionAt,
    image_hash: imageHash,
    ocr_raw: ocr.raw,
    status: 'success',
  }
  const extraCols = { fee: ocr.fee, sender_account: ocr.senderAccount, receiver_account: ocr.receiverAccount }
  const legacyImageUrl = imagePath
    ? supabase.storage.from('slips').getPublicUrl(imagePath).data.publicUrl
    : null

  const attempts = [
    // DB ปัจจุบัน (migration 004): เก็บ path สำหรับออก signed URL
    { ...baseRow, ...extraCols, type, image_path: imagePath },
    // DB ที่มีถึง 003 (ยังไม่มี image_path): ต้องไม่ทำ type หาย — เก็บ public URL แบบเดิมไปก่อน
    { ...baseRow, ...extraCols, type, image_url: legacyImageUrl },
    // DB เก่าสุด: คอลัมน์พื้นฐานเท่านั้น (ข้อมูลเต็มยังอยู่ใน ocr_raw)
    { ...baseRow, image_url: legacyImageUrl },
  ]

  let dbErr = null
  for (const row of attempts) {
    ;({ error: dbErr } = await supabase.from('slips').insert(row))
    if (!dbErr || !/column|could not find|schema cache/i.test(dbErr.message)) break
    console.warn('Insert fallback (DB ยังไม่ migrate ครบ — รัน migration ล่าสุดด้วย):', dbErr.message)
  }

  if (dbErr) {
    console.error('DB insert error:', dbErr.message)
    return { status: 'error', message: 'บันทึกข้อมูลไม่สำเร็จ' }
  }

  return {
    status: 'success',
    message: 'บันทึกสลิปสำเร็จ',
    data: {
      amount: ocr.amount,
      type,
      senderName: ocr.senderName,
      receiverName: ocr.receiverName,
      bank: ocr.bankName,
      referenceNo: ocr.referenceNo,
      transactionAt: ocr.transactionAt,
      fee: ocr.fee,
    },
  }
}

// ───────────────────── รูปสลิป (lazy) ─────────────────────
// GET /api/slip/:id/image — ออก signed URL ของรูปเฉพาะตอนเปิดดูทีละใบ
// (หน้ารายงานไม่ sign ทุกใบล่วงหน้าเพื่อความเร็ว — ดู report.js)
router.get('/:id/image', async (req, res) => {
  try {
    const { id } = req.params
    const lineUserId = req.lineUser.userId

    const doSelect = (cols) =>
      supabase
        .from('slips')
        .select(cols)
        .eq('id', id)
        .eq('line_user_id', lineUserId) // ดูได้เฉพาะรูปของตัวเอง
        .maybeSingle()

    let { data, error } = await doSelect('image_url, image_path')
    if (error && /column|could not find|schema cache/i.test(error.message)) {
      ;({ data, error } = await doSelect('image_url'))
    }
    if (error) {
      console.error('Slip image select error:', error.message)
      return res.status(500).json({ status: 'error', message: 'โหลดรูปไม่สำเร็จ' })
    }
    if (!data) {
      return res.status(404).json({ status: 'error', message: 'ไม่พบสลิป หรือไม่มีสิทธิ์ดู' })
    }

    await attachSignedImageUrls([data]) // แปลง path → signed URL (in place)
    const url = data.image_url || null
    if (!url) return res.status(404).json({ status: 'error', message: 'รายการนี้ไม่มีรูป' })
    res.json({ status: 'success', url })
  } catch (err) {
    console.error('Slip image error:', err)
    res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
  }
})

// ───────────────────── แก้ไขข้อมูลสลิป ─────────────────────
// PATCH /api/slip/:id — แก้ไขข้อมูลที่ OCR อ่านผิด (จำกัดเฉพาะเจ้าของสลิป)
const EDITABLE_FIELDS = [
  'amount',
  'sender_name',
  'receiver_name',
  'bank_name',
  'reference_no',
  'transaction_at',
  'note',
  'category',
  'type',
]

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const lineUserId = req.lineUser.userId
    const fields = req.body || {}

    // รับเฉพาะฟิลด์ที่อนุญาตให้แก้ไข ค่าว่าง = null
    const update = {}
    for (const key of EDITABLE_FIELDS) {
      if (key in fields) {
        const v = fields[key]
        update[key] = v === '' || v == null ? null : v
      }
    }
    if (update.amount != null) {
      const n = Number(update.amount)
      update.amount = Number.isFinite(n) ? n : null
    }
    // type รับเฉพาะ income/expense — ค่าอื่นไม่อัปเดต (กันข้อมูลเพี้ยน)
    if ('type' in update && update.type !== 'income' && update.type !== 'expense') {
      delete update.type
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ status: 'error', message: 'ไม่มีข้อมูลให้แก้ไข' })
    }

    // .eq('line_user_id') ทำให้แก้ได้เฉพาะสลิปของตัวเอง — ของคนอื่นจะไม่ match (data = null)
    const BASE_COLS =
      'id, amount, sender_name, receiver_name, bank_name, reference_no, transaction_at, image_url, created_at, note, category, type'
    const doUpdate = (cols) =>
      supabase
        .from('slips')
        .update(update)
        .eq('id', id)
        .eq('line_user_id', lineUserId)
        .select(cols)
        .maybeSingle()

    let { data, error } = await doUpdate(`${BASE_COLS}, image_path`)
    if (error && /column|could not find|schema cache/i.test(error.message)) {
      // DB ยังไม่ migrate 004 (ไม่มีคอลัมน์ image_path) — เลือกเฉพาะคอลัมน์เดิม
      ;({ data, error } = await doUpdate(BASE_COLS))
    }

    if (error) {
      console.error('Slip update error:', error.message)
      return res.status(500).json({ status: 'error', message: 'แก้ไขข้อมูลไม่สำเร็จ' })
    }
    if (!data) {
      return res.status(404).json({ status: 'error', message: 'ไม่พบสลิป หรือไม่มีสิทธิ์แก้ไข' })
    }

    await attachSignedImageUrls([data]) // บักเก็ต private — แปลงเป็น signed URL ก่อนตอบ
    res.json({ status: 'success', message: 'แก้ไขข้อมูลสำเร็จ', data })
  } catch (err) {
    console.error('Patch slip error:', err)
    res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
  }
})

// ───────────────────── ลบรายการ ─────────────────────
// DELETE /api/slip/:id — ลบได้เฉพาะรายการของตัวเอง (.eq line_user_id กันลบของคนอื่น)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const lineUserId = req.lineUser.userId

    // select รูปกลับมาด้วยเพื่อตามไปลบไฟล์ในบักเก็ต (fallback ถ้า DB ยังไม่มี image_path)
    const doDelete = (cols) =>
      supabase
        .from('slips')
        .delete()
        .eq('id', id)
        .eq('line_user_id', lineUserId)
        .select(cols)
        .maybeSingle()

    let { data, error } = await doDelete('id, image_url, image_path')
    if (error && /column|could not find|schema cache/i.test(error.message)) {
      ;({ data, error } = await doDelete('id, image_url'))
    }

    if (error) {
      console.error('Slip delete error:', error.message)
      return res.status(500).json({ status: 'error', message: 'ลบรายการไม่สำเร็จ' })
    }
    if (!data) {
      return res.status(404).json({ status: 'error', message: 'ไม่พบรายการ หรือไม่มีสิทธิ์ลบ' })
    }

    // ลบไฟล์รูปในบักเก็ตแบบ best-effort — รายการใน DB ลบไปแล้ว ถ้าลบไฟล์พลาดแค่ log ไว้
    const path = storagePathOf(data)
    if (path) {
      supabase.storage
        .from('slips')
        .remove([path])
        .then(({ error: rmErr }) => {
          if (rmErr) console.error('Storage remove error:', rmErr.message)
        })
    }

    res.json({ status: 'success', message: 'ลบรายการสำเร็จ' })
  } catch (err) {
    console.error('Delete slip error:', err)
    res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
  }
})

// ───────────────────── สร้างรายการเอง (ไม่มีสลิป) ─────────────────────
// POST /api/slip/manual — บันทึกธุรกรรมที่ผู้ใช้กรอกเอง (รายรับ/รายจ่าย) สำหรับรายการที่ไม่มีสลิป
// รับรูปแนบ (ไม่บังคับ) ผ่าน field `image` — เช่นถ่ายรูปสินค้าที่ซื้อไว้เป็นหลักฐาน
router.post('/manual', rateLimitByUser, upload.single('image'), async (req, res) => {
  try {
    const lineUserId = req.lineUser.userId
    const b = req.body || {}

    const amount = Number(b.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ status: 'error', message: 'กรุณาระบุจำนวนเงินให้ถูกต้อง' })
    }
    const type = b.type === 'expense' ? 'expense' : 'income'

    // วันที่: ถ้าผู้ใช้ไม่ใส่ (หรือใส่ค่าไม่ถูกต้อง) ใช้เวลาปัจจุบันแทน
    let transactionAt = new Date().toISOString()
    if (b.transaction_at) {
      const d = new Date(b.transaction_at)
      if (!isNaN(d.getTime())) transactionAt = d.toISOString()
    }

    // ต้องมี user ก่อน insert (กัน FK violation) + เก็บโปรไฟล์ล่าสุด
    await upsertUser(req.lineUser)

    // รูปแนบ (ถ้ามี) — บีบอัดแล้วอัปโหลดเข้าบักเก็ตเดียวกับสลิป เก็บแค่ path (บักเก็ต private)
    // ไม่ตรวจซ้ำ/ไม่ OCR เพราะเป็นรูปสินค้า ไม่ใช่สลิปโอนเงิน
    let imagePath = null
    if (req.file) {
      try {
        // รูปสินค้า — ไม่ OCR แค่เก็บเป็นหลักฐาน ใช้ preset เล็กพอ ประหยัดพื้นที่
        const { buffer, mimetype } = await compressImage(req.file.buffer, req.file.mimetype, STORAGE_PRESET)
        const filename = `${lineUserId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
        const { data: up, error: upErr } = await supabase.storage
          .from('slips')
          .upload(filename, buffer, { contentType: mimetype })
        if (up && !upErr) imagePath = filename
        else if (upErr) console.error('Manual image upload error:', upErr.message)
      } catch (err) {
        console.error('Manual image process error:', err.message) // รูปพลาด ไม่ทำให้บันทึกรายการล้ม
      }
    }

    const clean = (v) => {
      const s = (v ?? '').toString().trim()
      return s || null
    }

    const row = {
      line_user_id: lineUserId,
      amount,
      type,
      sender_name: clean(b.sender_name),
      receiver_name: clean(b.receiver_name),
      bank_name: clean(b.bank_name),
      note: clean(b.note),
      category: clean(b.category),
      transaction_at: transactionAt,
      source: 'manual',
      status: 'success',
    }

    const SELECT_COLS =
      'id, amount, type, sender_name, receiver_name, bank_name, note, category, reference_no, transaction_at, image_url, created_at'
    const doInsert = (extra, cols) =>
      supabase.from('slips').insert({ ...row, ...extra }).select(cols).single()

    // ลองแบบมี image_path ก่อน (DB migration 004) แล้วถอยถ้า DB ยังไม่มีคอลัมน์นั้น
    let { data, error } = await doInsert({ image_path: imagePath }, `${SELECT_COLS}, image_path`)
    if (error && /column|could not find|schema cache/i.test(error.message)) {
      ;({ data, error } = await doInsert({}, SELECT_COLS))
    }

    if (error) {
      if (/column|could not find|schema cache/i.test(error.message)) {
        // คอลัมน์ใหม่ (type/source/note/category) ยังไม่ถูกเพิ่ม — ต้องรัน migration 003 ก่อน
        console.error('Manual insert: missing columns — run migration 003:', error.message)
        return res.status(500).json({ status: 'error', message: 'ระบบยังไม่พร้อมรองรับรายการนี้ (ต้องอัปเดตฐานข้อมูล)' })
      }
      console.error('Manual insert error:', error.message)
      return res.status(500).json({ status: 'error', message: 'บันทึกรายการไม่สำเร็จ' })
    }

    await attachSignedImageUrls([data]) // บักเก็ต private — แปลงรูปสินค้าเป็น signed URL ก่อนตอบ
    res.json({ status: 'success', message: 'บันทึกรายการสำเร็จ', data })
  } catch (err) {
    console.error('Manual slip error:', err)
    res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
  }
})

// ───────────────────── อ่านโน้ตลายมือ → รายการ ─────────────────────
// POST /api/slip/note-scan — อ่านโน้ตที่จดเอง แตกเป็นรายการ (ยังไม่บันทึก — ให้ผู้ใช้ทวน/แก้ก่อน)
router.post('/note-scan', rateLimitByUser, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ status: 'error', message: 'ไม่พบรูปโน้ต' })

    // โน้ต — OCR อย่างเดียว ไม่เก็บรูป ใช้ preset คมชัดเพื่อให้อ่านลายมือ/ตัวเลขแม่น
    const { buffer, mimetype } = await compressImage(req.file.buffer, req.file.mimetype, OCR_PRESET)
    let items
    try {
      items = await ocrNote(buffer, mimetype)
    } catch (err) {
      console.error('Note OCR error:', err.message)
      // แยกเคสโควต้าเต็ม (ให้รอ) ออกจากอ่านไม่ออกจริง
      const quota = /429|quota|too many requests/i.test(err.message || '')
      return res.status(quota ? 429 : 502).json({
        status: 'error',
        message: quota ? 'คิวอ่านโน้ตเต็มชั่วคราว กรุณารอสักครู่แล้วลองใหม่' : 'อ่านโน้ตไม่สำเร็จ กรุณาถ่ายใหม่ให้ชัดเจน',
      })
    }

    // อ่านไม่พบรายการ — ตอบ success + items ว่าง ให้ฝั่ง client แจ้งผู้ใช้เพิ่มเอง
    res.json({ status: 'success', items, message: items.length ? undefined : 'อ่านไม่พบรายการเงินในโน้ตนี้' })
  } catch (err) {
    console.error('Note scan error:', err)
    res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
  }
})

// POST /api/slip/note-save — บันทึกรายการที่ผู้ใช้ทวน/แก้จากโน้ตแล้ว (หลายรายการพร้อมกัน)
router.post('/note-save', rateLimitByUser, async (req, res) => {
  try {
    const lineUserId = req.lineUser.userId
    const input = Array.isArray(req.body?.items) ? req.body.items : []

    const clean = (v) => {
      const s = (v ?? '').toString().trim()
      return s || null
    }

    // รายการในโน้ตชุดเดียวกัน ใช้เวลาปัจจุบันเป็นเวลาทำรายการเหมือนกัน
    const now = new Date().toISOString()
    const rows = []
    for (const it of input) {
      const amount = Number(it.amount)
      if (!Number.isFinite(amount) || amount <= 0) continue // ข้ามแถวที่ยอดไม่ถูกต้อง
      rows.push({
        line_user_id: lineUserId,
        amount,
        type: it.type === 'income' ? 'income' : 'expense',
        note: clean(it.description ?? it.note),
        category: clean(it.category),
        transaction_at: now,
        source: 'note',
        status: 'success',
      })
    }
    if (!rows.length) return res.status(400).json({ status: 'error', message: 'ไม่มีรายการให้บันทึก' })

    // ต้องมี user ก่อน insert (กัน FK violation) + เก็บโปรไฟล์ล่าสุด
    await upsertUser(req.lineUser)

    const { data, error } = await supabase
      .from('slips')
      .insert(rows)
      .select('id, amount, type, note, category, transaction_at, created_at')

    if (error) {
      if (/column|could not find|schema cache/i.test(error.message)) {
        console.error('Note save: missing columns — run migration 003:', error.message)
        return res.status(500).json({ status: 'error', message: 'ระบบยังไม่พร้อมรองรับรายการนี้ (ต้องอัปเดตฐานข้อมูล)' })
      }
      console.error('Note save error:', error.message)
      return res.status(500).json({ status: 'error', message: 'บันทึกรายการไม่สำเร็จ' })
    }

    res.json({ status: 'success', message: `บันทึก ${data.length} รายการสำเร็จ`, data })
  } catch (err) {
    console.error('Note save error:', err)
    res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
  }
})

// ───────────────────── Batch upload (สูงสุด 10) ─────────────────────
router.post('/upload-batch', rateLimitByUser, upload.array('images', 10), async (req, res) => {
  const lineUserId = req.lineUser.userId
  const files = req.files
  if (!files?.length) {
    return res.status(400).json({ error: 'ไม่พบไฟล์รูป' })
  }

  // ทิศทางเงินของสลิปชุดนี้ — ผู้ใช้เลือกตอนอัปโหลด (ค่าอื่น/ไม่ส่ง = รายรับ ตามพฤติกรรมเดิม)
  const type = req.body.type === 'expense' ? 'expense' : 'income'

  // ต้องมี user ก่อน insert slip (กัน FK violation) + เก็บโปรไฟล์ล่าสุด
  await upsertUser(req.lineUser)

  const results = []
  for (const file of files) {
    try {
      results.push(await processSlip(file, lineUserId, type))
    } catch (err) {
      console.error('Batch item error:', err)
      results.push({ status: 'error', message: 'เกิดข้อผิดพลาด' })
    }
  }

  res.json({ results })
})

// ───────────────────── Error handler ของ route นี้ ─────────────────────
// แปลง error จาก multer (เช่นไฟล์ใหญ่เกิน) เป็น JSON ข้อความไทย แทน HTML 500 ปริศนา
router.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ status: 'error', message: 'ไฟล์ใหญ่เกิน 10MB กรุณาเลือกรูปที่เล็กกว่านี้' })
  }
  console.error('Slip route error:', err)
  res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
})

export default router
