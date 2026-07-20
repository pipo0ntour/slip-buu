import pptxgen from 'pptxgenjs';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('docs');
fs.mkdirSync(outDir, { recursive: true });

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Codex research for Slip-Buu';
pptx.subject = 'Slip-Buu competitor research';
pptx.title = 'Slip-Buu Competitor Research';
pptx.company = 'Slip-Buu';
pptx.lang = 'th-TH';
pptx.theme = {
  headFontFace: 'Aptos Display',
  bodyFontFace: 'Aptos',
  lang: 'th-TH',
};
pptx.defineLayout({ name: 'CUSTOM_WIDE', width: 13.333, height: 7.5 });
pptx.layout = 'CUSTOM_WIDE';

const C = {
  ink: '172033',
  muted: '64748B',
  pale: 'F6F8FB',
  white: 'FFFFFF',
  green: '16A34A',
  teal: '0F766E',
  amber: 'B45309',
  red: 'B91C1C',
  blue: '2563EB',
  line: 'D9E1EC',
  dark: '0F172A',
};

const sources = [
  ['SlipOK', 'https://slipok.com/'],
  ['SlipOK API docs', 'https://slipok.com/api-documentation/check-slip/'],
  ['EasySlip', 'https://easyslip.com/'],
  ['EasySlip docs', 'https://document.easyslip.com/en/'],
  ['Slip2Go', 'https://slip2go.com/'],
  ['CheckSlips / SlipVerify', 'https://www.checkslips.com/'],
  ['KBank K API Slip Verification', 'https://apiportal.kasikornbank.com/product/public/All/Slip%20Verification/Documentation/Verify'],
  ['Bangkok Bank Developer Portal', 'https://apiportal.bangkokbank.com/en/api/qr-payment/api-documents'],
  ['Page365', 'https://www.page365.net/home-en'],
  ['Page365 App Store listing', 'https://apps.apple.com/ph/app/page365/id894477175'],
  ['ZORT Verify Slip Guide', 'https://zortout.com/en/docs/verify-slip-guide'],
  ['Oho Chat + SlipOK', 'https://help.oho.chat/user-manual/oho-chat-slipok'],
  ['Shipnity LINE OA guide', 'https://blog.shipnity.com/line-oa-shipnity-new/'],
  ['FlowAccount AutoKey', 'https://flowaccount.com/en/autokey'],
  ['FlowAccount mobile OCR', 'https://flowaccount.com/en/download-application'],
  ['PEAK Connect', 'https://www.peakaccount.com/peak-connect'],
  ['iApp Thai Receipt OCR', 'https://iapp.co.th/docs/ocr/receipt'],
  ['SpaceOCR+n8n workflow', 'https://n8n.io/workflows/3008-extract-thai-bank-slip-data-from-line-using-spaceocr-and-save-to-google-sheets/'],
  ['LINE OA Store', 'https://lineforbusiness.com/th-en/trends-and-insights/lineoastorethecentreofbrands'],
  ['LINE Messaging API', 'https://developers.line.biz/en/docs/messaging-api/receiving-messages/'],
  ['PromptPay BOT', 'https://www.bot.or.th/en/financial-innovation/digital-finance/digital-payment/promptpay.html'],
  ['Expensify receipt scanning', 'https://use.expensify.com/receipt-scanning-app'],
  ['SAP Concur ExpenseIt', 'https://www.concur.com/products/expenseit'],
  ['Zoho Expense receipt scanner', 'https://www.zoho.com/us/expense/receipt-scanner-app/'],
  ['Dext receipt capture', 'https://dext.com/us/business/product/capture-receipts-and-invoices'],
  ['QuickBooks receipt scanner', 'https://quickbooks.intuit.com/ca/receipt-scanner/'],
  ['Xero / Hubdoc', 'https://www.hubdoc.com/'],
  ['Veryfi receipt OCR API', 'https://www.veryfi.com/receipt-ocr-api/'],
  ['Klippa receipt OCR', 'https://www.klippa.com/en/ocr/financial-documents/receipts/'],
  ['Wave receipts', 'https://www.waveapps.com/receipts'],
  ['Shoeboxed', 'https://www.shoeboxed.com/'],
];

