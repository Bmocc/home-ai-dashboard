import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Header from './components/Header'
import StatsRow from './components/StatsRow'
import LiveSnapshot from './components/LiveSnapshot'
import EventsList from './components/EventsList'
import LoginForm from './components/LoginForm'
import UserMenu from './components/UserMenu'
import ConfigModal from './components/ConfigModal'
import useAuthToken from './hooks/useAuthToken'
import { authFetch } from './utils/api'
import { API_BASE_URL } from './config'
import './App.css'

const HEALTH_POLL_INTERVAL_MS = 7000
const SNAPSHOT_REFRESH_INTERVAL_MS = 4000

const getEventKey = (event) => {
  if (!event) {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : String(Math.random())
  }
  return String(event.id ?? `${event.timestamp ?? ''}-${event.source ?? ''}-${event.message ?? ''}`)
}

const mergeEvents = (existing = [], incoming = []) => {
  if (!incoming.length) return existing
  const map = new Map()
  existing.forEach((event) => map.set(getEventKey(event), event))
  incoming.forEach((event) => map.set(getEventKey(event), event))
  return Array.from(map.values())
}

function App() {
  const [token, setToken] = useAuthToken()
  const [username, setUsername] = useState(() => localStorage.getItem('authUser') || '')
  const [profileStatus, setProfileStatus] = useState('')
  const [profileError, setProfileError] = useState('')
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [healthStatus, setHealthStatus] = useState('checking')
  const [events, setEvents] = useState([])
  const [statusMessage, setStatusMessage] = useState('')
  const [eventTone, setEventTone] = useState('success')
  const [isSimulating, setIsSimulating] = useState(false)
  const [isRefreshingHealth, setIsRefreshingHealth] = useState(false)
  const [snapshotSrc, setSnapshotSrc] = useState('')
  const [snapshotReady, setSnapshotReady] = useState(false)
  const [authError, setAuthError] = useState('')
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const messageTimeoutRef = useRef(null)
  const initialLoadRef = useRef(false)

  const healthMeta = useMemo(() => {
    if (healthStatus === 'connected') return { label: 'Connected', tone: 'status-ok' }
    if (healthStatus === 'disconnected') return { label: 'Disconnected', tone: 'status-bad' }
    return { label: 'Checking…', tone: 'status-warn' }
  }, [healthStatus])

  const statCards = useMemo(() => {
    const totalEvents = events.length
    const lastEvent = totalEvents > 0 ? events[totalEvents - 1] : null
    const activeSources = new Set(events.map((event) => event.source)).size
    const lastEventTime = lastEvent
      ? new Date(lastEvent.frameTimestamp || lastEvent.timestamp).toLocaleTimeString()
      : '--'
    const lastSeverity = lastEvent?.severity || '---'

    return [
      {
        label: 'Total Events',
        value: totalEvents.toString().padStart(2, '0'),
        subValue: lastEvent ? `Last at ${lastEventTime}` : 'Waiting for activity',
        accent: 'primary',
      },
      {
        label: 'Active Sources',
        value: activeSources.toString().padStart(2, '0'),
        subValue: lastEvent?.source ? `Latest: ${lastEvent.source}` : 'No sources yet',
        accent: 'secondary',
      },
      {
        label: 'Last Zone',
        value: lastEvent?.zone || '--',
        subValue: `Severity: ${lastSeverity}`,
        accent: 'neutral',
      },
      // {
      //   label: 'Connection',
      //   value: healthMeta.label,
      //   subValue: healthStatus === 'connected' ? 'Streaming live' : 'Reconnecting…',
      //   accent: healthStatus === 'connected' ? 'success' : 'warning',
      // },
    ]
  }, [events, healthMeta.label, healthStatus])

  const handleLogout = useCallback(() => {
    setToken('')
    localStorage.removeItem('authUser')
    setUsername('')
    setEvents([])
    setStatusMessage('')
    setSnapshotSrc('')
    setSnapshotReady(false)
    setProfileStatus('')
    setProfileError('')
  }, [setToken])

  const securedFetch = useCallback(
    async (url, options = {}) => {
      try {
        return await authFetch(url, { token, ...options })
      } catch (error) {
        if (error.message === 'unauthorized') {
          handleLogout()
        }
        throw error
      }
    },
    [handleLogout, token],
  )

  const fetchProfile = useCallback(async () => {
    if (!token) return
    try {
      const response = await securedFetch(`${API_BASE_URL}/api/me`)
      if (!response.ok) return
      const data = await response.json()
      if (data?.username) {
        setUsername(data.username)
        localStorage.setItem('authUser', data.username)
      }
    } catch (error) {
      console.error('Failed to load profile info', error)
    }
  }, [securedFetch, token])

  const fetchHealth = useCallback(
    async (manual = false) => {
      if (!token) return
      if (manual) {
        setIsRefreshingHealth(true)
        setHealthStatus('checking')
      }
      try {
        const response = await securedFetch(`${API_BASE_URL}/api/health`)
        if (!response.ok) throw new Error('Health check failed')
        setHealthStatus('connected')
      } catch (error) {
        console.error('Health check failed', error)
        setHealthStatus('disconnected')
      } finally {
        if (manual) setTimeout(() => setIsRefreshingHealth(false), 200)
      }
    },
    [securedFetch, token],
  )

  const fetchEvents = useCallback(
    async (options = {}) => {
      if (!token) return
      const { forceReplace = false } = options
      try {
        const response = await securedFetch(`${API_BASE_URL}/api/motion-events`)
        if (!response.ok) throw new Error('Could not load events')
        const data = await response.json()
        if (!Array.isArray(data.events)) return
        setEvents((prev) => {
          if (forceReplace || !initialLoadRef.current) return data.events
          return mergeEvents(prev, data.events)
        })
        if (!initialLoadRef.current) initialLoadRef.current = true
      } catch (error) {
        console.error('Failed to load events', error)
      }
    },
    [securedFetch, token],
  )

  useEffect(() => {
    if (!token) return
    fetchProfile()
    fetchHealth()
    fetchEvents()
  }, [token, fetchHealth, fetchEvents, fetchProfile])

  useEffect(() => {
    if (!token) return undefined
    const intervalId = setInterval(() => {
      fetchHealth()
    }, HEALTH_POLL_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [fetchHealth, token])

  useEffect(() => () => messageTimeoutRef.current && clearTimeout(messageTimeoutRef.current), [])

  useEffect(() => {
    if (!token) {
      setSnapshotSrc('')
      return undefined
    }
    const refreshSnapshot = () => {
      setSnapshotReady(false)
      setSnapshotSrc(`${API_BASE_URL}/api/latest-frame?t=${Date.now()}`)
    }
    refreshSnapshot()
    const intervalId = setInterval(refreshSnapshot, SNAPSHOT_REFRESH_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [API_BASE_URL, token])

  const handleSimulateEvent = async () => {
    if (!token) return
    setIsSimulating(true)
    setStatusMessage('')
    try {
      const response = await securedFetch(`${API_BASE_URL}/api/motion-events/simulate`, { method: 'POST' })
      if (!response.ok) throw new Error('Simulation failed')
      setEventTone('success')
      setStatusMessage('Simulated motion event added.')
      await fetchEvents({ forceReplace: true })
    } catch (error) {
      console.error('Simulation error', error)
      setEventTone('error')
      setStatusMessage('Unable to create a simulated event. Try again.')
    } finally {
      setIsSimulating(false)
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current)
      messageTimeoutRef.current = setTimeout(() => setStatusMessage(''), 4000)
    }
  }

  useEffect(() => {
    if (!token) return undefined
    const wsUrl = (() => {
      try {
        const url = new URL(API_BASE_URL)
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
        const currentPath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname
        url.pathname = `${currentPath || ''}/ws`
        return url.toString()
      } catch (error) {
        console.error('Unable to construct WebSocket URL, falling back.', error)
        const protocol = API_BASE_URL.startsWith('https') ? 'wss://' : 'ws://'
        const host = API_BASE_URL.replace(/^https?:\/\//, '')
        return `${protocol}${host}/ws`
      }
    })()

    const socket = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`)

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload?.type === 'motion_event' && payload.payload) {
          setEvents((prev) => mergeEvents(prev, [payload.payload]))
        }
      } catch (error) {
        console.error('Failed to parse motion event message', error)
      }
    }

    socket.onerror = (error) => {
      console.error('WebSocket error', error)
    }

    return () => {
      socket.close()
    }
  }, [API_BASE_URL, token])

  const handleLogin = async ({ username: submittedUser, password }) => {
    setIsAuthenticating(true)
    setAuthError('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: submittedUser, password }),
      })
      if (!response.ok) {
        setAuthError('Invalid username or password.')
        return
      }
      const data = await response.json()
      setToken(data.token)
      const resolvedUsername = data.username || submittedUser
      setUsername(resolvedUsername)
      localStorage.setItem('authUser', resolvedUsername)
      setProfileStatus('')
      setProfileError('')
    } catch (error) {
      console.error('Login failed', error)
      setAuthError('Unable to sign in right now.')
    } finally {
      setIsAuthenticating(false)
    }
  }

  const handleProfileUpdate = async ({ currentPassword, newUsername, newPassword }) => {
    if (!token) return
    setIsUpdatingProfile(true)
    setProfileError('')
    setProfileStatus('')
    try {
      const response = await securedFetch(`${API_BASE_URL}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newUsername, newPassword }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.detail || 'Unable to update credentials.')
      }
      if (data.token) {
        setToken(data.token)
      }
      if (data.username) {
        setUsername(data.username)
        localStorage.setItem('authUser', data.username)
      }
      setProfileStatus('Credentials updated.')
    } catch (error) {
      if (error.message !== 'unauthorized') {
        setProfileError(error.message || 'Unable to update credentials.')
      }
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  if (!token) {
    return (
      <div className="app-shell login-shell">
        <LoginForm onSubmit={handleLogin} error={authError} isSubmitting={isAuthenticating} />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="header-container">
        <div className="header-row">
          <Header subtitle="Monitor AI-triggered motion events around your home." />
          <UserMenu
            username={username}
            onLogout={handleLogout}
            onUpdateCredentials={handleProfileUpdate}
            isUpdating={isUpdatingProfile}
            profileStatus={profileStatus}
            profileError={profileError}
            healthMeta={healthMeta}
            onOpenConfig={() => setIsConfigOpen(true)}
          />
        </div>
      </div>

      <main className="app-content">
        <StatsRow stats={statCards} />

        <div className="overview-grid">
          <LiveSnapshot
            snapshotSrc={snapshotSrc}
            isAvailable={snapshotReady}
            onImageLoad={() => setSnapshotReady(true)}
            onImageError={() => setSnapshotReady(false)}
          />
        </div>

        <EventsList
          events={events}
          statusMessage={statusMessage}
          statusTone={eventTone}
          isSimulating={isSimulating}
          onSimulate={handleSimulateEvent}
        />
      </main>
      {isConfigOpen ? (
        <ConfigModal
          apiBaseUrl={API_BASE_URL}
          healthMeta={healthMeta}
          onRecheck={() => fetchHealth(true)}
          isRechecking={isRefreshingHealth}
          onClose={() => setIsConfigOpen(false)}
        />
      ) : null}
    </div>
  )
}

export default App
