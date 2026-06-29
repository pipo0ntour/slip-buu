// แมป "ลักษณะใบหน้า" (จาก backend /api/avatar/analyze) → อวตารการ์ตูน DiceBear (สไตล์ avataaars)
// ค่าตัวเลือกทั้งหมดอ้างอิงจาก schema ของ avataaars (node_modules/@dicebear/avataaars/lib/schema.js)
import { createAvatar } from '@dicebear/core'
// นำเข้าสไตล์เดียวตรง ๆ (ไม่ผ่าน @dicebear/collection ที่ดึงทุกสไตล์มา) — bundle เล็กกว่า
import * as avataaars from '@dicebear/avataaars'

// โทนผิว → hex ผิวจริง (ไล่อ่อน→เข้ม, เลี่ยงโทนเหลือง/ส้มที่ไม่เป็นธรรมชาติ)
const SKIN = {
  fair: 'ffdbb4',
  light: 'edb98a',
  medium: 'd08b5b',
  tan: 'ae5d29',
  brown: 'ae5d29',
  dark: '614335',
}

// สีผม → hex (dyed = สีแฟชั่นชมพู เป็นลูกเล่น)
const HAIR = {
  black: '2c1b18',
  darkBrown: '4a312c',
  brown: '724133',
  blonde: 'd6b370',
  auburn: 'a55728',
  red: 'c93305',
  gray: 'e8e1e1',
  white: 'ecdcbf',
  dyed: 'f59797',
}

// เลือกทรงผม/สิ่งสวมหัว (top) จาก ความยาว + ลักษณะ + ของสวมหัว
// คืน { top:[..], prob } — prob 0 = หัวล้าน (ไม่ render ชั้นผม)
function pickTop(face) {
  if (face.headwear === 'hijab' || face.hairStyle === 'covered') return { top: ['hijab'], prob: 100 }
  if (face.headwear === 'hat') return { top: ['winterHat02'], prob: 100 }
  if (face.hairLength === 'bald') return { top: ['shortFlat'], prob: 0 }
  if (face.hairStyle === 'bun') return { top: ['bun'], prob: 100 }
  if (face.hairStyle === 'ponytail') return { top: ['straightAndStrand'], prob: 100 }
  if (face.hairStyle === 'coily') return { top: ['fro'], prob: 100 }

  const table = {
    short: { straight: 'shortFlat', wavy: 'shortWaved', curly: 'shortCurly' },
    medium: { straight: 'straight01', wavy: 'curvy', curly: 'curly' },
    long: { straight: 'straight02', wavy: 'longButNotTooLong', curly: 'frizzle' },
  }
  const top = table[face.hairLength]?.[face.hairStyle] || 'shortFlat'
  return { top: [top], prob: 100 }
}

// "ลุค" ที่สลับได้ด้วยปุ่ม "เปลี่ยนเป็นตัวอื่น" — เปลี่ยนเฉพาะของนอกหน้า (พื้นหลัง/เสื้อ/สีเสื้อ/คิ้ว)
// โดยคงเอกลักษณ์ (ผิว/สีผม/ทรงผม/แว่น/หนวด) ไว้ → ยังดูเป็นคนเดิม แค่ลุคต่างออกไป
// pool ความยาวต่างกัน → แต่ละ variant ได้คอมโบไม่ซ้ำหลายแบบ
const BG_POOL = ['d8f3ee', 'c6f0e4', 'd6f5d6', 'ffe9c7', 'e3e9ff', 'ffd9e8', 'fde2c0']
const CLOTHING_POOL = ['shirtCrewNeck', 'shirtScoopNeck', 'shirtVNeck', 'hoodie', 'collarAndSweater', 'blazerAndShirt', 'overall']
const CLOTHES_COLOR_POOL = ['14b8a6', '3b82f6', 'f59e0b', 'ef4444', '8b5cf6', '0ea5e9', 'ec4899']
const EYEBROWS_POOL = ['defaultNatural', 'default', 'flatNatural', 'raisedExcitedNatural', 'upDownNatural']