const apps = [
  {
    name: 'SlipOK',
    market: 'ไทย',
    type: 'ตรวจสลิปผ่าน LINE / API',
    fit: 'ใกล้เคียง Slip-Buu มากที่สุด: รับรูปสลิปใน LINE Group/OA แล้วตรวจจริง-ปลอม/ซ้ำ',
    pros: ['LINE-first ชัดเจน', 'ตรวจซ้ำและผูกบัญชีรับเงิน', 'แบรนด์เป็นที่รู้จักในไทย'],
    cons: ['เน้น verify มากกว่าบันทึกบัญชีส่วนตัว', 'ประสบการณ์ขึ้นกับแพ็กเกจ/การตั้งค่า OA'],
    customers: 'ร้านค้าออนไลน์, แอดมิน LINE OA, SME ที่รับโอนเงิน',
    src: 'S1,S2',
  },
  {
    name: 'EasySlip',
    market: 'ไทย',
    type: 'Slip Verification API',
    fit: 'API ตรวจสลิป QR/รูป/Base64/URL พร้อม duplicate และ account matching',
    pros: ['เอกสาร developer ดี', 'รองรับธนาคารไทย 18+', 'มีปลั๊กอิน WooCommerce'],
    cons: ['เป็น API มากกว่าแอปสำเร็จรูป', 'ผู้ใช้ non-tech ต้องมีคนเชื่อมระบบ'],
    customers: 'นักพัฒนา, ร้าน WooCommerce, SaaS/ระบบหลังบ้าน',
    src: 'S3,S4',
  },
  {
    name: 'Slip2Go',
    market: 'ไทย',
    type: 'LINE OA / API / Social slip verify',
    fit: 'ตรวจสลิปผ่าน LINE กลุ่ม, LINE OA, API และ Facebook',
    pros: ['ช่องทาง social ครบ', 'สื่อสารจุดขายเรื่องราคาและความง่าย', 'เหมาะกับร้านเริ่มต้น'],
    cons: ['ข้อมูลเชิงเทคนิคสาธารณะน้อยกว่า EasySlip', 'ความแตกต่างเชิงบัญชี/รายงานยังไม่เด่น'],
    customers: 'ร้านค้าออนไลน์, live commerce, ร้านที่รับสลิปหลายช่องทาง',
    src: 'S5',
  },
  {
    name: 'CheckSlips / SlipVerify',
    market: 'ไทย',
    type: 'Slip verification API',
    fit: 'API ตรวจสลิปธนาคารด้วย QR decode + OCR',
    pros: ['position สำหรับนักพัฒนาและร้านค้าออนไลน์', 'มีตัวอย่าง API', 'เน้นกันสลิปปลอม/สลิปเวียน'],
    cons: ['ยังไม่เห็น ecosystem LINE/รายงานเท่าเจ้าตลาด', 'ความน่าเชื่อถือแบรนด์ต้องพิสูจน์'],
    customers: 'developer, ร้านออนไลน์, ระบบ donation/booking',
    src: 'S6',
  },
  {
    name: 'KBank K API: Slip Verification',
    market: 'ไทย',
    type: 'Bank API',
    fit: 'ตรวจสถานะ/รายละเอียดธุรกรรมจากสลิป mobile banking',
    pros: ['แหล่งข้อมูลจากธนาคารโดยตรง', 'ความน่าเชื่อถือสูง', 'เหมาะงาน enterprise'],
    cons: ['ไม่ใช่แอปสำเร็จรูป', 'ข้อจำกัด onboarding/บัญชี/สัญญา', 'อาจไม่คล่องตัวเท่า SaaS'],
    customers: 'องค์กร, payment platform, merchant รายใหญ่',
    src: 'S7',
  },
  {
    name: 'Bangkok Bank QR Payment API',
    market: 'ไทย',
    type: 'Bank/payment API',
    fit: 'ใช้ transaction reference ใน mini-QR บนสลิปเพื่อตรวจรายการ',
    pros: ['ข้อมูลธนาคารโดยตรง', 'เหมาะกับ flow PromptPay/QR ขององค์กร', 'ลดความเสี่ยงสลิปปลอม'],
    cons: ['ไม่ได้แก้ UX LINE/OCR เอง', 'เหมาะกับระบบที่มีทีม technical และบัญชีธนาคารรองรับ'],
    customers: 'corporate merchant, payment integrator, fintech',
    src: 'S8',
  },
  {
    name: 'Page365',
    market: 'ไทย/SEA',
    type: 'Social commerce management',
    fit: 'รวมแชท-ออเดอร์-จ่ายเงิน-ส่งของ มีตรวจสลิปอัตโนมัติ',
    pros: ['ครบทั้ง funnel การขาย', 'ฐานร้านค้าใหญ่', 'รองรับ Facebook/LINE OA/IG/live'],
    cons: ['หนักสำหรับคนที่ต้องการแค่สแกนสลิป', 'UX/ราคาอาจเกินร้านเล็กมาก'],
    customers: 'ร้านออนไลน์หลายช่องทาง, live seller, SME ที่มีแอดมินหลายคน',
    src: 'S9,S10',
  },
  {
    name: 'ZORT',
    market: 'ไทย',
    type: 'Order/inventory/finance platform',
    fit: 'Verify Slip เช็กสลิปกับยอดเงินและ wallet/account ในระบบ',
    pros: ['ผูก order-stock-finance ได้', 'เหมาะธุรกิจที่โตแล้ว', 'มีคู่มือ LINE OA'],
    cons: ['ไม่ใช่ consumer LIFF แบบเบา', 'setup หลังบ้านมากกว่า plug-and-play'],
    customers: 'ร้าน e-commerce, warehouse, omnichannel seller',
    src: 'S11',
  },
  {
    name: 'Oho Chat + SlipOK',
    market: 'ไทย',
    type: 'Chat commerce + partner plugin',
    fit: 'รวมแชท LINE OA แล้วเชื่อม SlipOK เพื่อตรวจสลิปจากห้องแชท',
    pros: ['ดีสำหรับทีมแอดมิน', 'ลดการสลับหลายระบบ', 'ใช้ SlipOK เป็น engine ตรวจสลิป'],
    cons: ['ต้องพึ่ง plugin/คู่ค้า', 'ไม่ใช่ระบบบันทึกรายรับรายจ่ายโดยตัวเอง'],
    customers: 'ทีมขายผ่านแชท, แบรนด์ที่มี LINE OA traffic สูง',
    src: 'S12',
  },
  {
    name: 'Shipnity',
    market: 'ไทย',
    type: 'ระบบร้านค้าออนไลน์',
    fit: 'เปิดบิล/แชท/ออเดอร์ผ่าน LINE OA และช่องทางขายอื่น',
    pros: ['เหมาะร้านขายของจริงจัง', 'จัดการ order และ shipping', 'ลดงานแอดมิน'],
    cons: ['จุดเด่นไม่ใช่ OCR สลิปโดยตรง', 'flow อาจซับซ้อนกว่าการสแกนสลิปอย่างเดียว'],
    customers: 'ร้านออนไลน์, seller ที่ต้องส่งของและจัดสต๊อก',
    src: 'S13',
  },
  {
    name: 'FlowAccount AutoKey',
    market: 'ไทย',
    type: 'บัญชีออนไลน์ + OCR ใบเสร็จ',
    fit: 'สแกนใบเสร็จ/ใบกำกับภาษีด้วย OCR แล้วบันทึกค่าใช้จ่าย',
    pros: ['แข็งแรงด้านบัญชี/ภาษีไทย', 'ใช้มือถือสแกนได้', 'เหมาะงานเอกสารธุรกิจ'],
    cons: ['ไม่ได้เน้นตรวจสลิปโอนเงินจากลูกค้าใน LINE', 'workflow เป็นบัญชีมากกว่ารับชำระเงิน'],
    customers: 'SME, นักบัญชี, e-commerce ที่ต้องออกเอกสาร',
    src: 'S14,S15',
  },
  {
    name: 'PEAK Connect',
    market: 'ไทย',
    type: 'บัญชีผ่าน LINE + OCR',
    fit: 'ใช้ LINE ดูรายงาน สร้างเอกสาร และบันทึกค่าใช้จ่ายด้วย OCR',
    pros: ['LINE เป็นช่องทางใช้งาน', 'ครบงานบัญชีไทย', 'เหมาะเจ้าของกิจการและนักบัญชี'],
    cons: ['ไม่ได้โฟกัส slip fraud/duplicate detection', 'เหมาะเอกสารบัญชีมากกว่าสลิปลูกค้า'],
    customers: 'เจ้าของกิจการ, สำนักงานบัญชี, SME ที่ใช้ LINE ทำงาน',
    src: 'S16',
  },
  {
    name: 'iApp Thai Receipt OCR',
    market: 'ไทย',
    type: 'OCR API',
    fit: 'แปลงใบเสร็จ/ใบกำกับภาษีไทยเป็น structured JSON',
    pros: ['รองรับภาษาไทยและเอกสารภาษี', 'เหมาะต่อยอดเป็น engine', 'API ชัดเจน'],
    cons: ['ไม่ได้ verify ธุรกรรมธนาคาร', 'ต้องสร้าง UX/รายงาน/LINE integration เอง'],
    customers: 'developer, accounting SaaS, enterprise automation',
    src: 'S17',
  },
  {
    name: 'SpaceOCR + n8n Workflow',
    market: 'ไทย/โลก',
    type: 'Automation template',
    fit: 'รับสลิปจาก LINE แล้ว OCR เก็บ Google Sheets',
    pros: ['เร็วและต้นทุนต่ำสำหรับ prototype', 'ยืดหยุ่น', 'เหมาะทีม no-code/low-code'],
    cons: ['ความเสถียร/ความปลอดภัย/การตรวจซ้ำต้องออกแบบเอง', 'ไม่ใช่ product สำเร็จรูป'],
    customers: 'ร้านเล็ก, ทีม automation, internal ops',
    src: 'S18',
  },
  {
    name: 'LINE OA Store / LINE Messaging API',
    market: 'ไทย/เอเชีย',
    type: 'Platform ecosystem',
    fit: 'ช่องทางหลักที่ทำให้แอปแบบ Slip-Buu กระจายผ่าน LINE ได้',
    pros: ['ลูกค้าไทยคุ้นเคย', 'Webhook รับรูปและข้อความได้', 'OA Store ช่วย discovery'],
    cons: ['ต้องผ่านกติกา LINE และข้อจำกัด message/API', 'ไม่ใช่ระบบตรวจสลิปเอง'],
    customers: 'ทุกธุรกิจที่ใช้ LINE OA, developer, agency',
    src: 'S19,S20',
  },
  {
    name: 'Expensify',
    market: 'โลก',
    type: 'Expense management + OCR',
    fit: 'ถ่ายรูปใบเสร็จแล้ว SmartScan สร้าง expense/match บัตร/ทำ report',
    pros: ['UX ดีสำหรับพนักงานเดินทาง', 'workflow อนุมัติ/เบิกจ่ายครบ', 'มีฐานผู้ใช้ทั่วโลก'],
    cons: ['ไม่ได้ตรวจสลิปธนาคารไทย', 'เน้น expense reimbursement มากกว่ารายรับร้านค้า'],
    customers: 'SMB, freelancer, corporate travel team',
    src: 'S22',
  },
  {
    name: 'SAP Concur ExpenseIt',
    market: 'โลก',
    type: 'Enterprise expense suite',
    fit: 'OCR ใบเสร็จ สร้าง claim จับคู่บัตร และ workflow อนุมัติ',
    pros: ['enterprise governance แข็งแรง', 'เหมาะองค์กรใหญ่', 'เชื่อม policy/approval/audit'],
    cons: ['หนักและแพงสำหรับร้านเล็ก', 'custom ไทย/LINE ไม่ใช่จุดขายหลัก'],
    customers: 'องค์กรขนาดกลาง-ใหญ่, finance/procurement team',
    src: 'S23',
  },
  {
    name: 'Zoho Expense',
    market: 'โลก',
    type: 'Expense reports + autoscan',
    fit: 'Autoscan ใบเสร็จหลายภาษา สร้าง expense/report/trip approval',
    pros: ['ราคาเข้าถึงง่าย', 'multi-language', 'อยู่ใน ecosystem Zoho'],
    cons: ['ตลาดไทยต้องปรับภาษี/เอกสารเอง', 'ไม่ใช่ slip verification จากธนาคาร'],
    customers: 'SMB, startup, บริษัทที่ใช้ Zoho อยู่แล้ว',
    src: 'S24',
  },
  {
    name: 'Dext',
    market: 'โลก',
    type: 'Bookkeeping automation',
    fit: 'ถ่าย/อัปโหลด/อีเมล receipt & invoice แล้ว extract เข้า accounting',
    pros: ['ดีมากด้าน bookkeeping', 'รองรับหลายช่องทางนำเข้า', 'sync accounting software'],
    cons: ['ไม่ได้เป็น LINE/social payment flow', 'ราคาและ workflow เหมาะนักบัญชีมากกว่า seller เล็ก'],
    customers: 'สำนักงานบัญชี, bookkeeper, SMB finance teams',
    src: 'S25',
  },
  {
    name: 'QuickBooks Receipt Scanner',
    market: 'โลก',
    type: 'Accounting + receipt OCR',
    fit: 'OCR อ่านยอด/วันที่/ร้านค้า แล้วจัดหมวด expense ใน QuickBooks',
    pros: ['ผูกบัญชีและภาษีแน่น', 'เหมาะผู้ใช้ QuickBooks เดิม', 'mobile workflow ง่าย'],
    cons: ['ไม่เหมาะกับ PromptPay slip fraud', 'localized Thai accounting ไม่ใช่แกนหลัก'],
    customers: 'ธุรกิจเล็กในตลาด QuickBooks, freelancer, accountant',
    src: 'S26',
  },
  {
    name: 'Xero / Hubdoc',
    market: 'โลก',
    type: 'Accounting document capture',
    fit: 'ถ่าย/อีเมล/สแกน bills & receipts แล้ว extract ส่งเข้า Xero/QuickBooks',
    pros: ['เอกสารเป็นระเบียบ', 'bank feed matching', 'เหมาะ paperless accounting'],
    cons: ['ไม่ได้ตอบโจทย์แชท LINE และตรวจสลิปธนาคารไทย', 'ต้องอยู่ใน ecosystem accounting'],
    customers: 'SMB, accountant, bookkeeper, Xero users',
    src: 'S27',
  },
  {
    name: 'Veryfi',
    market: 'โลก',
    type: 'Document AI / OCR API',
    fit: 'Receipt OCR API คืน structured JSON รองรับหลายภาษา/รูปแบบ',
    pros: ['เหมาะสร้าง product ต่อ', 'เร็วและเน้น security/compliance', 'อ่าน line item ได้'],
    cons: ['ไม่ใช่ UI สำเร็จรูปสำหรับ LINE', 'ต้องทำ fraud logic และ local bank verification เอง'],
    customers: 'developer, fintech, expense platform, enterprise automation',
    src: 'S28',
  },
  {
    name: 'Klippa',
    market: 'ยุโรป/โลก',
    type: 'Receipt OCR / IDP',
    fit: 'OCR เอกสารการเงินและใบเสร็จเพื่อ automation/approval/archive',
    pros: ['รองรับไฟล์หลายชนิด', 'เหมาะ enterprise document workflow', 'มี API/SDK'],
    cons: ['ไม่ใช่ไทย bank slip specialist', 'ต้อง localize ภาษา/รูปแบบ/PromptPay เพิ่ม'],
    customers: 'enterprise, finance ops, developer ที่ต้องการ IDP',
    src: 'S29',
  },
  {
    name: 'Wave Receipts',
    market: 'อเมริกาเหนือ',
    type: 'Small business accounting + receipt OCR',
    fit: 'สแกน receipt ไม่จำกัดและดึงข้อมูลเข้า bookkeeping',
    pros: ['เหมาะธุรกิจเล็กมาก', 'ผูกบัญชี/ใบแจ้งหนี้', 'ใช้งานง่าย'],
    cons: ['ตลาด/ภาษีเน้น US/Canada', 'ไม่เกี่ยวกับ LINE หรือสลิปโอนเงินไทย'],
    customers: 'freelancer, sole proprietor, small business',
    src: 'S30',
  },
  {
    name: 'Shoeboxed',
    market: 'โลก/US',
    type: 'Receipt scanning + human verification',
    fit: 'ถ่ายรูปหรือส่งซองเอกสารจริงให้สแกน OCR/จัดหมวด/ทำรายงาน',
    pros: ['เด่นเรื่องเอกสารกระดาษจำนวนมาก', 'มี human-verified data', 'tax-ready categories'],
    cons: ['ไม่ใช่ real-time slip verification', 'รูปแบบบริการไม่เหมาะกับร้านออนไลน์ไทยที่ต้องรู้ผลทันที'],
    customers: 'small business, accountant, freelancer ที่มีใบเสร็จกระดาษเยอะ',
    src: 'S31',
  },
];

