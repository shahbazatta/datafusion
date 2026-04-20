const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Client } = require('@elastic/elasticsearch');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Elasticsearch client configuration
const elasticsearchClient = new Client({
  node: process.env.ELASTICSEARCH_URL || 'https://20.174.24.88:9200/',
  auth: {
    username: process.env.ELASTICSEARCH_USER || 'elastic',
    password: process.env.ELASTICSEARCH_PASSWORD || 'u-mSjGSAzHYRo2uDMV_-'
  },
  tls: {
    rejectUnauthorized: false // For self-signed certificates
  }
});

// Test Elasticsearch connection
elasticsearchClient.info()
  .then(() => console.log('✓ Connected to Elasticsearch'))
  .catch(err => console.error('✗ Failed to connect to Elasticsearch:', err.message));

// ==================== DATA FUSION ROUTES ====================

/**
 * GET /api/rfid
 * Fetches RFID tracking data from Nusuk readers
 */
app.get('/api/rfid', async (req, res) => {
  try {
    const response = await elasticsearchClient.search({
      index: 'peoplestats_rfid',
      body: {
        query: { match_all: {} },
        size: 10000,
        sort: [{ '@timestamp': { order: 'desc' } }]
      }
    });

    const data = response.hits.hits.map(hit => ({
      id: hit._id,
      ...hit._source
    }));

    res.json({
      source: 'RFID',
      count: data.length,
      data
    });
  } catch (error) {
    console.error('RFID Query Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch RFID data', details: error.message });
  }
});

/**
 * GET /api/camera
 * Fetches counting camera data
 */
app.get('/api/camera', async (req, res) => {
  try {
    const response = await elasticsearchClient.search({
      index: 'peoplestats_cam',
      body: {
        query: { match_all: {} },
        size: 10000,
        sort: [{ '@timestamp': { order: 'desc' } }]
      }
    });

    const data = response.hits.hits.map(hit => ({
      id: hit._id,
      ...hit._source
    }));

    res.json({
      source: 'Camera',
      count: data.length,
      data
    });
  } catch (error) {
    console.error('Camera Query Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch camera data', details: error.message });
  }
});

/**
 * GET /api/tafweej
 * Fetches Tafweej smartphone app data
 */
app.get('/api/tafweej', async (req, res) => {
  try {
    const response = await elasticsearchClient.search({
      index: 'peoplestats_tafweej_app',
      body: {
        query: { match_all: {} },
        size: 10000,
        sort: [{ '@timestamp': { order: 'desc' } }]
      }
    });

    const data = response.hits.hits.map(hit => ({
      id: hit._id,
      ...hit._source
    }));

    res.json({
      source: 'Tafweej App',
      count: data.length,
      data
    });
  } catch (error) {
    console.error('Tafweej Query Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch Tafweej data', details: error.message });
  }
});

/**
 * GET /api/fused
 * Returns fused and aggregated data from all three sources
 */
app.get('/api/fused', async (req, res) => {
  try {
    const [rfidResponse, cameraResponse, tafweejResponse] = await Promise.all([
      elasticsearchClient.search({
        index: 'peoplestats_rfid',
        body: { query: { match_all: {} }, size: 10000 }
      }),
      elasticsearchClient.search({
        index: 'peoplestats_cam',
        body: { query: { match_all: {} }, size: 10000 }
      }),
      elasticsearchClient.search({
        index: 'peoplestats_tafweej_app',
        body: { query: { match_all: {} }, size: 10000 }
      })
    ]);

    const rfidData = rfidResponse.hits.hits.map(hit => hit._source);
    const cameraData = cameraResponse.hits.hits.map(hit => hit._source);
    const tafweejData = tafweejResponse.hits.hits.map(hit => hit._source);

    // Data fusion logic
    const fusedData = {
      timestamp: new Date().toISOString(),
      sources: {
        rfid: { count: rfidData.length, data: rfidData },
        camera: { count: cameraData.length, data: cameraData },
        tafweej: { count: tafweejData.length, data: tafweejData }
      },
      aggregatedMetrics: calculateAggregatedMetrics(rfidData, cameraData, tafweejData),
      healthStatus: {
        rfid: rfidData.length > 0 ? 'active' : 'inactive',
        camera: cameraData.length > 0 ? 'active' : 'inactive',
        tafweej: tafweejData.length > 0 ? 'active' : 'inactive'
      }
    };

    res.json(fusedData);
  } catch (error) {
    console.error('Data Fusion Error:', error.message);
    res.status(500).json({ error: 'Failed to fuse data', details: error.message });
  }
});

/**
 * GET /api/congestion-prediction
 * Returns congestion prediction analysis
 */
