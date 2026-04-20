import React, { useEffect, useState } from 'react';
import { useDataFusion } from '../context/DataFusionContext';
import './Dashboard.css';

/* ── Animated counter hook ── */
function useCountUp(target, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) return;
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return value;
}

/* ── Risk config ── */
const RISK_CONFIG = {
  high:   { color: 'var(--status-danger)',  bg: 'var(--danger-bg)',  label: 'CRITICAL', icon: '⚠' },
  medium: { color: 'var(--status-warning)', bg: 'var(--warning-bg)', label: 'MONITOR',  icon: '◉' },
  low:    { color: 'var(--status-success)', bg: 'var(--success-bg)', label: 'CLEAR',    icon: '✓' },
};

/* ── Source config ── */
const SOURCE_CONFIG = [
  {
    key: 'rfid',
    name: 'RFID Tracking',
    label: 'Nusuk Readers',
    description: 'Identity-linked pilgrim observations via card readers',
    icon: '📡',
    countKey: 'totalPeopleRFID',
    unit: 'Records',
  },
  {
    key: 'camera',
    name: 'Camera Counting',
    label: 'Vision Systems',
    description: 'Automated crowd flow measurement via counting cameras',
    icon: '📷',
    countKey: 'totalPeopleCamera',
    unit: 'Counts',
  },
  {
    key: 'tafweej',
    name: 'Tafweej App',
    label: 'Mobile Tracking',
    description: 'GPS-based group leader tracking via smartphone',
    icon: '📲',
    countKey: 'totalPeopleTafweej',
    unit: 'Users',
  },
];

