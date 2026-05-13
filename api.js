export async function apiFetch(url, options = {}, navigate) {
  const response = await fetch(url, {
    ...options,
    credentials: "include", // ← cookie otomatis dikirim, hapus Authorization header
  })

  if (response.status === 401 || response.status === 403) {
    navigate("/admin-login")
    return null
  }

  return response
}