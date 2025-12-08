function StatsRow({ stats }) {
  return (
    <section className="stats-row">
      {stats.map((stat) => (
        <article key={stat.label} className={`stat-card stat-card--${stat.accent}`}>
          <p className="stat-label">{stat.label}</p>
          <p className="stat-value">{stat.value}</p>
          {stat.subValue ? <p className="stat-subvalue">{stat.subValue}</p> : null}
        </article>
      ))}
    </section>
  )
}

export default StatsRow
