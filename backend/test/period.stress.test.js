import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeRange, computePreviousRange } from '../src/services/period.js'

const DAY = 86_400_000
const pad = (n) => String(n).padStart(2, '0')
const daysInMonth = (y, mo) => new Date(Date.UTC(y, mo + 1, 0)).getUTCDate()
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

// ทุกขอบเขตช่วงเวลาต้องตกที่ "เที่ยงคืนเวลาไทย" = 17:00:00.000Z ของ UTC เสมอ (ไทย = UTC+7, ไม่มี DST)
function assertThaiMidnight(iso, label) {
  assert.ok(iso.endsWith('17:00:00.000Z'), `${label}: ${iso} ต้องลงท้าย 17:00:00.000Z (เที่ยงคืนไทย)`)
}

test('daily: วนทุกวัน 2020–2030 — ช่วง 24 ชม.พอดี, ขอบไทยเที่ยงคืน, ต่อเนื่องกับวันก่อนหน้า', () => {
  let count = 0
  for (let y = 2020; y <= 2030; y++) {
    for (let mo = 0; mo < 12; mo++) {
      for (let d = 1; d <= daysInMonth(y, mo); d++) {
        const dateStr = `${y}-${pad(mo + 1)}-${pad(d)}`
        const r = computeRange('daily', dateStr)
        assert.ok(r.fromIso < r.toIso, `${dateStr}: from < to`)
        assert.equal(new Date(r.toIso) - new Date(r.fromIso), DAY, `${dateStr}: ต้องกว้าง 24 ชม.`)
        assertThaiMidnight(r.fromIso, `${dateStr} from`)
        assertThaiMidnight(r.toIso, `${dateStr} to`)
        // ช่วงก่อนหน้า (เมื่อวาน) ต้องจบตรงกับจุดเริ่มของวันนี้พอดี — ไม่มีรู ไม่ทับ
        const prev = computePreviousRange('daily', dateStr)
        assert.equal(prev.toIso, r.fromIso, `${dateStr}: prev.to ต้องต่อกับ from`)
        assert.equal(new Date(prev.toIso) - new Date(prev.fromIso), DAY, `${dateStr}: prev กว้าง 24 ชม.`)
        count++
      }
    }
  }
  assert.ok(count > 4000, `ทดสอบ ${count} วัน`)
})

test('monthly: ทุกเดือน 2020–2030 — กว้างเท่าจำนวนวันจริงของเดือน + ต่อเนื่องเดือนก่อน', () => {
  for (let y = 2020; y <= 2030; y++) {
    for (let mo = 0; mo < 12; mo++) {
      const expected = daysInMonth(y, mo) * DAY
      const r = computeRange('monthly', `${y}-${pad(mo + 1)}-15`)
      assert.equal(new Date(r.toIso) - new Date(r.fromIso), expected, `${y}-${mo + 1}: กว้าง ${daysInMonth(y, mo)} วัน`)
      assertThaiMidnight(r.fromIso, `${y}-${mo + 1} from`)
      assertThaiMidnight(r.toIso, `${y}-${mo + 1} to`)
      const prev = computePreviousRange('monthly', `${y}-${pad(mo + 1)}-15`)
      assert.equal(prev.toIso, r.fromIso, `${y}-${mo + 1}: prev เดือนต่อกับ from`)
    }
  }
})

test('monthly: วันอ้างอิงต่างกันในเดือนเดียวกัน → ได้ช่วงเดือนเดียวกันเสมอ', () => {
  for (let y = 2020; y <= 2030; y++) {
    for (let mo = 0; mo < 12; mo++) {
      const last = daysInMonth(y, mo)
      const ref = computeRange('monthly', `${y}-${pad(mo + 1)}-01`)
      for (const d of [1, 2, 14, 15, last - 1, last]) {
        const r = computeRange('monthly', `${y}-${pad(mo + 1)}-${pad(d)}`)
        assert.deepEqual(r, ref, `${y}-${mo + 1}-${d}: ต้องได้ช่วงเดือนเดียวกับวันที่ 1`)
      }
    }
  }
})

test('yearly: ปีอธิกสุรทิน = 366 วัน, ปีปกติ = 365 วัน + ต่อเนื่องปีก่อน', () => {
  for (let y = 2000; y <= 2100; y++) {
    const expected = (isLeap(y) ? 366 : 365) * DAY
    const r = computeRange('yearly', `${y}-06-15`)
    assert.equal(new Date(r.toIso) - new Date(r.fromIso), expected, `ปี ${y}: ${isLeap(y) ? 366 : 365} วัน`)
    assertThaiMidnight(r.fromIso, `ปี ${y} from`)
    const prev = computePreviousRange('yearly', `${y}-06-15`)
    assert.equal(prev.toIso, r.fromIso, `ปี ${y}: prev ปีต่อกับ from`)
  }
})

test('กุมภาพันธ์: 2024/2028 = 29 วัน (อธิกสุรทิน), 2023/2025/2100 = 28 วัน', () => {
  const feb = (y) => (new Date(computeRange('monthly', `${y}-02-10`).toIso) - new Date(computeRange('monthly', `${y}-02-10`).fromIso)) / DAY
  assert.equal(feb(2024), 29)
  assert.equal(feb(2028), 29)
  assert.equal(feb(2023), 28)
  assert.equal(feb(2025), 28)
  assert.equal(feb(2100), 28) // หาร 100 ลงตัวแต่ไม่หาร 400 → ไม่ใช่อธิกสุรทิน
  assert.equal(feb(2000), 29) // หาร 400 ลงตัว → อธิกสุรทิน
})

