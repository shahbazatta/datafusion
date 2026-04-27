import React, { useState, useCallback, useMemo } from 'react';
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

const MAP_STYLES = {
  dark:      'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  night:     'mapbox://styles/mapbox/navigation-night-v1',
};

/* ── Risk palette ─────────────────────────────────────────────── */
const RISK = {
  high:   { hex: '#F03E3E', rgb: [240,  62,  62], bg: 'rgba(240,62,62,0.12)',   label: 'CRITICAL' },
  medium: { hex: '#F5A623', rgb: [245, 166,  35], bg: 'rgba(245,166,35,0.12)',  label: 'ELEVATED' },
  low:    { hex: '#22D35E', rgb: [ 34, 211,  94], bg: 'rgba(34,211,94,0.12)',   label: 'CLEAR'    },
};

/* ── Tafweej camp colour palette ──────────────────────────────── */
const CAMP_HEX = [
  '#D4AF37','#E74C3C','#3498DB','#2ECC71','#9B59B6',
  '#E67E22','#1ABC9C','#F39C12','#E91E63','#00BCD4',
  '#8BC34A','#FF5722','#607D8B','#AB47BC','#26C6DA',
];
const CAMP_RGB = [
  [212,175,55],[231,76,60],[52,152,219],[46,204,113],[155,89,182],
  [230,126,34],[26,188,156],[243,156,18],[233,30,99],[0,188,212],
  [139,195,74],[255,87,34],[96,125,139],[171,71,188],[38,198,218],
];

/* ── Helpers ──────────────────────────────────────────────────── */
function computeRisk(value, high, medium) {
  if (value >= high)  return 'high';
  if (value >= medium) return 'medium';
  return 'low';
}

/* ══════════════════════════════════════════════════════════════
   SUB-COMPONENTS
══════════════════════════════════════════════════════════════ */

/* Alert item in sidebar */
function AlertItem({ name, value, valueLabel, riskLevel, index }) {
  const cfg = RISK[riskLevel] || RISK.low;
  return (
    <div className="alert-item" style={{ '--risk-color': cfg.hex, animationDelay: `${index * 70}ms` }}>
      <div className="alert-item__bar" style={{ background: cfg.hex }} />
      <div className="alert-item__body">
        <div className="alert-item__header">
          <span className="alert-item__zone">{name}</span>
          <span className="alert-item__tag" style={{ color: cfg.hex, background: cfg.bg }}>{cfg.label}</span>
        </div>
        <div className="alert-item__detail">
          <span>{valueLabel}: <strong>{typeof value === 'number' ? value.toLocaleString() : value}</strong></span>
        </div>
      </div>
    </div>
  );
}

/* Loading skeleton row */
function SkeletonRow() {
  return (
    <div style={{
      height: 52, borderRadius: 8, background: 'var(--bg-elevated)',
      border: '1px solid var(--border-subtle)', marginBottom: 6,
      animation: 'pulse 1.6s ease infinite', opacity: 0.6
    }} />
  );
}

/* ══════════════════════════════════════════════════════════════
   MAP VIEW
══════════════════════════════════════════════════════════════ */
export default function MapView() {
  const { fusedData, mapData } = useDataFusion();

  const [layer,     setLayer]    = useState('rfid');
  const [selected,  setSelected] = useState(null);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [tooltip,   setTooltip]  = useState(null);
  const [mapStyle,  setMapStyle]  = useState('satellite');

  const isLoading = !mapData;
  const health    = fusedData?.healthStatus;
  const fCounts   = fusedData?.sources;

  /* ── Build camp → colour map for Tafweej ─────────────────── */
  const campColorMap = useMemo(() => {
    if (!mapData?.tafweej?.length) return {};
    const camps = [...new Set(mapData.tafweej.map(p => p.camp_label))].sort();
    return Object.fromEntries(camps.map((c, i) => [
      c, { hex: CAMP_HEX[i % CAMP_HEX.length], rgb: CAMP_RGB[i % CAMP_RGB.length] }
    ]));
  }, [mapData?.tafweej]);

  /* ── Enrich RFID points with risk ────────────────────────── */
  const rfidPoints = useMemo(() => {
    if (!mapData?.rfid?.length) return [];
    const vals = mapData.rfid.map(p => p.people_count);
    const max  = Math.max(...vals, 1);
    return mapData.rfid.map(p => {
      const risk = computeRisk(p.people_count, max * 0.66, max * 0.33);
      return { ...p, risk, cfg: RISK[risk], coords: [p.lon, p.lat] };
    });
  }, [mapData?.rfid]);

  /* ── Enrich Camera points with risk ──────────────────────── */
  const cameraPoints = useMemo(() => {
    if (!mapData?.camera?.length) return [];
    const vals   = mapData.camera.map(p => p.enteredToday || p.people_count);
    const max    = Math.max(...vals, 1);
    return mapData.camera.map(p => {
      const metric = p.enteredToday || p.people_count;
      const risk   = computeRisk(metric, max * 0.66, max * 0.33);
      return { ...p, metric, risk, cfg: RISK[risk], coords: [p.lon, p.lat] };
    });
  }, [mapData?.camera]);

  /* ── Enrich Tafweej points with colour ───────────────────── */
  const tafweejPoints = useMemo(() => {
    if (!mapData?.tafweej?.length) return [];
    return mapData.tafweej.map(p => {
      const ci = campColorMap[p.camp_label] || { hex: '#D4AF37', rgb: [212,175,55] };
      return { ...p, ci, coords: [p.lon, p.lat] };
    });
  }, [mapData?.tafweej, campColorMap]);

  /* ── Tafweej grouped by camp (sidebar) ───────────────────── */
  const tafweejByCamp = useMemo(() => {
    return tafweejPoints.reduce((acc, p) => {
      const k = p.camp_label || 'Unknown';
      (acc[k] = acc[k] || []).push(p);
      return acc;
    }, {});
  }, [tafweejPoints]);

  /* ── Active alerts ───────────────────────────────────────── */
  const activeAlerts = useMemo(() => {
    const pts = layer === 'camera' ? cameraPoints
              : layer === 'fused'  ? [...rfidPoints, ...cameraPoints]
              :                      rfidPoints;
    return pts.filter(p => p.risk !== 'low');
  }, [layer, rfidPoints, cameraPoints]);

  /* ── Fly to a point ──────────────────────────────────────── */
  const flyTo = useCallback((point) => {
    setViewState(vs => ({
      ...vs,
      longitude: point.coords[0],
      latitude:  point.coords[1],
      zoom: 15.5,
      pitch: 55,
      transitionDuration: 800,
    }));
  }, []);

  /* ══════════════════════════════════════════════════════════
     DeckGL layers
  ══════════════════════════════════════════════════════════ */
  const deckLayers = useMemo(() => {
    const L = [];

    /* ── RFID layers ──────────────────────────────────────── */
    if ((layer === 'rfid' || layer === 'fused') && rfidPoints.length) {
      L.push(new ScatterplotLayer({
        id: 'rfid-halo',
        data: rfidPoints,
        getPosition: d => d.coords,
        getRadius: d => Math.sqrt(d.people_count + 1) * 22,
        getFillColor: d => [...d.cfg.rgb, 28],
        stroked: false,
        radiusMinPixels: 22,
        radiusMaxPixels: 130,
      }));

      L.push(new ColumnLayer({
        id: 'rfid-columns',
        data: rfidPoints,
        getPosition: d => d.coords,
        getElevation: d => (d.people_count + 1) * 4.5,
        diskResolution: 20,
        radius: layer === 'fused' ? 44 : 52,
        extruded: true,
        getFillColor: d => [...d.cfg.rgb, 210],
        getLineColor: d => [...d.cfg.rgb, 255],
        lineWidthMinPixels: 1,
        pickable: true,
        onHover: ({ object, x, y }) =>
          setTooltip(object ? { object, x, y, type: 'rfid' } : null),
        onClick: ({ object }) => {
          if (object) { setSelected(s => s === object.id ? null : object.id); flyTo(object); }
        },
      }));

      if (layer === 'rfid') {
        L.push(new TextLayer({
          id: 'rfid-labels',
          data: rfidPoints,
          getPosition: d => d.coords,
          getText: d => (d.camp_label || d.id).slice(0, 14),
          getSize: 11,
          getColor: [255, 255, 255, 220],
          getBackgroundColor: d => [...d.cfg.rgb, 200],
          background: true,
          backgroundPadding: [4, 2],
          fontFamily: 'Space Grotesk, Inter, sans-serif',
          fontWeight: 700,
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'bottom',
          getPixelOffset: [0, -22],
          pickable: false,
        }));
      }
    }

    /* ── Camera layers ────────────────────────────────────── */
    if ((layer === 'camera' || layer === 'fused') && cameraPoints.length) {
      L.push(new ScatterplotLayer({
        id: 'camera-halo',
        data: cameraPoints,
        getPosition: d => d.coords,
        getRadius: d => Math.sqrt(d.metric + 1) * 14,
        getFillColor: d => [...d.cfg.rgb, 22],
        stroked: false,
        radiusMinPixels: 18,
        radiusMaxPixels: 100,
      }));

      L.push(new ColumnLayer({
        id: 'camera-columns',
        data: cameraPoints,
        getPosition: d => d.coords,
        getElevation: d => (d.metric + 1) * 0.85,
        diskResolution: 20,
        radius: layer === 'fused' ? 30 : 48,
        extruded: true,
        getFillColor: d => [...d.cfg.rgb, 195],
        getLineColor: d => [...d.cfg.rgb, 255],
        lineWidthMinPixels: 1,
        pickable: true,
        onHover: ({ object, x, y }) =>
          setTooltip(object ? { object, x, y, type: 'camera' } : null),
        onClick: ({ object }) => {
          if (object) { setSelected(s => s === object.id ? null : object.id); flyTo(object); }
        },
      }));

      if (layer === 'camera') {
        L.push(new TextLayer({
          id: 'camera-labels',
          data: cameraPoints,
          getPosition: d => d.coords,
          getText: d => (d.camp_label || d.id).slice(0, 14),
          getSize: 11,
          getColor: [255, 255, 255, 220],
          getBackgroundColor: d => [...d.cfg.rgb, 200],
          background: true,
          backgroundPadding: [4, 2],
          fontFamily: 'Space Grotesk, Inter, sans-serif',
          fontWeight: 700,
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'bottom',
          getPixelOffset: [0, -22],
          pickable: false,
        }));
      }
    }

    /* ── Tafweej layers ───────────────────────────────────── */
    if ((layer === 'tafweej' || layer === 'fused') && tafweejPoints.length) {
      L.push(new ScatterplotLayer({
        id: 'tafweej-halo',
        data: tafweejPoints,
        getPosition: d => d.coords,
        getRadius: layer === 'fused' ? 20 : 32,
        getFillColor: d => [...d.ci.rgb, 22],
        stroked: false,
        radiusMinPixels: 12,
        radiusMaxPixels: 55,
      }));

      L.push(new ScatterplotLayer({
        id: 'tafweej-dots',
        data: tafweejPoints,
        getPosition: d => d.coords,
        getRadius: layer === 'fused' ? 12 : 18,
        getFillColor: d => [...d.ci.rgb, 225],
        stroked: true,
        getLineColor: [255, 255, 255, 170],
        lineWidthMinPixels: 1.5,
        radiusMinPixels: 5,
        radiusMaxPixels: layer === 'fused' ? 14 : 22,
        pickable: true,
        onHover: ({ object, x, y }) =>
          setTooltip(object ? { object, x, y, type: 'tafweej' } : null),
        onClick: ({ object }) => {
          if (object) { setSelected(s => s === object.id ? null : object.id); flyTo(object); }
        },
      }));
    }

    /* ── Arc from selected point ──────────────────────────── */
    if (selected && layer !== 'tafweej') {
      const allPts = [...rfidPoints, ...cameraPoints];
      const src    = allPts.find(d => d.id === selected);
      if (src && allPts.length > 1) {
        L.push(new ArcLayer({
          id: 'flow-arc',
          data: allPts.filter(d => d.id !== selected).slice(0, 5),
          getSourcePosition: () => src.coords,
          getTargetPosition: d => d.coords,
          getSourceColor: [212, 175, 55, 210],
          getTargetColor: d => [...(d.cfg?.rgb || [212, 175, 55]), 160],
          getWidth: 2,
          widthMinPixels: 1,
          widthMaxPixels: 4,
        }));
      }
    }

    return L;
  }, [layer, rfidPoints, cameraPoints, tafweejPoints, selected, flyTo]);

  /* ══════════════════════════════════════════════════════════
     Zone-list data for RFID / Camera / Fused sidebar
  ══════════════════════════════════════════════════════════ */
  const zoneListPoints = useMemo(() => {
    if (layer === 'camera') return cameraPoints;
    return rfidPoints;               // rfid + fused both show rfid list
  }, [layer, rfidPoints, cameraPoints]);

  const zoneListMax = useMemo(() => {
    if (!zoneListPoints.length) return 1;
    return Math.max(
      ...zoneListPoints.map(p => layer === 'camera' ? p.metric : p.people_count),
      1
    );
  }, [zoneListPoints, layer]);

  /* ══════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════ */
  return (
    <div className="mapview">

      {/* ── Page header ──────────────────────────────────── */}
      <div className="page-header">
        <div className="page-header__left">
          <h1 className="page-title">
            <span className="gold-text">Live</span> Map &amp; Visualization
          </h1>
          <p className="page-desc">
            Real-time crowd density · 3-D column layers · Mina zone monitoring
            {mapData && (
              <span style={{ marginLeft: '0.75rem', color: 'var(--gold)', fontSize: '0.7rem', fontWeight: 700 }}>
                · {mapData.counts?.rfid} RFID camps
                · {mapData.counts?.camera} cameras
                · {mapData.counts?.tafweej} groups
              </span>
            )}
          </p>
        </div>

        <div className="page-header__right map-toolbar">
          {/* Data layer */}
          <div className="toolbar-group">
            <span className="toolbar-label">Data</span>
            {['rfid','camera','tafweej','fused'].map(l => (
              <button
                key={l}
                className={`layer-btn ${layer === l ? 'active' : ''}`}
                onClick={() => { setLayer(l); setSelected(null); setTooltip(null); }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          {/* Basemap */}
          <div className="toolbar-group">
            <span className="toolbar-label">Basemap</span>
            {Object.keys(MAP_STYLES).map(s => (
              <button
                key={s}
                className={`layer-btn ${mapStyle === s ? 'active' : ''}`}
                onClick={() => setMapStyle(s)}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main grid ────────────────────────────────────── */}
      <div className="mapview-grid">

        {/* ── Map canvas ─────────────────────────────────── */}
        <div className="map-canvas">
          <div className="map-canvas__header">
            <div className="map-canvas__title">
              <span className="dot dot--gold" />
              Mina, Makkah Al-Mukarramah &nbsp;·&nbsp;
              {layer === 'fused'   ? 'All Sources Overlay'   :
               layer === 'rfid'    ? 'RFID Tracker Layer'    :
               layer === 'camera'  ? 'Camera Counting Layer' :
                                     'Tafweej App Layer'}
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

          {/* ── DeckGL canvas ────────────────────────────── */}
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
                    Add <code>REACT_APP_MAPBOX_TOKEN</code> to your{' '}
                    <code>client/.env</code> file and restart the dev server.
                  </div>
                </div>
              </div>
            )}

            {/* Loading badge */}
            {isLoading && MAPBOX_TOKEN && (
              <div style={{
                position: 'absolute', top: 12, right: 12,
                background: 'rgba(10,10,20,0.9)', border: '1px solid var(--gold-border)',
                borderRadius: 6, padding: '0.35rem 0.7rem',
                fontSize: '0.7rem', color: 'var(--gold)', fontWeight: 700, letterSpacing: '0.07em',
              }}>
                LOADING DATA…
              </div>
            )}

            {/* DeckGL tooltip */}
            {tooltip && (
              <div className="deck-tooltip" style={{ left: tooltip.x + 16, top: Math.max(8, tooltip.y - 44) }}>
                {tooltip.type === 'rfid' && (
                  <>
                    <strong>{tooltip.object.camp_label}</strong><br />
                    People:&nbsp;
                    <span style={{ color: tooltip.object.cfg.hex }}>
                      {tooltip.object.people_count?.toLocaleString()}
                    </span>
                    &ensp;·&ensp;Records:&nbsp;{tooltip.object.doc_count?.toLocaleString()}
                  </>
                )}
                {tooltip.type === 'camera' && (
                  <>
                    <strong>{tooltip.object.camp_label}</strong><br />
                    Entered today:&nbsp;
                    <span style={{ color: tooltip.object.cfg.hex }}>
                      {tooltip.object.enteredToday?.toLocaleString()}
                    </span><br />
                    This hour:&nbsp;↑{tooltip.object.enteredHour?.toLocaleString()}
                    &ensp;↓{tooltip.object.exitedHour?.toLocaleString()}
                  </>
                )}
                {tooltip.type === 'tafweej' && (
                  <>
                    <strong>Batch: {tooltip.object.batch_code}</strong><br />
                    Camp:&nbsp;
                    <span style={{ color: tooltip.object.ci.hex }}>
                      {tooltip.object.camp_label}
                    </span><br />
                    Records:&nbsp;{tooltip.object.doc_count}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Legend bar */}
          <div className="map-legend">
            <span className="map-legend__title">
              {layer === 'tafweej' ? 'Camp Groups' : 'Density Scale'}
            </span>

            {layer === 'tafweej' ? (
              <div className="map-legend__scale" style={{ flexWrap: 'wrap', gap: '0.55rem' }}>
                {Object.entries(campColorMap).slice(0, 7).map(([camp, c]) => (
                  <span key={camp} style={{ color: c.hex, fontSize: '0.68rem', fontWeight: 700 }}>
                    ● {camp.slice(0, 18)}
                  </span>
                ))}
                {Object.keys(campColorMap).length > 7 && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>
                    +{Object.keys(campColorMap).length - 7} more
                  </span>
                )}
              </div>
            ) : (
              <div className="map-legend__scale">
                <span style={{ color: RISK.low.hex    }}>▲ CLEAR</span>
                <span style={{ color: RISK.medium.hex }}>▲ ELEVATED</span>
                <span style={{ color: RISK.high.hex   }}>▲ CRITICAL</span>
              </div>
            )}

            <span className="map-legend__hint">
              {layer === 'tafweej'
                ? 'Hover for batch details · Click to focus'
                : 'Click column to select · Drag to pan · Scroll to zoom'}
            </span>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════
            Right sidebar
        ══════════════════════════════════════════════════ */}
        <div className="map-sidebar">

          {/* ── RFID / Camera / Fused: zone list ─────────── */}
          {layer !== 'tafweej' && (
            <div className="panel">
              <div className="panel__header">
                <h2 className="panel__title">
                  {layer === 'camera' ? 'Camera Camps' : 'RFID Camps'}
                </h2>
                <span className="panel__badge panel__badge--gold">
                  {zoneListPoints.length} zones
                </span>
              </div>

              <div className="panel__body" style={{ padding: '0.5rem' }}>
                {isLoading ? (
                  <>
                    {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
                  </>
                ) : zoneListPoints.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state__icon">📭</div>
                    <div className="empty-state__text">No data with coordinates</div>
                  </div>
                ) : (
                  <div className="zone-list">
                    {zoneListPoints.slice(0, 25).map(point => {
                      const metric = layer === 'camera' ? point.metric : point.people_count;
                      const pct    = Math.min(100, Math.round((metric / zoneListMax) * 100));
                      const isSel  = selected === point.id;
                      return (
                        <button
                          key={point.id}
                          className={`zone-list-item ${isSel ? 'zone-list-item--sel' : ''}`}
                          style={{ '--rc': point.cfg.hex }}
                          onClick={() => { setSelected(isSel ? null : point.id); flyTo(point); }}
                        >
                          <div className="zli-top">
                            <span className="zli-id">{(point.camp_label || point.id).slice(0, 18)}</span>
                            <span className="zli-risk" style={{ color: point.cfg.hex, background: point.cfg.bg }}>
                              {point.cfg.label}
                            </span>
                          </div>

                          <div className="zli-bar">
                            <div className="zli-bar-fill" style={{ width: `${pct}%`, background: point.cfg.hex }} />
                          </div>

                          <div className="zli-stats">
                            {layer === 'camera' ? (
                              <>
                                <span>
                                  ↑{(point.enteredHour || 0).toLocaleString()} hr
                                  &nbsp;·&nbsp;
                                  {(point.enteredToday || 0).toLocaleString()} today
                                </span>
                                <span style={{ color: point.cfg.hex, fontWeight: 700 }}>{pct}%</span>
                              </>
                            ) : (
                              <>
                                <span>
                                  {(point.people_count || 0).toLocaleString()} ppl
                                  &nbsp;·&nbsp;
                                  {(point.doc_count || 0).toLocaleString()} rec
                                </span>
                                <span style={{ color: point.cfg.hex, fontWeight: 700 }}>{pct}%</span>
                              </>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    {zoneListPoints.length > 25 && (
                      <div style={{ textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-dim)', padding: '0.3rem 0' }}>
                        Showing 25 of {zoneListPoints.length} zones
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Tafweej: batch codes grouped by camp ──────── */}
          {layer === 'tafweej' && (
            <div className="panel">
              <div className="panel__header">
                <h2 className="panel__title">Tafweej Groups</h2>
                <span className="panel__badge panel__badge--gold">
                  {tafweejPoints.length} batches
                </span>
              </div>

              <div className="panel__body" style={{ padding: '0.5rem', maxHeight: 400, overflowY: 'auto' }}>
                {isLoading ? (
                  [...Array(6)].map((_, i) => <SkeletonRow key={i} />)
                ) : tafweejPoints.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state__icon">📭</div>
                    <div className="empty-state__text">No Tafweej data with coordinates</div>
                  </div>
                ) : (
                  Object.entries(tafweejByCamp).slice(0, 18).map(([camp, batches]) => {
                    const ci = campColorMap[camp] || { hex: '#D4AF37', rgb: [212,175,55] };
                    return (
                      <div key={camp} style={{ marginBottom: '0.8rem' }}>
                        {/* Camp header */}
                        <div style={{
                          fontSize: '0.68rem', fontWeight: 700, color: ci.hex,
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          borderLeft: `3px solid ${ci.hex}`,
                          paddingLeft: '0.5rem', marginBottom: '0.3rem',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                          <span>{camp.slice(0, 24)}</span>
                          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                            {batches.length} batch{batches.length !== 1 ? 'es' : ''}
                          </span>
                        </div>

                        {/* Batch rows */}
                        {batches.slice(0, 10).map(b => (
                          <button
                            key={b.id}
                            className={`zone-list-item ${selected === b.id ? 'zone-list-item--sel' : ''}`}
                            style={{ '--rc': ci.hex, padding: '0.38rem 0.6rem', marginBottom: '0.2rem' }}
                            onClick={() => { setSelected(s => s === b.id ? null : b.id); flyTo(b); }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{
                                fontSize: '0.72rem', fontWeight: 700,
                                color: selected === b.id ? ci.hex : 'var(--text-secondary)',
                              }}>
                                {(b.batch_code || b.id).slice(0, 20)}
                              </span>
                              <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>
                                {b.doc_count} rec
                              </span>
                            </div>
                          </button>
                        ))}

                        {batches.length > 10 && (
                          <div style={{ fontSize: '0.63rem', color: 'var(--text-dim)', padding: '0.1rem 0.5rem 0.2rem' }}>
                            +{batches.length - 10} more batches in this camp
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                {Object.keys(tafweejByCamp).length > 18 && (
                  <div style={{ textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-dim)', padding: '0.4rem 0' }}>
                    Showing 18 of {Object.keys(tafweejByCamp).length} camps
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Active Alerts (RFID / Camera / Fused) ────── */}
          {layer !== 'tafweej' && (
            <div className="panel">
              <div className="panel__header">
                <h2 className="panel__title">Active Alerts</h2>
                <span className="panel__badge">{activeAlerts.length} zones</span>
              </div>
              <div className="panel__body alert-list">
                {isLoading ? (
                  [...Array(2)].map((_, i) => <SkeletonRow key={i} />)
                ) : activeAlerts.length > 0 ? (
                  activeAlerts.slice(0, 6).map((z, i) => (
                    <AlertItem
                      key={z.id}
                      name={z.camp_label || z.id}
                      riskLevel={z.risk}
                      value={layer === 'camera' ? z.metric : z.people_count}
                      valueLabel={layer === 'camera' ? 'Entered today' : 'People'}
                      index={i}
                    />
                  ))
                ) : (
                  <div className="empty-state">
                    <div className="empty-state__icon">✅</div>
                    <div className="empty-state__text">All zones clear</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Source statistics (always shown) ─────────── */}
          <div className="panel">
            <div className="panel__header">
              <h2 className="panel__title">Source Statistics</h2>
            </div>
            <div className="panel__body" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {[
                { key: 'rfid',    label: 'RFID Readers',   icon: '📡', count: mapData?.counts?.rfid    ?? fCounts?.rfid?.count    },
                { key: 'camera',  label: 'Cameras',         icon: '📷', count: mapData?.counts?.camera  ?? fCounts?.camera?.count  },
                { key: 'tafweej', label: 'Tafweej Groups',  icon: '📲', count: mapData?.counts?.tafweej ?? fCounts?.tafweej?.count },
              ].map(s => (
                <div
                  key={s.key}
                  className={`layer-stat ${layer === s.key || layer === 'fused' ? 'layer-stat--active' : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1rem' }}>{s.icon}</span>
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {s.label}
                      </div>
                      <span
                        className={`status-badge status-badge--${health?.[s.key] ?? 'inactive'}`}
                        style={{ marginTop: 2, display: 'inline-flex' }}
                      >
                        <span className="status-badge__dot" />
                        {(health?.[s.key] ?? 'inactive').toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '1.1rem', fontWeight: 700,
                    color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums',
                  }}>
                    {s.count != null ? s.count.toLocaleString() : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>{/* /sidebar */}
      </div>{/* /grid */}
    </div>
  );
}