/* ── Metric Card ── */
function MetricCard({ label, value, unit, icon, delta, accent = 'gold' }) {
  const animated = useCountUp(value);
  return (
    <div className={`metric-card metric-card--${accent}`}>
      <div className="metric-card__icon">{icon}</div>
      <div className="metric-card__body">
        <div className="metric-card__label">{label}</div>
        <div className="metric-card__value">
          {animated.toLocaleString()}
          {unit && <span className="metric-card__unit"> {unit}</span>}
        </div>
        {delta !== undefined && (
          <div className={`metric-card__delta ${delta >= 0 ? 'up' : 'down'}`}>
            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}% vs last window
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Source Row ── */
function SourceRow({ config, metrics, health }) {
  const count = useCountUp(metrics?.[config.countKey] ?? 0);
  const status = health?.[config.key] ?? 'inactive';
  return (
    <div className={`source-row source-row--${status}`}>
      <div className="source-row__icon">{config.icon}</div>
      <div className="source-row__info">
        <div className="source-row__name">{config.name}</div>
        <div className="source-row__label">{config.label}</div>
        <div className="source-row__desc">{config.description}</div>
      </div>
      <div className="source-row__stats">
        <div className="source-row__count">{count.toLocaleString()}</div>
        <div className="source-row__unit">{config.unit}</div>
      </div>
      <div className="source-row__status">
        <span className={`status-badge status-badge--${status}`}>
          <span className="status-badge__dot" />
          {status.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

/* ── Prediction Row ── */
function PredictionRow({ prediction, index }) {
  const cfg = RISK_CONFIG[prediction.riskLevel] || RISK_CONFIG.low;
  return (
    <div className="pred-row" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="pred-row__rank">{String(index + 1).padStart(2, '0')}</div>
      <div className="pred-row__location">{prediction.location}</div>
      <div className="pred-row__density">
        <span className="pred-row__density-bar"
          style={{ '--fill': Math.min((prediction.currentDensity / 300) * 100, 100) + '%', '--color': cfg.color }} />
        <span className="pred-row__density-val">{prediction.currentDensity}</span>
      </div>
      <div className="pred-row__risk" style={{ color: cfg.color, background: cfg.bg }}>
        <span>{cfg.icon}</span>
        <span>{cfg.label}</span>
      </div>
      <div className="pred-row__lead">{prediction.predictedLeadTime} MIN</div>
    </div>
  );
}

/* ══════════════════════════════════════
   DASHBOARD
══════════════════════════════════════ */
export default function Dashboard() {
  const { fusedData, predictions, loading, error, lastUpdate, refreshAllData } = useDataFusion();
  const metrics = fusedData?.aggregatedMetrics;
  const health  = fusedData?.healthStatus;

  const avgDensity   = useCountUp(metrics?.averageDensity ?? 0);
  const totalSources = 3;
  const activeSources = health ? Object.values(health).filter(s => s === 'active').length : 0;

  const fmt = d => d ? new Date(d).toLocaleTimeString('en-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

  return (
    <div className="dashboard">

      {/* ── Page header ── */}
      <div className="page-header">
        <div className="page-header__left">
          <h1 className="page-title">
            <span className="gold-text">Operational</span> Dashboard
          </h1>
          <p className="page-desc">
            Unified digital twin · Real-time data from 3 sensor networks · Refreshes every 30 s
          </p>
        </div>
        <div className="page-header__right">
          <div className="last-update">
            Updated <strong>{fmt(lastUpdate)}</strong>
          </div>
          <button className="btn-refresh" onClick={refreshAllData} disabled={loading}>
            <span className={loading ? 'spin' : ''}>↻</span>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert--error">
          <span>⚠</span> {error}
        </div>
      )}

      {/* ── KPI strip ── */}
      <div className="kpi-strip">
        <MetricCard
          label="Active Sources"
          value={activeSources}
          unit={`/ ${totalSources}`}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M8.46 8.46a5 5 0 0 0 0 7.07"/></svg>}
          accent="gold"
        />
        <MetricCard
          label="Total RFID Readings"
          value={metrics?.totalPeopleRFID ?? 0}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>}
          accent="default"
        />
        <MetricCard
          label="Camera Counts"
          value={metrics?.totalPeopleCamera ?? 0}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7 16 12 23 17V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>}
          accent="default"
        />
        <MetricCard
          label="App Users Tracked"
          value={metrics?.totalPeopleTafweej ?? 0}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>}
          accent="default"
        />
        <MetricCard
          label="Avg. Crowd Density"
          value={metrics?.averageDensity ?? 0}
          unit="p/m²"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
          accent={avgDensity > 200 ? 'danger' : avgDensity > 100 ? 'warning' : 'success'}
        />
      </div>

      {/* ── Two-column grid ── */}
      <div className="dashboard-grid">

        {/* LEFT: Data sources */}
        <section className="panel">
          <div className="panel__header">
            <h2 className="panel__title">Data Sources</h2>
            <span className="panel__badge">{activeSources}/{totalSources} Active</span>
          </div>
          <div className="panel__body source-list">
            {SOURCE_CONFIG.map(cfg => (
              <SourceRow key={cfg.key} config={cfg} metrics={metrics} health={health} />
            ))}
          </div>
          {/* Fusion quality bar */}
          <div className="fusion-quality">
            <div className="fusion-quality__label">
              <span>Data Fusion Quality</span>
              <span className="gold-text">{Math.round((activeSources / totalSources) * 100)}%</span>
            </div>
            <div className="fusion-bar">
              <div
                className="fusion-bar__fill"
                style={{ width: `${Math.round((activeSources / totalSources) * 100)}%` }}
              />
            </div>
          </div>
        </section>

        {/* RIGHT: Congestion predictions */}
        <section className="panel">
          <div className="panel__header">
            <h2 className="panel__title">Congestion Predictions</h2>
            <span className="panel__badge panel__badge--gold">15–30 min lead</span>
          </div>
          <div className="panel__body">
            {predictions && predictions.length > 0 ? (
              <>
                <div className="pred-table-head">
                  <span>#</span>
                  <span>Location</span>
                  <span>Density</span>
                  <span>Risk</span>
                  <span>Lead</span>
                </div>
                <div className="pred-list">
                  {predictions.map((p, i) => (
                    <PredictionRow key={i} prediction={p} index={i} />
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-state__icon">📊</div>
                <div className="empty-state__text">No prediction data yet</div>
                <div className="empty-state__sub">Predictions will appear once Elasticsearch data is populated</div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── System info strip ── */}
      <div className="sys-info-strip">
        {[
          { label: 'Platform',        value: 'Tafweej Data Fusion v1.0' },
          { label: 'Phase',           value: 'Phase 1 – Hajj 1447' },
          { label: 'Refresh Cadence', value: '30 seconds' },
          { label: 'Prediction Lead', value: '15–30 minutes' },
          { label: 'Data Sources',    value: '3 (RFID · Camera · App)' },
          { label: 'Coverage Area',   value: 'Mina, Makkah Al-Mukarramah' },
        ].map(({ label, value }) => (
          <div key={label} className="sys-info-item">
            <div className="sys-info-item__label">{label}</div>
            <div className="sys-info-item__value">{value}</div>
          </div>
        ))}
      </div>

    </div>
  );
}
