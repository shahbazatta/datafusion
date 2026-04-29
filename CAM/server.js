const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const app = express();
const PORT = process.argv[2] || process.env.PORT || 3000;

app.disable("x-powered-by");
app.set("etag", false);

// --------------------
// Simulation config
// --------------------
// Real-time: dispatching = pilgrims EXITING the camp at the scheduled hour:minute.
// Batch is spread evenly over DISPATCH_DURATION_SEC real seconds so counters
// ramp smoothly rather than jumping.
// On startup the counters are pre-populated with whatever has already
// dispatched today (synchronized to wall clock).
const TICK_MS = 1000;
const DISPATCH_DURATION_SEC = 60;

// --------------------
// camera_id → camp_label → schedule
// --------------------
const cameraId = parseInt(PORT, 10);

let campLabel = null;
try {
  const camps = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "camps.json"), "utf8"));
  const match = camps.find((c) => c && c._source && c._source.camera_id === cameraId);
  if (match) campLabel = match._source.camp_label;
} catch (e) {
  console.warn("Could not read camps.json:", e.message);
}

let dispatches = [];
try {
  const schedRaw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "schedule.json"), "utf8"));
  const rows = schedRaw.Sheet1 || [];
  if (campLabel) {
    dispatches = rows
      .filter((r) => r.camp_label === campLabel)
      .map((r) => ({
        disp_day:    Number(r.disp_day),
        disp_hour:   Number(r.disp_hour),
        disp_minute: Number(r.disp_minute),
        pilgrims:    Number(r.pilgrims) || 0,
      }))
      .filter((d) => d.pilgrims > 0)
      .sort((a, b) => (a.disp_hour * 60 + a.disp_minute) - (b.disp_hour * 60 + b.disp_minute));
  }
} catch (e) {
  console.warn("Could not read schedule.json:", e.message);
}

// Day cycling: use actual disp_day values from the schedule (e.g. [11, 12]).
// Each real calendar day advances to the next schedule day, then loops.
const scheduleDays = [...new Set(dispatches.map((d) => d.disp_day))].sort((a, b) => a - b);
const simStart = Date.now();

function getSimDay() {
  if (!scheduleDays.length) return 11;
  const daysPassed = Math.floor((Date.now() - simStart) / 86400000);
  return scheduleDays[daysPassed % scheduleDays.length];
}

// Cumulative exits for simDay up to current real wall-clock second.
// Dispatching = people exiting the camp, so we only track exits.
function cumulativeExited(simDay) {
  const now = new Date();
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  let total = 0;
  for (const d of dispatches) {
    if (d.disp_day !== simDay) continue;
    const dispSec = d.disp_hour * 3600 + d.disp_minute * 60;
    const elapsed = nowSec - dispSec;
    if (elapsed <= 0) continue;
    total += elapsed >= DISPATCH_DURATION_SEC
      ? d.pilgrims
      : Math.floor(d.pilgrims * (elapsed / DISPATCH_DURATION_SEC));
  }
  return total;
}

// Exits in a specific hour for simDay.
function exitedInHour(simDay, hour) {
  const now = new Date();
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  let total = 0;
  for (const d of dispatches) {
    if (d.disp_day !== simDay || d.disp_hour !== hour) continue;
    const dispSec = d.disp_hour * 3600 + d.disp_minute * 60;
    const elapsed = nowSec - dispSec;
    if (elapsed <= 0) continue;
    total += elapsed >= DISPATCH_DURATION_SEC
      ? d.pilgrims
      : Math.floor(d.pilgrims * (elapsed / DISPATCH_DURATION_SEC));
  }
  return total;
}

console.log(`[INIT] camera_id=${cameraId} camp_label=${campLabel || "(none)"} dispatches=${dispatches.length} scheduleDays=${scheduleDays}`);

// --------------------
// State
// --------------------
let enteredHour  = 0;
let exitedHour   = 0;
let enteredToday = 0;
let exitedToday  = 0;
let totalEntered = 0;
let totalExited  = 0;

let currentHour = new Date().getHours();
let currentDate = new Date().getDate();

let prevEnteredHour  = 0;
let prevExitedHour   = 0;
let prevEnteredToday = 0;
let prevExitedToday  = 0;
let prevTotalEntered = 0;
let prevTotalExited  = 0;

// --------------------
// Logs
// --------------------
function getLogFileName() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
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
  return path.join(__dirname, `summary_${dateTime}_${ipAddress}.log`);
}

let logFile = getLogFileName();

function logSnapshot(type) {
  const snapshot = {
    timestamp: new Date().toISOString(),
    type,
    port: parseInt(PORT, 10),
    enteredHour, exitedHour,
    enteredToday, exitedToday,
    totalEntered, totalExited,
  };
  fs.appendFileSync(logFile, JSON.stringify(snapshot) + "\n");
  console.log(`[LOGGED] ${type} snapshot → ${path.basename(logFile)}`);
}