function addTitle(slide, title, subtitle) {
  slide.addText(title, { x: 0.55, y: 0.35, w: 8.7, h: 0.35, fontFace: 'Aptos Display', fontSize: 20, bold: true, color: C.ink, margin: 0 });
  if (subtitle) slide.addText(subtitle, { x: 0.56, y: 0.75, w: 10.7, h: 0.26, fontSize: 8.8, color: C.muted, margin: 0 });
  slide.addShape(pptx.ShapeType.line, { x: 0.55, y: 1.08, w: 12.2, h: 0, line: { color: C.line, width: 1 } });
}

function addFooter(slide, text = 'Slip-Buu competitor research | July 2026') {
  slide.addText(text, { x: 0.55, y: 7.17, w: 9.0, h: 0.16, fontSize: 6.5, color: '94A3B8', margin: 0 });
}

function bulletText(items) {
  return items.map((t) => ({ text: t, options: { bullet: { type: 'ul' } } }));
}

function card(slide, x, y, w, h, app, idx) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h,
    rectRadius: 0.08,
    fill: { color: C.white },
    line: { color: C.line, width: 0.8 },
  });
  slide.addText(`${idx}. ${app.name}`, { x: x + 0.18, y: y + 0.14, w: w - 0.36, h: 0.25, fontSize: 12.5, bold: true, color: C.ink, margin: 0 });
  slide.addText(`${app.market} | ${app.type}`, { x: x + 0.18, y: y + 0.43, w: w - 0.36, h: 0.22, fontSize: 7.2, color: C.blue, bold: true, margin: 0 });
  slide.addText(app.fit, { x: x + 0.18, y: y + 0.72, w: w - 0.36, h: 0.43, fontSize: 7.6, color: C.dark, fit: 'shrink', margin: 0.02, breakLine: false });
  slide.addText('ข้อดี', { x: x + 0.18, y: y + 1.19, w: 0.45, h: 0.16, fontSize: 7.2, bold: true, color: C.green, margin: 0 });
  slide.addText(bulletText(app.pros), { x: x + 0.65, y: y + 1.17, w: w - 0.82, h: 0.52, fontSize: 6.8, color: C.ink, fit: 'shrink', margin: 0.02, breakLine: false, paraSpaceAfterPt: 1 });
  slide.addText('ข้อเสีย', { x: x + 0.18, y: y + 1.75, w: 0.52, h: 0.16, fontSize: 7.2, bold: true, color: C.red, margin: 0 });
  slide.addText(bulletText(app.cons), { x: x + 0.72, y: y + 1.73, w: w - 0.88, h: 0.44, fontSize: 6.8, color: C.ink, fit: 'shrink', margin: 0.02, paraSpaceAfterPt: 1 });
  slide.addText('ลูกค้า', { x: x + 0.18, y: y + 2.26, w: 0.52, h: 0.16, fontSize: 7.2, bold: true, color: C.amber, margin: 0 });
  slide.addText(app.customers, { x: x + 0.72, y: y + 2.24, w: w - 0.92, h: 0.35, fontSize: 6.9, color: C.ink, fit: 'shrink', margin: 0.02 });
  slide.addText(app.src, { x: x + w - 0.62, y: y + h - 0.22, w: 0.47, h: 0.12, fontSize: 5.7, color: '94A3B8', align: 'right', margin: 0 });
}

