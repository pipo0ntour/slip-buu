import { test } from 'node:test'
import assert from 'node:assert/strict'

// duplicate.js → supabase.js เรียก createClient ตอน import (ต้องมี URL) แต่ npm test ไม่โหลด dotenv
// ใส่ค่า dummy ก่อน แล้ว dynamic import — เทสที่นี่แตะแค่ hashBuffer + guard ที่คืน null ก่อนยิง DB (ไม่ query จริง)
process.env.SUPABASE_URL ||= 'http://localhost:54321'
process.env.SUPABASE_SERVICE_KEY ||= 'dummy-key-for-test'
const { hashBuffer, checkByHash, checkByRefNo } = await import('../src/services/duplicate.js')

// ───────────────────────── hashBuffer ─────────────────────────
test('hashBuffer: ผลตรงกับ SHA-256 มาตรฐาน (เทียบ vector ที่รู้ค่า)', () => {
  assert.equal(
    hashBuffer(Buffer.from('hello')),
    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  )
  assert.equal(
    hashBuffer(Buffer.from('')),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  )
})

test('hashBuffer: deterministic — buffer เดียวกันได้ค่าเดิมเสมอ, ต่างกันได้ค่าต่าง', () => {
  const a = Buffer.from('สลิปโอนเงิน 1500 บาท')
  assert.equal(hashBuffer(a), hashBuffer(Buffer.from('สลิปโอนเงิน 1500 บาท')), 'อินพุตเดียวกัน = แฮชเดียวกัน')
  assert.notEqual(hashBuffer(a), hashBuffer(Buffer.from('สลิปโอนเงิน 1501 บาท')), 'ต่าง 1 ตัว = แฮชต่าง')

  // แฮชความยาวคงที่ 64 hex และไม่ชนกันในชุดสุ่ม 1000 ตัว
  const seen = new Set()
  for (let i = 0; i < 1000; i++) {
    const h = hashBuffer(Buffer.from(`payload-${i}-${i * 7}`))
    assert.match(h, /^[0-9a-f]{64}$/, 'ต้องเป็น hex 64 ตัว')
    assert.ok(!seen.has(h), `แฮชต้องไม่ชนกัน (i=${i})`)
    seen.add(h)
  }
  assert.equal(seen.size, 1000)
})

// ─────────────── guard ก่อนยิง DB (เทสได้โดยไม่ต้องต่อ Supabase) ───────────────
test('checkByHash: อินพุตไม่ครบ → null โดยไม่แตะ DB', async () => {
  assert.equal(await checkByHash(null, 'user1'), null)
  assert.equal(await checkByHash('somehash', null), null)
  assert.equal(await checkByHash('', ''), null)
  assert.equal(await checkByHash(undefined, undefined), null)
})

test('checkByRefNo: เลขอ้างอิงสั้น (<6)/ว่าง หรือไม่มี userId → null (กัน false positive) โดยไม่แตะ DB', async () => {
  assert.equal(await checkByRefNo('', 'user1'), null)
  assert.equal(await checkByRefNo('12345', 'user1'), null, 'ยาว 5 < 6 → ข้าม')
  assert.equal(await checkByRefNo('   ', 'user1'), null, 'ช่องว่างล้วน → ข้าม')
  assert.equal(await checkByRefNo(null, 'user1'), null)
  assert.equal(await checkByRefNo('123456', null), null, 'ไม่มี userId → ข้าม')
  assert.equal(await checkByRefNo('123456', ''), null)
})
