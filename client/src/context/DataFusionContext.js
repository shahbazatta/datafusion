import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const DataFusionContext = createContext();

export const DataFusionProvider = ({ children }) => {
  const [fusedData, setFusedData] = useState(null);
  const [rfidData, setRfidData] = useState([]);
  const [cameraData, setCameraData] = useState([]);
  const [tafweejData, setTafweejData] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [mapData, setMapData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

  // Fetch fused data from all sources
  const fetchFusedData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/fused`);
      setFusedData(response.data);
      setError(null);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Error fetching fused data:', err);
      setError('Failed to fetch fused data');
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  // Fetch RFID data
  const fetchRfidData = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/rfid`);
      setRfidData(response.data.data || []);
    } catch (err) {
      console.error('Error fetching RFID data:', err);
    }
  }, [API_URL]);

  // Fetch Camera data
  const fetchCameraData = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/camera`);
      setCameraData(response.data.data || []);
    } catch (err) {
      console.error('Error fetching camera data:', err);
    }
  }, [API_URL]);

  // Fetch Tafweej app data
  const fetchTafweejData = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/tafweej`);
      setTafweejData(response.data.data || []);
    } catch (err) {
      console.error('Error fetching Tafweej data:', err);
    }
  }, [API_URL]);

  // Fetch congestion predictions
  const fetchPredictions = useCallback(async (timeWindow = 30) => {
    try {
      const response = await axios.get(`${API_URL}/api/congestion-prediction`, {
        params: { timeWindow }
      });
      setPredictions(response.data.predictions || []);
    } catch (err) {
      console.error('Error fetching predictions:', err);
    }
  }, [API_URL]);

  // Fetch map data (latest per group – used by MapView)
  const fetchMapData = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/map-data`);
      setMapData(response.data);
    } catch (err) {
      console.error('Error fetching map data:', err);
    }
  }, [API_URL]);

  // Fetch analytics
  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/analytics`);
      setAnalytics(response.data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
    }
  }, [API_URL]);

  // Refresh all data
  const refreshAllData = useCallback(async () => {
    await Promise.all([
      fetchFusedData(),
      fetchRfidData(),
      fetchCameraData(),
      fetchTafweejData(),
      fetchPredictions(),
      fetchAnalytics(),
      fetchMapData()
    ]);
  }, [fetchFusedData, fetchRfidData, fetchCameraData, fetchTafweejData, fetchPredictions, fetchAnalytics, fetchMapData]);

  // Initial data fetch and set up auto-refresh
  useEffect(() => {
    refreshAllData();
    const interval = setInterval(refreshAllData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [refreshAllData]);

  const value = {
    // Data
    fusedData,
    rfidData,
    cameraData,
    tafweejData,
    predictions,
    analytics,
    mapData,

    // State
    loading,
    error,
    lastUpdate,

    // Methods
    fetchFusedData,
    fetchRfidData,
    fetchCameraData,
    fetchTafweejData,
    fetchPredictions,
    fetchAnalytics,
    fetchMapData,
    refreshAllData
  };

  return (
    <DataFusionContext.Provider value={value}>
      {children}
    </DataFusionContext.Provider>
  );
};

export const useDataFusion = () => {
  const context = useContext(DataFusionContext);
  if (!context) {
    throw new Error('useDataFusion must be used within DataFusionProvider');
  }
  return context;
};

export default DataFusionProvider;
