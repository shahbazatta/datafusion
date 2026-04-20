# Tafweej Data Fusion Platform

## Real-Time Operational Intelligence for Pilgrim Movement Management

A sophisticated data fusion platform that integrates RFID tracking, camera counting systems, and smartphone app data to provide real-time congestion prediction and operational intelligence for Hajj pilgrimage management in Mina.

---

## 📋 Overview

### Project Vision
Transform Tafweej operations from reactive monitoring to **proactive, data-driven management** by creating a unified digital twin that fuses data from three complementary sources:

- **📍 RFID Readers** (Nusuk) - Individual pilgrim tracking
- **📹 Counting Cameras** - Real-time flow measurement
- **📱 Tafweej App** - Group leader tracking & GPS-based data

### Key Features

✅ **Real-Time Data Fusion** - Unified dashboard combining all data sources  
✅ **Congestion Prediction** - 15-30 minute lead time forecasts  
✅ **Interactive Visualization** - Mapbox + DeckGL geographic visualization  
✅ **Advanced Analytics** - Performance metrics and temporal analysis  
✅ **Health Monitoring** - System status and data quality tracking  
✅ **RESTful API** - Comprehensive backend API for data access  

---

## 🏗️ Technology Stack

### Backend
- **Node.js + Express** - RESTful API server
- **Elasticsearch** - Time-series data storage and querying
- **Axios** - HTTP client for data integration

### Frontend
- **React 18** - Modern UI framework
- **Mapbox GL** - Geographic data visualization
- **DeckGL** - High-performance WebGL visualization layer
- **Chart.js** - Data visualization and analytics
- **Zustand** - State management (optional)

### Infrastructure
- **Docker** - Containerization support
- **CORS** - Cross-origin resource sharing enabled

---

## 📁 Project Structure

```
tafweej-data-fusion/
├── server/
│   └── index.js                    # Main Express server
├── client/
│   ├── src/
│   │   ├── components/             # Reusable React components
│   │   │   ├── DataSourceCard.js
│   │   │   ├── PredictionWidget.js
│   │   │   ├── HealthStatus.js
│   │   │   ├── RealTimeMetrics.js
│   │   │   └── AnalyticsChart.js
│   │   ├── context/                # React context providers
│   │   │   └── DataFusionContext.js
│   │   ├── pages/                  # Page components
│   │   │   ├── Dashboard.js
│   │   │   ├── MapView.js
│   │   │   └── Analytics.js
│   │   ├── App.js                  # Main App component
│   │   ├── index.js                # React entry point
│   │   └── index.css               # Global styles
│   ├── public/
│   │   └── index.html              # HTML template
│   └── package.json
├── .env                            # Environment configuration
├── package.json                    # Root package.json
└── README.md                       # This file
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 14+** and **npm 6+**
- **Elasticsearch 7.x** running at the configured URL
- **Mapbox API Token** (for map visualization)

### Installation

#### 1. Clone and Setup

```bash
cd D:\KSA\DataFusion
npm run install-all
```

This installs dependencies for both backend and frontend.

#### 2. Configure Environment

Edit `.env` file with your Elasticsearch credentials:

```env
# Elasticsearch Configuration
ELASTICSEARCH_URL=https://20.174.24.88:9200/
ELASTICSEARCH_USER=elastic
ELASTICSEARCH_PASSWORD=u-mSjGSAzHYRo2uDMV_-

# Server Configuration
PORT=5000
NODE_ENV=development

# Frontend Configuration
REACT_APP_API_URL=http://localhost:5000

# Mapbox Configuration
REACT_APP_MAPBOX_TOKEN=your_mapbox_token_here

