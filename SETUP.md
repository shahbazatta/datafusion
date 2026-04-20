# Tafweej Data Fusion Platform - Setup Guide

## Quick Start

### Option 1: Docker (Recommended for Production)

#### Prerequisites
- Docker and Docker Compose installed
- Elasticsearch running at `https://20.174.24.88:9200/`

#### Steps

1. **Build and Run**
   ```bash
   docker-compose up --build
   ```

2. **Access the Application**
   - Frontend: http://localhost:5000
   - Backend API: http://localhost:5000/api

3. **Stop Services**
   ```bash
   docker-compose down
   ```

---

### Option 2: Local Development Setup

#### Prerequisites

- **Node.js 14+** with npm
- **Elasticsearch 7.x** with credentials:
  - URL: `https://20.174.24.88:9200/`
  - Username: `elastic`
  - Password: `u-mSjGSAzHYRo2uDMV_-`

#### Installation Steps

##### 1. Clone and Navigate to Project
```bash
cd D:\KSA\DataFusion
```

##### 2. Install Dependencies
```bash
# Install all dependencies (root + client)
npm run install-all

# Or manually:
npm install
cd client && npm install && cd ..
```

##### 3. Configure Environment Variables
Create `.env` file in project root:

```env
# Elasticsearch
ELASTICSEARCH_URL=https://20.174.24.88:9200/
ELASTICSEARCH_USER=elastic
ELASTICSEARCH_PASSWORD=u-mSjGSAzHYRo2uDMV_-

# Server
PORT=5000
NODE_ENV=development

# Frontend
REACT_APP_API_URL=http://localhost:5000

# Mapbox (Optional - for map visualization)
REACT_APP_MAPBOX_TOKEN=your_mapbox_token_here

# Thresholds
CONGESTION_THRESHOLD_LOW=50
CONGESTION_THRESHOLD_MEDIUM=150
CONGESTION_THRESHOLD_HIGH=300
PREDICTION_WINDOW_MINUTES=30
```

##### 4. Verify Elasticsearch Connection
```bash
curl -u elastic:u-mSjGSAzHYRo2uDMV_- https://20.174.24.88:9200/ -k
```

Expected response:
```json
{
  "name": "...",
  "cluster_name": "...",
  "version": { "number": "7.17.0" }
}
```

##### 5. Start the Application

**Combined Mode** (Backend + Frontend):
```bash
npm run dev
```

**Or separately:**

Terminal 1 - Backend:
```bash
npm run server
```

Terminal 2 - Frontend:
```bash
cd client
npm start
```

#### Expected Output

Backend:
```
╔════════════════════════════════════════════════════════╗
║   Tafweej Data Fusion Platform - Backend Server      ║
║   Real-Time Operational Intelligence for Hajj        ║
╚════════════════════════════════════════════════════════╝

  Server running at: http://localhost:5000

  Available Endpoints:
  • GET /api/rfid                  - RFID tracking data
  • GET /api/camera                - Camera counting data
  • GET /api/tafweej               - Smartphone app data
  • GET /api/fused                 - Fused data from all sources
  • GET /api/congestion-prediction - Congestion predictions
  • GET /api/analytics             - Operational analytics

  Elasticsearch Status: ✓ Connected to Elasticsearch
```

Frontend:
```
Compiled successfully!

You can now view tafweej-client in the browser.

  Local:            http://localhost:3000
  On Your Network:  http://192.168.x.x:3000
```

##### 6. Verify Installation

1. Open http://localhost:3000 in your browser
2. Check Dashboard tab - should show data from Elasticsearch
3. Review Browser Console (F12) for any errors

---

## Verification Checklist

- [ ] Node.js version ≥ 14
- [ ] npm version ≥ 6
- [ ] Elasticsearch accessible at configured URL
- [ ] Port 5000 available for backend
- [ ] Port 3000 available for frontend
- [ ] .env file created with credentials
- [ ] Dependencies installed (`node_modules` exists)
- [ ] Backend server starts without errors
- [ ] Frontend loads in browser
- [ ] Dashboard shows data from Elasticsearch

