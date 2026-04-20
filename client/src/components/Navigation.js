import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navigation.css';

const NAV_ITEMS = [
  {
    to: '/',
    label: 'Dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  {
    to: '/map',
    label: 'Live Map',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
        <line x1="9" y1="3" x2="9" y2="18"/>
        <line x1="15" y1="6" x2="15" y2="21"/>
      </svg>
    ),
  },
  {
    to: '/analytics',
    label: 'Analytics',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6"  y1="20" x2="6"  y2="14"/>
        <line x1="2"  y1="20" x2="22" y2="20"/>
      </svg>
    ),
  },
];

const Navigation = () => {
  const { pathname } = useLocation();

  return (
    <nav className="nav">
      <div className="nav-inner">
        <ul className="nav-list" role="list">
          {NAV_ITEMS.map(({ to, label, icon }) => {
            const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
            return (
              <li key={to} className="nav-item">
                <Link to={to} className={`nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
                  <span className="nav-icon">{icon}</span>
                  <span className="nav-label">{label}</span>
                  {active && <span className="nav-indicator" aria-hidden="true" />}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Decorative right side info */}
        <div className="nav-meta">
          <span className="nav-meta-item">
            <span className="dot dot--gold" />
            <span>Hajj 1447</span>
          </span>
          <span className="nav-meta-sep" aria-hidden="true">·</span>
          <span className="nav-meta-item">Mina, Makkah Al-Mukarramah</span>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
