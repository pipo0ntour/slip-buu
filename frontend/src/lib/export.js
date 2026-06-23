// ส่งออกรายงานเป็น CSV / PDF จากข้อมูลที่หน้า Report โหลดมาแล้ว (เฉพาะช่วงที่กำลังดูอยู่)
// ทำฝั่ง client ล้วน — CSV เขียนเอง (ใส่ BOM ให้ Excel อ่านไทยถูก), PDF ใช้ jsPDF + ฟอนต์ Sarabun ฝังในบันเดิล
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { registerSarabun } from './fonts/sarabun.js'

const typeLabel = s => (s.type === 'expense' ? 'รายจ่าย' : 'รายรับ')
const categoryLabel = c => (c == null || c === '' ? 'ไม่ระบุหมวด' : c)
// รายละเอียดย่อ: โน้ต > ผู้โอน→ผู้รับ > ธนาคาร (อย่างใดอย่างหนึ่งที่มี)
const detailOf = s =>
  s.note ||
  [s.sender_name, s.receiver_name].filter(Boolean).join(' → ') ||
  s.bank_name ||
  '-'

// จำนวนเงินแบบมีคอมมา 2 ตำแหน่ง (ใช้แสดงผลใน PDF)
const fmtBaht = n =>
  Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// วันที่ทำรายการ (ไม่มี → วันที่บันทึก) เป็นเวลาเครื่องผู้ใช้ → 'YYYY-MM-DD HH:mm' (เรียง/พิมพ์ง่าย)