function table(slide, rows, x, y, w, h, colW) {
  slide.addTable(rows, {
    x, y, w, h,
    colW,
    border: { type: 'solid', color: C.line, pt: 0.6 },
    margin: 0.04,
    fontSize: 7.4,
    color: C.ink,
    valign: 'mid',
    fit: 'shrink',
    autoFit: false,
  });
}

{
  const slide = pptx.addSlide();
  slide.background = { color: C.pale };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.pale }, line: { color: C.pale } });
  slide.addText('Slip-Buu', { x: 0.7, y: 0.65, w: 4.6, h: 0.52, fontFace: 'Aptos Display', fontSize: 31, bold: true, color: C.ink, margin: 0 });
  slide.addText('Competitor Research', { x: 0.72, y: 1.24, w: 5.3, h: 0.35, fontSize: 16, bold: true, color: C.teal, margin: 0 });
  slide.addText('ศึกษาแอป/บริการที่ทำงานใกล้เคียง: ตรวจสลิปโอนเงิน, OCR เอกสารการเงิน, LINE/social commerce และ expense automation', {
    x: 0.72, y: 1.8, w: 6.6, h: 0.6, fontSize: 12, color: C.dark, fit: 'shrink', margin: 0,
  });
  slide.addShape(pptx.ShapeType.roundRect, { x: 7.75, y: 0.8, w: 4.65, h: 5.7, rectRadius: 0.08, fill: { color: C.white }, line: { color: C.line } });
  slide.addText('Scope', { x: 8.1, y: 1.15, w: 3.8, h: 0.3, fontSize: 16, bold: true, color: C.ink, margin: 0 });
  slide.addText(bulletText([
    'รวม 24 แอป/บริการทั่วโลก โดยเน้นไทยก่อน',
    'ดูข้อดี ข้อเสีย กลุ่มลูกค้า และช่องว่างเชิงกลยุทธ์',
    'เทียบจากมุม Slip-Buu: LINE LIFF + OCR + duplicate + report',
    'ข้อมูลอ้างอิงจากหน้า official docs/เว็บไซต์/marketplace ณ 8 ก.ค. 2026',
  ]), { x: 8.08, y: 1.62, w: 3.95, h: 2.2, fontSize: 10.5, color: C.dark, breakLine: false, margin: 0.02, paraSpaceAfterPt: 8 });
  slide.addText('Output: downloadable .pptx', { x: 8.1, y: 5.72, w: 3.8, h: 0.25, fontSize: 9, color: C.muted, margin: 0 });
  addFooter(slide);
}

