import liff from '@line/liff'

const API_URL = import.meta.env.VITE_API_URL

// แนบ LINE access token ไปทุก request เพื่อให้ backend ยืนยันตัวตน + ดึง line_user_id เองได้
function authHeaders() {
  let token
  try {
    token = liff.getAccessToken?.()
  } catch {
    token = null // liff ยังไม่ init / ยังไม่ login → ปล่อยให้ backend ตอบ 401 แล้วจัดการที่ฝั่ง UI
  }
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function apiGet(path) {
  return fetch(`${API_URL}${path}`, { headers: authHeaders() })
}

export function apiPostForm(path, formData) {
  return fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  })
}

export function apiPostJson(path, body) {
  return fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
}

export function apiPatchJson(path, body) {
  return fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
}

export function apiDelete(path) {
  return fetch(`${API_URL}${path}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
}