function dateTimeText(s) {
  const iso = s.transaction_at || s.created_at
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ชื่อไฟล์ ASCII ล้วน (กันปัญหา header/ระบบไฟล์กับชื่อไทย) — slip-report_<period>_<YYYY-MM-DD>
function buildFilename(period, ext) {
  const today = new Date()
  const pad = n => String(n).padStart(2, '0')
  const stamp = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  return `slip-report_${period || 'report'}_${stamp}.${ext}`
}

// สร้างลิงก์ชั่วคราวแล้วกดดาวน์โหลดให้อัตโนมัติ จากนั้นคืน object URL
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // หน่วง revoke เล็กน้อยให้เบราว์เซอร์เริ่มดาวน์โหลดก่อน (บางตัว revoke เร็วไปแล้วโหลดไม่ขึ้น)
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

// ───────────────────────── CSV ─────────────────────────

// หัวคอลัมน์ + ตัวดึงค่าของแต่ละแถว (ใช้กับ CSV — เก็บข้อมูลครบทุกฟิลด์)
const CSV_COLUMNS = [
  ['วันที่', s => dateTimeText(s)],
  ['ประเภท', s => typeLabel(s)],
  ['จำนวนเงิน', s => Number(s.amount || 0)], // ตัวเลขล้วน (ไม่มีคอมมา) ให้ Excel คำนวณได้
  ['หมวดหมู่', s => categoryLabel(s.category)],
  ['โน้ต', s => s.note || ''],
  ['ผู้โอน', s => s.sender_name || ''],
  ['ผู้รับ', s => s.receiver_name || ''],
  ['ธนาคาร', s => s.bank_name || ''],
  ['เลขอ้างอิง', s => s.reference_no || ''],
  ['ค่าธรรมเนียม', s => (s.fee != null ? Number(s.fee) : '')],
]

// ครอบค่าด้วย "..." เมื่อมีคอมมา/อัญประกาศ/ขึ้นบรรทัด และ escape อัญประกาศซ้อนด้วยการเบิ้ล
function csvCell(value) {
  const str = value == null ? '' : String(value)
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export function exportCsv({ slips = [], periodLabel = '', rangeLabel = '', period = '' } = {}) {
  const header = CSV_COLUMNS.map(([label]) => label)
  const lines = [header.map(csvCell).join(',')]
  for (const s of slips) {
    lines.push(CSV_COLUMNS.map(([, get]) => csvCell(get(s))).join(','))
  }
  // \r\n + BOM (﻿) → Excel บน Windows เปิดแล้วภาษาไทยไม่เพี้ยน
  const csv = '﻿' + lines.join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, buildFilename(period, 'csv'))
}

// ───────────────────────── PDF ─────────────────────────

const INK = [30, 41, 59] // slate-800
const MUTED = [100, 116, 139] // slate-500
const GREEN = [22, 163, 74]
const RED = [220, 38, 38]

export function exportPdf({
  slips = [],
  totalIncome = 0,
  totalExpense = 0,
  net = 0,
  count = 0,
  periodLabel = '',
  rangeLabel = '',
  period = '',
} = {}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  registerSarabun(doc)
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 40

  // ── หัวรายงาน ──
  doc.setFont('Sarabun', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...INK)
  doc.text('รายงานสรุปยอดสลิป', margin, 52)

  doc.setFont('Sarabun', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...MUTED)
  const sub = [periodLabel, rangeLabel].filter(Boolean).join(' · ')
  doc.text(sub, margin, 70)
  const printedAt = new Date().toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  doc.text(`ออกรายงานเมื่อ ${printedAt}`, margin, 85)

  // ── การ์ดสรุป 4 ช่อง ──
  const cards = [
    { label: 'รายรับ', value: fmtBaht(totalIncome), color: GREEN },
    { label: 'รายจ่าย', value: fmtBaht(totalExpense), color: RED },
    { label: 'คงเหลือ', value: fmtBaht(net), color: net < 0 ? RED : INK },
    { label: 'จำนวนรายการ', value: String(count), color: INK },
  ]
  const gap = 10
  const cardW = (pageW - margin * 2 - gap * (cards.length - 1)) / cards.length
  const cardY = 100
  const cardH = 50
  cards.forEach((c, i) => {
    const x = margin + i * (cardW + gap)
    doc.setDrawColor(226, 232, 240) // slate-200
    doc.setFillColor(248, 250, 252) // slate-50
    doc.roundedRect(x, cardY, cardW, cardH, 6, 6, 'FD')
    doc.setFont('Sarabun', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text(c.label, x + 10, cardY + 18)
    doc.setFont('Sarabun', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...c.color)
    doc.text(c.value, x + 10, cardY + 38)
  })

  // ── ตารางรายการ ──
  const body = slips.map(s => [
    dateTimeText(s),
    typeLabel(s),
    categoryLabel(s.category),
    detailOf(s),
    `${s.type === 'expense' ? '-' : '+'}${fmtBaht(s.amount)}`,
  ])

  autoTable(doc, {
    startY: cardY + cardH + 18,
    margin: { left: margin, right: margin },
    head: [['วันที่', 'ประเภท', 'หมวดหมู่', 'รายละเอียด', 'จำนวนเงิน']],
    body,
    styles: { font: 'Sarabun', fontStyle: 'normal', fontSize: 9, textColor: INK, cellPadding: 5, overflow: 'linebreak' },
    headStyles: { font: 'Sarabun', fontStyle: 'bold', fillColor: [241, 245, 249], textColor: INK, lineWidth: 0 },
    alternateRowStyles: { fillColor: [250, 250, 251] },
    columnStyles: {
      0: { cellWidth: 95 },
      1: { cellWidth: 50 },
      2: { cellWidth: 75 },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 75, halign: 'right' },
    },
    // ระบายสีคอลัมน์จำนวนเงิน: รายจ่าย = แดง, รายรับ = เขียว (ตามแถว slip จริง)
    didParseCell(d) {
      if (d.section === 'body' && d.column.index === 4) {
        d.cell.styles.textColor = slips[d.row.index]?.type === 'expense' ? RED : GREEN
        d.cell.styles.fontStyle = 'bold'
      }
    },
  })

  // ── เลขหน้า ──
  const pages = doc.getNumberOfPages()
  const pageH = doc.internal.pageSize.getHeight()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('Sarabun', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(`หน้า ${p} / ${pages}`, pageW - margin, pageH - 20, { align: 'right' })
  }

  doc.save(buildFilename(period, 'pdf'))
}
