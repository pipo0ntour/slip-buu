import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rateLimitByUser, rateLimitReads, createRateLimit } from '../src/services/rateLimit.js'

const MAX = 20 // ต้องตรงกับลิมิตของ rateLimitByUser ใน rateLimit.js

// จำลองหนึ่ง request ของ userId ผ่าน middleware ที่กำหนด — คืนว่าผ่าน (next) หรือโดนบล็อก (429)
function callWith(mw, userId) {
  const req = { lineUser: userId === undefined ? undefined : { userId } }
  let statusCode = null
  let jsonBody = null
  let nexted = false
  const res = {
    status(c) {
      statusCode = c
      return { json(b) { jsonBody = b } }
    },
  }
  mw(req, res, () => { nexted = true })
  return { allowed: nexted, statusCode, jsonBody }
}

// ดีฟอลต์ใช้ rateLimitByUser (ตัวเข้ม 20/นาที)
const call = (userId) => callWith(rateLimitByUser, userId)

test('rateLimit: อนุญาตครบ 20 req แรกในหน้าต่างเดียว แล้วบล็อก req ที่ 21+', () => {
  const u = `rl-burst-${Date.now()}`
  for (let i = 1; i <= MAX; i++) {
    const r = call(u)
    assert.equal(r.allowed, true, `req ที่ ${i} ต้องผ่าน`)
    assert.equal(r.statusCode, null, `req ที่ ${i} ต้องไม่ถูกบล็อก`)
  }
  for (let i = MAX + 1; i <= MAX + 5; i++) {
    const r = call(u)
    assert.equal(r.allowed, false, `req ที่ ${i} ต้องถูกบล็อก`)
    assert.equal(r.statusCode, 429, `req ที่ ${i} ต้องตอบ 429`)
    assert.equal(r.jsonBody.status, 'error')
    assert.match(r.jsonBody.message, /ถี่เกินไป/)
  }
})

test('rateLimit: แต่ละผู้ใช้นับแยกกัน — ผู้ใช้ A เต็มไม่กระทบผู้ใช้ B', () => {
  const a = `rl-a-${Date.now()}`
  const b = `rl-b-${Date.now()}`
  for (let i = 0; i < MAX + 3; i++) call(a) // ทำให้ A เต็ม
  assert.equal(call(a).statusCode, 429, 'A ต้องถูกบล็อก')
  // B ยังสดอยู่ — ควรผ่านได้ครบโควต้าของตัวเอง
  for (let i = 1; i <= MAX; i++) {
    assert.equal(call(b).allowed, true, `B req ที่ ${i} ต้องผ่าน`)
  }
  assert.equal(call(b).statusCode, 429, 'B ครบ 20 แล้วจึงถูกบล็อก')
})

test('rateLimit: ไม่มี userId (กันพลาด) → ปล่อยผ่าน next() ไม่บล็อก', () => {
  for (let i = 0; i < 50; i++) {
    const r = call(undefined)
    assert.equal(r.allowed, true)
    assert.equal(r.statusCode, null)
  }
})

test('rateLimitReads: ผ่อนกว่า — อนุญาต 60 req แรก แล้วบล็อก req ที่ 61', () => {
  const u = `rl-read-${Date.now()}`
  for (let i = 1; i <= 60; i++) {
    assert.equal(callWith(rateLimitReads, u).allowed, true, `read req ที่ ${i} ต้องผ่าน`)
  }
  assert.equal(callWith(rateLimitReads, u).statusCode, 429, 'read req ที่ 61 ต้องถูกบล็อก')
})

test('rateLimit: แต่ละ limiter นับแยกถัง — ยิงตัวเขียนจนเต็มไม่กระทบตัวอ่าน', () => {
  const u = `rl-split-${Date.now()}`
  for (let i = 0; i < MAX + 5; i++) callWith(rateLimitByUser, u) // ทำให้ถังเขียน (20) เต็มของ user นี้
  assert.equal(callWith(rateLimitByUser, u).statusCode, 429, 'ถังเขียนต้องเต็ม')
  // ถังอ่านของ user เดียวกันต้องยังว่าง (Map แยกกัน)
  assert.equal(callWith(rateLimitReads, u).allowed, true, 'ถังอ่านต้องยังผ่านได้')
})

test('createRateLimit: ปรับ max ได้ และแต่ละ instance มี Map ของตัวเอง', () => {
  const lim = createRateLimit({ max: 2 })
  const u = `rl-factory-${Date.now()}`
  assert.equal(callWith(lim, u).allowed, true)
  assert.equal(callWith(lim, u).allowed, true)
  assert.equal(callWith(lim, u).statusCode, 429, 'เกิน max=2 ต้องบล็อก')
  // instance ใหม่ = ถังใหม่ ไม่รับรู้ประวัติของ instance ก่อนหน้า
  assert.equal(callWith(createRateLimit({ max: 2 }), u).allowed, true)
})
