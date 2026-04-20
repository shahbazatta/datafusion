/* PredictionWidget is now rendered inline in Dashboard.js as PredictionRow.
   Kept to avoid stale import errors. */
import React from 'react';

const RISK_CONFIG = {
  high:   { color: 'var(--status-danger)',  bg: 'var(--danger-bg)',  label: 'CRITICAL' },
  medium: { color: 'var(--status-warning)', bg: 'var(--warning-bg)', label: 'ELEVATED' },
  low:    { color: 'var(--status-success)', bg: 'var(--success-bg)', label: 'CLEAR'    },
};

const PredictionWidget = ({ prediction }) => {
  const cfg = RISK_CONFIG[prediction.riskLevel] || RISK_CONFIG.low;
  return (
    <div style={{ padding: '0.75rem', border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--bg-card)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{prediction.location}</strong>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: cfg.color, background: cfg.bg, padding: '2px 6px', borderRadius: 3 }}>
          {cfg.label}
        </span>
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        Density: {prediction.currentDensity} · Lead: <span style={{ color: 'var(--gold)' }}>{prediction.predictedLeadTime} min</span>
      </div>
    </div>
  );
};

export default PredictionWidget;
