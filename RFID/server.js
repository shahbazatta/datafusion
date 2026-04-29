const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
const PORT = process.argv[2] || process.env.PORT || 3000;
const readerId = parseInt(PORT, 10);

app.disable("x-powered-by");
app.set("etag", false);

// --------------------
// Simulation config
// --------------------
// Real-time: dispatching = pilgrims EXITING the camp at disp_hour:disp_minute.
// Each batch is spread evenly over DISPATCH_DURATION_SEC real seconds.
// Only "Exit" events are emitted — dispatching means leaving the camp.
const TICK_MS = 1000;
const DISPATCH_DURATION_SEC = 60;

// In-memory ring buffer of recent events (for streaming clients).
const RECENT_EVENT_LIMIT = 100;

// --------------------
// Resolve reader_id → camp_label via camps.json
// --------------------
function loadJson(...candidates) {
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (e) {
      console.warn(`Failed to read ${p}:`, e.message);
    }
  }
  return null;
}

const campsData = loadJson(path.join(__dirname, "..", "camps.json"));

let campLabel = null;
let campGate = null;
if (Array.isArray(campsData)) {
  const match = campsData.find((c) => c && c._source && c._source.rfid_id === readerId);
  if (match) {
    campLabel = match._source.camp_label;
    campGate  = match._source.gate;
  }
}

const schedRaw = loadJson(path.join(__dirname, "..", "schedule.json"));

let dispatches = [];
if (schedRaw && schedRaw.Sheet1 && campLabel) {
  dispatches = schedRaw.Sheet1
    .filter((r) => r.camp_label === campLabel)
    .map((r) => ({
      code:        r.code,
      disp_day:    Number(r.disp_day),
      disp_hour:   Number(r.disp_hour),
      disp_minute: Number(r.disp_minute),
      pilgrims:    Number(r.pilgrims) || 0,
    }))
    .filter((d) => d.pilgrims > 0)
    .sort((a, b) => (a.disp_hour * 60 + a.disp_minute) - (b.disp_hour * 60 + b.disp_minute));
}

// Day cycling: same logic as CAM simulator.
const scheduleDays = [...new Set(dispatches.map((d) => d.disp_day))].sort((a, b) => a - b);
const simStart = Date.now();

function getSimDay() {
  if (!scheduleDays.length) return 11;
  const daysPassed = Math.floor((Date.now() - simStart) / 86400000);
  return scheduleDays[daysPassed % scheduleDays.length];
}

console.log(
  `[INIT] reader_id=${readerId} camp_label=${campLabel || "(none)"} gate=${campGate || "-"} ` +
  `dispatches=${dispatches.length} scheduleDays=${scheduleDays}`
);

// --------------------
// Logs
// --------------------
function getLogFileName() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const nets = os.networkInterfaces();
  let ipAddress = "unknown";
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        ipAddress = net.address.replace(/\./g, "-");
        break;
      }
    }
    if (ipAddress !== "unknown") break;
  }
  return path.join(__dirname, "logs", `rfid_events_${date}_${ipAddress}.log`);
}

if (!fs.existsSync(path.join(__dirname, "logs"))) {
  fs.mkdirSync(path.join(__dirname, "logs"), { recursive: true });
}

let logFile = getLogFileName();
let currentDate = new Date().getDate();

// Touch the log file on startup.
fs.appendFileSync(
  logFile,
  JSON.stringify({ timestamp: new Date().toISOString(), type: "startup", readerId, campLabel, dispatches: dispatches.length }) + "\n"
);

function logRfidEvent(event) {
  fs.appendFileSync(logFile, JSON.stringify(event) + "\n");
}

// --------------------
// Simulation state
// --------------------
let recentEvents = [];

// firedDispatches: Set of keys "simDay-disp_hour-disp_minute" already triggered this cycle.
let firedDispatches = new Set();

// activeDispatches: batches currently being spread over DISPATCH_DURATION_SEC.
// { disp, startRealMs, emittedCount }
let activeDispatches = [];

let currentSimDay = getSimDay();

const readerLocation = campLabel
  ? `Camp ${campLabel}${campGate ? ` (Gate ${campGate})` : ""}`
  : `Reader ${readerId}`;

function emitEvent(tagId) {
  const now = new Date();
  const event = {
    timestamp: now.toISOString(),
    timestampFormatted: now.toLocaleString("sv").replace("T", " ").slice(0, 19),
    port: parseInt(PORT, 10),
    tagId,
    readerLocation,
    eventType: "Exit",
    signalStrength_dBm: -Math.floor(Math.random() * 51 + 50), // -50 to -100 dBm
  };
  recentEvents.push(event);
  if (recentEvents.length > RECENT_EVENT_LIMIT) recentEvents.shift();
  logRfidEvent(event);
  return event;
}

