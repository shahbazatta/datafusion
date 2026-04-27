const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
const PORT = process.argv[2] || process.env.PORT || 3000;
// Optional second arg lets RFID run on any port while mapping to the correct
// camera_id in camps.json (e.g. node server.js 5002 3002)
const readerId = parseInt(process.argv[3] || process.argv[2] || process.env.CAMERA_ID || PORT, 10);

app.disable("x-powered-by");
app.set("etag", false);

// --------------------
// Simulation config (mirrors the camera simulator)
// --------------------
// 1 real second = SPEED_FACTOR simulated seconds.
// Schedule covers days 11-12 → 2 sim days = 172800 sim sec.
// At 60x → ~48 min per cycle.
const SPEED_FACTOR = 60;
const TICK_MS = 1000;
const SCHEDULE_DAY_BASE = 11;
// Each scheduled batch of `pilgrims` is dispatched over this window
// (linear ramp), so RFID Entry events trickle in instead of flooding.
const DISPATCH_DURATION_SIM_SEC = 60;
// Pilgrims walk away then come back; Exit events lag Entry by this much.
const EXIT_LAG_SIM_SEC = 2 * 3600;
// Spread the exit phase over a window so Exit events trickle too.
const EXIT_DURATION_SIM_SEC = 60;
// Total sim duration of the schedule. After this (+ exit-drain tail) the
// simulator resets and replays from sim-day 11 again.
const SCHEDULE_TOTAL_SIM_SEC = 2 * 86400;
const LOOP_TAIL_SIM_SEC = EXIT_LAG_SIM_SEC + EXIT_DURATION_SIM_SEC;

// In-memory ring buffer of recent events (for streaming clients).
const RECENT_EVENT_LIMIT = 100;

// --------------------
// Resolve this instance's reader_id (= port) → camp_label → schedule
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

const campsData = loadJson(
  path.join(__dirname, "..", "CAM", "camps.json"),
  path.join(__dirname, "camps.json")
);

let campLabel = null;
let campGate = null;
if (Array.isArray(campsData)) {
  const match = campsData.find((c) => c && c._source && c._source.camera_id === readerId);
  if (match) {
    campLabel = match._source.camp_label;
    campGate = match._source.gate;
  }
}

const schedRaw = loadJson(
  path.join(__dirname, "..", "CAM", "schedule.json"),
  path.join(__dirname, "schedule.json")
);

let dispatches = [];
if (schedRaw && schedRaw.Sheet1 && campLabel) {
  dispatches = schedRaw.Sheet1
    .filter((r) => r.camp_label === campLabel)
    .map((r) => ({
      code: r.code,
      pilgrims: Number(r.pilgrims) || 0,
      schedSimSec:
        (Number(r.disp_day) - SCHEDULE_DAY_BASE) * 86400 +
        Number(r.disp_hour) * 3600 +
        Number(r.disp_minute) * 60,
    }))
    .filter((d) => d.pilgrims > 0 && d.schedSimSec >= 0)
    .sort((a, b) => a.schedSimSec - b.schedSimSec);
}

// --------------------
// Pre-compute the full event timeline for one schedule cycle.
// Each pilgrim → one Entry event + one Exit event with the same tagId.
// --------------------
function buildTimeline() {
  const events = [];
  for (const d of dispatches) {
    for (let i = 0; i < d.pilgrims; i++) {
      const frac = (i + 0.5) / d.pilgrims; // even spread
      const tagId = `${d.code}-${String(i + 1).padStart(4, "0")}`;
      events.push({
        simSec: d.schedSimSec + frac * DISPATCH_DURATION_SIM_SEC,
        tagId,
        eventType: "Entry",
      });
      events.push({
        simSec: d.schedSimSec + EXIT_LAG_SIM_SEC + frac * EXIT_DURATION_SIM_SEC,
        tagId,
        eventType: "Exit",
      });
    }
  }
  events.sort((a, b) => a.simSec - b.simSec);
  return events;
}

const timeline = buildTimeline();

console.log(
  `[INIT] reader_id=${readerId} camp_label=${campLabel || "(none)"} gate=${campGate || "-"} ` +
    `dispatches=${dispatches.length} timelineEvents=${timeline.length}`
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
  fs.mkdirSync(path.join(__dirname, "logs"));
}

let logFile = getLogFileName();
let currentDate = new Date().getDate();

// Touch the log file immediately so it exists even before any events fire.
fs.appendFileSync(logFile, JSON.stringify({ timestamp: new Date().toISOString(), type: "startup", readerId, campLabel, dispatches: dispatches.length }) + "\n");

