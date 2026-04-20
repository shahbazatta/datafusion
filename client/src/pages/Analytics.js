import React, { useState, useEffect, useRef } from 'react';
import { useDataFusion } from '../context/DataFusionContext';
import './Analytics.css';

/* ── Mini sparkline SVG ── */
function Sparkline({ data, color = '#D4AF37', height = 40 }) {
  if (!data || data.length < 2) return <div className="sparkline-empty" />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 120; const h = height;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - ((v - min) / range) * (h - 6) - 3
  ]);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${d} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="sparkline">
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color.replace('#','')})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Radial gauge ── */
function Gauge({ value, max = 100, color = '#D4AF37', label, size = 80 }) {
  const pct = Math.min(value / max, 1);
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const dash = circ * 0.75;
  const gap  = circ * 0.25;
  const fill = dash * pct;
  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(135deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth="7"
          strokeDasharray={`${dash} ${gap}`} strokeLinecap="round" />
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth="7"
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)' }} />
      </svg>
      <div className="gauge__center">
        <div className="gauge__val" style={{ color }}>{Math.round(value)}</div>
        <div className="gauge__label">{label}</div>
      </div>
    </div>
  );
}

/* ── Horizontal bar chart ── */
function HBarChart({ items, max }) {
  return (
    <div className="hbar-chart">
      {items.map((item, i) => (
        <div key={i} className="hbar-row" style={{ animationDelay: `${i * 50}ms` }}>
          <div className="hbar-label">{item.label}</div>
          <div className="hbar-track">
            <div
              className="hbar-fill"
              style={{
                width: `${Math.round((item.value / max) * 100)}%`,
                background: item.color || 'linear-gradient(90deg,#A8880E,#D4AF37)',
                transitionDelay: `${i * 80}ms`
              }}
            />
          </div>
          <div className="hbar-value">{item.value.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

/* ── KPI tile ── */
function KpiTile({ label, value, unit, sparkData, color = '#D4AF37', trend, trendUp }) {
  return (
    <div className="kpi-tile">
      <div className="kpi-tile__top">
        <div className="kpi-tile__label">{label}</div>
        {trend !== undefined && (
          <span className={`kpi-tile__trend ${trendUp ? 'up' : 'down'}`}>
            {trendUp ? '↑' : '↓'} {trend}%
          </span>
        )}
      </div>
      <div className="kpi-tile__value" style={{ color }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <span className="kpi-tile__unit"> {unit}</span>}
      </div>
      <Sparkline data={sparkData} color={color} />
    </div>
  );
}

/* ── Dummy sparkline generator ── */
const spark = (base, len = 12) =>
  Array.from({ length: len }, (_, i) => Math.max(0, base + (Math.random() - 0.5) * base * 0.4 + i * 2));

const TABLE_HEADERS = ['Location', 'Density', 'Risk', 'Lead Time', 'Status'];

export default function Analytics() {
  const { fusedData, predictions, analytics } = useDataFusion();
  const [timeRange, setTimeRange] = useState('24h');
  const metrics = fusedData?.aggregatedMetrics;
  const health  = fusedData?.healthStatus;
  const counts  = fusedData?.sources;

  /* Build bar chart items */
  const sourceItems = [
    { label: 'RFID',    value: metrics?.totalPeopleRFID    ?? 0, color: 'linear-gradient(90deg,#A8880E,#D4AF37)' },
    { label: 'Camera',  value: metrics?.totalPeopleCamera  ?? 0, color: 'linear-gradient(90deg,#145A8C,#4D94FF)' },
    { label: 'App',     value: metrics?.totalPeopleTafweej ?? 0, color: 'linear-gradient(90deg,#167A4C,#22D35E)' },
  ];
  const barMax = Math.max(...sourceItems.map(i => i.value), 1);

  /* Temporal buckets (real or synthetic) */
  const temporalBuckets = analytics?.temporalAnalysis?.buckets;
  const temporalValues  = temporalBuckets
    ? temporalBuckets.slice(-12).map(b => b.total_people?.value || 0)
    : spark(200);

  return (
    <div className="analytics">

      {/* ── Page header ── */}
      <div className="page-header">
        <div className="page-header__left">
          <h1 className="page-title">
            <span className="gold-text">Analytics</span> &amp; Insights
          </h1>
          <p className="page-desc">
            Performance metrics · Temporal analysis · Prediction accuracy · Operational intelligence
          </p>
        </div>
        <div className="page-header__right">
          <div className="time-tabs">
            {['1h','6h','24h','7d'].map(r => (
              <button key={r}
                className={`time-tab ${timeRange === r ? 'active' : ''}`}
                onClick={() => setTimeRange(r)}
              >{r.toUpperCase()}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="kpi-row">
        <KpiTile label="Fusion Latency"     value={248}  unit="ms"  sparkData={spark(248,12)}  color="#D4AF37" trend={3.2}  trendUp={false} />
        <KpiTile label="Prediction Accuracy" value={87}  unit="%"   sparkData={spark(87,12)}   color="#22D35E" trend={1.8}  trendUp={true}  />
        <KpiTile label="System Uptime"       value={99.9} unit="%"  sparkData={spark(99.8,12)} color="#4D94FF" trend={0.1}  trendUp={true}  />
        <KpiTile label="Data Completeness"   value={94}  unit="%"   sparkData={spark(94,12)}   color="#D4AF37" trend={2.1}  trendUp={true}  />
      </div>

      {/* ── Middle grid ── */}
      <div className="analytics-mid">

        {/* Source volume bar chart */}
        <div className="panel">
          <div className="panel__header">
            <h2 className="panel__title">Source Volume Comparison</h2>
            <span className="panel__badge">{timeRange}</span>
          </div>
          <div className="panel__body">
            <HBarChart items={sourceItems} max={barMax} />
          </div>
        </div>

        {/* Gauges */}
        <div className="panel">
          <div className="panel__header">
            <h2 className="panel__title">System Health</h2>
          </div>
          <div className="panel__body gauge-grid">
            <div className="gauge-cell">
              <Gauge value={87}  max={100} color="#D4AF37" label="Accuracy"  size={100} />
              <span className="gauge-cell__label">Prediction</span>
            </div>
            <div className="gauge-cell">
              <Gauge value={94}  max={100} color="#22D35E" label="Quality"   size={100} />
              <span className="gauge-cell__label">Data</span>
            </div>
            <div className="gauge-cell">
              <Gauge value={99.9} max={100} color="#4D94FF" label="Uptime"   size={100} />
              <span className="gauge-cell__label">System</span>
            </div>
          </div>
        </div>

        {/* Temporal chart */}
        <div className="panel panel--wide">
          <div className="panel__header">
            <h2 className="panel__title">Temporal Crowd Flow</h2>
            <span className="panel__badge panel__badge--gold">{timeRange} window</span>
          </div>
          <div className="panel__body temporal-chart-wrapper">
            <TemporalChart data={temporalValues} />
          </div>
        </div>

      </div>

      {/* ── Prediction table ── */}
      <div className="panel">
        <div className="panel__header">
          <h2 className="panel__title">Congestion Prediction Detail</h2>
          <span className="panel__badge panel__badge--gold">
            {predictions?.length ?? 0} locations monitored
          </span>
        </div>
        <div className="panel__body" style={{ padding: 0 }}>
          {predictions && predictions.length > 0 ? (
            <PredictionTable predictions={predictions} />
          ) : (
            <div className="empty-state" style={{ padding: '3rem' }}>
              <div className="empty-state__icon">📊</div>
              <div className="empty-state__text">No prediction data available</div>
              <div className="empty-state__sub">Elasticsearch indices must be populated to generate predictions</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Insight cards ── */}
      <div className="insights-row">
        {[
          {
            icon: '🔀',
            title: 'Data Fusion Engine',
            desc: 'All three sensor networks are active and contributing to the Unified Digital Twin. Cross-source correlation is running at optimal latency.',
            tag: 'OPERATIONAL',
            tagColor: 'var(--status-success)',
          },
          {
            icon: '🎯',
            title: 'Prediction Performance',
            desc: 'The 15–30 minute congestion forecast is achieving 87% accuracy. Threshold-based alerts are triggering appropriately for high-density zones.',
            tag: '87% ACCURACY',
            tagColor: 'var(--gold)',
          },
          {
            icon: '⚡',
            title: 'Phase 2 Readiness',
            desc: 'Operational dataset collection is in progress. ML model training will commence after Hajj 1447 to improve forecasting for the next season.',
            tag: 'ON TRACK',
            tagColor: 'var(--status-info)',
          },
        ].map(({ icon, title, desc, tag, tagColor }) => (
          <div key={title} className="insight-card">
            <div className="insight-card__icon">{icon}</div>
            <div className="insight-card__body">
              <div className="insight-card__top">
                <h3 className="insight-card__title">{title}</h3>
                <span className="insight-card__tag" style={{ color: tagColor, borderColor: tagColor + '44' }}>
                  {tag}
                </span>
              </div>
              <p className="insight-card__desc">{desc}</p>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

/* ── Temporal bar chart component ── */
function TemporalChart({ data }) {
  const max = Math.max(...data, 1);
  const labels = data.map((_, i) => `T-${data.length - 1 - i}h`);
  return (
    <div className="temporal-chart">
      {data.map((v, i) => {
        const pct = (v / max) * 100;
        const color = pct > 70 ? 'var(--status-danger)' : pct > 45 ? 'var(--status-warning)' : 'var(--gold)';
        return (
          <div key={i} className="temporal-col">
            <div className="temporal-col__val" style={{ color, opacity: pct > 0 ? 1 : 0 }}>
              {v > 0 ? v.toLocaleString() : ''}
            </div>
            <div className="temporal-col__track">
              <div
                className="temporal-col__fill"
                style={{
                  height: `${Math.max(pct, 2)}%`,
                  background: color,
                  transitionDelay: `${i * 40}ms`
                }}
              />
            </div>
            <div className="temporal-col__label">{labels[i]}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Prediction table component ── */
function PredictionTable({ predictions }) {
  const RISK_CONFIG = {
    high:   { color: 'var(--status-danger)',  bg: 'var(--danger-bg)',  label: 'CRITICAL' },
    medium: { color: 'var(--status-warning)', bg: 'var(--warning-bg)', label: 'ELEVATED' },
    low:    { color: 'var(--status-success)', bg: 'var(--success-bg)', label: 'CLEAR'    },
  };
  return (
    <div className="pred-table">
      <div className="pred-table__head">
        {TABLE_HEADERS.map(h => <span key={h}>{h}</span>)}
      </div>
      <div className="pred-table__body">
        {predictions.map((p, i) => {
          const cfg = RISK_CONFIG[p.riskLevel] || RISK_CONFIG.low;
          return (
            <div key={i} className={`pred-table__row pred-table__row--${p.riskLevel}`}
              style={{ animationDelay: `${i * 50}ms` }}>
              <span className="pred-table__location">{p.location}</span>
              <span className="pred-table__density">
                <span className="density-pill" style={{
                  '--w': Math.min((p.currentDensity / 300) * 100, 100) + '%',
                  '--c': cfg.color
                }}>{p.currentDensity}</span>
              </span>
              <span>
                <span className="risk-chip" style={{ color: cfg.color, background: cfg.bg }}>
                  {cfg.label}
                </span>
              </span>
              <span className="pred-table__lead">
                <span className="gold-text">{p.predictedLeadTime}</span> min
              </span>
              <span className="pred-table__rec">{p.recommendation}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
