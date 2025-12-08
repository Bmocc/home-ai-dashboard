function LiveSnapshot({ snapshotSrc, isAvailable, onImageLoad, onImageError }) {
  return (
    <section className="card snapshot-card">
      <div className="card-header">
        <div>
          <h2>Latest Snapshot</h2>
          <p className="card-subtitle">Refreshes every few seconds from your laptop camera.</p>
        </div>
      </div>
      {snapshotSrc ? (
        <img
          className={`snapshot-image ${isAvailable ? '' : 'snapshot-image--loading'}`}
          src={snapshotSrc}
          alt="Latest laptop camera frame"
          onLoad={onImageLoad}
          onError={onImageError}
        />
      ) : null}
      {!isAvailable && <p className="empty-state">Waiting for the first camera frame…</p>}
    </section>
  )
}

export default LiveSnapshot
