import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toNumber, normalizeBank, clean, buildTransactionAt, parseThaiDate, THAI_MONTHS } from '../src/services/parse.js'

// ───────────────────────── toNumber ─────────────────────────
test('toNumber: รูปแบบเลขปกติที่เจอบนสลิป → ตัวเลขล้วน', () => {
  const cases = [
    [50, 50], [0, 0], [1500.5, 1500.5],
    ['1,500.00', 1500], ['1500', 1500], ['1,234,567.89', 1234567.89],
    ['฿50', 50], ['50 บาท', 50], ['50.50', 50.5], ['0.99', 0.99],
    ['.5', 0.5], ['5.', 5], ['  1,000.50  ', 1000.5], ['50%', 50],
    ['2,000', 2000], ['999999999', 999999999],
  ]
  for (const [input, expected] of cases) {
    assert.equal(toNumber(input), expected, `toNumber(${JSON.stringify(input)})`)
  }
})

test('toNumber: ค่าที่อ่านไม่ออก/ว่าง → null (ไม่เดา)', () => {
  for (const input of ['', '   ', 'abc', 'null', 'บาท', '฿', null, undefined, NaN, Infinity, -Infinity, {}, [], true]) {
    assert.equal(toNumber(input), null, `toNumber(${JSON.stringify(input)}) ต้องเป็น null`)
  }
})

test('toNumber: พฤติกรรมขอบ (จดไว้) — เครื่องหมายลบถูกตัดทิ้ง, จุดหลายตัว, เลขไทย', () => {
  // amount บนสลิปเป็นบวกเสมอ — การตัด '-' ออกจึงไม่กระทบใช้งานจริง แต่จดไว้ว่าเป็นพฤติกรรมปัจจุบัน
  assert.equal(toNumber('-50'), 50, 'เครื่องหมายลบถูก strip (amount จริงเป็นบวกเสมอ)')
  assert.equal(toNumber('1.2.3'), 1.2, 'จุดหลายตัว → parseFloat หยุดที่จุดที่สอง')
  assert.equal(toNumber('๕๐'), null, 'เลขไทย ๕๐ ไม่ถูกแปลง (LLM แปลงให้ก่อนแล้วในทางปฏิบัติ)')
})

// ───────────────────────── clean ─────────────────────────
test('clean: ตัดช่องว่าง + ถือว่า "null" (ทุกตัวพิมพ์) = ไม่มีข้อมูล', () => {
  assert.equal(clean('  ก๋วยเตี๋ยวเรือ  '), 'ก๋วยเตี๋ยวเรือ')
  assert.equal(clean('hello'), 'hello')
  for (const v of ['null', 'NULL', 'Null', '', '   ', null, undefined]) {
    assert.equal(clean(v), null, `clean(${JSON.stringify(v)}) ต้องเป็น null`)
  }
  assert.equal(clean(0), '0', 'ตัวเลข 0 → "0" (ไม่ใช่ null)')
  assert.equal(clean(123), '123')
})

// ───────────────────────── normalizeBank ─────────────────────────
test('normalizeBank: คีย์เวิร์ดหลายแบบ (ไทย/อังกฤษ/ตัวย่อ) → ชื่อย่อมาตรฐานเดียว', () => {
  const cases = [
    ['KBANK', 'กสิกรไทย'], ['kasikorn', 'กสิกรไทย'], ['ธ.กสิกรไทย', 'กสิกรไทย'],
    ['SCB', 'ไทยพาณิชย์'], ['siam commercial', 'ไทยพาณิชย์'], ['ไทยพาณิชย์', 'ไทยพาณิชย์'],
    ['BBL', 'กรุงเทพ'], ['bangkok bank', 'กรุงเทพ'], ['ธนาคารกรุงเทพ', 'กรุงเทพ'],
    ['KTB', 'กรุงไทย'], ['krungthai', 'กรุงไทย'], ['กรุงไทย', 'กรุงไทย'],
    ['BAY', 'กรุงศรีอยุธยา'], ['krungsri', 'กรุงศรีอยุธยา'], ['กรุงศรี', 'กรุงศรีอยุธยา'],
    ['ttb', 'ทหารไทยธนชาต'], ['ทหารไทย', 'ทหารไทยธนชาต'], ['ธนชาต', 'ทหารไทยธนชาต'],
    ['GSB', 'ออมสิน'], ['ออมสิน', 'ออมสิน'], ['government savings', 'ออมสิน'],
    ['baac', 'ธ.ก.ส.'], ['ธ.ก.ส', 'ธ.ก.ส.'], ['ธนาคารเพื่อการเกษตร', 'ธ.ก.ส.'],
    ['kkp', 'เกียรตินาคินภัทร'], ['เกียรตินาคิน', 'เกียรตินาคินภัทร'],
    ['CIMB', 'ซีไอเอ็มบีไทย'], ['ซีไอเอ็มบี', 'ซีไอเอ็มบีไทย'],
    ['UOB', 'ยูโอบี'], ['ยูโอบี', 'ยูโอบี'],
    ['TISCO', 'ทิสโก้'], ['ทิสโก้', 'ทิสโก้'],
    ['ICBC', 'ไอซีบีซีไทย'], ['ไอซีบีซี', 'ไอซีบีซีไทย'],
  ]
  for (const [input, expected] of cases) {
    assert.equal(normalizeBank(input), expected, `normalizeBank(${input})`)
  }
})

test('normalizeBank: e-wallet จับก่อน "พร้อมเพย์" (สลิปรัฐโอนผ่านพร้อมเพย์แต่อยากเห็นชื่อแอป)', () => {
  assert.equal(normalizeBank('เป๋าตัง'), 'เป๋าตัง')
  assert.equal(normalizeBank('G-Wallet'), 'เป๋าตัง')
  assert.equal(normalizeBank('คนละครึ่ง'), 'เป๋าตัง')
  assert.equal(normalizeBank('ไทยช่วยไทย'), 'เป๋าตัง')
  assert.equal(normalizeBank('เป๋าตัง พร้อมเพย์'), 'เป๋าตัง', 'มีทั้งคู่ → เป๋าตังชนะ (อยู่ก่อนในลิสต์)')
  assert.equal(normalizeBank('ทรูมันนี่'), 'ทรูมันนี่')
  assert.equal(normalizeBank('truemoney'), 'ทรูมันนี่')
  assert.equal(normalizeBank('พร้อมเพย์'), 'พร้อมเพย์')
  assert.equal(normalizeBank('PromptPay'), 'พร้อมเพย์')
})

test('normalizeBank: ไม่รู้จัก → คืนชื่อเดิม(trim), ว่าง/null → null', () => {
  assert.equal(normalizeBank('ธนาคารอะไรไม่รู้'), 'ธนาคารอะไรไม่รู้')
  assert.equal(normalizeBank('  ธ.แปลก  '), 'ธ.แปลก')
  assert.equal(normalizeBank(null), null)
  assert.equal(normalizeBank(''), null)
  assert.equal(normalizeBank('   '), null)
})

// ───────────────────────── parseThaiDate ─────────────────────────
test('parseThaiDate: ทุกเดือน (ทั้งย่อและเต็ม) แปลงเลขเดือนถูกต้อง', () => {
  for (const [name, mo] of Object.entries(THAI_MONTHS)) {
    const parsed = parseThaiDate(`15 ${name} 2567`)
    assert.ok(parsed, `"${name}" ต้อง parse ได้`)
    assert.equal(parsed.mo, mo, `เดือน "${name}" → ${mo}`)
    assert.equal(parsed.d, 15, `วันของ "${name}"`)
    assert.equal(parsed.y, 2567, `ปีของ "${name}"`)
  }
})

test('parseThaiDate: ปีย่อ 2 หลัก = พ.ศ. 25xx', () => {
  assert.deepEqual(parseThaiDate('8 มิ.ย. 68'), { y: 2568, mo: 6, d: 8 })
  assert.deepEqual(parseThaiDate('1 ม.ค. 70'), { y: 2570, mo: 1, d: 1 })
  assert.deepEqual(parseThaiDate('31 ธ.ค. 99'), { y: 2599, mo: 12, d: 31 })
})

