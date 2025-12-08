import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Header from './components/Header'
import ServerInfo from './components/ServerInfo'
import StatsRow from './components/StatsRow'
import StatusCard from './components/StatusCard'
import LiveSnapshot from './components/LiveSnapshot'
import EventsList from './components/EventsList'
// API_BASE_URL lives in src/config.js so swapping to your LAN IP is easy.
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
  existing.forEach((event) => {
    map.set(getEventKey(event), event)
  })
  incoming.forEach((event) => {
    map.set(getEventKey(event), event)
  })
  return Array.from(map.values())
}

function App() {
  const [healthStatus, setHealthStatus] = useState('checking')
  const [events, setEvents] = useState([])
  const [statusMessage, setStatusMessage] = useState('')
  const [eventTone, setEventTone] = useState('success')
  const [isSimulating, setIsSimulating] = useState(false)
  const [isRefreshingHealth, setIsRefreshingHealth] = useState(false)
  const messageTimeoutRef = useRef(null)
  const initialLoadRef = useRef(false)
  const [snapshotSrc, setSnapshotSrc] = useState('')
  const [snapshotReady, setSnapshotReady] = useState(false)

  // Friendly text + colors for the status indicator.
  const healthMeta = useMemo(() => {
    if (healthStatus === 'connected') {
      return { label: 'Connected', tone: 'status-ok' }
    }
    if (healthStatus === 'disconnected') {
      return { label: 'Disconnected', tone: 'status-bad' }
    }
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
      {
        label: 'Connection',
        value: healthMeta.label,
        subValue: healthStatus === 'connected' ? 'Streaming live' : 'Reconnecting…',
        accent: healthStatus === 'connected' ? 'success' : 'warning',
      },
    ]
  }, [events, healthMeta.label, healthStatus])

  const fetchHealth = useCallback(async (manual = false) => {
    if (manual) {
      setIsRefreshingHealth(true)
      setHealthStatus('checking')
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`)
      if (!response.ok) throw new Error('Health check failed')
      setHealthStatus('connected')
    } catch (error) {
      console.error('Health check failed', error)
      setHealthStatus('disconnected')
    } finally {
      if (manual) {
        setTimeout(() => setIsRefreshingHealth(false), 200)
      }
    }
  }, [])

  const fetchEvents = useCallback(async (options = {}) => {
    const { forceReplace = false } = options
    try {
      const response = await fetch(`${API_BASE_URL}/api/motion-events`)
      if (!response.ok) throw new Error('Could not load events')
      const data = await response.json()
      if (!Array.isArray(data.events)) return
      setEvents((prev) => {
        if (forceReplace || !initialLoadRef.current) {
          return data.events
        }
        return mergeEvents(prev, data.events)
      })
      if (!initialLoadRef.current) {
        initialLoadRef.current = true
      }
    } catch (error) {
      console.error('Failed to load events', error)
    }
  }, [])

  useEffect(() => {
    // Fetch backend status and events when the dashboard mounts.
    fetchHealth()
    fetchEvents()
  }, [fetchHealth, fetchEvents])

  useEffect(() => {
    // Poll for updates while the app is open.
    const intervalId = setInterval(() => {
      fetchHealth()
    }, HEALTH_POLL_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [fetchHealth])

  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const refreshSnapshot = () => {
      setSnapshotReady(false)
      setSnapshotSrc(`${API_BASE_URL}/api/latest-frame?t=${Date.now()}`)
    }
    refreshSnapshot()
    const intervalId = setInterval(refreshSnapshot, SNAPSHOT_REFRESH_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [API_BASE_URL])

  // Placeholder for future AI logic; swap this POST with a real detector later.
  const handleSimulateEvent = async () => {
    setIsSimulating(true)
    setStatusMessage('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/motion-events/simulate`, {
        method: 'POST',
      })
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
      // Clear the helper text after a short delay.
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current)
      }
      messageTimeoutRef.current = setTimeout(() => setStatusMessage(''), 4000)
    }
  }

  useEffect(() => {
    const wsUrl = (() => {
      try {
        const url = new URL(API_BASE_URL)
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
        const currentPath = url.pathname.endsWith('/')
          ? url.pathname.slice(0, -1)
          : url.pathname
        url.pathname = `${currentPath || ''}/ws`
        return url.toString()
      } catch (error) {
        console.error('Unable to construct WebSocket URL, falling back.', error)
        const protocol = API_BASE_URL.startsWith('https') ? 'wss://' : 'ws://'
        const host = API_BASE_URL.replace(/^https?:\/\//, '')
        return `${protocol}${host}/ws`
      }
    })()

    const socket = new WebSocket(wsUrl)

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
  }, [API_BASE_URL])

  return (
    <div className="app-shell">
      <Header subtitle="Monitor AI-triggered motion events around your home." />
      <ServerInfo apiBaseUrl={API_BASE_URL} />

      <main className="app-content">
        <StatsRow stats={statCards} />

        <div className="overview-grid">
          <StatusCard
            statusLabel={healthMeta.label}
            statusTone={healthMeta.tone}
            isRefreshing={healthStatus === 'checking' || isRefreshingHealth}
            onRefresh={() => fetchHealth(true)}
            apiBaseUrl={API_BASE_URL}
          />

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
    </div>
  )
}

export default App
