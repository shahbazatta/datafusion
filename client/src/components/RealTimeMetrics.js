/* RealTimeMetrics is rendered inline in Dashboard.js as MetricCard. Kept to avoid stale imports. */
import React from 'react';

const RealTimeMetrics = ({ metrics }) => {
  if (!metrics) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '1rem' }}>
      {[
        { label: 'RFID',    val: metrics.totalPeopleRFID    },
        { label: 'Camera',  val: metrics.totalPeopleCamera  },
        { label: 'Tafweej', val: metrics.totalPeopleTafweej },
        { label: 'Density', val: metrics.averageDensity     },
      ].map(({ label, val }) => (
        <div key={label} style={{
          background: 'var(--bg-elevated)',
          borderRadius: 8,
          padding: '1rem',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{val?.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
};

export default RealTimeMetrics;