app.get('/api/congestion-prediction', async (req, res) => {
  try {
    const { location, timeWindow = 30 } = req.query; // timeWindow in minutes

    const response = await elasticsearchClient.search({
      index: ['peoplestats_rfid', 'peoplestats_cam', 'peoplestats_tafweej_app'],
      body: {
        query: {
          bool: {
            must: [
              {
                range: {
                  '@timestamp': {
                    gte: `now-${timeWindow}m`
                  }
                }
              }
            ]
          }
        },
        aggs: {
          by_location: {
            terms: {
              field: 'location.keyword',
              size: 100
            },
            aggs: {
              crowd_density: {
                avg: { field: 'people_count' }
              },
              density_trend: {
                date_histogram: {
                  field: '@timestamp',
                  calendar_interval: '1m'
                },
                aggs: {
                  avg_density: {
                    avg: { field: 'people_count' }
                  }
                }
              }
            }
          }
        }
      }
    });

    const predictions = generateCongestionPredictions(response.aggregations);

    res.json({
      timeWindow: `${timeWindow} minutes`,
      predictions,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Prediction Error:', error.message);
    res.status(500).json({ error: 'Failed to generate predictions', details: error.message });
  }
});

/**
 * GET /api/analytics
 * Returns operational analytics and insights
 */
app.get('/api/analytics', async (req, res) => {
  try {
    const response = await elasticsearchClient.search({
      index: ['peoplestats_rfid', 'peoplestats_cam', 'peoplestats_tafweej_app'],
      body: {
        aggs: {
          locations: {
            terms: {
              field: 'location.keyword',
              size: 100
            },
            aggs: {
              avg_density: {
                avg: { field: 'people_count' }
              },
              max_density: {
                max: { field: 'people_count' }
              },
              min_density: {
                min: { field: 'people_count' }
              }
            }
          },
          temporal_analysis: {
            date_histogram: {
              field: '@timestamp',
              calendar_interval: '1h'
            },
            aggs: {
              total_people: {
                sum: { field: 'people_count' }
              }
            }
          }
        }
      }
    });

    res.json({
      timestamp: new Date().toISOString(),
      locationAnalytics: response.aggregations.locations,
      temporalAnalysis: response.aggregations.temporal_analysis
    });
  } catch (error) {
    console.error('Analytics Error:', error.message);
    res.status(500).json({ error: 'Failed to generate analytics', details: error.message });
  }
});

// ==================== HELPER FUNCTIONS ====================

function calculateAggregatedMetrics(rfidData, cameraData, tafweejData) {
  const getTotalPeople = (data) => {
    return data.reduce((sum, item) => sum + (item.people_count || 0), 0);
  };

  return {
    totalPeopleRFID: getTotalPeople(rfidData),
    totalPeopleCamera: getTotalPeople(cameraData),
    totalPeopleTafweej: getTotalPeople(tafweejData),
    averageDensity: calculateAverageDensity([...rfidData, ...cameraData, ...tafweejData]),
    dataQuality: {
      rfid: rfidData.length > 0 ? 'good' : 'no-data',
      camera: cameraData.length > 0 ? 'good' : 'no-data',
      tafweej: tafweejData.length > 0 ? 'good' : 'no-data'
    }
  };
}

function calculateAverageDensity(allData) {
  if (allData.length === 0) return 0;
  const total = allData.reduce((sum, item) => sum + (item.people_count || 0), 0);
  return Math.round(total / allData.length);
}

function generateCongestionPredictions(aggregations) {
  const locations = aggregations.by_location.buckets || [];

  return locations.map(location => {
    const density = location.crowd_density.value || 0;
    const trend = location.density_trend.buckets || [];

    // Simple prediction: if trend is increasing, flag as warning
    let riskLevel = 'low';
    let leadTime = 30; // minutes

    if (density > 100) {
      riskLevel = 'medium';
      leadTime = 20;
    }
    if (density > 200) {
      riskLevel = 'high';
      leadTime = 15;
    }

    return {
      location: location.key,
      currentDensity: Math.round(density),
      riskLevel,
      predictedLeadTime: leadTime,
      recommendation: getRiskRecommendation(riskLevel)
    };
  });
}

function getRiskRecommendation(riskLevel) {
  const recommendations = {
    low: 'Continue monitoring',
    medium: 'Increase monitoring frequency, prepare contingency plans',
    high: 'Implement immediate crowd management measures'
  };
  return recommendations[riskLevel] || 'Unknown risk level';
}

// ==================== ERROR HANDLING ====================

app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// ==================== SERVER STARTUP ====================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║   Tafweej Data Fusion Platform - Backend Server      ║
║   Real-Time Operational Intelligence for Hajj        ║
╚════════════════════════════════════════════════════════╝

  Server running at: http://localhost:${PORT}

  Available Endpoints:
  • GET /api/rfid                  - RFID tracking data
  • GET /api/camera                - Camera counting data
  • GET /api/tafweej               - Smartphone app data
  • GET /api/fused                 - Fused data from all sources
  • GET /api/congestion-prediction - Congestion predictions
  • GET /api/analytics             - Operational analytics

  Elasticsearch Status: Checking...
  `);
});

module.exports = app;
