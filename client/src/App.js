import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import MapView from './pages/MapView';
import Analytics from './pages/Analytics';
import Navigation from './components/Navigation';
import DataFusionProvider from './context/DataFusionContext';
import './App.css';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const res = await fetch('/api/fused');
        setIsConnected(res.ok);
      } catch {
        setIsConnected(false);
      }
    };
    checkConnection();
    const connInterval = setInterval(checkConnection, 30_000);
    return () => clearInterval(connInterval);
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setClock(new Date()), 1_000);
    return () => clearInterval(tick);
  }, []);

  const pad = n => String(n).padStart(2, '0');
  const timeStr = `${pad(clock.getHours())}:${pad(clock.getMinutes())}:${pad(clock.getSeconds())}`;
  const dateStr = clock.toLocaleDateString('en-SA', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });

  return (
    <DataFusionProvider>
      <Router>
        <div className="app">
          {/* ── Header ── */}
          <header className="app-header">
            <div className="header-inner">
              {/* Brand */}
              <div className="header-brand">
                <div className="brand-logo" aria-hidden="true">🛰️</div>
                <div className="brand-text">
                  <div className="brand-title">TAFWEEJ DATA FUSION</div>
                  <div className="brand-subtitle">Ministry of Hajj &amp; Umrah · Mina Operations</div>
                </div>
              </div>

              {/* Right controls */}
              <div className="header-right">
                <div className="live-badge">
                  <span className="live-dot" />
                  <span className="live-text">LIVE</span>
                </div>

                <div className={`conn-pill ${isConnected ? 'connected' : 'disconnected'}`}>
                  <span className="conn-pill-dot" />
                  <span className="conn-text">{isConnected ? 'ES Connected' : 'Disconnected'}</span>
                </div>

                <div className="header-timestamp">
                  <div style={{ fontWeight: 600 }}>{timeStr}</div>
                  <div style={{ fontSize: '0.68rem', marginTop: 1 }}>{dateStr}</div>
                </div>
              </div>
            </div>
          </header>

          {/* ── Navigation ── */}
          <Navigation />

          {/* ── Pages ── */}
          <main className="app-main">
            <Routes>
              <Route path="/"         element={<Dashboard />} />
              <Route path="/map"      element={<MapView />} />
              <Route path="/analytics" element={<Analytics />} />
            </Routes>
          </main>

          {/* ── Footer ── */}
          <footer className="app-footer">
            <div className="footer-inner">
              <div className="footer-left">
                <span>© 2026 Ministry of Hajj and Umrah</span>
                <span className="footer-divider">·</span>
                <span>Tafweej Data Fusion Platform</span>
                <span className="footer-divider">·</span>
                <span>v1.0.0 Phase I</span>
              </div>
              <div className="footer-right">
                Real-Time Operational Intelligence · Mina Congestion Prediction
              </div>
            </div>
          </footer>
        </div>
      </Router>
    </DataFusionProvider>
  );
}

export default App;