test('ข้ามปี: 31 ธ.ค. daily ขอบบนข้ามไป 1 ม.ค. ปีถัดไป', () => {
  const r = computeRange('daily', '2025-12-31')
  // 2025-12-31 00:00 ไทย = 2025-12-30T17:00Z ; ขอบบน = 2026-01-01 00:00 ไทย = 2025-12-31T17:00Z
  assert.equal(r.fromIso, '2025-12-30T17:00:00.000Z')
  assert.equal(r.toIso, '2025-12-31T17:00:00.000Z')
  const dec = computeRange('monthly', '2025-12-05')
  assert.equal(dec.toIso, '2025-12-31T17:00:00.000Z') // ม.ค. ปีถัดไป
})

test('ไม่ส่งวันอ้างอิง: ใช้ "วันนี้" ตามเวลาไทย (ไม่ใช่ UTC ของ server)', () => {
  // now = 2025-06-07T17:30:00Z = 2025-06-08 00:30 เวลาไทย → anchor ต้องเป็น 8 มิ.ย.
  const justAfterMidnight = new Date('2025-06-07T17:30:00.000Z')
  assert.equal(computeRange('daily', undefined, justAfterMidnight).fromIso, '2025-06-07T17:00:00.000Z')
  // now = 2025-06-07T16:30:00Z = 2025-06-07 23:30 เวลาไทย → anchor ยังเป็น 7 มิ.ย.
  const justBeforeMidnight = new Date('2025-06-07T16:30:00.000Z')
  assert.equal(computeRange('daily', undefined, justBeforeMidnight).fromIso, '2025-06-06T17:00:00.000Z')
})

test('วันอ้างอิงที่ไม่ match รูปแบบ YYYY-MM-DD → fallback ใช้วันนี้ (ไม่พัง/ไม่ NaN)', () => {
  const now = new Date('2025-06-07T17:30:00.000Z')
  // เฉพาะสตริงที่ "ไม่เข้า" regex เท่านั้นที่ fallback (null/undefined ก็ไม่ใช่ string → fallback)
  for (const bad of ['', 'ไม่ใช่วันที่', '2025/06/08', '25-6-8', null, undefined, '2025-06', 'abcd-ef-gh']) {
    const r = computeRange('daily', bad, now)
    assert.ok(!Number.isNaN(new Date(r.fromIso).getTime()), `bad=${JSON.stringify(bad)}: from ต้องไม่ NaN`)
    assert.equal(r.fromIso, '2025-06-07T17:00:00.000Z', `bad=${JSON.stringify(bad)}: ใช้วันนี้แทน`)
  }
})

// เคย FINDING: regex \d{2} รับ '2025-13-40' (เดือน 13/วัน 40) แล้ว overflow เงียบ ๆ → แก้แล้วด้วย round-trip validation
// ตอนนี้วันที่ match regex แต่นอกช่วง (เดือน>12, วันเกินจำนวนวันจริงของเดือน) ต้อง fallback เป็น "วันนี้"
test('วันที่ match regex แต่นอกช่วงจริง → fallback เป็นวันนี้ (ไม่ overflow เงียบ ๆ)', () => {
  const now = new Date('2025-06-07T17:30:00.000Z') // = 8 มิ.ย. 2025 เวลาไทย
  const today = '2025-06-07T17:00:00.000Z'
  for (const bad of [
    '2025-13-40', // เดือน 13 + วัน 40
    '2025-13-01', // เดือน 13
    '2025-00-15', // เดือน 00
    '2025-02-30', // ก.พ. ไม่มีวันที่ 30
    '2025-02-29', // 2025 ไม่ใช่อธิกสุรทิน → ไม่มี 29
    '2025-04-31', // เม.ย. มี 30 วัน
    '2025-06-00', // วัน 00
    '2025-06-32', // วัน 32
  ]) {
    const r = computeRange('daily', bad, now)
    assert.equal(r.fromIso, today, `${bad}: ต้อง fallback เป็นวันนี้`)
  }
  // ขอบที่ valid จริงต้องผ่าน ไม่โดน fallback
  assert.equal(computeRange('daily', '2024-02-29', now).fromIso, '2024-02-28T17:00:00.000Z', '2024 อธิกสุรทิน → 29 ก.พ. ใช้ได้')
  assert.equal(computeRange('daily', '2025-12-31', now).fromIso, '2025-12-30T17:00:00.000Z', '31 ธ.ค. ใช้ได้')
})

test('period ไม่รู้จัก (สตริง) → ตีความเป็น yearly (พฤติกรรม else เดิม)', () => {
  const y = computeRange('yearly', '2025-06-15')
  // หมายเหตุ: undefined จะเข้า default param = 'daily' (ไม่ใช่ yearly) จึงไม่รวมในลิสต์นี้
  for (const weird of ['weekly', 'hourly', '', 'xxx', 'WEEKLY']) {
    assert.deepEqual(computeRange(weird, '2025-06-15'), y, `period=${JSON.stringify(weird)} → เหมือน yearly`)
  }
  // undefined → default 'daily'
  const daily = computeRange('daily', '2025-06-15')
  assert.deepEqual(computeRange(undefined, '2025-06-15'), daily, 'period=undefined → default daily (ไม่ใช่ yearly)')
})
