import { useId, useState } from 'react'

function ServerInfo({ apiBaseUrl }) {
  const [isOpen, setIsOpen] = useState(false)
  const panelId = useId()

  return (
    <section className={`info-banner ${isOpen ? 'info-banner--open' : ''}`}>
      <div className="info-summary">
        <div>
          <p className="info-label">API endpoint</p>
          <p className="info-url">{apiBaseUrl}</p>
        </div>
        <button
          type="button"
          className="info-toggle"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((prev) => !prev)}
        >
          ?
        </button>
      </div>
      <div className="info-content" id={panelId} aria-hidden={!isOpen}>
        <p className="info-hint">
          Update <code>VITE_API_BASE_URL</code> in your frontend <code>.env</code> to use your laptop&apos;s LAN IP so
          phones on the same Wi-Fi can reach the backend.
        </p>
      </div>
    </section>
  )
}

export default ServerInfo
