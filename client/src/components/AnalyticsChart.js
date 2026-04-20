/* AnalyticsChart is now the inline TemporalChart in Analytics.js. Kept to avoid stale imports. */
import React from 'react';

const AnalyticsChart = ({ data }) => {
  if (!data?.buckets?.length) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderRadius: 8 }}>
        No temporal data available
      </div>
    );
  }
  const values = data.buckets.map(b => b.total_people?.value || 0);
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, padding: '0.5rem 0' }}>
      {values.slice(-12).map((v, i) => (
        <div key={i} title={v} style={{
          flex: 1,
          height: `${Math.max((v / max) * 100, 3)}%`,
          background: 'linear-gradient(180deg,var(--gold) 0%,var(--gold-dark) 100%)',
          borderRadius: '3px 3px 0 0',
          transition: 'height 0.8s'
        }} />
      ))}
    </div>
  );
};

export default AnalyticsChart;
