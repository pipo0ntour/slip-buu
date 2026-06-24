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

// ลักษณะ → ชุด options ของ avataaars (พินค่าเป็น array เดี่ยว ๆ ให้ผลคงที่ ไม่สุ่มตาม seed)
function buildOptions(face) {
  const hair = HAIR[face.hairColor] || HAIR.black
  const top = pickTop(face)

  return {
    seed: 'slipbuu',
    backgroundColor: ['d8f3ee'], // ฟ้าอมเขียวอ่อน เข้าโทนแบรนด์ teal
    radius: 50,
    skinColor: [SKIN[face.skinTone] || SKIN.light],
    hairColor: [hair],
    facialHairColor: [hair],
    eyebrows: ['defaultNatural'],
    clothing: ['shirtCrewNeck'],
    clothesColor: ['14b8a6'], // teal
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

// หมายเหตุ: ฟังก์ชันเก็บ/โหลดอวตารอยู่ที่ avatarStore.js (แยกไว้ให้ import ได้เบา ๆ ไม่ดึง DiceBear)
