function EventsList({ events, statusMessage, statusTone, onSimulate, isSimulating }) {
  const formatTime = (timestamp) => {
    try {
      return new Date(timestamp).toLocaleString()
    } catch (error) {
      return timestamp
    }
  }

  return (
    <section className="card events-card">
      <div className="card-header events-header">
        <div>
          <h2>Motion Events</h2>
          <p className="card-subtitle">
            Polls every few seconds. Replace these simulators with real AI detections soon.
          </p>
        </div>
        <button type="button" className="primary-button" onClick={onSimulate} disabled={isSimulating}>
          {isSimulating ? 'Simulating…' : 'Simulate Motion Event'}
        </button>
      </div>

      {statusMessage ? <p className={`status-message ${statusTone}`}>{statusMessage}</p> : null}

      {events.length === 0 ? (
        <p className="empty-state">No motion events yet. Tap simulate to create one.</p>
      ) : (
        <div className="event-grid">
          {events.map((event) => {
            const severity = (event.severity || 'low').toLowerCase()
            const zone = event.zone || 'Unknown zone'
            const thumb = event.thumbnailUrl || 'https://placehold.co/120x68?text=Motion'

            return (
              <article key={event.id ?? `${zone}-${event.timestamp}`} className="event-card">
                <img
                  src={thumb}
                  alt={`Thumbnail for ${zone}`}
                  className="event-thumbnail"
                  loading="lazy"
                />
                <div className="event-details">
                  <div className="event-meta">
                    <span className="badge">{zone}</span>
                    <span className={`severity severity-${severity}`}>{severity}</span>
                  </div>
                  <p className="event-time">{formatTime(event.frameTimestamp || event.timestamp)}</p>
                  <p className="event-message">{event.message}</p>
                  <p className="event-source">Source: {event.source}</p>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default EventsList
