/* DataSourceCard is now rendered inline in Dashboard.js as SourceRow.
   This file is kept to avoid stale import errors during migration. */
import React from 'react';

const DataSourceCard = ({ title, icon, count, status, description }) => {
  return (
    <div className="source-row">
      <div className="source-row__icon">{icon}</div>
      <div className="source-row__info">
        <div className="source-row__name">{title}</div>
        <div className="source-row__desc">{description}</div>
      </div>
      <div className="source-row__stats">
        <div className="source-row__count">{count?.toLocaleString()}</div>
        <div className="source-row__unit">Records</div>
      </div>
      <span className={`status-badge status-badge--${status}`}>
        <span className="status-badge__dot" />{status?.toUpperCase()}
      </span>
    </div>
  );
};

export default DataSourceCard;
