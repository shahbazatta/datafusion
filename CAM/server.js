const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const app = express();
const PORT = process.argv[2] || process.env.PORT || 3000;

// Strip Express defaults
app.disable("x-powered-by");
app.set("etag", false);

// --------------------
// Simulation config
// --------------------
// 1 real second = SPEED_FACTOR simulated seconds.
// Schedule spans days 11-12 = 2 sim days = 172800 sim sec.
// At 60x → 2880 real sec ≈ 48 min for the whole schedule.
const SPEED_FACTOR = 60;
const TICK_MS = 1000;
const SCHEDULE_DAY_BASE = 11;
// A scheduled batch of `pilgrims` people enters over this many sim seconds
// (linear ramp), so counters tick up smoothly instead of jumping.
const DISPATCH_DURATION_SIM_SEC = 60;
// Pilgrims walk away then come back; exit count lags entry count.
const EXIT_LAG_SIM_SEC = 2 * 3600;
// Spread the exit phase over a window so it ramps in too.
const EXIT_DURATION_SIM_SEC = 60;
// Total sim duration of the schedule (days 11-12). After this, the
// simulator loops back to sim-day 11 and replays — totals keep growing,
// hour/today counters reset naturally via the sim-day/hour change checks.
const SCHEDULE_TOTAL_SIM_SEC = 2 * 86400;
// Pause (in sim seconds) between loops so the last exits can drain.
const LOOP_TAIL_SIM_SEC = EXIT_LAG_SIM_SEC + EXIT_DURATION_SIM_SEC;

// --------------------
// Resolve this instance's camera_id → camp_label → schedule
// --------------------
const cameraId = parseInt(PORT, 10);

let campLabel = null;
try {
  const camps = JSON.parse(fs.readFileSync(path.join(__dirname, "camps.json"), "utf8"));
  const match = camps.find((c) => c && c._source && c._source.camera_id === cameraId);
  if (match) campLabel = match._source.camp_label;
} catch (e) {
  console.warn("Could not read camps.json:", e.message);
}

let dispatches = [];
try {
  const schedRaw = JSON.parse(fs.readFileSync(path.join(__dirname, "schedule.json"), "utf8"));
  const rows = schedRaw.Sheet1 || [];
  if (campLabel) {
    dispatches = rows
      .filter((r) => r.camp_label === campLabel)
      .map((r) => ({
        pilgrims: Number(r.pilgrims) || 0,
        schedSimSec:
          (Number(r.disp_day) - SCHEDULE_DAY_BASE) * 86400 +
          Number(r.disp_hour) * 3600 +
          Number(r.disp_minute) * 60,
      }))
      .filter((d) => d.pilgrims > 0 && d.schedSimSec >= 0)
      .sort((a, b) => a.schedSimSec - b.schedSimSec);
  }
} catch (e) {
  console.warn("Could not read schedule.json:", e.message);
}

console.log(`[INIT] camera_id=${cameraId} camp_label=${campLabel || "(none)"} dispatches=${dispatches.length}`);

// --------------------
// State (device memory)
// --------------------
let enteredHour = 0;
let exitedHour = 0;
let enteredToday = 0;
let exitedToday = 0;
let totalEntered = 0;
let totalExited = 0;

// Cumulative entered/exited derived from schedule (for delta computation).
let lastCumEntered = 0;
let lastCumExited = 0;

// Sim-time hour/day for resets (independent of wall clock).
let simStart = Date.now();
let prevSimHour = 0;
let prevSimDay = 0;

// Track previous values for change detection (streaming endpoint).
let prevEnteredHour = 0;
let prevExitedHour = 0;
let prevEnteredToday = 0;
let prevExitedToday = 0;
let prevTotalEntered = 0;
let prevTotalExited = 0;

// ------------------------------------
// Log files: date-time-ip-address naming
// ------------------------------------
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
  const now = new Date();
  const snapshot = {
    timestamp: now.toISOString(),
    type,
    port: parseInt(PORT, 10),
    enteredHour,
    exitedHour,
    enteredToday,
    exitedToday,
    totalEntered,
    totalExited,
  };
  fs.appendFileSync(logFile, JSON.stringify(snapshot) + "\n");
  console.log(`[LOGGED] ${type} snapshot saved to ${path.basename(logFile)}`);
}

// --------------------
// Schedule-driven cumulative counts
// --------------------
function cumulativeFromDispatches(simSec, durationSec) {
  let total = 0;
  for (const d of dispatches) {
    const elapsed = simSec - d.schedSimSec;
    if (elapsed <= 0) continue;
    if (elapsed >= durationSec) total += d.pilgrims;
    else total += Math.floor(d.pilgrims * (elapsed / durationSec));
  }
  return total;
}

function getSimSec() {
  return ((Date.now() - simStart) / 1000) * SPEED_FACTOR;
}

