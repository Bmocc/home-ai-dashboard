function LiveSnapshot({
  snapshotSrc,
  isAvailable,
  onImageLoad,
  onImageError,
  lastUpdated,
  sourceLabel,
  onRefresh,
  isRefreshing,
  autoRefresh,
  onToggleAutoRefresh,
  refreshIntervalMs,
  dimensions,
}) {
  return (
    <section className="card snapshot-card">
      <div className="card-header">
        <div>
          <h2>Latest Snapshot</h2>
          <p className="card-subtitle">Refreshes every few seconds from your laptop camera.</p>
        </div>
        <div className="snapshot-actions">
          <button type="button" className="ghost-button ghost-button--compact" onClick={onToggleAutoRefresh}>
            {autoRefresh ? 'Auto: On' : 'Auto: Off'}
          </button>
          <button type="button" className="ghost-button" onClick={onRefresh} disabled={isRefreshing}>
            {isRefreshing ? 'Refreshing…' : 'Refresh now'}
          </button>
        </div>
      </div>
      {snapshotSrc ? (
        <div className={`snapshot-frame ${isAvailable ? 'snapshot-frame--ready' : 'snapshot-frame--loading'}`}>
          <div className="snapshot-meta">
            <span className="chip chip--source">{sourceLabel}</span>
            <span className="chip chip--time">
              {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Waiting for frame'}
            </span>
            <span className="chip chip--ghost">
              {dimensions?.width && dimensions?.height
                ? `${dimensions.width}x${dimensions.height}`
                : 'Resolution —'}
              {refreshIntervalMs ? ` • ${Math.round(refreshIntervalMs / 1000)}s` : ''}
            </span>
          </div>
          <img
            className={`snapshot-image ${isAvailable ? '' : 'snapshot-image--loading'}`}
            src={snapshotSrc}
            alt="Latest laptop camera frame"
            onLoad={onImageLoad}
            onError={onImageError}
          />
        </div>
      ) : null}
      {!isAvailable && <p className="empty-state">Waiting for the first camera frame…</p>}
    </section>
  )
}

export default LiveSnapshot
