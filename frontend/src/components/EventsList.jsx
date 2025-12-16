import { useEffect, useState } from 'react'

const eventKey = (event) => String(event.id ?? `${event.timestamp ?? ''}-${event.source ?? ''}-${event.message ?? ''}`)

function EventsList({
  events,
  statusMessage,
  statusTone,
  onSimulate,
  isSimulating,
  activeFilter,
  onFilterChange,
  sortMode,
  onSortChange,
  filters,
  onRefresh,
  isLoading,
  highlightedIds = [],
  apiBaseUrl,
  filterSummary,
  livePaused,
  onToggleLivePaused,
  queuedCount,
  initialEventId,
}) {
  const [activeEvent, setActiveEvent] = useState(null)
  const [visibleCount, setVisibleCount] = useState(15)

  const formatTime = (timestamp) => {
    try {
      return new Date(timestamp).toLocaleString()
    } catch (error) {
      return timestamp
    }
  }

  const renderDetections = (detections = []) => {
    if (!detections.length) return null
    return (
      <div className="detection-chips" aria-label="Detected objects">
        {detections.slice(0, 3).map((det, idx) => (
          <span key={`${det.label}-${idx}`} className="chip chip--detection">
            {det.label} {det.confidence ? `• ${(det.confidence * 100).toFixed(0)}%` : ''}
          </span>
        ))}
      </div>
    )
  }

  const resolveThumb = (thumb) => {
    if (!thumb) return null
    if (thumb.startsWith('http')) return thumb
    const base = apiBaseUrl ? apiBaseUrl.replace(/\/$/, '') : ''
    return `${base}${thumb.startsWith('/') ? thumb : `/${thumb}`}`
  }

  const closeModal = () => setActiveEvent(null)

  useEffect(() => {
    setVisibleCount((prev) => Math.min(Math.max(prev, 15), events.length || 0))
  }, [events.length])

  useEffect(() => {
    setVisibleCount(Math.min(15, events.length || 0))
  }, [activeFilter, sortMode, events.length])

  useEffect(
    () => () => {
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
    },
    [],
  )

  useEffect(() => {
    if (!initialEventId) return
    const target = events.find((ev) => String(ev.id) === String(initialEventId))
    if (target) {
      setActiveEvent(target)
    }
  }, [events, initialEventId])

  const renderModal = () => {
    if (!activeEvent) return null
    const thumb = resolveThumb(
      activeEvent.thumbnailUrl ||
        (apiBaseUrl
          ? `${apiBaseUrl.replace(/\/$/, '')}/api/latest-frame?t=${new Date(
              activeEvent.frameTimestamp || activeEvent.timestamp || Date.now(),
            ).getTime()}`
          : null),
    )
    const boxes = activeEvent.detections?.filter((d) => d.bbox) || []
    return (
      <div className="event-modal-backdrop" onClick={closeModal} role="dialog" aria-modal="true">
        <div className="event-modal" onClick={(e) => e.stopPropagation()}>
          <div className="event-modal__header">
            <div>
              <p className="event-modal__title">{activeEvent.message}</p>
              <p className="event-modal__meta">
                {formatTime(activeEvent.frameTimestamp || activeEvent.timestamp)} • {activeEvent.zone || 'Unknown zone'}
              </p>
            </div>
            <button type="button" className="ghost-button ghost-button--compact" onClick={closeModal}>
              Close
            </button>
          </div>
          {thumb ? (
            <div className="event-modal__image-wrap">
              <img
                src={thumb}
                alt="Detected frame"
              />
              <div className="event-modal__boxes">
                {boxes.map((det, idx) => {
                  const bbox = det.bbox || {}
                  const left = (bbox.x1 || 0) * 100
                  const top = (bbox.y1 || 0) * 100
                  const width = ((bbox.x2 || 0) - (bbox.x1 || 0)) * 100
                  const height = ((bbox.y2 || 0) - (bbox.y1 || 0)) * 100
                  const conf = det.confidence ? `${(det.confidence * 100).toFixed(0)}%` : ''
                  return (
                    <div
                      key={`${det.label}-${idx}`}
                      className="event-box"
                      style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
                    >
                      <span className="event-box__label">
                        {det.label} {conf}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="empty-state">No snapshot available for this event.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <section className="card events-card">
      <div className="card-header events-header">
        <div className="events-header__info">
          <div>
            <h2>Motion Events</h2>
            <p className="card-subtitle">
              Polls every few seconds. Replace these simulators with real AI detections soon.
            </p>
          </div>
          <div className="events-toolbar">
            <div className="filter-row" role="tablist" aria-label="Filter by detection type">
              {filters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  className={`filter-chip ${activeFilter === filter.key ? 'filter-chip--active' : ''}`}
                  onClick={() => onFilterChange(filter.key)}
                  role="tab"
                  aria-selected={activeFilter === filter.key}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="sort-row">
              <span className="chip chip--ghost">Sort</span>
              <button
                type="button"
                className={`ghost-button ghost-button--compact ${sortMode === 'newest' ? 'ghost-button--active' : ''}`}
                onClick={() => onSortChange('newest')}
              >
                Newest
              </button>
              <button
                type="button"
                className={`ghost-button ghost-button--compact ${sortMode === 'severity' ? 'ghost-button--active' : ''}`}
                onClick={() => onSortChange('severity')}
              >
                Severity
              </button>
              <button type="button" className="ghost-button ghost-button--compact" onClick={onRefresh}>
                Refresh
              </button>
              <button
                type="button"
                className={`ghost-button ghost-button--compact ${livePaused ? 'ghost-button--active' : ''}`}
                onClick={onToggleLivePaused}
              >
                {livePaused ? 'Live: Paused' : 'Live: On'}
              </button>
            </div>
          </div>
        </div>
        <button type="button" className="primary-button desktop-only" onClick={onSimulate} disabled={isSimulating}>
          {isSimulating ? 'Simulating…' : 'Simulate Motion Event'}
        </button>
      </div>

      {filterSummary ? <p className="filter-summary">{filterSummary}</p> : null}

      {statusMessage ? <p className={`status-message ${statusTone}`}>{statusMessage}</p> : null}

      {events.length > visibleCount ? (
        <p className="filter-summary">Showing {visibleCount} of {events.length} events</p>
      ) : null}

      {isLoading ? (
        <div className="event-grid">
          {Array.from({ length: 3 }).map((_, idx) => (
            <article key={`skeleton-${idx}`} className="event-card event-card--loading" aria-hidden>
              <div className="event-thumbnail skeleton-block" />
              <div className="event-details">
                <div className="event-meta skeleton-block" />
                <div className="event-time skeleton-block" />
                <div className="event-message skeleton-block" />
                <div className="event-source skeleton-block" />
              </div>
            </article>
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="empty-state">No motion events yet. Tap simulate to create one.</p>
      ) : (
        <div className="event-grid">
          {events.slice(0, visibleCount).map((event) => {
            const severity = (event.severity || 'low').toLowerCase()
            const zone = event.zone || 'Unknown zone'
            const thumb =
              resolveThumb(
                event.thumbnailUrl ||
                (apiBaseUrl
                  ? `${apiBaseUrl.replace(/\/$/, '')}/api/latest-frame?t=${new Date(
                      event.frameTimestamp || event.timestamp || Date.now(),
                    ).getTime()}`
                  : null),
              ) || 'https://placehold.co/120x68?text=Motion'
            const isHighlighted = highlightedIds.includes(eventKey(event))
            const shareUrl = (() => {
              try {
                const url = new URL(window.location.href)
                url.searchParams.set('event', event.id || eventKey(event))
                return url.toString()
              } catch {
                return window.location.href
              }
            })()

            return (
              <article
                key={event.id ?? `${zone}-${event.timestamp}`}
                className={`event-card event-card--${severity} ${isHighlighted ? 'event-card--highlight' : ''}`}
                onClick={() => setActiveEvent(event)}
              >
                <img
                  src={thumb}
                  alt={`Thumbnail for ${zone}`}
                  className="event-thumbnail"
                  loading="lazy"
                />
                <div className="event-details">
                  <div className="event-meta">
                    <span className="badge">{zone}</span>
                    <span className={`severity severity-${severity}`}>
                      <span className="status-dot status-dot--severity" aria-hidden />
                      {severity}
                    </span>
                    <button
                      type="button"
                      className="ghost-button ghost-button--compact"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (navigator?.clipboard?.writeText) {
                          navigator.clipboard.writeText(shareUrl)
                        }
                      }}
                    >
                      Copy link
                    </button>
                  </div>
                  <p className="event-time">{formatTime(event.frameTimestamp || event.timestamp)}</p>
                  <p className="event-message">{event.message}</p>
                  {renderDetections(event.detections)}
                  <p className="event-source">Source: {event.source}</p>
                </div>
              </article>
            )
          })}
        </div>
      )}
      {livePaused && queuedCount > 0 ? (
        <p className="status-message warning">Live updates paused. {queuedCount} new events waiting.</p>
      ) : null}
      {events.length > visibleCount ? (
        <div className="load-more-row">
          <button
            type="button"
            className="ghost-button"
            onClick={() => setVisibleCount((prev) => Math.min(prev + 10, events.length))}
          >
            Load more
          </button>
        </div>
      ) : null}

      <div className="mobile-action-bar">
        <button type="button" className="primary-button" onClick={onSimulate} disabled={isSimulating}>
          {isSimulating ? 'Simulating…' : 'Simulate Motion Event'}
        </button>
      </div>
      {renderModal()}
    </section>
  )
}

export default EventsList
