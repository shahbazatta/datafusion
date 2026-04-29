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
// Real-time: dispatching = pilgrims EXITING the camp at disp_hour:disp_minute.
// Each pilgrim exit is emitted as a separate event with 1–2 s gaps between them.
const TICK_MS = 1000;
const PILGRIM_INTERVAL_MIN_MS = 1000; // min gap between individual exits
const PILGRIM_INTERVAL_MAX_MS = 2000; // max gap between individual exits
// Generous upper bound on how long a full batch takes (pilgrims × max_interval).
// Used during startup catch-up to decide if a past dispatch is fully done.
const MAX_PILGRIM_BATCH_SEC = 250 * (PILGRIM_INTERVAL_MAX_MS / 1000); // ~500 s

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
        code:        r.code,
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
const scheduleDays = [...new Set(dispatches.map((d) => d.disp_day))].sort((a, b) => a - b);
const simStart = Date.now();

function getSimDay() {
  if (!scheduleDays.length) return 11;
  const daysPassed = Math.floor((Date.now() - simStart) / 86400000);
  return scheduleDays[daysPassed % scheduleDays.length];
}

// Build an array of cumulative ms offsets (from batch-start) for each pilgrim.
// e.g. [1400, 3200, 4700, ...] — times at which each pilgrim should be emitted.
function buildEmissionOffsets(count) {
  const offsets = [];
  let cumulative = 0;
  for (let i = 0; i < count; i++) {
    cumulative += Math.floor(Math.random() * (PILGRIM_INTERVAL_MAX_MS - PILGRIM_INTERVAL_MIN_MS + 1))
                  + PILGRIM_INTERVAL_MIN_MS;
    offsets.push(cumulative);
  }
  return offsets;
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

// Active batch queue.
// Each entry: { disp, startRealMs, baseIdx, emittedCount, offsets }
//   baseIdx:      how many pilgrims were already counted before this entry (for tag IDs)
//   emittedCount: how many of `offsets` have fired so far
//   offsets:      ms-from-startRealMs when each remaining pilgrim should exit
let activeDispatches = [];

// Keys already fired this sim-day — prevents double-firing if process restarts mid-minute.
let firedDispatches = new Set();
let currentSimDay = getSimDay();

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

function logEvent(obj) {
  fs.appendFileSync(logFile, JSON.stringify(obj) + "\n");
}

function logSnapshot(type) {
  const snapshot = {
    timestamp: new Date().toISOString(),
    type,
    port: parseInt(PORT, 10),
    enteredHour, exitedHour,
    enteredToday, exitedToday,
    totalEntered, totalExited,
  };
  logEvent(snapshot);
  console.log(`[LOGGED] ${type} snapshot → ${path.basename(logFile)}`);
}

// --------------------
// Periodic updater — real-time, wall-clock synchronized
// --------------------
function startSummaryUpdater() {
  // ── Startup catch-up ────────────────────────────────────────────────────────
  // Pre-populate counters for batches that already started before this process launched.
  const now0 = new Date();
  const nowSec0 = now0.getHours() * 3600 + now0.getMinutes() * 60 + now0.getSeconds();
  const AVG_INTERVAL_SEC = (PILGRIM_INTERVAL_MIN_MS + PILGRIM_INTERVAL_MAX_MS) / 2 / 1000; // 1.5 s

  for (const d of dispatches) {
    if (d.disp_day !== currentSimDay) continue;
    const dispSec = d.disp_hour * 3600 + d.disp_minute * 60;
    const elapsed = nowSec0 - dispSec; // seconds since this batch should have started
    if (elapsed <= 0) continue;        // not yet time

    const key = `${currentSimDay}-${d.disp_hour}-${d.disp_minute}-${d.code}`;
    firedDispatches.add(key);

    if (elapsed >= MAX_PILGRIM_BATCH_SEC) {
      // Batch fully complete — count all pilgrims immediately.
      if (d.disp_hour === currentHour) exitedHour += d.pilgrims;
      exitedToday += d.pilgrims;
      totalExited += d.pilgrims;
      console.log(`[CATCHUP] Done  ${d.disp_hour}:${String(d.disp_minute).padStart(2,"0")} pilgrims=${d.pilgrims}`);
    } else {
      // Batch still in progress — count already-emitted portion and queue the rest.
      const alreadyEmitted = Math.min(d.pilgrims - 1, Math.floor(elapsed / AVG_INTERVAL_SEC));
      if (alreadyEmitted > 0) {
        if (d.disp_hour === currentHour) exitedHour += alreadyEmitted;
        exitedToday += alreadyEmitted;
        totalExited += alreadyEmitted;
      }
      const remaining = d.pilgrims - alreadyEmitted;
      if (remaining > 0) {
        activeDispatches.push({
          disp:         d,
          startRealMs:  Date.now(),
          baseIdx:      alreadyEmitted,
          emittedCount: 0,
          offsets:      buildEmissionOffsets(remaining),
        });
        console.log(`[CATCHUP] InProg ${d.disp_hour}:${String(d.disp_minute).padStart(2,"0")} alreadyEmitted=${alreadyEmitted} remaining=${remaining}`);
      }
    }
  }

  console.log(`[CATCHUP] exitedToday=${exitedToday} exitedHour=${exitedHour} totalExited=${totalExited}`);

  // ── Main tick ────────────────────────────────────────────────────────────────
  setInterval(() => {
    const now = new Date();

    // Daily reset on real calendar day change.
    if (now.getDate() !== currentDate) {
      logSnapshot("daily");
      currentDate   = now.getDate();
      currentSimDay = getSimDay();
      firedDispatches.clear();
      activeDispatches = [];
      enteredToday = 0;
      exitedToday  = 0;
      logFile = getLogFileName();
      console.log(`[RESET] Daily reset. New simDay=${currentSimDay}`);
    }

    // Hourly reset on real hour change.
    if (now.getHours() !== currentHour) {
      logSnapshot("hourly");
      currentHour = now.getHours();
      enteredHour = 0;
      exitedHour  = 0;
      console.log(`[RESET] Hourly reset. hour=${currentHour}`);
    }

    const nowHour   = now.getHours();
    const nowMinute = now.getMinutes();

    // Check each dispatch — fire if it's time and not yet fired.
    for (const d of dispatches) {
      if (d.disp_day !== currentSimDay) continue;
      const key = `${currentSimDay}-${d.disp_hour}-${d.disp_minute}-${d.code}`;
      if (firedDispatches.has(key)) continue;
      if (nowHour === d.disp_hour && nowMinute === d.disp_minute) {
        firedDispatches.add(key);
        activeDispatches.push({
          disp:         d,
          startRealMs:  Date.now(),
          baseIdx:      0,
          emittedCount: 0,
          offsets:      buildEmissionOffsets(d.pilgrims),
        });
        console.log(`[DISPATCH] simDay=${currentSimDay} ${d.disp_hour}:${String(d.disp_minute).padStart(2,"0")} camp=${campLabel} pilgrims=${d.pilgrims}`);
      }
    }

    // Drain active batches — emit individual pilgrim exits that are due.
    let totalNewExits = 0;
    const nowMs = Date.now();

    for (const active of activeDispatches) {
      const elapsedMs = nowMs - active.startRealMs;
      let newCount = 0;

      while (
        active.emittedCount < active.offsets.length &&
        active.offsets[active.emittedCount] <= elapsedMs
      ) {
        const pilgrimNum = active.baseIdx + active.emittedCount + 1;
        const tagId = `${active.disp.code}-${String(pilgrimNum).padStart(4, "0")}`;

        // Log the individual exit event.
        logEvent({
          timestamp:   now.toISOString(),
          type:        "exit",
          port:        parseInt(PORT, 10),
          camp:        campLabel,
          tagId,
          pilgrimNum,
          totalPilgrims: active.disp.pilgrims,
        });

        active.emittedCount++;
        newCount++;
      }

      if (newCount > 0) {
        exitedHour   += newCount;
        exitedToday  += newCount;
        totalExited  += newCount;
        totalNewExits += newCount;
      }
    }

    // Remove fully-emitted batches.
    activeDispatches = activeDispatches.filter((a) => a.emittedCount < a.offsets.length);

    if (totalNewExits > 0) {
      console.log(`[TICK] simDay=${currentSimDay} hour=${currentHour} newExits=${totalNewExits} exitedToday=${exitedToday} totalExited=${totalExited}`);
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
  console.log(`Real-time mode: individual pilgrim exits at 1–2 s intervals starting at disp_hour:disp_minute`);
});

process.on("SIGINT", () => {
  console.log("\nShutting down gracefully...");
  process.exit(0);
});
