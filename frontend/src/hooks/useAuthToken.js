import { useCallback, useState } from 'react'

const STORAGE_KEY = 'authToken'

function useAuthToken() {
  const [token, setTokenState] = useState(() => localStorage.getItem(STORAGE_KEY) || '')

  const setToken = useCallback((value) => {
    setTokenState(value)
    if (value) {
      localStorage.setItem(STORAGE_KEY, value)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  return [token, setToken]
}

export default useAuthToken
