function StatusCard({ statusLabel, statusTone, isRefreshing, onRefresh, apiBaseUrl }) {
  return (
    <section className="card status-card">
      <div className="card-header">
        <div>
          <h2>Backend Status</h2>
          <p className="card-subtitle">
            Health check via <span className="mono">{apiBaseUrl}/api/health</span>
          </p>
        </div>
        <div className="status-indicator">
          <span className={`status-dot ${statusTone}`} aria-hidden="true" />
          <span>{statusLabel}</span>
        </div>
      </div>
      <button className="ghost-button" type="button" onClick={onRefresh} disabled={isRefreshing}>
        {isRefreshing ? 'Checking…' : 'Re-check'}
      </button>
    </section>
  )
}

export default StatusCard
