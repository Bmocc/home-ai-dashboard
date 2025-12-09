function ConfigModal({ apiBaseUrl, healthMeta, onRecheck, isRechecking, onClose }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <header className="modal-header">
          <div>
            <p className="eyebrow">Connection Info</p>
            <h2>API & Network Configuration</h2>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal-body">
          <div className="modal-section">
            <div className="modal-status">
              <p className="modal-label">Backend status</p>
              <div className="status-indicator">
                <span className={`status-dot ${healthMeta.tone}`} aria-hidden="true" />
                <span>{healthMeta.label}</span>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={onRecheck}
                disabled={isRechecking}
              >
                {isRechecking ? 'Checking…' : 'Re-check'}
              </button>
            </div>
          </div>
          <div className="modal-section">
            <p className="modal-label">Current API base URL</p>
            <p className="modal-value">{apiBaseUrl}</p>
            <p className="modal-hint">
              Update <code>VITE_API_BASE_URL</code> in dev or drop a <code>config/api-base-url</code> file when running Docker to
              point phones to your laptop&apos;s LAN IP (e.g. <code>http://192.168.1.50:8000</code>).
            </p>
          </div>
          <div className="modal-section">
            <p className="modal-label">Need to change credentials?</p>
            <p className="modal-hint">
              Use the “Manage credentials” option in this menu to update the username/password stored in SQLite. A new JWT will
              be issued automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConfigModal
