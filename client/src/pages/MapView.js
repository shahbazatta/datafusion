import React, { useState, useEffect, useCallback, useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { Map, NavigationControl } from 'react-map-gl';
import { ScatterplotLayer, ColumnLayer, TextLayer, ArcLayer } from '@deck.gl/layers';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useDataFusion } from '../context/DataFusionContext';
import './MapView.css';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

const INITIAL_VIEW_STATE = {
  longitude: 39.860,
  latitude:  21.420,
  zoom:      13.8,
  pitch:     50,
  bearing:   -10,
  transitionDuration: 1000,
};

const RISK_CONFIG = {
  high:   { color: '#F03E3E', bg: 'rgba(240,62,62,0.12)',  label: 'CRITICAL', pulse: true  },
  medium: { color: '#F5A623', bg: 'rgba(245,166,35,0.12)', label: 'ELEVATED', pulse: false },
  low:    { color: '#22D35E', bg: 'rgba(34,211,94,0.12)',  label: 'CLEAR',    pulse: false },
};

const MINA_ZONES = [
  { id: 'JAM-A', name: 'Jamarat – Lower',    coords: [39.8732, 21.4225], capacity: 300 },
  { id: 'JAM-B', name: 'Jamarat – Upper',    coords: [39.8735, 21.4235], capacity: 250 },
  { id: 'KHAT',  name: 'Khatm al-Layl',      coords: [39.8600, 21.4182], capacity: 200 },
  { id: 'TASH',  name: 'Tashreeq Camps',     coords: [39.8550, 21.4205], capacity: 400 },
  { id: 'AQBA',  name: 'Aqabah Junction',    coords: [39.8655, 21.4102], capacity: 180 },
  { id: 'MUSD',  name: 'Muzdalifah Approach',coords: [39.8400, 21.4295], capacity: 350 },
];

/* ── Density simulation ── */
const BASE_DENSITIES = [175, 228, 88, 145, 62, 130];

function getDensity(zoneIndex, tick) {
  const base  = BASE_DENSITIES[zoneIndex] || 100;
  const noise = Math.round(Math.sin(tick * 0.6 + zoneIndex * 1.3) * 22);
  return Math.max(0, base + noise);
}

function getRisk(density, capacity) {
  const pct = density / capacity;
  if (pct > 0.65) return 'high';
  if (pct > 0.40) return 'medium';
  return 'low';
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return [r, g, b];
}