// ลักษณะ → ชุด options ของ avataaars (พินค่าเป็น array เดี่ยว ๆ ให้ผลคงที่ ไม่สุ่มตาม seed)
// face.variant = เลขลุค (กดปุ่มเปลี่ยน → +1) ค่าเริ่ม 0; ของเก่าที่ไม่มี variant = 0 (เหมือนเดิม)
function buildOptions(face) {
  const hair = HAIR[face.hairColor] || HAIR.black
  const top = pickTop(face)
  const v = Number.isFinite(face.variant) ? Math.max(0, Math.floor(face.variant)) : 0

  return {
    seed: `slipbuu-${v}`,
    backgroundColor: [BG_POOL[v % BG_POOL.length]],
    radius: 50,
    skinColor: [SKIN[face.skinTone] || SKIN.light],
    hairColor: [hair],
    facialHairColor: [hair],
    eyebrows: [EYEBROWS_POOL[v % EYEBROWS_POOL.length]],
    clothing: [CLOTHING_POOL[v % CLOTHING_POOL.length]],
    clothesColor: [CLOTHES_COLOR_POOL[v % CLOTHES_COLOR_POOL.length]],
    top: top.top,
    topProbability: top.prob,
    accessories: ['prescription02'],
    accessoriesProbability: face.glasses ? 100 : 0,
    facialHair: face.facialHair === 'beard' ? ['beardMedium'] : ['moustacheFancy'],
    facialHairProbability: face.facialHair === 'none' ? 0 : 100,
    mouth: face.expression === 'neutral' ? ['default'] : ['smile'],
    eyes: face.expression === 'neutral' ? ['default'] : ['happy'],
  }
}

// SVG (string) ของอวตารจากลักษณะใบหน้า
export function avatarSvg(face) {
  return createAvatar(avataaars, buildOptions(face)).toString()
}

// data URI ใช้กับ <img src=...> ได้เลย
export function avatarDataUri(face) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(avatarSvg(face))}`
}

// อวตารสำเร็จรูป — ให้เลือกได้ทันทีโดยไม่ต้องถ่ายรูป (หลากผิว/ผม/แว่น/หนวด/สีหน้า)
// เลือกตัวไหนแล้วยังปรับ "ลุค" (เสื้อ/พื้นหลัง) ต่อในหน้าพรีวิวได้ (variant 0..5)
export const PRESET_FACES = [
  { skinTone: 'light',  hairColor: 'black',     hairLength: 'short',  hairStyle: 'straight', glasses: false, facialHair: 'none',      headwear: 'none', expression: 'smile',   variant: 0 },
  { skinTone: 'fair',   hairColor: 'blonde',    hairLength: 'long',   hairStyle: 'straight', glasses: false, facialHair: 'none',      headwear: 'none', expression: 'smile',   variant: 1 },
  { skinTone: 'medium', hairColor: 'brown',     hairLength: 'medium', hairStyle: 'wavy',     glasses: true,  facialHair: 'none',      headwear: 'none', expression: 'smile',   variant: 2 },
  { skinTone: 'tan',    hairColor: 'darkBrown', hairLength: 'short',  hairStyle: 'curly',    glasses: false, facialHair: 'beard',     headwear: 'none', expression: 'neutral', variant: 3 },
  { skinTone: 'brown',  hairColor: 'black',     hairLength: 'short',  hairStyle: 'coily',    glasses: false, facialHair: 'none',      headwear: 'none', expression: 'smile',   variant: 4 },
  { skinTone: 'light',  hairColor: 'dyed',      hairLength: 'medium', hairStyle: 'bun',      glasses: false, facialHair: 'none',      headwear: 'none', expression: 'smile',   variant: 5 },
  { skinTone: 'dark',   hairColor: 'black',     hairLength: 'long',   hairStyle: 'ponytail', glasses: false, facialHair: 'none',      headwear: 'none', expression: 'smile',   variant: 0 },
  { skinTone: 'fair',   hairColor: 'brown',     hairLength: 'medium', hairStyle: 'straight', glasses: true,  facialHair: 'none',      headwear: 'none', expression: 'neutral', variant: 1 },
  { skinTone: 'medium', hairColor: 'black',     hairLength: 'short',  hairStyle: 'wavy',     glasses: false, facialHair: 'moustache', headwear: 'none', expression: 'smile',   variant: 2 },
]

// หมายเหตุ: ฟังก์ชันเก็บ/โหลดอวตารอยู่ที่ avatarStore.js (แยกไว้ให้ import ได้เบา ๆ ไม่ดึง DiceBear)
