import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rateLimitByUser } from '../src/services/rateLimit.js'

const MAX = 20 // ต้องตรงกับ MAX_PER_WINDOW ใน rateLimit.js

// จำลองหนึ่ง request ของ userId — คืนว่าผ่าน (next) หรือโดนบล็อก (429)
function call(userId) {
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
  rateLimitByUser(req, res, () => { nexted = true })
  return { allowed: nexted, statusCode, jsonBody }
}

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
