import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeRange } from '../src/services/period.js'

// เที่ยงคืนเวลาไทย = 17:00 UTC ของวันก่อนหน้า (ไทย = UTC+7 ไม่มี DST)

test('daily: ขอบเขตคือเที่ยงคืนไทยถึงเที่ยงคืนไทยวันถัดไป', () => {
  const { fromIso, toIso } = computeRange('daily', '2026-06-12')
  assert.equal(fromIso, '2026-06-11T17:00:00.000Z')
  assert.equal(toIso, '2026-06-12T17:00:00.000Z')
})

test('daily: วันสุดท้ายของเดือน — ขอบบนข้ามไปเดือนถัดไปถูกต้อง', () => {
  const { fromIso, toIso } = computeRange('daily', '2026-01-31')
  assert.equal(fromIso, '2026-01-30T17:00:00.000Z')
  assert.equal(toIso, '2026-01-31T17:00:00.000Z') // = 1 ก.พ. เที่ยงคืนไทย
})

test('monthly: ครอบทั้งเดือนตามปฏิทินไทย', () => {
  const { fromIso, toIso } = computeRange('monthly', '2026-06-12')
  assert.equal(fromIso, '2026-05-31T17:00:00.000Z')
  assert.equal(toIso, '2026-06-30T17:00:00.000Z')
})

test('monthly: เดือนธันวาคม — ขอบบนข้ามปีถูกต้อง', () => {
  const { fromIso, toIso } = computeRange('monthly', '2026-12-05')
  assert.equal(fromIso, '2026-11-30T17:00:00.000Z')
  assert.equal(toIso, '2026-12-31T17:00:00.000Z')
})

test('yearly: ครอบทั้งปีตามปฏิทินไทย', () => {
  const { fromIso, toIso } = computeRange('yearly', '2026-06-12')
  assert.equal(fromIso, '2025-12-31T17:00:00.000Z')
  assert.equal(toIso, '2026-12-31T17:00:00.000Z')
})

test('ไม่ส่งวันอ้างอิง: ใช้ "วันนี้" ตามเวลาไทย ไม่ใช่เวลา server (UTC)', () => {
  // 20:00 UTC = 03:00 เวลาไทยของ "วันถัดไป" — ต้องได้ช่วงของวันที่ 13 ไม่ใช่ 12
  const now = new Date('2026-06-12T20:00:00.000Z')
  const { fromIso, toIso } = computeRange('daily', undefined, now)
  assert.equal(fromIso, '2026-06-12T17:00:00.000Z')
  assert.equal(toIso, '2026-06-13T17:00:00.000Z')
})

test('วันอ้างอิงผิดรูปแบบ: เมินแล้วใช้วันนี้แทน (ไม่พัง)', () => {
  const now = new Date('2026-06-12T05:00:00.000Z') // = 12:00 เวลาไทย วันที่ 12
  const { fromIso } = computeRange('daily', '12/06/2026', now)
  assert.equal(fromIso, '2026-06-11T17:00:00.000Z')
})

test('period ไม่รู้จัก: ตีความเป็น yearly (พฤติกรรมเดิมของ else)', () => {
  const a = computeRange('yearly', '2026-03-01')
  const b = computeRange('อะไรก็ไม่รู้', '2026-03-01')
  assert.deepEqual(b, a)
})