// --------------------
// Periodic updater — real-time, wall-clock synchronized
// --------------------
function startRfidSimulator() {
  setInterval(() => {
    const now = new Date();

    // Rotate log file on new wall-clock day.
    if (now.getDate() !== currentDate) {
      currentDate = now.getDate();
      logFile = getLogFileName();
      firedDispatches.clear();
      activeDispatches = [];
      currentSimDay = getSimDay();
      console.log(`[LOG ROTATE] New day — simDay=${currentSimDay} log: ${path.basename(logFile)}`);
    }

    const nowHour   = now.getHours();
    const nowMinute = now.getMinutes();

    // Check each dispatch: fire if it's time and hasn't been fired yet.
    for (const d of dispatches) {
      if (d.disp_day !== currentSimDay) continue;
      const key = `${currentSimDay}-${d.disp_hour}-${d.disp_minute}`;
      if (firedDispatches.has(key)) continue;
      if (nowHour === d.disp_hour && nowMinute === d.disp_minute) {
        firedDispatches.add(key);
        activeDispatches.push({ disp: d, startRealMs: Date.now(), emittedCount: 0 });
        console.log(`[DISPATCH] simDay=${currentSimDay} ${d.disp_hour}:${String(d.disp_minute).padStart(2,"0")} camp=${campLabel} pilgrims=${d.pilgrims}`);
      }
    }

    // Drain active dispatches — emit events proportional to elapsed real time.
    let totalEmitted = 0;
    for (const active of activeDispatches) {
      const elapsedSec = (Date.now() - active.startRealMs) / 1000;
      const targetCount = elapsedSec >= DISPATCH_DURATION_SEC
        ? active.disp.pilgrims
        : Math.floor(active.disp.pilgrims * (elapsedSec / DISPATCH_DURATION_SEC));

      const toEmit = targetCount - active.emittedCount;
      for (let i = 0; i < toEmit; i++) {
        const idx = active.emittedCount + i + 1;
        const tagId = `${active.disp.code}-${String(idx).padStart(4, "0")}`;
        emitEvent(tagId);
        totalEmitted++;
      }
      active.emittedCount = targetCount;
    }

    // Remove fully emitted dispatches.
    activeDispatches = activeDispatches.filter((a) => a.emittedCount < a.disp.pilgrims);

    if (totalEmitted > 0) {
      console.log(`[RFID] Emitted ${totalEmitted} Exit event(s); buffer=${recentEvents.length}`);
    }
  }, TICK_MS);
}

// --------------------
// Response formats
// --------------------
function generateRfidPayload() {
  return JSON.stringify(recentEvents, null, 2);
}

function generateHeartbeat() {
  return `--myboundary\r\nContent-Type: text/plain\r\nContent-Length: 9\r\n\r\nHeartbeat`;
}

let lastEventCount = 0;

// --------------------
// Routes
// --------------------
app.get("/cgi-bin/videoStatServer.cgi", (req, res) => {
  console.log("videoStatServer.cgi streaming started");

  res.set({
    Server: "Device/1.0",
    Connection: "keep-alive",
    "Content-Type": "multipart/x-mixed-replace; boundary=myboundary",
    "Transfer-Encoding": "chunked",
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  res.status(200);

  const payload = generateRfidPayload();
  res.write(
    `--myboundary\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(payload)}\r\n\r\n${payload}\r\n`
  );
  lastEventCount = recentEvents.length;

  let heartbeatCount = 0;

  const interval = setInterval(() => {
    try {
      if (recentEvents.length !== lastEventCount) {
        const p = generateRfidPayload();
        res.write(
          `--myboundary\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(p)}\r\n\r\n${p}\r\n`
        );
        console.log(`Sent RFID update (${recentEvents.length} events)`);
        lastEventCount = recentEvents.length;
        heartbeatCount = 0;
      } else {
        res.write(generateHeartbeat() + "\r\n");
        heartbeatCount++;
        console.log(`Sent heartbeat #${heartbeatCount}`);
      }
    } catch (err) {
      console.error("Error writing stream:", err);
      clearInterval(interval);
    }
  }, 5000);

  req.on("close", () => {
    console.log("Client disconnected from RFID stream");
    clearInterval(interval);
  });
  req.on("error", () => clearInterval(interval));
});

app.get("/cgi-bin/logs", (req, res) => {
  if (fs.existsSync(logFile)) {
    const logs = fs.readFileSync(logFile, "utf8");
    res.set({
      Server: "Device/1.0",
      "Content-Type": "text/plain",
      "Content-Length": String(Buffer.byteLength(logs, "utf8")),
      Connection: "close",
    });
    res.status(200).end(logs);
  } else {
    res.set({ Server: "Device/1.0", "Content-Type": "text/plain", "Content-Length": "0", Connection: "close" });
    res.status(404).end();
  }
});

app.all("/cgi-bin/*", (req, res) => {
  res.set({ Server: "Device/1.0", "Content-Type": "text/plain", "Content-Length": "0", Connection: "close" });
  res.status(200).end();
});

startRfidSimulator();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`RFID simulator running at http://0.0.0.0:${PORT}`);
  console.log(`Reader ${readerId} → ${readerLocation} | ${dispatches.length} dispatches | days ${scheduleDays}`);
  console.log(`Real-time mode: Exit events synchronized to wall clock (disp_hour:disp_minute)`);
});

process.on("SIGINT", () => {
  console.log("\nShutting down RFID simulator gracefully...");
  process.exit(0);
});
