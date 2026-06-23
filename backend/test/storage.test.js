import { test } from 'node:test'
import assert from 'node:assert/strict'

// storage.js → supabase.js ต้องมี URL ตอน import — ใส่ dummy แล้ว dynamic import (storagePathOf เป็น pure ไม่ยิง DB)
process.env.SUPABASE_URL ||= 'http://localhost:54321'
process.env.SUPABASE_SERVICE_KEY ||= 'dummy-key-for-test'
const { storagePathOf } = await import('../src/services/storage.js')

test('storagePathOf: แถวใหม่ใช้ image_path ตรง ๆ (มาก่อน image_url เสมอ)', () => {
  assert.equal(storagePathOf({ image_path: 'Uabc/123-xy.jpg' }), 'Uabc/123-xy.jpg')
  // image_path มี → ชนะ image_url แม้จะมีทั้งคู่
  assert.equal(
    storagePathOf({ image_path: 'Uabc/new.jpg', image_url: 'https://x/object/public/slips/Uabc/old.jpg' }),
    'Uabc/new.jpg',
  )
})

test('storagePathOf: แถวเก่าดึง path จาก public/sign URL ได้ + decode อักขระ', () => {
  assert.equal(
    storagePathOf({ image_url: 'https://x.supabase.co/storage/v1/object/public/slips/Uabc/123-xy.jpg' }),
    'Uabc/123-xy.jpg',
  )
  // sign URL มี query token ต่อท้าย → เอาเฉพาะส่วน path ก่อน ?
  assert.equal(
    storagePathOf({ image_url: 'https://x/storage/v1/object/sign/slips/Uabc/123-xy.jpg?token=eyJ.abc' }),
    'Uabc/123-xy.jpg',
  )
  // path เข้ารหัส (เว้นวรรค/ไทย) → ต้อง decode กลับ
  assert.equal(
    storagePathOf({ image_url: 'https://x/object/public/slips/Uabc/my%20slip%20.jpg' }),
    'Uabc/my slip .jpg',
  )
})

test('storagePathOf: ไม่มีรูป/URL ไม่เข้าแพทเทิร์น → null (จะได้ไม่ sign/ไม่ลบมั่ว)', () => {
  assert.equal(storagePathOf({}), null)
  assert.equal(storagePathOf({ image_url: null }), null)
  assert.equal(storagePathOf({ image_url: '' }), null)
  assert.equal(storagePathOf({ image_url: 'https://other.com/some/random/path.jpg' }), null) // ไม่ใช่บักเก็ต slips
  assert.equal(storagePathOf({ image_url: 'https://x/object/public/OTHERBUCKET/a.jpg' }), null)
  assert.equal(storagePathOf({ image_path: null, image_url: null }), null)
})
