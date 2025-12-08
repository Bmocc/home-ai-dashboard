function Header({ subtitle }) {
  return (
    <header className="dashboard-header">
      <p className="eyebrow">AI Motion</p>
      <h1>Home AI Motion Dashboard</h1>
      {subtitle ? <p className="header-subtitle">{subtitle}</p> : null}
    </header>
  )
}

export default Header