---

## Troubleshooting

### Issue: "Cannot find module 'express'"

**Solution:**
```bash
npm install
```

### Issue: "ECONNREFUSED - Elasticsearch connection failed"

**Solutions:**
1. Verify Elasticsearch is running:
   ```bash
   curl -u elastic:u-mSjGSAzHYRo2uDMV_- https://20.174.24.88:9200/ -k
   ```

2. Check credentials in `.env` file

3. Verify network connectivity:
   ```bash
   ping 20.174.24.88
   ```

### Issue: "Port 5000 is already in use"

**Solution:**
```bash
# Find process using port 5000
lsof -i :5000

# Kill the process
kill -9 <PID>

# Or use different port in .env
PORT=5001
```

### Issue: "Port 3000 is already in use"

**Solution:**
```bash
# Use different port
PORT=3001 npm start
```

### Issue: "No data showing on Dashboard"

**Check:**
1. Elasticsearch indices exist:
   ```bash
   curl -u elastic:u-mSjGSAzHYRo2uDMV_- https://20.174.24.88:9200/_cat/indices -k
   ```

2. Check expected indices:
   - `peoplestats_rfid`
   - `peoplestats_cam`
   - `peoplestats_tafweej_app`

3. Sample query to verify data:
   ```bash
   curl -u elastic:u-mSjGSAzHYRo2uDMV_- \
     -X GET "https://20.174.24.88:9200/peoplestats_rfid/_search?pretty" \
     -H "Content-Type: application/json" \
     -d '{"query": {"match_all": {}}}' -k
   ```

### Issue: "CORS error in console"

**Solution:**
The backend has CORS enabled. If you still see errors:
1. Check Network tab in browser DevTools
2. Verify API URL in .env matches frontend
3. Ensure backend is running

---

## Development Tips

### Enable Auto-Reload
```bash
# Install nodemon for backend auto-reload
npm install --save-dev nodemon

# Run with nodemon
npm run dev:server
```

### Debug Mode
```bash
# Node debug
NODE_DEBUG=http node server/index.js

# React with Chrome DevTools
npm start
```

### API Testing
```bash
# Test endpoints with curl
curl http://localhost:5000/api/fused | json_pp

# Or use VS Code REST Client extension
```

---

## Performance Optimization

### For Development
- Keep default settings
- Use file-based .env

### For Production
- Set `NODE_ENV=production`
- Implement caching
- Use CDN for frontend assets
- Enable compression in Express
- Monitor with APM tools

---

## Database Indices

Ensure Elasticsearch has these indices with appropriate mappings:

```json
{
  "peoplestats_rfid": {
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "location": { "type": "keyword" },
        "people_count": { "type": "integer" },
        "rfid_id": { "type": "keyword" }
      }
    }
  },
  "peoplestats_cam": {
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "location": { "type": "keyword" },
        "people_count": { "type": "integer" },
        "camera_id": { "type": "keyword" }
      }
    }
  },
  "peoplestats_tafweej_app": {
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "location": { "type": "geo_point" },
        "people_count": { "type": "integer" },
        "group_leader_id": { "type": "keyword" }
      }
    }
  }
}
```

---

## Next Steps

1. **Configure Mapbox Token**
   - Get token from https://mapbox.com
   - Add to `.env`: `REACT_APP_MAPBOX_TOKEN=...`

2. **Customize Thresholds**
   - Edit `.env` for density thresholds
   - Adjust `PREDICTION_WINDOW_MINUTES`

3. **Production Deployment**
   - See `docker-compose.yml` for container setup
   - Use environment-specific `.env` files
   - Enable HTTPS and authentication

4. **Monitoring**
   - Set up error tracking (e.g., Sentry)
   - Monitor Elasticsearch performance
   - Track API response times

---

## Support & Resources

- **API Documentation**: See README.md
- **Component Structure**: Check client/src/components/
- **Backend Code**: See server/index.js

---

**Version**: 1.0.0  
**Last Updated**: April 2026
