import express from 'express'
import multer from 'multer'
import { ocrSlip } from '../services/gemini.js'
import { compressImage } from '../services/image.js'
import { hashBuffer, checkByHash, checkByRefNo } from '../services/duplicate.js'
import { supabase } from '../services/supabase.js'
import { upsertUser } from '../services/users.js'
import { rateLimitByUser } from '../services/rateLimit.js'

const router = express.Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})

/**
 * ประมวลผลสลิป 1 ไฟล์: ตรวจซ้ำ → OCR → กรอง → อัพโหลด → บันทึก
 * คืนค่า object สำหรับตอบกลับ client (มี status + data)
 */
async function processSlip(file, lineUserId) {
  // 1. ตรวจซ้ำด้วย image hash ของไฟล์ต้นฉบับ (จับการอัปโหลดรูปเดิมซ้ำได้แม่นสุด)
  const imageHash = hashBuffer(file.buffer)
  if (await checkByHash(imageHash)) {
    return { status: 'duplicate', message: 'สลิปนี้เคยส่งมาแล้ว' }
  }

  // 2. บีบอัด + หมุนรูปตาม EXIF (ไฟล์เล็กลง, OCR แม่นขึ้น) ใช้ buffer นี้ทั้ง OCR และ Storage
  const { buffer: imageBuffer, mimetype } = await compressImage(file.buffer, file.mimetype)

  // 3. OCR ด้วย Gemini — ถ้า fail ทั้งหมดให้แจ้ง error ไม่บันทึก record เปล่า
  let ocr
  try {
    ocr = await ocrSlip(imageBuffer, mimetype)
  } catch (err) {
    console.error('OCR error:', err.message)
    return { status: 'error', message: 'อ่านสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }
  }

  // 3. กรองรูปที่ไม่ใช่สลิป (ไม่ใช่สลิป และอ่านยอดเงินไม่ได้)
  if (!ocr.isSlip && ocr.amount == null) {
    return { status: 'error', message: 'ไม่พบข้อมูลสลิปในรูปนี้ กรุณาถ่ายใหม่ให้ชัดเจน' }
  }

  // 4. ตรวจซ้ำด้วยเลขอ้างอิง
  if (ocr.referenceNo && (await checkByRefNo(ocr.referenceNo))) {
    return { status: 'duplicate', message: 'สลิปนี้เคยส่งมาแล้ว (เลขอ้างอิงซ้ำ)' }
  }

  // 5. อัพโหลดรูป (ที่บีบอัดแล้ว) ไป Supabase Storage
  const filename = `${lineUserId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  let imageUrl = null
  const { data: uploaded, error: uploadErr } = await supabase.storage
    .from('slips')
    .upload(filename, imageBuffer, { contentType: mimetype })
  if (uploaded && !uploadErr) {
    imageUrl = supabase.storage.from('slips').getPublicUrl(filename).data.publicUrl
  } else if (uploadErr) {
    console.error('Storage upload error:', uploadErr.message)
  }

  // 6. บันทึกลงฐานข้อมูล
  const baseRow = {
    line_user_id: lineUserId,
    amount: ocr.amount,
    sender_name: ocr.senderName,
    receiver_name: ocr.receiverName,
    bank_name: ocr.bankName,
    reference_no: ocr.referenceNo,
    transaction_at: ocr.transactionAt,
    image_url: imageUrl,
    image_hash: imageHash,
    ocr_raw: ocr.raw,
    status: 'success',
  }
  // คอลัมน์ใหม่ — เก็บแยกเพื่อ query ตรงๆ ได้ (ถ้า DB ยังไม่ migrate จะ fallback อัตโนมัติ)
  const fullRow = {
    ...baseRow,
    fee: ocr.fee,
    sender_account: ocr.senderAccount,
    receiver_account: ocr.receiverAccount,
  }

  let { error: dbErr } = await supabase.from('slips').insert(fullRow)
  if (dbErr && /column|could not find|schema cache/i.test(dbErr.message)) {
    // คอลัมน์ใหม่ยังไม่ถูกเพิ่มในฐานข้อมูล — บันทึกแบบเดิม (ข้อมูลยังอยู่ครบใน ocr_raw)
    console.warn('New columns missing, falling back. Run migration:', dbErr.message)
    ;({ error: dbErr } = await supabase.from('slips').insert(baseRow))
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
      senderName: ocr.senderName,
      receiverName: ocr.receiverName,
      bank: ocr.bankName,
      referenceNo: ocr.referenceNo,
      transactionAt: ocr.transactionAt,
      fee: ocr.fee,
    },
  }
}

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
    const { data, error } = await supabase
      .from('slips')
      .update(update)
      .eq('id', id)
      .eq('line_user_id', lineUserId)
      .select('id, amount, sender_name, receiver_name, bank_name, reference_no, transaction_at, image_url, created_at, note, category, type')
      .maybeSingle()

    if (error) {
      console.error('Slip update error:', error.message)
      return res.status(500).json({ status: 'error', message: 'แก้ไขข้อมูลไม่สำเร็จ' })
    }
    if (!data) {
      return res.status(404).json({ status: 'error', message: 'ไม่พบสลิป หรือไม่มีสิทธิ์แก้ไข' })
    }

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

    const { data, error } = await supabase
      .from('slips')
      .delete()
      .eq('id', id)
      .eq('line_user_id', lineUserId)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('Slip delete error:', error.message)
      return res.status(500).json({ status: 'error', message: 'ลบรายการไม่สำเร็จ' })
    }
    if (!data) {
      return res.status(404).json({ status: 'error', message: 'ไม่พบรายการ หรือไม่มีสิทธิ์ลบ' })
    }

    res.json({ status: 'success', message: 'ลบรายการสำเร็จ' })
  } catch (err) {
    console.error('Delete slip error:', err)
    res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
  }
})

// ───────────────────── สร้างรายการเอง (ไม่มีสลิป) ─────────────────────
// POST /api/slip/manual — บันทึกธุรกรรมที่ผู้ใช้กรอกเอง (รายรับ/รายจ่าย) สำหรับรายการที่ไม่มีสลิป
router.post('/manual', rateLimitByUser, async (req, res) => {
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

    const { data, error } = await supabase
      .from('slips')
      .insert(row)
      .select('id, amount, type, sender_name, receiver_name, bank_name, note, category, reference_no, transaction_at, image_url, created_at')
      .single()

    if (error) {
      if (/column|could not find|schema cache/i.test(error.message)) {
        // คอลัมน์ใหม่ (type/source/note/category) ยังไม่ถูกเพิ่ม — ต้องรัน migration 003 ก่อน
        console.error('Manual insert: missing columns — run migration 003:', error.message)
        return res.status(500).json({ status: 'error', message: 'ระบบยังไม่พร้อมรองรับรายการนี้ (ต้องอัปเดตฐานข้อมูล)' })
      }
      console.error('Manual insert error:', error.message)
      return res.status(500).json({ status: 'error', message: 'บันทึกรายการไม่สำเร็จ' })
    }

    res.json({ status: 'success', message: 'บันทึกรายการสำเร็จ', data })
  } catch (err) {
    console.error('Manual slip error:', err)
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

  // ต้องมี user ก่อน insert slip (กัน FK violation) + เก็บโปรไฟล์ล่าสุด
  await upsertUser(req.lineUser)

  const results = []
  for (const file of files) {
    try {
      results.push(await processSlip(file, lineUserId))
    } catch (err) {
      console.error('Batch item error:', err)
      results.push({ status: 'error', message: 'เกิดข้อผิดพลาด' })
    }
  }

  res.json({ results })
})

export default router
