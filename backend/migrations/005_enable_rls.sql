-- Defense-in-depth: เปิด Row Level Security กันการอ่าน/เขียนตารางตรง ๆ ด้วย anon/public key
--
-- ทำไมปลอดภัยกับแอป: backend เชื่อมต่อด้วย service_role key ซึ่งมีสิทธิ์ BYPASSRLS
--   → "ข้าม" RLS อยู่แล้ว แอปทำงานเหมือนเดิมทุกอย่าง (ทุก query ยัง scope ด้วย line_user_id ในโค้ด)
-- ได้อะไรเพิ่ม: ต่อให้ anon key (คีย์ฝั่ง public) หลุด ก็อ่าน/แก้ตาราง slips/users ไม่ได้เลย
--   เพราะ "ไม่สร้าง policy ใด ๆ = ปฏิเสธทุก role ที่ไม่ใช่ service_role" (deny by default)
--
-- ปลอดภัยต่อการรันซ้ำ (idempotent) — รันในหน้า Supabase SQL editor ได้เลย ไม่ต้อง deploy ก่อน

ALTER TABLE slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE slips FORCE  ROW LEVEL SECURITY;   -- บังคับใช้กับ table owner ด้วย (service_role ยัง bypass ได้)

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE  ROW LEVEL SECURITY;
