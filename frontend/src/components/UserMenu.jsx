import { useEffect, useRef, useState } from 'react'

function UserMenu({
  username,
  onLogout,
  onUpdateCredentials,
  isUpdating,
  profileStatus,
  profileError,
  onOpenConfig,
  healthMeta,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState({ currentPassword: '', newUsername: '', newPassword: '' })
  const menuRef = useRef(null)

  const handleToggle = () => setIsOpen((prev) => !prev)

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    onUpdateCredentials(form)
  }

  useEffect(() => {
    if (profileStatus && !isUpdating) {
      setForm({ currentPassword: '', newUsername: '', newPassword: '' })
      setIsEditing(false)
    }
  }, [profileStatus, isUpdating])

  useEffect(() => {
    if (!isOpen) return undefined
    const handleClickAway = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false)
        setIsEditing(false)
      }
    }
    document.addEventListener('mousedown', handleClickAway)
    return () => document.removeEventListener('mousedown', handleClickAway)
  }, [isOpen])

  return (
    <div className="user-menu" ref={menuRef}>
      <button type="button" className="user-menu__button" onClick={handleToggle} aria-expanded={isOpen}>
        <span className={`user-avatar ${healthMeta?.tone ?? ''}`}>
        </span>
        <span className="user-name">{username || 'Signed in'}</span>
        <span className="chevron" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {isOpen ? (
        <div className="user-menu__dropdown">
          <p className="user-menu__label">Signed in as</p>
          <p className="user-menu__value">{username || 'user'}</p>
          <button type="button" className="ghost-button logout-dropdown" onClick={onLogout}>
            Log out
          </button>
          <button type="button" className="ghost-button manage-credentials" onClick={onOpenConfig}>
            View connection info
          </button>
          <button type="button" className="ghost-button manage-credentials" onClick={() => setIsEditing((prev) => !prev)}>
            {isEditing ? 'Close settings' : 'Manage credentials'}
          </button>

          {isEditing ? (
            <form className="credentials-form" onSubmit={handleSubmit}>
              <label>
                <span>Current password</span>
                <input
                  type="password"
                  name="currentPassword"
                  value={form.currentPassword}
                  onChange={handleChange}
                  required
                />
              </label>
              <label>
                <span>New username</span>
                <input
                  type="text"
                  name="newUsername"
                  value={form.newUsername}
                  onChange={handleChange}
                  placeholder={username}
                />
              </label>
              <label>
                <span>New password</span>
                <input type="password" name="newPassword" value={form.newPassword} onChange={handleChange} />
              </label>
              {profileError ? <p className="login-error">{profileError}</p> : null}
              {profileStatus ? <p className="login-hint success">{profileStatus}</p> : null}
              <button type="submit" className="primary-button login-button" disabled={isUpdating}>
                {isUpdating ? 'Saving…' : 'Save changes'}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default UserMenu
