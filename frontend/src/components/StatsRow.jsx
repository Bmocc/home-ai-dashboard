function StatsRow({ stats, isLoading }) {
  const placeholders = isLoading ? Array.from({ length: 4 }) : stats
  return (
    <section className="stats-row">
      {placeholders.map((stat, index) => (
        <article
          key={stat?.label ?? `placeholder-${index}`}
          className={`stat-card stat-card--${stat?.accent || 'neutral'} ${isLoading ? 'stat-card--loading' : ''}`}
        >
          <p className="stat-label">{stat?.label || 'Loading'}</p>
          <p className="stat-value">{isLoading ? '••' : stat?.value}</p>
          {stat?.subValue ? <p className="stat-subvalue">{stat.subValue}</p> : null}
          {stat?.trend?.length ? (
            <div className="stat-trend" aria-hidden>
              {stat.trend.map((value, idx) => (
                <span key={idx} style={{ height: `${20 + value * 8}px` }} />
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </section>
  )
}

export default StatsRow