/* ── Alert item (sidebar) ── */
function AlertItem({ alert, index }) {
  const cfg = RISK_CONFIG[alert.riskLevel] || RISK_CONFIG.low;
  return (
    <div className="alert-item" style={{ '--risk-color': cfg.color, animationDelay: `${index * 80}ms` }}>
      <div className="alert-item__bar" style={{ background: cfg.color }} />
      <div className="alert-item__body">
        <div className="alert-item__header">
          <span className="alert-item__zone">{alert.name}</span>
          <span className="alert-item__tag" style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
        </div>
        <div className="alert-item__detail">
          <span>Density: <strong>{alert.density}</strong></span>
          <span>Capacity: <strong style={{ color: '#D4AF37' }}>{Math.round((alert.density / alert.capacity) * 100)}%</strong></span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAP VIEW
═══════════════════════════════════════ */
export default function MapView() {
  const { fusedData, predictions } = useDataFusion();
  const [layer,      setLayer]    = useState('fused');
  const [selected,   setSelected] = useState(null);
  const [viewState,  setViewState] = useState(INITIAL_VIEW_STATE);
  const [tick,       setTick]     = useState(0);
  const [tooltip,    setTooltip]  = useState(null);

  /* Animate density every 3 s */
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 3000);
    return () => clearInterval(t);
  }, []);

  /* Build zone data with live density */
  const zoneData = useMemo(() => MINA_ZONES.map((zone, i) => {
    const density = getDensity(i, tick);
    const risk    = getRisk(density, zone.capacity);
    const cfg     = RISK_CONFIG[risk];
    return { ...zone, density, risk, cfg };
  }), [tick]);

  /* Fly to a zone when selected */
  const flyTo = useCallback((zone) => {
    setViewState(vs => ({
      ...vs,
      longitude: zone.coords[0],
      latitude:  zone.coords[1],
      zoom: 15,
      pitch: 55,
      transitionDuration: 800,
    }));
  }, []);

  /* ── DeckGL Layers ── */
  const deckLayers = useMemo(() => {
    /* Glow halo – large soft circles */
    const haloLayer = new ScatterplotLayer({
      id: 'zone-halo',
      data: zoneData,
      getPosition: d => d.coords,
      getRadius: d => Math.sqrt(d.density) * 18,
      getFillColor: d => [...hexToRgb(d.cfg.color), 30],
      stroked: false,
      radiusMinPixels: 30,
      radiusMaxPixels: 140,
    });

    /* 3-D columns – height = density */
    const columnLayer = new ColumnLayer({
      id: 'zone-columns',
      data: zoneData,
      getPosition: d => d.coords,
      getElevation: d => d.density * 3.5,
      getDiskResolution: 24,
      diskResolution: 24,
      radius: 55,
      extruded: true,
      getFillColor: d => [...hexToRgb(d.cfg.color), 210],
      getLineColor: d => [...hexToRgb(d.cfg.color), 255],
      lineWidthMinPixels: 1,
      pickable: true,
      elevationScale: 1,
      onHover: ({ object, x, y }) => {
        setTooltip(object ? { object, x, y } : null);
      },
      onClick: ({ object }) => {
        if (object) {
          setSelected(object.id === selected ? null : object.id);
          flyTo(object);
        }
      },
    });

    /* Inner dot */
    const dotLayer = new ScatterplotLayer({
      id: 'zone-dots',
      data: zoneData,
      getPosition: d => d.coords,
      getRadius: 30,
      getFillColor: d => [...hexToRgb(d.cfg.color), 255],
      stroked: true,
      getLineColor: [255, 255, 255, 200],
      lineWidthMinPixels: 2,
      radiusMinPixels: 8,
      radiusMaxPixels: 20,
      pickable: true,
      onHover: ({ object, x, y }) => {
        setTooltip(object ? { object, x, y } : null);
      },
      onClick: ({ object }) => {
        if (object) {
          setSelected(object.id === selected ? null : object.id);
          flyTo(object);
        }
      },
    });

    /* Zone ID labels */
    const labelLayer = new TextLayer({
      id: 'zone-labels',
      data: zoneData,
      getPosition: d => d.coords,
      getText: d => d.id,
      getSize: 13,
      getColor: [255, 255, 255, 230],
      getBackgroundColor: d => [...hexToRgb(d.cfg.color), 200],
      background: true,
      backgroundPadding: [5, 3],
      getBorderRadius: 4,
      fontFamily: 'Space Grotesk, Inter, sans-serif',
      fontWeight: 800,
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'bottom',
      getPixelOffset: [0, -22],
      pickable: false,
    });

    /* Arc from selected zone to Jamarat (illustrative flow line) */
    const arcLayer = selected
      ? new ArcLayer({
          id: 'flow-arc',
          data: zoneData.filter(d => d.id !== selected).slice(0, 3),
          getSourcePosition: () => (zoneData.find(d => d.id === selected) || zoneData[0]).coords,
          getTargetPosition: d => d.coords,
          getSourceColor: [212, 175, 55, 200],
          getTargetColor: d => [...hexToRgb(d.cfg.color), 180],
          getWidth: 2,
          widthMinPixels: 1,
          widthMaxPixels: 4,
        })
      : null;

    return [haloLayer, columnLayer, dotLayer, labelLayer, arcLayer].filter(Boolean);
  }, [zoneData, selected, flyTo]);

  /* Map style options */
  const MAP_STYLES = {
    dark:      'mapbox://styles/mapbox/dark-v11',
    satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
    night:     'mapbox://styles/mapbox/navigation-night-v1',
  };
  const [mapStyle, setMapStyle] = useState('satellite');

  const counts = fusedData?.sources;
  const health = fusedData?.healthStatus;

  const activeAlerts = zoneData.filter(z => z.risk !== 'low');

  return (
    <div className="mapview">

      {/* ── Page header ── */}
      <div className="page-header">
        <div className="page-header__left">
          <h1 className="page-title"><span className="gold-text">Live</span> Map &amp; Visualization</h1>
          <p className="page-desc">
            Real-time crowd density · 3-D column layer · Interactive Mina zone monitoring
          </p>
        </div>
        <div className="page-header__right map-toolbar">
          {/* Layer */}
          <div className="toolbar-group">
            <span className="toolbar-label">Data</span>
            {['rfid','camera','tafweej','fused'].map(l => (
              <button key={l} className={`layer-btn ${layer===l?'active':''}`} onClick={() => setLayer(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          {/* Style */}
          <div className="toolbar-group">
            <span className="toolbar-label">Basemap</span>
            {Object.keys(MAP_STYLES).map(s => (
              <button key={s} className={`layer-btn ${mapStyle===s?'active':''}`} onClick={() => setMapStyle(s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="mapview-grid">

        {/* ── Mapbox + DeckGL canvas ── */}
        <div className="map-canvas">
          <div className="map-canvas__header">
            <div className="map-canvas__title">
              <span className="dot dot--gold" />
              Mina, Makkah Al-Mukarramah &nbsp;·&nbsp; {layer === 'fused' ? 'Fused Overlay' : layer.toUpperCase() + ' Layer'}
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div className="map-canvas__coords">21.420° N &nbsp; 39.860° E</div>
              {selected && (
                <button className="btn-clear-sel" onClick={() => setSelected(null)}>
                  Clear selection
                </button>
              )}
            </div>
          </div>

          {/* ── DeckGL Map ── */}
          <div className="map-body">
            {MAPBOX_TOKEN ? (
              <DeckGL
                viewState={viewState}
                onViewStateChange={({ viewState: vs }) => setViewState(vs)}
                controller={true}
                layers={deckLayers}
                style={{ width: '100%', height: '100%' }}
                getCursor={({ isDragging }) => isDragging ? 'grabbing' : 'grab'}
              >
                <Map
                  mapboxAccessToken={MAPBOX_TOKEN}
                  mapStyle={MAP_STYLES[mapStyle]}
                  reuseMaps
                >
                  <NavigationControl position="top-left" showCompass showZoom />
                </Map>
              </DeckGL>
            ) : (
              <div className="map-no-token">
                <div className="map-notice">
                  <div className="map-notice__icon">🗺️</div>
                  <div className="map-notice__title">Mapbox Token Missing</div>
                  <div className="map-notice__sub">
                    Add <code>REACT_APP_MAPBOX_TOKEN</code> to your <code>.env</code> file
                    and restart the dev server.
                  </div>
                </div>
              </div>
            )}

            {/* DeckGL tooltip */}
            {tooltip && (
              <div className="deck-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y - 40 }}>
                <strong>{tooltip.object.id}</strong> — {tooltip.object.name}<br />
                Density: <span style={{ color: tooltip.object.cfg.color }}>{tooltip.object.density}</span>
                &nbsp;/&nbsp;Cap: {tooltip.object.capacity}
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="map-legend">
            <span className="map-legend__title">Density Scale</span>
            <div className="map-legend__scale">
              <span style={{ color: '#22D35E' }}>▲ CLEAR</span>
              <span style={{ color: '#F5A623' }}>▲ ELEVATED</span>
              <span style={{ color: '#F03E3E' }}>▲ CRITICAL</span>
            </div>
            <span className="map-legend__hint">Click column to select zone · Drag to pan · Scroll to zoom</span>
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div className="map-sidebar">

          {/* Zone list */}
          <div className="panel">
            <div className="panel__header">
              <h2 className="panel__title">Zone Occupancy</h2>
              <span className="panel__badge panel__badge--gold">
                {activeAlerts.length} alerts
              </span>
            </div>
            <div className="panel__body" style={{ padding: '0.5rem' }}>
              <div className="zone-list">
                {zoneData.map(zone => {
                  const pct = Math.round((zone.density / zone.capacity) * 100);
                  const isSelected = selected === zone.id;
                  return (
                    <button
                      key={zone.id}
                      className={`zone-list-item ${isSelected ? 'zone-list-item--sel' : ''}`}
                      style={{ '--rc': zone.cfg.color }}
                      onClick={() => { setSelected(isSelected ? null : zone.id); flyTo(zone); }}
                    >
                      <div className="zli-top">
                        <span className="zli-id">{zone.id}</span>
                        <span className="zli-risk" style={{ color: zone.cfg.color, background: zone.cfg.bg }}>
                          {zone.cfg.label}
                        </span>
                      </div>
                      <div className="zli-name">{zone.name}</div>
                      <div className="zli-bar">
                        <div className="zli-bar-fill" style={{ width: `${pct}%`, background: zone.cfg.color }} />
                      </div>
                      <div className="zli-stats">
                        <span>{zone.density} / {zone.capacity}</span>
                        <span style={{ color: zone.cfg.color, fontWeight: 700 }}>{pct}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Active alerts */}
          <div className="panel">
            <div className="panel__header">
              <h2 className="panel__title">Active Alerts</h2>
              <span className="panel__badge">{activeAlerts.length} zones</span>
            </div>
            <div className="panel__body alert-list">
              {activeAlerts.length > 0
                ? activeAlerts.map((z, i) => (
                    <AlertItem key={z.id} alert={{ name: z.name, density: z.density, capacity: z.capacity, riskLevel: z.risk }} index={i} />
                  ))
                : (
                  <div className="empty-state">
                    <div className="empty-state__icon">✅</div>
                    <div className="empty-state__text">All zones clear</div>
                  </div>
                )
              }
            </div>
          </div>

          {/* Data source stats */}
          <div className="panel">
            <div className="panel__header">
              <h2 className="panel__title">Source Statistics</h2>
            </div>
            <div className="panel__body" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {[
                { key: 'rfid',    label: 'RFID Readers',  icon: '📡' },
                { key: 'camera',  label: 'Cameras',        icon: '📷' },
                { key: 'tafweej', label: 'Tafweej App',    icon: '📲' },
              ].map(s => (
                <div key={s.key} className={`layer-stat ${layer === s.key || layer === 'fused' ? 'layer-stat--active' : ''}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1rem' }}>{s.icon}</span>
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{s.label}</div>
                      <span className={`status-badge status-badge--${health?.[s.key] ?? 'inactive'}`} style={{ marginTop: 2, display: 'inline-flex' }}>
                        <span className="status-badge__dot" />
                        {(health?.[s.key] ?? 'inactive').toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {(counts?.[s.key]?.count ?? 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