function logRfidEvent(event) {
  fs.appendFileSync(logFile, JSON.stringify(event) + "\n");
}

// --------------------
// Simulation state
// --------------------
let simStart = Date.now();
let nextEventIdx = 0;
let recentEvents = [];

const readerLocation = campLabel
  ? `Camp ${campLabel}${campGate ? ` (Gate ${campGate})` : ""}`
  : `Reader ${readerId}`;

function emitEvent(tpl) {
  const now = new Date();
  const event = {
    timestamp: now.toISOString(),
    timestampFormatted: now.toLocaleString("sv").replace("T", " ").slice(0, 19),
    port: parseInt(PORT, 10),
    tagId: tpl.tagId,
    readerLocation,
    eventType: tpl.eventType,
    signalStrength_dBm: -Math.floor(Math.random() * 51 + 50), // -50 to -100 dBm
  };
  recentEvents.push(event);
  if (recentEvents.length > RECENT_EVENT_LIMIT) recentEvents.shift();
  logRfidEvent(event);
  return event;
}

function getSimSec() {
  return ((Date.now() - simStart) / 1000) * SPEED_FACTOR;
}

function startRfidSimulator() {
  setInterval(() => {
    const now = new Date();

    // Rotate log file on new wall-clock day.
    if (now.getDate() !== currentDate) {
      currentDate = now.getDate();
      logFile = getLogFileName();
      console.log("[LOG ROTATE] New log file:", path.basename(logFile));
    }

    let simSec = getSimSec();

    // Loop the schedule once it (plus exit-drain tail) finishes.
    if (simSec >= SCHEDULE_TOTAL_SIM_SEC + LOOP_TAIL_SIM_SEC) {
      console.log("[LOOP] Schedule cycle complete — restarting RFID simulator.");
      simStart = Date.now();
      nextEventIdx = 0;
      simSec = 0;
    }

    if (timeline.length === 0) return;

    let emitted = 0;
    while (nextEventIdx < timeline.length && timeline[nextEventIdx].simSec <= simSec) {
      emitEvent(timeline[nextEventIdx]);
      nextEventIdx++;
      emitted++;
    }

    if (emitted > 0) {
      console.log(`[RFID] Emitted ${emitted} scheduled event(s); buffer=${recentEvents.length}`);
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
  return `--myboundary
Content-Type: text/plain
Content-Length: 9

Heartbeat`;
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

  let payload = generateRfidPayload();
  res.write(`--myboundary
Content-Type: application/json
Content-Length: ${Buffer.byteLength(payload)}

${payload}
`);

  let heartbeatCount = 0;

  const interval = setInterval(() => {
    try {
      if (recentEvents.length !== lastEventCount) {
        payload = generateRfidPayload();
        res.write(`--myboundary
Content-Type: application/json
Content-Length: ${Buffer.byteLength(payload)}

${payload}
`);
        console.log(`Sent RFID update (${recentEvents.length} events)`);
        lastEventCount = recentEvents.length;
        heartbeatCount = 0;
      } else {
        const hb = generateHeartbeat();
        res.write(hb + "\n");
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
});

app.get("/cgi-bin/logs", (req, res) => {
  if (fs.existsSync(logFile)) {
    const logs = fs.readFileSync(logFile, "utf8");
    res.set({
      Server: "Device/1.0",
      "Content-Type": "text/plain",
      "Content-Length": Buffer.byteLength(logs, "utf8"),
    });
    res.send(logs);
  } else {
    res.status(404).send("No log file found");
  }
});

app.all("/cgi-bin/*catchall", (req, res) => {
  console.log("Generic /cgi-bin hit:", req.originalUrl);
  res.set({
    Server: "Device/1.0",
    "Content-Type": "text/plain",
    "Content-Length": "0",
    Connection: "close",
  });
  res.status(200).end();
});

startRfidSimulator();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`RFID simulator running at http://0.0.0.0:${PORT}`);
  console.log(`Logging to file: ${logFile}`);
  console.log(`Reader ${readerId} → ${readerLocation} with ${dispatches.length} scheduled dispatches (${timeline.length} events/cycle)`);
  console.log(`Sim speed: ${SPEED_FACTOR}x (full 2-day schedule completes in ~${Math.round(SCHEDULE_TOTAL_SIM_SEC / SPEED_FACTOR / 60)} min, then loops)`);
});

process.on("SIGINT", () => {
  console.log("\nShutting down RFID simulator gracefully...");
  process.exit(0);
});
