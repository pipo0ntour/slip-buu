import { test } from 'node:test'
import assert from 'node:assert/strict'
import { retryDelayMs } from '../src/services/gemini.js'

// ข้อความ error จริงจาก Gemini free tier มีเวลารอแนะนำมา 2 รูปแบบ — ต้อง parse ได้ทั้งคู่

test('retryDelayMs: อ่านจากข้อความ "Please retry in Xs" (ทศนิยม)', () => {
  const err = new Error('[503 Service Unavailable] ... Please retry in 55.794969947s. ...')
  assert.equal(retryDelayMs(err), 56295) // ceil(55794.97) + buffer 500ms
})

test('retryDelayMs: อ่านจาก RetryInfo JSON "retryDelay":"55s"', () => {
  const err = new Error('... {"@type":".../RetryInfo","retryDelay":"55s"} ...')
  assert.equal(retryDelayMs(err), 55500)
})

test('retryDelayMs: cap ที่ 65 วินาที — ไม่แขวน request ค้างนานเกิน', () => {
  assert.equal(retryDelayMs(new Error('Please retry in 300s.')), 65000)
})

test('retryDelayMs: ไม่พบเวลารอ/ไม่มี error → null (ให้ fallback ใช้ backoff เดิม)', () => {
  assert.equal(retryDelayMs(new Error('fetch failed')), null)
  assert.equal(retryDelayMs(null), null)
})
