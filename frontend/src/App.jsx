import { useCallback, useEffect, useMemo, useState } from 'react'
// API_BASE_URL lives in src/config.js so swapping to your LAN IP is easy.
import { API_BASE_URL } from './config'
import './App.css'

const POLL_INTERVAL_MS = 7000

function App() {
  const [healthStatus, setHealthStatus] = useState('checking')
  const [events, setEvents] = useState([])
  const [statusMessage, setStatusMessage] = useState('')
  const [isSimulating, setIsSimulating] = useState(false)

  // Friendly text + colors for the status indicator.
  const healthMeta = useMemo(() => {
    if (healthStatus === 'connected') {
      return { label: 'Connected', className: 'status-dot status-ok' }
    }
    if (healthStatus === 'disconnected') {
      return { label: 'Disconnected', className: 'status-dot status-bad' }
    }
    return { label: 'Checking…', className: 'status-dot status-warn' }
  }, [healthStatus])

  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`)
      if (!response.ok) throw new Error('Health check failed')
      setHealthStatus('connected')
    } catch (error) {
      console.error('Health check failed', error)
      setHealthStatus('disconnected')
    }
  }, [])

  const fetchEvents = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/motion-events`)
      if (!response.ok) throw new Error('Could not load events')
      const data = await response.json()
      setEvents(data.events ?? [])
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
      fetchEvents()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [fetchEvents, fetchHealth])

  // Placeholder for future AI logic; swap this POST with a real detector later.
  const handleSimulateEvent = async () => {
    setIsSimulating(true)
    setStatusMessage('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/motion-events/simulate`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Simulation failed')
      await fetchEvents()
      setStatusMessage('Simulated motion event added.')
    } catch (error) {
      console.error('Simulation error', error)
      setStatusMessage('Unable to create a simulated event. Try again.')
    } finally {
      setIsSimulating(false)
      // Clear the helper text after a short delay.
      setTimeout(() => setStatusMessage(''), 4000)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">AI Motion</p>
          <h1>Home AI Motion Dashboard</h1>
        </div>
      </header>

      <main className="app-content">
        <section className="card status-card">
          <div className="card-header">
            <h2>Backend Status</h2>
            <div className="status-indicator">
              <span className={healthMeta.className} aria-hidden="true" />
              <span>{healthMeta.label}</span>
            </div>
          </div>
          <p className="card-subtitle">
            Uses {API_BASE_URL} to check if the FastAPI service is reachable.
          </p>
          <button
            className="ghost-button"
            type="button"
            onClick={fetchHealth}
            disabled={healthStatus === 'checking'}
          >
            Re-check
          </button>
        </section>

        <section className="card events-card">
          <div className="card-header">
            <h2>Motion Events</h2>
            <button
              type="button"
              className="primary-button"
              onClick={handleSimulateEvent}
              disabled={isSimulating}
            >
              {isSimulating ? 'Simulating…' : 'Simulate Motion Event'}
            </button>
          </div>
          <p className="card-subtitle">
            Polls every few seconds. Replace this with real AI detections later.
          </p>

          {statusMessage && <p className="status-message">{statusMessage}</p>}

          <div className="events-table">
            <div className="events-header">
              <span>Time</span>
              <span>Source</span>
              <span>Message</span>
            </div>
            {events.length === 0 ? (
              <p className="empty-state">No motion events yet.</p>
            ) : (
              events.map((event) => (
                <div key={event.id} className="event-row">
                  <span>{new Date(event.timestamp).toLocaleString()}</span>
                  <span className="badge">{event.source}</span>
                  <span>{event.message}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
