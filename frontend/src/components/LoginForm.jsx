import { useState } from 'react'

function LoginForm({ onSubmit, error, isSubmitting }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    onSubmit({ username, password })
  }

  return (
    <div className="login-card">
      <div className="login-card__header">
        <p className="eyebrow">Home AI Dashboard</p>
        <h1>Welcome back</h1>
        <p className="login-subtitle">Sign in to view live snapshots and motion timelines.</p>
      </div>
      <form className="login-form" onSubmit={handleSubmit}>
        <label>
          <span>Username</span>
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p className="login-error">{error}</p> : null}
        <button type="submit" className="primary-button login-button" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="login-hint">
        Default credentials live in <code>backend/.env.example</code>. Remember to change them!
      </p>
    </div>
  )
}

export default LoginForm