// ---------------------------------------------------
// Periodic updater: drives counters from the schedule
// ---------------------------------------------------
function startSummaryUpdater() {
  setInterval(() => {
    let simSec = getSimSec();

    // Loop the schedule once it (plus exit-drain tail) finishes.
    if (simSec >= SCHEDULE_TOTAL_SIM_SEC + LOOP_TAIL_SIM_SEC) {
      console.log("[LOOP] Schedule cycle complete — restarting simulator.");
      simStart = Date.now();
      lastCumEntered = 0;
      lastCumExited = 0;
      simSec = 0;
    }

    const simDayIdx = Math.floor(simSec / 86400);
    const secInDay = simSec - simDayIdx * 86400;
    const simHour = Math.floor(secInDay / 3600);

    // Daily reset on sim-day change (also rotates log file).
    if (simDayIdx !== prevSimDay) {
      logSnapshot("daily");
      prevSimDay = simDayIdx;
      enteredToday = 0;
      exitedToday = 0;
      logFile = getLogFileName();
      console.log("[RESET] Sim daily counters reset. New log file:", logFile);
    }

    // Hourly reset on sim-hour change.
    if (simHour !== prevSimHour) {
      logSnapshot("hourly");
      prevSimHour = simHour;
      enteredHour = 0;
      exitedHour = 0;
      console.log(`[RESET] Sim hourly counters reset (sim day=${SCHEDULE_DAY_BASE + simDayIdx} hour=${simHour}).`);
    }

    const curEntered = cumulativeFromDispatches(simSec, DISPATCH_DURATION_SIM_SEC);
    const curExited = cumulativeFromDispatches(simSec - EXIT_LAG_SIM_SEC, EXIT_DURATION_SIM_SEC);

    const dEntered = Math.max(0, curEntered - lastCumEntered);
    let dExited = Math.max(0, curExited - lastCumExited);

    // Exit can never outpace entries.
    if (curExited > curEntered) dExited = Math.max(0, curEntered - lastCumExited);

    lastCumEntered = curEntered;
    lastCumExited = lastCumExited + dExited;

    enteredHour += dEntered;
    exitedHour += dExited;
    enteredToday += dEntered;
    exitedToday += dExited;
    totalEntered += dEntered;
    totalExited += dExited;

    if (dEntered || dExited) {
      console.log("Sim tick:", {
        simDay: SCHEDULE_DAY_BASE + simDayIdx,
        simHour,
        dEntered,
        dExited,
        enteredHour,
        exitedHour,
        enteredToday,
        exitedToday,
        totalEntered,
        totalExited,
      });
    }
  }, TICK_MS);
}

// ---------------------------
// Response body (key=value)
// ---------------------------
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
    enteredHour !== prevEnteredHour ||
    exitedHour !== prevExitedHour ||
    enteredToday !== prevEnteredToday ||
    exitedToday !== prevExitedToday ||
    totalEntered !== prevTotalEntered ||
    totalExited !== prevTotalExited
  );
}

function updatePreviousStats() {
  prevEnteredHour = enteredHour;
  prevExitedHour = exitedHour;
  prevEnteredToday = enteredToday;
  prevExitedToday = exitedToday;
  prevTotalEntered = totalEntered;
  prevTotalExited = totalExited;
}

function generateHeartbeat() {
  return `--myboundary
Content-Type: text/plain
Content-Length:9

Heartbeat`;
}

// ---------------------------
// Routes
// ---------------------------
app.get("/cgi-bin/videoStatServer.cgi", (req, res) => {
  console.log("videoStatServer.cgi called with streaming mode:", req.query);

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

  const initialSummary = generateSummary();
  res.write(initialSummary + "\n\n");
  console.log("Sent initial summary block");

  let heartbeatCount = 0;

  const interval = setInterval(() => {
    try {
      if (hasStatsChanged()) {
        const summaryBlock = generateSummary();
        res.write(summaryBlock + "\n\n");
        console.log("Sent summary update (stats changed)");
        updatePreviousStats();
        heartbeatCount = 0;
      } else {
        const heartbeat = generateHeartbeat();
        res.write(heartbeat + "\n\n");
        heartbeatCount++;
        console.log(`Sent heartbeat #${heartbeatCount}`);
      }
    } catch (error) {
      console.error("Error writing to response stream:", error);
      clearInterval(interval);
    }
  }, 5000);

  req.on("close", () => {
    console.log("Client disconnected from videoStatServer.cgi stream");
    clearInterval(interval);
  });

  req.on("error", (error) => {
    console.error("Connection error in videoStatServer.cgi:", error);
    clearInterval(interval);
  });
});

app.get("/cgi-bin/logs", (req, res) => {
  if (fs.existsSync(logFile)) {
    const logs = fs.readFileSync(logFile, "utf8");
    res.set({
      Server: "Device/1.0",
      Connection: "close",
      "Content-Type": "text/plain",
      "Content-Length": String(Buffer.byteLength(logs, "utf8")),
    });
    res.status(200).end(logs);
  } else {
    res.set({
      Server: "Device/1.0",
      Connection: "close",
      "Content-Type": "text/plain",
      "Content-Length": "0",
    });
    res.status(404).end();
  }
});

app.all("/cgi-bin/*", (req, res) => {
  console.log("Generic /cgi-bin hit:", req.originalUrl);
  res.set({
    Server: "Device/1.0",
    "Content-Type": "text/plain",
    "Content-Length": "0",
    Connection: "close",
  });
  res.status(200).end();
});

startSummaryUpdater();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
  console.log(`Logging to file: ${logFile}`);
  console.log(`Camera ${cameraId} → camp ${campLabel || "(unmapped)"} with ${dispatches.length} scheduled dispatches`);
  console.log(`Sim speed: ${SPEED_FACTOR}x (full 2-day schedule completes in ~${Math.round((2 * 86400) / SPEED_FACTOR / 60)} min)`);
});

process.on("SIGINT", () => {
  console.log("\nShutting down server gracefully...");
  process.exit(0);
});
