import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { compressImage, OCR_PRESET, STORAGE_PRESET } from '../src/services/image.js'

// สร้างรูปทดสอบขนาดที่กำหนด (สีพื้น) ด้วย sharp เอง
async function makeImage(width, height) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 60 } } }).png().toBuffer()
}

test('preset: ค่าคงที่ตรงตามดีไซน์ (OCR คมชัด/ใหญ่กว่า, STORAGE เล็ก/ประหยัด)', () => {
  assert.deepEqual(OCR_PRESET, { maxDim: 2000, quality: 92 })
  assert.deepEqual(STORAGE_PRESET, { maxDim: 1280, quality: 80 })
  assert.ok(OCR_PRESET.maxDim > STORAGE_PRESET.maxDim, 'OCR ต้องคมกว่า storage')
})

test('compressImage: รูปใหญ่ถูกย่อให้ด้านยาวสุด ≤ maxDim + แปลงเป็น JPEG', async () => {
  const big = await makeImage(3000, 2000)
  const { buffer, mimetype } = await compressImage(big, 'image/png', OCR_PRESET)
  assert.equal(mimetype, 'image/jpeg', 'ต้องแปลงเป็น JPEG')
  const meta = await sharp(buffer).metadata()
  assert.equal(meta.format, 'jpeg')
  assert.ok(Math.max(meta.width, meta.height) <= OCR_PRESET.maxDim, `ด้านยาว ${meta.width}x${meta.height} ต้อง ≤ ${OCR_PRESET.maxDim}`)
  assert.equal(meta.width, 2000, '3000x2000 → ย่อตามด้านกว้างเป็น 2000')
  assert.equal(meta.height, 1333, 'รักษาสัดส่วน (2000/3000*2000 ≈ 1333)')
})

test('compressImage: STORAGE preset ย่อเล็กกว่า + ไฟล์เล็กลงจริง', async () => {
  const big = await makeImage(3000, 2000)
  const { buffer } = await compressImage(big, 'image/png', STORAGE_PRESET)
  const meta = await sharp(buffer).metadata()
  assert.ok(Math.max(meta.width, meta.height) <= STORAGE_PRESET.maxDim, `≤ ${STORAGE_PRESET.maxDim}`)
  assert.equal(meta.width, 1280)
  assert.ok(buffer.length < big.length, 'JPEG ที่ย่อแล้วต้องเล็กกว่า PNG ต้นฉบับ')
})

test('compressImage: รูปเล็กกว่า maxDim → ไม่ขยาย (withoutEnlargement)', async () => {
  const small = await makeImage(500, 400)
  const { buffer } = await compressImage(small, 'image/png', STORAGE_PRESET)
  const meta = await sharp(buffer).metadata()
  assert.equal(meta.width, 500, 'ต้องไม่ถูกขยายเกินขนาดเดิม')
  assert.equal(meta.height, 400)
})

test('compressImage: ดีฟอลต์ใช้ STORAGE_PRESET เมื่อไม่ส่ง opts', async () => {
  const big = await makeImage(2000, 2000)
  const { buffer } = await compressImage(big, 'image/png')
  const meta = await sharp(buffer).metadata()
  assert.equal(meta.width, STORAGE_PRESET.maxDim, 'ไม่ส่ง opts → ย่อเป็น 1280 (STORAGE)')
})

test('compressImage: buffer ที่ไม่ใช่รูป → fallback คืน buffer เดิม + mime เดิม (flow ไม่พัง)', async () => {
  const notImage = Buffer.from('this is definitely not an image')
  const { buffer, mimetype } = await compressImage(notImage, 'image/heic', OCR_PRESET)
  assert.equal(buffer, notImage, 'คืน buffer เดิม (อ้างอิงเดียวกัน)')
  assert.equal(mimetype, 'image/heic', 'คืน mime เดิมที่ส่งเข้ามา')
})