# Data Fusion Configuration
CONGESTION_THRESHOLD_LOW=50
CONGESTION_THRESHOLD_MEDIUM=150
CONGESTION_THRESHOLD_HIGH=300
PREDICTION_WINDOW_MINUTES=30
```

#### 3. Start the Application

**Development Mode** (runs both backend and frontend):
```bash
npm run dev
```

**Or separately:**

Backend:
```bash
npm run server
```

Frontend (in another terminal):
```bash
cd client
npm start
```

The application will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000

---

## 📡 API Endpoints

### Data Source Endpoints

#### Get RFID Data
```
GET /api/rfid
```
Returns all RFID tracking data from Nusuk readers.

#### Get Camera Data
```
GET /api/camera
```
Returns counting camera data from all locations.

#### Get Tafweej App Data
```
GET /api/tafweej
```
Returns smartphone app location and movement data.

### Fusion & Analytics Endpoints

#### Get Fused Data
```
GET /api/fused
```
Returns aggregated and fused data from all three sources with health status.

Response:
```json
{
  "timestamp": "2026-04-19T10:30:00Z",
  "sources": {
    "rfid": { "count": 1500, "data": [...] },
    "camera": { "count": 2300, "data": [...] },
    "tafweej": { "count": 1800, "data": [...] }
  },
  "aggregatedMetrics": {
    "totalPeopleRFID": 1500,
    "totalPeopleCamera": 2300,
    "totalPeopleTafweej": 1800,
    "averageDensity": 42,
    "dataQuality": { "rfid": "good", "camera": "good", "tafweej": "good" }
  },
  "healthStatus": {
    "rfid": "active",
    "camera": "active",
    "tafweej": "active"
  }
}
```

#### Get Congestion Predictions
```
GET /api/congestion-prediction?timeWindow=30&location=mina
```

Query Parameters:
- `timeWindow` (optional): Time window in minutes (default: 30)
- `location` (optional): Specific location filter

Response:
```json
{
  "timeWindow": "30 minutes",
  "predictions": [
    {
      "location": "Jamarat Area",
      "currentDensity": 185,
      "riskLevel": "high",
      "predictedLeadTime": 15,
      "recommendation": "Implement immediate crowd management measures"
    }
  ],
  "generatedAt": "2026-04-19T10:30:00Z"
}
```

#### Get Analytics
```
GET /api/analytics
```
Returns comprehensive analytics and aggregations across all data sources.

---

## 🎨 Frontend Features

### Dashboard
- Real-time health status of all data sources
- Data source comparison cards with record counts
- Aggregated metrics and crowd density statistics
- Congestion prediction widgets with risk levels
- System information and operational status

### Map View
- Interactive geographic visualization (Mapbox + DeckGL)
- Layer selection (RFID, Camera, Tafweej, or Fused)
- Density legend and real-time alerts
- Congestion alert panel with lead time information

### Analytics
- Data source comparison charts
- System performance metrics (latency, accuracy, uptime)
- Temporal analysis with hourly distribution
- Prediction statistics by risk level
- Detailed location-based prediction table
- Operational insights and recommendations

---

## 🔄 Data Fusion Pipeline

### Phase 1: Data Collection
- Query Elasticsearch indices for each data source
- Fetch latest records with configurable time windows
- Handle missing or incomplete data

### Phase 2: Data Aggregation
- Combine readings from all three sources
- Calculate aggregate metrics (total counts, average density)
- Assess data quality and source health

### Phase 3: Prediction
- Analyze density trends and temporal patterns
- Generate risk levels based on threshold analysis
- Calculate intervention lead times
- Provide actionable recommendations

### Phase 4: Visualization
- Display unified digital twin on dashboard
- Render geographic data on interactive map
- Show predictive analytics in real-time

---

## 🎯 Congestion Prediction Algorithm

The platform uses a simple yet effective approach:

1. **Density Calculation**
   - Average people count across time window
   - Normalize by location area

2. **Risk Assessment**
   - Low: Density < 50
   - Medium: 50 ≤ Density < 150
   - High: Density ≥ 150

3. **Lead Time Estimation**
   - High Risk: 15 minutes
   - Medium Risk: 20 minutes
   - Low Risk: 30 minutes

---

## 📊 Data Quality Metrics

The platform monitors three key quality indicators:

- **RFID Quality**: Completeness of RFID reader coverage
- **Camera Quality**: Accuracy of counting systems
- **Tafweej Quality**: GPS data availability from app

---

## 🔧 Configuration

### Elasticsearch Indices

The platform expects three Elasticsearch indices:

1. **peoplestats_rfid** - RFID tracking data
2. **peoplestats_cam** - Camera counting data
3. **peoplestats_tafweej_app** - Smartphone app data

### Congestion Thresholds

Configure thresholds in `.env`:
```env
CONGESTION_THRESHOLD_LOW=50
CONGESTION_THRESHOLD_MEDIUM=150
CONGESTION_THRESHOLD_HIGH=300
PREDICTION_WINDOW_MINUTES=30
```

---

## 🚢 Deployment

### Docker Setup

Create a `Dockerfile` for the backend:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY server ./server
EXPOSE 5000
CMD ["node", "server/index.js"]
```

Build and run:
```bash
docker build -t tafweej-api .
docker run -p 5000:5000 --env-file .env tafweej-api
```

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure CORS for your domain
- [ ] Use SSL/TLS certificates
- [ ] Enable authentication for sensitive endpoints
- [ ] Set up monitoring and logging
- [ ] Configure database backups
- [ ] Implement rate limiting

---

## 📈 Performance Metrics

**System Targets:**
- Data Fusion Latency: < 500ms
- Prediction Accuracy: 85%+
- System Uptime: 99.9%
- Data Completeness: 90%+

---

## 🐛 Troubleshooting

### Elasticsearch Connection Failed
- Verify Elasticsearch is running at the configured URL
- Check credentials in `.env`
- Confirm network connectivity and firewall rules

### No Data Showing on Dashboard
- Verify Elasticsearch indices exist and contain data
- Check that queries match your data schema
- Review browser console for API errors

### Map Not Loading
- Ensure Mapbox token is set in `.env`
- Verify token has map data permissions
- Check browser console for Mapbox errors

### High API Latency
- Analyze Elasticsearch query performance
- Consider adding indices or shards
- Check network latency between services

---

## 📝 Development Workflow

### Running Tests
```bash
npm test
```

### Building for Production
```bash
npm run build
```

### Code Formatting
```bash
npm run format
```

---

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

---

## 📄 License

This project is developed for the Ministry of Hajj and Umrah.

---

## 📞 Support

For support and questions:
- Check this README
- Review API documentation
- Examine server logs for errors
- Monitor Elasticsearch cluster health

---

## 🎯 Roadmap

### Phase 1 (Current)
- ✅ Data fusion engine
- ✅ Real-time dashboard
- ✅ Congestion prediction
- ✅ Basic analytics

### Phase 2
- [ ] Advanced ML models
- [ ] Enhanced map visualizations
- [ ] Multi-language support
- [ ] Mobile application
- [ ] Detailed historical analysis

---

## 📚 Resources

- **Elasticsearch Documentation**: https://www.elastic.co/guide/en/elasticsearch/reference/current/
- **React Documentation**: https://react.dev
- **Mapbox GL JS**: https://docs.mapbox.com/mapbox-gl-js/
- **DeckGL**: https://deck.gl/

---

**Last Updated**: April 2026  
**Version**: 1.0.0 (Phase 1)

Made with ❤️ for Hajj pilgrimage management
