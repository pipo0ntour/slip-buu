import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  toNumber,
  normalizeBank,
  clean,
  buildTransactionAt,
  parseThaiDate,
} from '../src/services/parse.js'

// ปีอ้างอิงคงที่ในเทส — ไม่ให้ผลเทสเปลี่ยนตามปีที่รัน
const NOW_YEAR = 2026

test('toNumber: แปลงเลขมีลูกน้ำ/หน่วยเป็นตัวเลขล้วน', () => {
  assert.equal(toNumber('1,500.00'), 1500)
  assert.equal(toNumber('1,234,567.89 บาท'), 1234567.89)
  assert.equal(toNumber(250), 250)
  assert.equal(toNumber(null), null)
  assert.equal(toNumber('ไม่ใช่ตัวเลข'), null)
  assert.equal(toNumber(NaN), null)
})

test('normalizeBank: จับชื่อธนาคารหลายรูปแบบเป็นชื่อย่อมาตรฐานเดียว', () => {
  assert.equal(normalizeBank('KBank'), 'กสิกรไทย')
  assert.equal(normalizeBank('ธนาคารกสิกรไทย'), 'กสิกรไทย')
  assert.equal(normalizeBank('SCB EASY'), 'ไทยพาณิชย์')
  assert.equal(normalizeBank('Krungthai NEXT'), 'กรุงไทย')
  assert.equal(normalizeBank('PromptPay'), 'พร้อมเพย์')
  assert.equal(normalizeBank('ธนาคารอะไรไม่รู้'), 'ธนาคารอะไรไม่รู้') // ไม่รู้จัก = คงเดิม
  assert.equal(normalizeBank(null), null)
})

test('clean: ตัดช่องว่างและถือว่าสตริง "null" คือไม่มีข้อมูล', () => {
  assert.equal(clean('  นาย ก  '), 'นาย ก')
  assert.equal(clean('null'), null)
  assert.equal(clean('NULL'), null)
  assert.equal(clean(''), null)
  assert.equal(clean(null), null)
})

test('buildTransactionAt: วันที่ ค.ศ. + เวลา → ISO โซนไทย (+07:00)', () => {
  assert.equal(buildTransactionAt('2025-06-08', '14:30', NOW_YEAR), '2025-06-08T07:30:00.000Z')
})

test('buildTransactionAt: ปี พ.ศ. ในรูปแบบ YYYY-MM-DD ถูกแปลงเป็น ค.ศ. อัตโนมัติ', () => {
  // Gemini อาจหลุดส่งปี พ.ศ. มาทั้งที่สั่งให้แปลงแล้ว — safety net ต้องลบ 543 ให้
  assert.equal(buildTransactionAt('2568-06-08', '10:00', NOW_YEAR), '2025-06-08T03:00:00.000Z')
})

test('buildTransactionAt: วันที่ภาษาไทยเดือนย่อ + ปี พ.ศ. เต็ม', () => {
  assert.equal(buildTransactionAt('8 มิ.ย. 2568', '09:15', NOW_YEAR), '2025-06-08T02:15:00.000Z')
})

test('buildTransactionAt: ปีย่อ 2 หลักบนสลิปไทย = พ.ศ. 25xx (เช่น "68" → 2568 → ค.ศ. 2025)', () => {
  // เคยมีบั๊ก: ปี > 50 ถูกบวก 2400 กลายเป็น พ.ศ. 2468 (ค.ศ. 1925)
  assert.equal(buildTransactionAt('8 มิ.ย. 68', '09:15', NOW_YEAR), '2025-06-08T02:15:00.000Z')
  assert.equal(buildTransactionAt('31 ธ.ค. 69', '23:59', NOW_YEAR), '2026-12-31T16:59:00.000Z')
})

test('buildTransactionAt: ไม่มีเวลา → เที่ยงคืนเวลาไทย', () => {
  assert.equal(buildTransactionAt('2025-06-08', null, NOW_YEAR), '2025-06-07T17:00:00.000Z')
})

test('buildTransactionAt: ข้อมูลไม่ครบ/อ่านไม่ออก → null (ไม่เดา)', () => {
  assert.equal(buildTransactionAt(null, '10:00', NOW_YEAR), null)
  assert.equal(buildTransactionAt('', '10:00', NOW_YEAR), null)
  assert.equal(buildTransactionAt('ไม่ใช่วันที่', '10:00', NOW_YEAR), null)
  assert.equal(buildTransactionAt('2025-13-45', '10:00', NOW_YEAR), null) // เดือน/วันเกินจริง
})

test('buildTransactionAt: ปีผิดรูป (3 หลัก/นอกช่วงสมเหตุสมผล) → null (ใช้ fallback แทน)', () => {
  assert.equal(buildTransactionAt('8 มิ.ย. 568', '10:00', NOW_YEAR), null) // ปี 3 หลักจาก OCR เพี้ยน
  assert.equal(buildTransactionAt('0568-06-08', '10:00', NOW_YEAR), null) // YYYY-MM-DD แต่ปีหลุดช่วง
})

test('parseThaiDate: เดือนเต็มและเดือนย่อ', () => {
  assert.deepEqual(parseThaiDate('8 มิถุนายน 2568'), { y: 2568, mo: 6, d: 8 })
  assert.deepEqual(parseThaiDate('15 ม.ค. 2569'), { y: 2569, mo: 1, d: 15 })
  assert.equal(parseThaiDate('วันที่ไม่รู้เรื่อง'), null)
})
