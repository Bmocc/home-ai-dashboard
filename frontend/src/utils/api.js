export const buildAuthHeaders = (token, headers = {}) => ({
  ...headers,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

export const authFetch = async (url, { token, ...options }) => {
  const response = await fetch(url, {
    ...options,
    headers: buildAuthHeaders(token, options.headers || {}),
  })
  if (response.status === 401) {
    throw new Error('unauthorized')
  }
  return response
}