test('parseThaiDate: อ่านไม่ออก → null', () => {
  for (const s of ['ไม่มีวันที่', '2025-06-08', 'มิถุนายน', '8 8 8', '']) {
    assert.equal(parseThaiDate(s), null, `parseThaiDate(${JSON.stringify(s)})`)
  }
})

// ───────────────────────── buildTransactionAt ─────────────────────────
const NOW_YEAR = 2026

test('buildTransactionAt: YYYY-MM-DD ค.ศ. + เวลา → instant UTC ถูกต้อง (ไทย +07:00)', () => {
  assert.equal(buildTransactionAt('2025-06-08', '14:30', NOW_YEAR), '2025-06-08T07:30:00.000Z') // 14:30 ไทย = 07:30Z
  assert.equal(buildTransactionAt('2025-01-01', '00:00', NOW_YEAR), '2024-12-31T17:00:00.000Z') // เที่ยงคืนไทย
  assert.equal(buildTransactionAt('2025-12-31', '23:59', NOW_YEAR), '2025-12-31T16:59:00.000Z')
  assert.equal(buildTransactionAt('2025-06-08', null, NOW_YEAR), '2025-06-07T17:00:00.000Z') // ไม่มีเวลา → เที่ยงคืนไทย
})

test('buildTransactionAt: ปี พ.ศ. ถูกแปลงเป็น ค.ศ. อัตโนมัติ (ลบ 543)', () => {
  assert.equal(buildTransactionAt('2568-06-08', '00:00', NOW_YEAR), '2025-06-07T17:00:00.000Z')
  assert.equal(buildTransactionAt('2567-12-31', '12:00', NOW_YEAR), '2024-12-31T05:00:00.000Z')
  // ปี ค.ศ. ปกติ (<= nowYear+1) ต้องไม่ถูกลบ 543
  assert.equal(buildTransactionAt('2024-06-08', '00:00', NOW_YEAR), '2024-06-07T17:00:00.000Z')
})

test('buildTransactionAt: วันที่ไทย (เดือนย่อ/เต็ม) + ปี พ.ศ. เต็มและย่อ', () => {
  assert.equal(buildTransactionAt('8 มิ.ย. 2568', null, NOW_YEAR), '2025-06-07T17:00:00.000Z')
  assert.equal(buildTransactionAt('8 มิถุนายน 2568', '09:15', NOW_YEAR), '2025-06-08T02:15:00.000Z')
  assert.equal(buildTransactionAt('8 มิ.ย. 68', null, NOW_YEAR), '2025-06-07T17:00:00.000Z') // ปีย่อ
})

test('buildTransactionAt: ทุกเดือนไทย → เลขเดือนถูกต้องใน ISO', () => {
  const abbr = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  abbr.forEach((m, i) => {
    const iso = buildTransactionAt(`15 ${m} 2567`, '12:00', NOW_YEAR) // 12:00 ไทย = 05:00Z วันเดียวกัน
    assert.ok(iso.startsWith(`2024-${String(i + 1).padStart(2, '0')}-15T05:00`), `เดือน ${m} → ${iso}`)
  })
})

test('buildTransactionAt: ข้อมูลไม่ครบ/ผิด → null (ไม่เดา)', () => {
  for (const [d, t] of [[null, '12:00'], ['', null], ['อ่านไม่ออก', null], ['2025-99-99', '00:00'], [undefined, undefined]]) {
    assert.equal(buildTransactionAt(d, t, NOW_YEAR), null, `buildTransactionAt(${JSON.stringify(d)}, ${JSON.stringify(t)})`)
  }
})

test('buildTransactionAt: ทุกค่า ที่ไม่ใช่ null ต้องเป็น ISO ที่ valid (สุ่มหลายร้อยวัน)', () => {
  let ok = 0
  for (let y = 2020; y <= 2027; y++) {
    for (let mo = 1; mo <= 12; mo++) {
      for (const d of [1, 15, 28]) {
        const iso = buildTransactionAt(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, '08:00', NOW_YEAR)
        assert.ok(iso && !Number.isNaN(new Date(iso).getTime()), `${y}-${mo}-${d} ต้องได้ ISO valid`)
        ok++
      }
    }
  }
  assert.ok(ok > 250, `ทดสอบ ${ok} วัน`)
})