// --------------------
// Periodic updater — real-time, wall-clock synchronized
// --------------------
function startSummaryUpdater() {
  // Catch-up: pre-populate counters with what has already dispatched today.
  let simDay = getSimDay();
  let lastCumExited = cumulativeExited(simDay);
  exitedToday = lastCumExited;
  exitedHour  = exitedInHour(simDay, currentHour);
  totalExited = lastCumExited;

  console.log(`[CATCHUP] simDay=${simDay} exitedToday=${exitedToday} exitedHour=${exitedHour}`);

  setInterval(() => {
    const now = new Date();

    // Daily reset on real calendar day change.
    if (now.getDate() !== currentDate) {
      logSnapshot("daily");
      currentDate = now.getDate();
      simDay = getSimDay();
      enteredToday = 0;
      exitedToday  = 0;
      lastCumExited = 0;
      logFile = getLogFileName();
      console.log(`[RESET] Daily reset. New simDay=${simDay}`);
    }

    // Hourly reset on real hour change.
    if (now.getHours() !== currentHour) {
      logSnapshot("hourly");
      currentHour = now.getHours();
      enteredHour = 0;
      exitedHour  = 0;
      console.log(`[RESET] Hourly reset. hour=${currentHour}`);
    }

    // Compute new cumulative exits and apply delta.
    const newCumExited = cumulativeExited(simDay);
    const dExited = Math.max(0, newCumExited - lastCumExited);
    lastCumExited = newCumExited;

    if (dExited > 0) {
      exitedHour   += dExited;
      exitedToday  += dExited;
      totalExited  += dExited;
      console.log(`[TICK] simDay=${simDay} hour=${currentHour} dExited=${dExited} exitedToday=${exitedToday} totalExited=${totalExited}`);
    }
  }, TICK_MS);
}

// --------------------
// Response body (key=value) — format unchanged
// --------------------
function generateSummary() {
  const nowEpoch = Math.floor(Date.now() / 1000);
  return `summary.Channel=0
summary.RuleName=NumberStat
summary.Port=${PORT}
summary.EnteredSubtotal.Hour=${enteredHour}
summary.EnteredSubtotal.Today=${enteredToday}
summary.EnteredSubtotal.Total=${totalEntered}
summary.ExitedSubtotal.Hour=${exitedHour}
summary.ExitedSubtotal.Today=${exitedToday}
summary.ExitedSubtotal.Total=${totalExited}
summary.UTC=${nowEpoch}`;
}

function hasStatsChanged() {
  return (
    enteredHour  !== prevEnteredHour  ||
    exitedHour   !== prevExitedHour   ||
    enteredToday !== prevEnteredToday ||
    exitedToday  !== prevExitedToday  ||
    totalEntered !== prevTotalEntered ||
    totalExited  !== prevTotalExited
  );
}

function updatePreviousStats() {
  prevEnteredHour  = enteredHour;
  prevExitedHour   = exitedHour;
  prevEnteredToday = enteredToday;
  prevExitedToday  = exitedToday;
  prevTotalEntered = totalEntered;
  prevTotalExited  = totalExited;
}

function generateHeartbeat() {
  return `--myboundary
Content-Type: text/plain
Content-Length:9

Heartbeat`;
}

// --------------------
// Routes — unchanged
// --------------------
app.get("/cgi-bin/videoStatServer.cgi", (req, res) => {
  console.log("videoStatServer.cgi called:", req.query);
  res.set({
    Server: "Device/1.0",
    Connection: "keep-alive",
    "Content-Type": "multipart/x-mixed-replace; boundary=myboundary",
    "Transfer-Encoding": "chunked",
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  res.status(200);

  updatePreviousStats();
  res.write(generateSummary() + "\n\n");

  let heartbeatCount = 0;
  const interval = setInterval(() => {
    try {
      if (hasStatsChanged()) {
        res.write(generateSummary() + "\n\n");
        updatePreviousStats();
        heartbeatCount = 0;
      } else {
        res.write(generateHeartbeat() + "\n\n");
        heartbeatCount++;
      }
    } catch (err) {
      clearInterval(interval);
    }
  }, 5000);

  req.on("close", () => clearInterval(interval));
  req.on("error", () => clearInterval(interval));
});

app.get("/cgi-bin/logs", (req, res) => {
  if (fs.existsSync(logFile)) {
    const logs = fs.readFileSync(logFile, "utf8");
    res.set({ Server: "Device/1.0", Connection: "close", "Content-Type": "text/plain", "Content-Length": String(Buffer.byteLength(logs, "utf8")) });
    res.status(200).end(logs);
  } else {
    res.set({ Server: "Device/1.0", Connection: "close", "Content-Type": "text/plain", "Content-Length": "0" });
    res.status(404).end();
  }
});

app.all("/cgi-bin/*", (req, res) => {
  res.set({ Server: "Device/1.0", "Content-Type": "text/plain", "Content-Length": "0", Connection: "close" });
  res.status(200).end();
});

startSummaryUpdater();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Camera simulator running at http://0.0.0.0:${PORT}`);
  console.log(`Camera ${cameraId} → camp ${campLabel || "(unmapped)"} | ${dispatches.length} dispatches | days ${scheduleDays}`);
  console.log(`Real-time mode: exits synchronized to wall clock (disp_hour:disp_minute)`);
});

process.on("SIGINT", () => {
  console.log("\nShutting down gracefully...");
  process.exit(0);
});
