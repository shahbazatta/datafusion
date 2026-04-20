/* HealthStatus is rendered inline in Dashboard.js. Kept to avoid stale imports. */
import React from 'react';

const HealthStatus = ({ data }) => {
  if (!data) return null;
  return (
    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
      {Object.entries(data).map(([key, status]) => (
        <span key={key} className={`status-badge status-badge--${status}`}>
          <span className="status-badge__dot" />{key.toUpperCase()}: {status.toUpperCase()}
        </span>
      ))}
    </div>
  );
};

export default HealthStatus;