{
  const slide = pptx.addSlide();
  addTitle(slide, 'นิยามคู่แข่งของ Slip-Buu', 'ไม่ใช่แค่ “แอปตรวจสลิป” แต่คือทุกเครื่องมือที่ลดงานหลังการรับโอนเงิน/บันทึกเอกสารการเงิน');
  const boxes = [
    ['Direct slip verification', 'SlipOK, EasySlip, Slip2Go, CheckSlips, bank APIs', 'ตรวจจริง-ปลอม, duplicate, ตรวจยอด/บัญชีรับเงิน'],
    ['Social commerce ops', 'Page365, ZORT, Oho Chat, Shipnity', 'รวมแชท, เปิดบิล, รับชำระ, shipping, stock'],
    ['Accounting/receipt OCR', 'FlowAccount, PEAK, iApp, global OCR apps', 'บันทึกบัญชี, ภาษี, expense report, archive'],
    ['Platform layer', 'LINE OA, Messaging API, PromptPay ecosystem', 'ช่องทางลูกค้าและโครงสร้าง payment ในไทย'],
  ];
  boxes.forEach((b, i) => {
    const x = 0.7 + (i % 2) * 6.1;
    const y = 1.45 + Math.floor(i / 2) * 2.25;
    slide.addShape(pptx.ShapeType.roundRect, { x, y, w: 5.65, h: 1.65, rectRadius: 0.08, fill: { color: C.white }, line: { color: C.line } });
    slide.addText(b[0], { x: x + 0.22, y: y + 0.18, w: 4.9, h: 0.23, fontSize: 13.5, bold: true, color: C.ink, margin: 0 });
    slide.addText(b[1], { x: x + 0.22, y: y + 0.54, w: 4.95, h: 0.3, fontSize: 8.6, color: C.blue, fit: 'shrink', margin: 0 });
    slide.addText(b[2], { x: x + 0.22, y: y + 0.94, w: 4.95, h: 0.35, fontSize: 8.8, color: C.dark, fit: 'shrink', margin: 0 });
  });
  addFooter(slide, 'Sources include S1-S21 and app official documentation listed at the end.');
}

