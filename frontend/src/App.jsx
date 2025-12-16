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

const detectionFilters = [
  { key: 'all', label: 'All' },
  { key: 'people', label: 'People' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'packages', label: 'Packages' },
  { key: 'pets', label: 'Pets' },
]

const severityRank = { high: 3, medium: 2, low: 1 }

const filterKeywords = {
  people: ['person', 'people', 'human'],
  vehicles: ['car', 'vehicle', 'truck', 'bus', 'bike'],
  packages: ['package', 'box', 'parcel', 'delivery'],
  pets: ['cat', 'dog', 'pet', 'animal'],
}

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
  const [autoRefreshSnapshot, setAutoRefreshSnapshot] = useState(true)
  const [snapshotDimensions, setSnapshotDimensions] = useState({ width: null, height: null })
  const [lastSnapshotAt, setLastSnapshotAt] = useState(null)
  const [isSnapshotRefreshing, setIsSnapshotRefreshing] = useState(false)
  const [authError, setAuthError] = useState('')
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [isEventsLoading, setIsEventsLoading] = useState(false)
  const [activeFilter, setActiveFilter] = useState('all')
  const [sortMode, setSortMode] = useState('newest')
  const [highlightedIds, setHighlightedIds] = useState([])
  const [livePaused, setLivePaused] = useState(false)
  const [queuedEvents, setQueuedEvents] = useState([])
  const messageTimeoutRef = useRef(null)
  const initialLoadRef = useRef(false)
  const initialEventId = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const val = params.get('event')
    return val ? String(val) : null
  }, [])

  const healthMeta = useMemo(() => {
    if (healthStatus === 'connected') return { label: 'Connected', tone: 'status-ok' }
    if (healthStatus === 'disconnected') return { label: 'Disconnected', tone: 'status-bad' }
    return { label: 'Checking…', tone: 'status-warn' }
  }, [healthStatus])

  const latestDetection = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const ev = events[i]
      if (ev?.detections?.length) return ev.detections[0]
    }
    return null
  }, [events])

  const trendData = useMemo(() => {
    const slice = events.slice(-7)
    return slice.map((ev) => severityRank[String(ev.severity || '').toLowerCase()] || 1)
  }, [events])

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
      {
        label: 'AI Detections',
        value: latestDetection ? latestDetection.label : '--',
        subValue: latestDetection ? `Conf: ${(latestDetection.confidence * 100).toFixed(0)}%` : 'None yet',
        accent: 'success',
        trend: trendData,
      },
    ]
  }, [events, healthMeta.label, healthStatus, latestDetection, trendData])

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
    setActiveFilter('all')
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
      if (!initialLoadRef.current) setIsEventsLoading(true)
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
      } finally {
        setIsEventsLoading(false)
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
      setIsSnapshotRefreshing(true)
      setSnapshotSrc(`${API_BASE_URL}/api/latest-frame?t=${Date.now()}`)
    }
    refreshSnapshot()
    let intervalId
    if (autoRefreshSnapshot) {
      intervalId = setInterval(refreshSnapshot, SNAPSHOT_REFRESH_INTERVAL_MS)
    }
    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [API_BASE_URL, autoRefreshSnapshot, token])

  const handleManualSnapshotRefresh = () => {
    if (!token) return
    setSnapshotReady(false)
    setIsSnapshotRefreshing(true)
    setSnapshotSrc(`${API_BASE_URL}/api/latest-frame?t=${Date.now()}`)
  }

  const handleSimulateEvent = async () => {
    if (!token) return
    setIsSimulating(true)
    setStatusMessage('')
    try {
      const response = await securedFetch(`${API_BASE_URL}/api/motion-events/simulate`, { method: 'POST' })
      if (!response.ok) throw new Error('Simulation failed')
      const data = await response.json().catch(() => null)
      if (data) {
        const key = getEventKey(data)
        setHighlightedIds((prev) => (prev.includes(key) ? prev : [...prev, key]))
        setTimeout(() => {
          setHighlightedIds((prev) => prev.filter((id) => id !== key))
        }, 2500)
      }
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
    const onKeydown = (event) => {
      if (!token) return
      const tag = event.target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (event.key?.toLowerCase() === 's' && !isSimulating) {
        event.preventDefault()
        handleSimulateEvent()
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [handleSimulateEvent, isSimulating, token])

  const filteredEvents = useMemo(() => {
    const matchesFilter = (event) => {
      if (activeFilter === 'all') return true
      const keywords = filterKeywords[activeFilter] || []
      const text = `${event?.message || ''} ${(event?.detections || [])
        .map((d) => d.label || '')
        .join(' ')}`.toLowerCase()
      return keywords.some((kw) => text.includes(kw))
    }

    const sorted = [...events].filter(matchesFilter)

    if (sortMode === 'severity') {
      sorted.sort((a, b) => {
        const aRank = severityRank[String(a.severity || '').toLowerCase()] || 0
        const bRank = severityRank[String(b.severity || '').toLowerCase()] || 0
        if (bRank !== aRank) return bRank - aRank
        return new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
      })
      return sorted
    }

    return sorted.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
  }, [activeFilter, events, sortMode])

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
          if (livePaused) {
            setQueuedEvents((prev) => mergeEvents(prev, [payload.payload]))
          } else {
            setEvents((prev) => mergeEvents(prev, [payload.payload]))
            const key = getEventKey(payload.payload)
            setHighlightedIds((prev) => (prev.includes(key) ? prev : [...prev, key]))
            setTimeout(() => {
              setHighlightedIds((prev) => prev.filter((id) => id !== key))
            }, 2500)
          }
        }
      } catch (error) {
        console.error('Failed to parse motion event message', error)
      }
    }

    socket.onerror = () => {
      // If backend isn't reachable yet, avoid spamming errors; reconnection handled by reload/login.
      console.warn('WebSocket connection issue; will retry on next reload/login.')
    }

    return () => {
      socket.close()
    }
  }, [API_BASE_URL, token, livePaused])

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
        <StatsRow stats={statCards} isLoading={isEventsLoading && !events.length} />

        {healthStatus === 'disconnected' ? (
          <div className="reconnect-banner" role="status">
            <span className="status-dot status-dot--alert" aria-hidden />
            Connection lost. Retrying…
          </div>
        ) : null}

        <div className="overview-grid">
          <LiveSnapshot
            snapshotSrc={snapshotSrc}
            isAvailable={snapshotReady}
            onImageLoad={(e) => {
              setSnapshotReady(true)
              setIsSnapshotRefreshing(false)
              setLastSnapshotAt(new Date())
              if (e?.target?.naturalWidth && e?.target?.naturalHeight) {
                setSnapshotDimensions({ width: e.target.naturalWidth, height: e.target.naturalHeight })
              }
            }}
            onImageError={() => {
              setSnapshotReady(false)
              setIsSnapshotRefreshing(false)
            }}
            lastUpdated={lastSnapshotAt}
            sourceLabel="Laptop Cam"
            onRefresh={handleManualSnapshotRefresh}
            isRefreshing={isSnapshotRefreshing}
            autoRefresh={autoRefreshSnapshot}
            onToggleAutoRefresh={() => setAutoRefreshSnapshot((prev) => !prev)}
            refreshIntervalMs={SNAPSHOT_REFRESH_INTERVAL_MS}
            dimensions={snapshotDimensions}
          />
        </div>

        <EventsList
          events={filteredEvents}
          statusMessage={statusMessage}
          statusTone={eventTone}
          isSimulating={isSimulating}
          onSimulate={handleSimulateEvent}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          sortMode={sortMode}
          onSortChange={setSortMode}
          filters={detectionFilters}
          onRefresh={() => fetchEvents({ forceReplace: true })}
          isLoading={isEventsLoading && !events.length}
          highlightedIds={highlightedIds}
          apiBaseUrl={API_BASE_URL}
          filterSummary={`Showing ${filteredEvents.length} events • Filter: ${
            detectionFilters.find((f) => f.key === activeFilter)?.label || 'All'
          } • Sort: ${sortMode === 'severity' ? 'Severity' : 'Newest'}`}
          livePaused={livePaused}
          onToggleLivePaused={() => {
            setLivePaused((prev) => {
              if (prev) {
                setEvents((existing) => mergeEvents(existing, queuedEvents))
                setQueuedEvents([])
              }
              return !prev
            })
          }}
          queuedCount={queuedEvents.length}
          initialEventId={initialEventId}
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