{
  const slide = pptx.addSlide();
  addTitle(slide, 'สรุปตลาดแบบเร็ว', 'ไทยมีคู่แข่งตรงด้าน verification เยอะ แต่ยังมีช่องว่างเรื่อง “ผู้ใช้ปลายทางบน LINE + รายงานการเงินส่วนตัว/ร้านเล็ก”');
  const rows = [
    [
      { text: 'กลุ่ม', options: { bold: true, fill: { color: 'E2E8F0' } } },
      { text: 'จุดแข็งตลาด', options: { bold: true, fill: { color: 'E2E8F0' } } },
      { text: 'ช่องว่างสำหรับ Slip-Buu', options: { bold: true, fill: { color: 'E2E8F0' } } },
    ],
    ['Slip verification ไทย', 'เร็ว, ตรวจซ้ำ, อ่าน QR, ผูกบัญชีรับเงิน', 'หลายรายเป็น API/บอท ยังไม่เน้น UX รายรับ-รายจ่ายส่วนตัวใน LIFF'],
    ['Social commerce', 'ครบ order, stock, shipping, multi-admin', 'ซับซ้อน/เกินความจำเป็นสำหรับคนที่อยากแค่เก็บสลิปและดูรายงาน'],
    ['Accounting OCR ไทย', 'บัญชี/ภาษีไทยแข็งแรง', 'โฟกัสใบเสร็จ/ใบกำกับภาษี ไม่ใช่สลิปโอนลูกค้าแบบ real-time'],
    ['Global expense OCR', 'OCR, approval, reimbursement, accounting sync ดีมาก', 'ไม่เข้าใจ PromptPay/LINE/ธนาคารไทยโดยตรง'],
  ];
  table(slide, rows, 0.7, 1.45, 11.95, 4.25, [2.25, 4.35, 5.35]);
  slide.addText('Takeaway', { x: 0.75, y: 6.05, w: 1.1, h: 0.2, fontSize: 11.5, bold: true, color: C.teal, margin: 0 });
  slide.addText('ตำแหน่งที่น่าสนใจคือ “LINE-native finance notebook for Thai transfers”: ตรวจ/อ่าน/กันซ้ำ/สรุปเงินเข้าออก โดยไม่ต้องย้ายไปใช้ระบบร้านค้าใหญ่เต็มชุด', {
    x: 1.72, y: 6.03, w: 10.8, h: 0.35, fontSize: 10, color: C.dark, fit: 'shrink', margin: 0,
  });
  addFooter(slide);
}

for (let i = 0; i < apps.length; i += 3) {
  const slide = pptx.addSlide();
  const page = Math.floor(i / 3) + 1;
  addTitle(slide, `แอปคู่แข่งและบริการใกล้เคียง (${page}/8)`, 'แต่ละการ์ดสรุปความใกล้เคียงกับ Slip-Buu, ข้อดี, ข้อเสีย และลูกค้าหลัก');
  [0, 1, 2].forEach((offset) => {
    if (apps[i + offset]) card(slide, 0.55 + offset * 4.25, 1.35, 3.95, 5.35, apps[i + offset], i + offset + 1);
  });
  addFooter(slide);
}

{
  const slide = pptx.addSlide();
  addTitle(slide, 'แผนที่ตำแหน่งการแข่งขัน', 'มองตามแกน “LINE/social native” และ “ความลึกด้านบัญชี/automation”');
  const rows = [
    [
      { text: 'ตำแหน่ง', options: { bold: true, fill: { color: 'E2E8F0' } } },
      { text: 'ผู้เล่น', options: { bold: true, fill: { color: 'E2E8F0' } } },
      { text: 'ความหมายเชิงกลยุทธ์', options: { bold: true, fill: { color: 'E2E8F0' } } },
    ],
    ['LINE-native + verify', 'SlipOK, Slip2Go, Oho Chat+SlipOK', 'แข่งตรงที่สุด ต้องชนะด้วย UX เฉพาะงาน, insight, ราคา, และความง่าย'],
    ['API-first verification', 'EasySlip, CheckSlips, KBank, Bangkok Bank', 'เป็น supplier/คู่แข่งเชิงเทคนิค ควรเลือกว่าจะ build เองหรือเชื่อมเพื่อความน่าเชื่อถือ'],
    ['Commerce platform', 'Page365, ZORT, Shipnity', 'ไม่ได้ชนทุก use case แต่ดูดลูกค้าร้านค้าที่ต้องการระบบครบวงจร'],
    ['Accounting-first OCR', 'FlowAccount, PEAK, Dext, Xero/Hubdoc', 'แข็งแรงด้านบัญชี ใช้เป็น benchmark เรื่อง export, category, tax, audit trail'],
    ['Global OCR/API', 'Veryfi, Klippa, iApp', 'เป็น benchmark เรื่อง structured output, confidence, API reliability, security'],
  ];
  table(slide, rows, 0.65, 1.36, 12.05, 4.9, [2.55, 3.75, 5.75]);
  addFooter(slide);
}

{
  const slide = pptx.addSlide();
  addTitle(slide, 'กลุ่มลูกค้าเป้าหมายที่พบจากคู่แข่ง', 'ใช้เพื่อเลือก positioning และ pricing ของ Slip-Buu');
  const rows = [
    ['ร้านเล็ก/แม่ค้าออนไลน์', 'ต้องการตรวจสลิปเร็ว ไม่อยากเปิดระบบใหญ่', 'SlipOK, Slip2Go, Slip-Buu'],
    ['ทีมแอดมิน LINE OA', 'ต้องการลด manual check และตอบลูกค้าเร็ว', 'Oho Chat, Page365, ZORT, Slip-Buu'],
    ['ร้าน e-commerce โตแล้ว', 'ต้องการ order-stock-shipping-accounting', 'Page365, ZORT, Shipnity'],
    ['เจ้าของกิจการ/นักบัญชี', 'ต้องการบัญชี ภาษี เอกสาร ตรวจสอบย้อนหลัง', 'FlowAccount, PEAK, Dext, Xero'],
    ['Developer/SaaS/enterprise', 'ต้องการ API เชื่อมระบบเอง', 'EasySlip, CheckSlips, Veryfi, Klippa, iApp, Bank APIs'],
    ['คนใช้ส่วนตัว/creator/freelancer', 'อยากบันทึกรายรับรายจ่ายจากสลิปแบบเบา', 'ช่องว่างที่ Slip-Buu ทำได้ดี'],
  ];
  const pptRows = [
    [
      { text: 'Segment', options: { bold: true, fill: { color: 'E2E8F0' } } },
      { text: 'Pain point', options: { bold: true, fill: { color: 'E2E8F0' } } },
      { text: 'ผู้เล่น/โอกาส', options: { bold: true, fill: { color: 'E2E8F0' } } },
    ],
    ...rows,
  ];
  table(slide, pptRows, 0.7, 1.35, 11.95, 5.05, [2.5, 4.65, 4.8]);
  addFooter(slide);
}

{
  const slide = pptx.addSlide();
  addTitle(slide, 'ข้อดี-ข้อเสียของตลาดโดยรวม', 'มองจากสิ่งที่คู่แข่งทำได้ดีและสิ่งที่ยังเหลือให้ Slip-Buu เล่น');
  const left = [
    'ไทยมี infrastructure ตรวจสลิปและ PromptPay แข็งแรง',
    'LINE เป็นช่องทางที่ผู้ใช้ไทยคุ้นเคยมาก',
    'คู่แข่ง API มีฟีเจอร์ duplicate/account matching เป็น baseline แล้ว',
    'global OCR เป็น benchmark ด้าน structured data และ workflow อนุมัติ',
  ];
  const right = [
    'หลายตัวแก้แค่ verify แต่ไม่ช่วยให้ผู้ใช้เห็นภาพการเงินต่อ',
    'social commerce platform ครบแต่หนักสำหรับร้านเล็ก/คนใช้ส่วนตัว',
    'accounting tools เก่งภาษี แต่ไม่ real-time ในแชทลูกค้า',
    'โอกาส differentiation อยู่ที่ insight, category, budget, report, personal UX',
  ];
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 1.5, w: 5.55, h: 4.6, rectRadius: 0.08, fill: { color: 'ECFDF5' }, line: { color: 'BBF7D0' } });
  slide.addText('สิ่งที่ตลาดพิสูจน์แล้ว', { x: 1.1, y: 1.85, w: 4.8, h: 0.3, fontSize: 15, bold: true, color: C.green, margin: 0 });
  slide.addText(bulletText(left), { x: 1.1, y: 2.35, w: 4.75, h: 2.6, fontSize: 11, color: C.dark, margin: 0.02, breakLine: false, paraSpaceAfterPt: 8 });
  slide.addShape(pptx.ShapeType.roundRect, { x: 6.95, y: 1.5, w: 5.55, h: 4.6, rectRadius: 0.08, fill: { color: 'FFF7ED' }, line: { color: 'FED7AA' } });
  slide.addText('ช่องว่างที่ยังน่าลงมือ', { x: 7.25, y: 1.85, w: 4.8, h: 0.3, fontSize: 15, bold: true, color: C.amber, margin: 0 });
  slide.addText(bulletText(right), { x: 7.25, y: 2.35, w: 4.75, h: 2.6, fontSize: 11, color: C.dark, margin: 0.02, breakLine: false, paraSpaceAfterPt: 8 });
  addFooter(slide);
}

{
  const slide = pptx.addSlide();
  addTitle(slide, 'คำแนะนำ positioning สำหรับ Slip-Buu', 'หลีกเลี่ยงการชนแบบ feature-for-feature กับ API ตรวจสลิปอย่างเดียว');
  const points = [
    ['1. ชนะด้วย LINE UX', 'เปิดจาก Rich Menu, อัปหลายสลิป, แก้ข้อมูลง่าย, สรุปทันทีในแชท/LIFF'],
    ['2. ทำมากกว่า verify', 'แยก income/expense, category, note, report, budget/goal, export PDF/Excel'],
    ['3. เพิ่ม trust layer', 'QR decode + OCR + hash + reference duplicate + account/amount matching เมื่อพร้อม'],
    ['4. เจาะร้านเล็กและ creator', 'กลุ่มที่ไม่อยากใช้ Page365/ZORT แต่ต้องการหลักฐานและรายงานแบบมืออาชีพ'],
    ['5. เปิด API/partner ภายหลัง', 'เมื่อฐานผู้ใช้ชัด ค่อยต่อยอด WooCommerce, Google Sheets, accounting export'],
  ];
  points.forEach((p, i) => {
    const y = 1.35 + i * 0.95;
    slide.addShape(pptx.ShapeType.roundRect, { x: 0.8, y, w: 11.75, h: 0.68, rectRadius: 0.06, fill: { color: i % 2 ? 'F8FAFC' : C.white }, line: { color: C.line } });
    slide.addText(p[0], { x: 1.05, y: y + 0.18, w: 2.7, h: 0.21, fontSize: 11.2, bold: true, color: C.teal, margin: 0 });
    slide.addText(p[1], { x: 3.85, y: y + 0.17, w: 8.25, h: 0.25, fontSize: 9.4, color: C.dark, fit: 'shrink', margin: 0 });
  });
  addFooter(slide);
}

{
  const slide = pptx.addSlide();
  addTitle(slide, 'Feature roadmap ที่ควรพิจารณา', 'จัดลำดับจากสิ่งที่สร้างความต่างและลดความเสี่ยงการแข่งขัน');
  const rows = [
    [
      { text: 'Priority', options: { bold: true, fill: { color: 'E2E8F0' } } },
      { text: 'Feature', options: { bold: true, fill: { color: 'E2E8F0' } } },
      { text: 'เหตุผล', options: { bold: true, fill: { color: 'E2E8F0' } } },
    ],
    ['P0', 'QR payload decode + reference duplicate', 'เป็น baseline ของตลาดตรวจสลิปไทย ต้องกันสลิปซ้ำ/เวียนให้ชัด'],
    ['P0', 'Account/amount matching', 'ช่วยร้านค้าเช็กว่าปลายทางและยอดตรงกับที่คาดไว้'],
    ['P1', 'Smart category + note assistant', 'ทำให้ Slip-Buu ต่างจาก verify-only และช่วยสร้างรายงานมีความหมาย'],
    ['P1', 'Daily/monthly LINE summary', 'เหมาะกับ LINE-native habit และสร้าง retention'],
    ['P1', 'Google Sheets / Excel / accounting export', 'เชื่อม workflow ของร้านเล็กและนักบัญชี'],
    ['P2', 'Team/admin mode', 'ขยายจากผู้ใช้เดี่ยวไปทีมร้านค้า โดยไม่ต้องกลายเป็น Page365 ทั้งระบบ'],
  ];
  table(slide, rows, 0.8, 1.35, 11.7, 5.05, [1.15, 3.65, 6.9]);
  addFooter(slide);
}

{
  const slide = pptx.addSlide();
  addTitle(slide, 'แหล่งอ้างอิง (1/2)', 'รหัส S ใช้อ้างในสไลด์การ์ดของแต่ละแอป');
  const rows = [
    [
      { text: 'ID', options: { bold: true, fill: { color: 'E2E8F0' } } },
      { text: 'Source', options: { bold: true, fill: { color: 'E2E8F0' } } },
      { text: 'URL', options: { bold: true, fill: { color: 'E2E8F0' } } },
    ],
    ...sources.slice(0, 16).map((s, i) => [`S${i + 1}`, s[0], s[1]]),
  ];
  table(slide, rows, 0.5, 1.25, 12.35, 5.9, [0.55, 3.0, 8.8]);
  addFooter(slide);
}

{
  const slide = pptx.addSlide();
  addTitle(slide, 'แหล่งอ้างอิง (2/2)', 'ข้อมูลสืบค้นจาก official websites/docs และ marketplace pages เท่าที่เปิดเผยต่อสาธารณะ');
  const rows = [
    [
      { text: 'ID', options: { bold: true, fill: { color: 'E2E8F0' } } },
      { text: 'Source', options: { bold: true, fill: { color: 'E2E8F0' } } },
      { text: 'URL', options: { bold: true, fill: { color: 'E2E8F0' } } },
    ],
    ...sources.slice(16).map((s, i) => [`S${i + 17}`, s[0], s[1]]),
  ];
  table(slide, rows, 0.5, 1.25, 12.35, 5.9, [0.55, 3.0, 8.8]);
  addFooter(slide);
}

const out = path.join(outDir, 'Slip-Buu-Competitor-Research.pptx');
await pptx.writeFile({ fileName: out });
console.log(out);
