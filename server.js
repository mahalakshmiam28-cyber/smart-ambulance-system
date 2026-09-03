const express = require("express");
const crypto = require("crypto");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const APP_USER_AGENT =
  process.env.APP_USER_AGENT || "smart-ambulance-system/1.0 (contact: local-project)";
const OSM_CONTACT_EMAIL = process.env.OSM_CONTACT_EMAIL || "";
const HOSPITALS_PROVIDER = process.env.HOSPITALS_PROVIDER || "database";
const OSM_NOMINATIM_URL =
  process.env.OSM_NOMINATIM_URL || "https://nominatim.openstreetmap.org/search";
const OSM_REVERSE_GEOCODE_URL =
  process.env.OSM_REVERSE_GEOCODE_URL || "https://nominatim.openstreetmap.org/reverse";
const OSM_OVERPASS_API_URL =
  process.env.OSM_OVERPASS_API_URL || "https://overpass-api.de/api/interpreter";
const EXTERNAL_HOSPITALS_API_URL = process.env.EXTERNAL_HOSPITALS_API_URL || "";
const EXTERNAL_HOSPITALS_API_KEY = process.env.EXTERNAL_HOSPITALS_API_KEY || "";
const EXTERNAL_HOSPITALS_API_KEY_HEADER =
  process.env.EXTERNAL_HOSPITALS_API_KEY_HEADER || "x-api-key";
const EXTERNAL_HOSPITALS_AUTH_TYPE = process.env.EXTERNAL_HOSPITALS_AUTH_TYPE || "header";
const ROUTE_PROVIDER = process.env.ROUTE_PROVIDER || "none";
const OSRM_ROUTE_API_URL =
  process.env.OSRM_ROUTE_API_URL || "https://router.project-osrm.org/route/v1/driving";
const GRAPHHOPPER_DIRECTIONS_API_URL =
  process.env.GRAPHHOPPER_DIRECTIONS_API_URL || "https://graphhopper.com/api/1/route";
const GRAPHHOPPER_API_KEY = process.env.GRAPHHOPPER_API_KEY || "";
const GRAPHHOPPER_PROFILE = process.env.GRAPHHOPPER_PROFILE || "car_avoid_toll";
const GRAPHHOPPER_SNAP_PREVENTION =
  process.env.GRAPHHOPPER_SNAP_PREVENTION || "motorway,ferry,tunnel";
const OPENROUTESERVICE_API_URL =
  process.env.OPENROUTESERVICE_API_URL ||
  "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
const OPENROUTESERVICE_API_KEY = process.env.OPENROUTESERVICE_API_KEY || "";
const HOSPITAL_SEARCH_RADIUS_KM = 5;
const LOCAL_FALLBACK_AMBULANCE_RADIUS_KM = 3;
const ACTIVE_USER_WINDOW_MINUTES = 10;
const ADMIN_CONSOLE_PASSWORD = process.env.ADMIN_CONSOLE_PASSWORD || "Dispatch@2026";
const ADMIN_SESSION_COOKIE = "admin_session";
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const adminSessions = new Map();
const liveDispatchTracks = new Map();
const AI_PROVIDER = process.env.AI_PROVIDER || "local";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_API_URL = process.env.OPENAI_API_URL || "https://api.openai.com/v1/responses";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const SCORING_WEIGHTS = {
  responseDistance: 0.2,
  ambulanceToHospitalDistance: 0.25,
  trafficDelay: 0.2,
  hospitalLoad: 0.2,
  emergencyFit: 0.15
};

const EMERGENCY_PROFILES = {
  cardiac: {
    label: "Cardiac Emergency",
    priorityBoost: 1,
    preferredCapabilities: ["cardiac", "icu", "cathlab"],
    avoidanceCapabilities: []
  },
  trauma: {
    label: "Trauma / Accident",
    priorityBoost: 0.95,
    preferredCapabilities: ["trauma", "orthopedic", "icu"],
    avoidanceCapabilities: []
  },
  stroke: {
    label: "Stroke / Neuro",
    priorityBoost: 0.98,
    preferredCapabilities: ["stroke", "neuro", "icu"],
    avoidanceCapabilities: []
  },
  pediatric: {
    label: "Pediatric Emergency",
    priorityBoost: 0.94,
    preferredCapabilities: ["pediatric", "nicu", "icu"],
    avoidanceCapabilities: []
  },
  maternity: {
    label: "Maternity Emergency",
    priorityBoost: 0.92,
    preferredCapabilities: ["maternity", "nicu", "icu"],
    avoidanceCapabilities: []
  },
  respiratory: {
    label: "Respiratory Distress",
    priorityBoost: 0.96,
    preferredCapabilities: ["pulmonary", "icu", "emergency"],
    avoidanceCapabilities: []
  },
  general: {
    label: "General Emergency",
    priorityBoost: 0.9,
    preferredCapabilities: ["emergency", "icu"],
    avoidanceCapabilities: []
  }
};

const PRE_ARRIVAL_GUIDANCE = {
  cardiac: {
    summary:
      "Keep the patient at rest, loosen tight clothing, and monitor breathing while waiting for the ambulance.",
    precautions: [
      "Keep the patient seated upright or lying down with head slightly raised.",
      "If the patient is prescribed their own emergency heart medication, help them take it only as previously instructed by their doctor.",
      "Do not give food, alcohol, or unnecessary drinks.",
      "Be ready to start CPR if the patient becomes unresponsive and is not breathing normally."
    ],
    warnings: [
      "If the patient collapses or stops breathing, begin CPR immediately if trained.",
      "Do not allow the patient to walk or strain."
    ]
  },
  trauma: {
    summary:
      "Minimize movement, control visible bleeding, and keep the patient still until responders arrive.",
    precautions: [
      "Apply firm pressure with a clean cloth to serious external bleeding if possible.",
      "Do not move the patient unless there is immediate danger such as fire or traffic.",
      "Support injured limbs gently without forcing them straight.",
      "Keep the patient warm and calm."
    ],
    warnings: [
      "If head, neck, or spine injury is suspected, keep the patient completely still.",
      "Do not remove deeply embedded objects."
    ]
  },
  stroke: {
    summary:
      "Keep the patient safe, monitor speech and breathing, and avoid giving food or drink.",
    precautions: [
      "Lay the patient on their side if they are drowsy or vomiting.",
      "Note the exact time symptoms started if known.",
      "Keep the airway clear and monitor for worsening weakness or confusion.",
      "Speak calmly and keep the patient still."
    ],
    warnings: [
      "Do not give food, water, or tablets unless instructed by medical professionals.",
      "If the patient becomes unresponsive and is not breathing normally, start CPR if trained."
    ]
  },
  pediatric: {
    summary:
      "Keep the child calm, watch breathing closely, and avoid giving anything by mouth unless necessary.",
    precautions: [
      "Hold or position the child comfortably with airway open.",
      "Monitor for changes in breathing, skin color, or responsiveness.",
      "Keep the child warm and reassured.",
      "Have any known allergy or medication details ready for responders."
    ],
    warnings: [
      "If the child is choking or stops breathing, perform age-appropriate first aid if trained.",
      "Do not force food or drink."
    ]
  },
  maternity: {
    summary:
      "Help the patient stay comfortable, prepare for urgent transport, and watch for heavy bleeding or delivery signs.",
    precautions: [
      "Help the patient lie on their left side if dizzy or uncomfortable.",
      "Gather maternity records or known pregnancy details if available.",
      "Prepare clean towels or sheets in case of sudden delivery.",
      "Keep the patient calm and avoid unnecessary walking."
    ],
    warnings: [
      "If there is heavy bleeding, severe pain, or the baby is crowning, inform responders immediately.",
      "Do not delay transport for nonessential items."
    ]
  },
  respiratory: {
    summary:
      "Help the patient sit upright, loosen tight clothing, and focus on keeping breathing as easy as possible.",
    precautions: [
      "Seat the patient upright and encourage slow, steady breaths.",
      "Move them away from smoke, dust, or strong fumes if present.",
      "If they use their own inhaler or breathing medication, help them use it as prescribed.",
      "Keep the room ventilated if safe."
    ],
    warnings: [
      "If lips turn blue, breathing stops, or the patient cannot speak, treat it as critical.",
      "Do not force the patient to lie flat."
    ]
  },
  general: {
    summary:
      "Keep the patient safe, calm, and observed while preparing key details for emergency responders.",
    precautions: [
      "Keep the patient in the most comfortable position and monitor breathing.",
      "Do not give anything by mouth if the patient is confused, vomiting, or very weak.",
      "Keep emergency contacts, medications, and medical history ready if known.",
      "Clear the entrance or path so responders can reach the patient quickly."
    ],
    warnings: [
      "If the patient becomes unresponsive or stops breathing normally, start CPR if trained.",
      "Call local emergency services again if symptoms rapidly worsen."
    ]
  }
};

const dbPool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "smart_ambulance",
  waitForConnections: true,
  connectionLimit: 10
});

app.use(express.json());

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex === -1) {
        return cookies;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

function createAdminSession() {
  const token = crypto.randomBytes(24).toString("hex");
  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  return token;
}

function getAdminSessionToken(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return cookies[ADMIN_SESSION_COOKIE] || "";
}

function isAdminAuthenticated(req) {
  const token = getAdminSessionToken(req);
  const expiresAt = adminSessions.get(token);

  if (!token || !expiresAt) {
    return false;
  }

  if (expiresAt <= Date.now()) {
    adminSessions.delete(token);
    return false;
  }

  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  return true;
}

function clearExpiredAdminSessions() {
  const now = Date.now();

  for (const [token, expiresAt] of adminSessions.entries()) {
    if (expiresAt <= now) {
      adminSessions.delete(token);
    }
  }
}

function requireAdminAuth(req, res, next) {
  clearExpiredAdminSessions();

  if (isAdminAuthenticated(req)) {
    return next();
  }

  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Admin login required" });
  }

  return res.redirect("/admin-login.html");
}

app.use((req, res, next) => {
  const isProtectedAdminAsset =
    req.path === "/admin.html" ||
    req.path === "/admin.js" ||
    req.path.startsWith("/api/admin");
  const isPublicAdminRoute = req.path === "/api/admin/login";

  if (isProtectedAdminAsset && !isPublicAdminRoute) {
    return requireAdminAuth(req, res, next);
  }

  return next();
});

app.use(express.static(path.join(__dirname)));

async function ensureColumnExists(tableName, columnName, columnDefinition) {
  const [rows] = await dbPool.query(
    `
    SELECT COUNT(*) AS column_count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    `,
    [tableName, columnName]
  );

  if (!rows[0]?.column_count) {
    await dbPool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
  }
}

async function ensureOperationalTables() {
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS website_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      session_id VARCHAR(64) NOT NULL UNIQUE,
      first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      user_agent VARCHAR(255) NOT NULL DEFAULT '',
      current_page VARCHAR(120) NOT NULL DEFAULT 'main'
    )
  `);

  await ensureColumnExists(
    "ambulance_requests",
    "status",
    "status VARCHAR(20) NOT NULL DEFAULT 'active' AFTER eta_minutes"
  );
  await ensureColumnExists(
    "ambulance_requests",
    "completed_at",
    "completed_at TIMESTAMP NULL DEFAULT NULL AFTER status"
  );
  await ensureColumnExists(
    "ambulance_requests",
    "completed_by",
    "completed_by VARCHAR(64) NOT NULL DEFAULT '' AFTER completed_at"
  );
  await ensureColumnExists(
    "ambulance_requests",
    "session_id",
    "session_id VARCHAR(64) NOT NULL DEFAULT '' AFTER completed_by"
  );
  await ensureColumnExists(
    "ambulance_requests",
    "emergency_type",
    "emergency_type VARCHAR(40) NOT NULL DEFAULT 'general' AFTER session_id"
  );

  await dbPool.query(`
    CREATE INDEX idx_website_sessions_last_seen
    ON website_sessions (last_seen)
  `).catch(() => {});

  await dbPool.query(`
    CREATE INDEX idx_ambulance_requests_status
    ON ambulance_requests (status, requested_at)
  `).catch(() => {});

  await dbPool.query(`
    UPDATE ambulance_requests ar
    JOIN ambulances a ON a.id = ar.ambulance_id
    SET
      ar.status = 'completed',
      ar.completed_at = COALESCE(ar.completed_at, ar.requested_at),
      ar.completed_by = CASE
        WHEN ar.completed_by = '' THEN 'system-backfill'
        ELSE ar.completed_by
      END
    WHERE ar.status = 'active'
      AND a.is_available = 1
  `);

  await dbPool.query(`
    UPDATE ambulance_requests ar
    JOIN (
      SELECT ambulance_id, MAX(id) AS latest_id
      FROM ambulance_requests
      WHERE status = 'active'
      GROUP BY ambulance_id
    ) latest ON latest.ambulance_id = ar.ambulance_id
    SET
      ar.status = 'completed',
      ar.completed_at = COALESCE(ar.completed_at, ar.requested_at),
      ar.completed_by = CASE
        WHEN ar.completed_by = '' THEN 'system-backfill'
        ELSE ar.completed_by
      END
    WHERE ar.status = 'active'
      AND ar.id <> latest.latest_id
  `);

  await dbPool.query(`
    UPDATE ambulances a
    LEFT JOIN (
      SELECT DISTINCT ambulance_id
      FROM ambulance_requests
      WHERE status = 'active'
    ) active_dispatches ON active_dispatches.ambulance_id = a.id
    SET a.is_available = CASE
      WHEN active_dispatches.ambulance_id IS NULL THEN 1
      ELSE 0
    END
  `);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latDiff = toRadians(lat2 - lat1);
  const lngDiff = toRadians(lng2 - lng1);
  const a =
    Math.sin(latDiff / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lngDiff / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeEmergencyType(value) {
  const normalized = String(value || "general").trim().toLowerCase();
  return EMERGENCY_PROFILES[normalized] ? normalized : "general";
}

function normalizeAreaQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function toTitleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function extractAreaFromAddress(address = {}) {
  return (
    address.suburb ||
    address.neighbourhood ||
    address.residential ||
    address.city_district ||
    address.quarter ||
    address.hamlet ||
    address.village ||
    address.town ||
    address.city ||
    address.county ||
    ""
  );
}

function estimateTrafficDelay(distanceKm, emergencyType, seedValue) {
  const intensitySeed = Math.abs(Math.sin(seedValue * 12.9898));
  const trafficIndex = clamp(0.25 + intensitySeed * 0.9, 0.15, 1.15);
  const emergencyModifier = emergencyType === "cardiac" || emergencyType === "stroke" ? 0.88 : 1;
  const delayMinutes = Math.max(
    2,
    Math.round(distanceKm * (3.2 + trafficIndex * 2.8) * emergencyModifier)
  );

  let level = "Low";
  if (trafficIndex > 0.82) {
    level = "High";
  } else if (trafficIndex > 0.52) {
    level = "Moderate";
  }

  return {
    delayMinutes,
    level,
    index: Number(trafficIndex.toFixed(2))
  };
}

function offsetCoordinate(lat, lng, distanceKm, bearingDegrees) {
  const earthRadiusKm = 6371;
  const bearingRadians = (bearingDegrees * Math.PI) / 180;
  const latRadians = (lat * Math.PI) / 180;
  const lngRadians = (lng * Math.PI) / 180;
  const angularDistance = distanceKm / earthRadiusKm;

  const nextLatRadians = Math.asin(
    Math.sin(latRadians) * Math.cos(angularDistance) +
      Math.cos(latRadians) * Math.sin(angularDistance) * Math.cos(bearingRadians)
  );
  const nextLngRadians =
    lngRadians +
    Math.atan2(
      Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(latRadians),
      Math.cos(angularDistance) - Math.sin(latRadians) * Math.sin(nextLatRadians)
    );

  const normalizedLng = ((((nextLngRadians * 180) / Math.PI) + 540) % 360) - 180;

  return {
    latitude: Number(((nextLatRadians * 180) / Math.PI).toFixed(7)),
    longitude: Number(normalizedLng.toFixed(7))
  };
}

function buildFallbackHospitals(lat, lng, emergencyType, areaQuery) {
  const areaLabel = toTitleCase(areaQuery) || "Local Coverage";
  const specialtySets = {
    cardiac: "emergency,cardiac,icu,cathlab",
    trauma: "emergency,trauma,orthopedic,icu",
    stroke: "emergency,stroke,neuro,icu",
    pediatric: "emergency,pediatric,nicu,icu",
    maternity: "emergency,maternity,nicu,icu",
    respiratory: "emergency,pulmonary,icu",
    general: "emergency,icu"
  };

  return [0.9, 1.8, 3.1].map((distanceKm, index) => {
    const point = offsetCoordinate(lat, lng, distanceKm, 40 + index * 110);
    return {
      hospital_name: `${areaLabel} Hospital ${index + 1}`,
      latitude: point.latitude,
      longitude: point.longitude,
      locality: areaLabel,
      specialties: specialtySets[emergencyType] || specialtySets.general,
      current_load_percent: 35 + index * 12,
      available_beds: 24 - index * 4,
      total_beds: 90 + index * 10
    };
  });
}

function buildFallbackAmbulance(lat, lng, areaQuery) {
  const areaLabel = toTitleCase(areaQuery) || "Local Coverage";
  const point = offsetCoordinate(lat, lng, LOCAL_FALLBACK_AMBULANCE_RADIUS_KM / 2, 225);

  return {
    id: null,
    ambulance_code: `AMB-LOCAL-${Date.now()}`,
    hospital_name: `${areaLabel} Response Base`,
    latitude: point.latitude,
    longitude: point.longitude,
    distance_km: LOCAL_FALLBACK_AMBULANCE_RADIUS_KM / 2,
    synthetic: true
  };
}

function buildPreArrivalGuidance(emergencyType, etaMinutes) {
  const profile = PRE_ARRIVAL_GUIDANCE[emergencyType] || PRE_ARRIVAL_GUIDANCE.general;

  return {
    heading: "Pre-arrival AI guidance",
    summary: profile.summary,
    etaWindow: `Ambulance estimated in about ${Math.max(1, Math.ceil(etaMinutes))} minutes.`,
    precautions: profile.precautions,
    warnings: profile.warnings,
    disclaimer:
      "These instructions are supportive first-aid guidance and not a replacement for trained medical care."
  };
}

function buildLocalAiDispatchInsight({
  emergencyType,
  emergencyLabel,
  selectedAmbulance,
  bestHospital,
  alternatives,
  responseEtaMinutes,
  areaQuery
}) {
  const alternativeNames = (alternatives || []).slice(0, 2).map((item) => item.hospital);
  const priorities = [];

  if (bestHospital.emergencyFit?.matched?.length) {
    priorities.push(`specialty support in ${bestHospital.emergencyFit.matched.join(", ")}`);
  }
  priorities.push(`${bestHospital.traffic.level.toLowerCase()} traffic toward the hospital route`);
  priorities.push(`${bestHospital.loadLabel.toLowerCase()} hospital load at ${bestHospital.loadPercent}%`);
  if (areaQuery) {
    priorities.push(`context around ${toTitleCase(areaQuery)}`);
  }

  return {
    heading: "AI dispatch decision support",
    summary: `${selectedAmbulance.ambulance_code} should respond first for this ${emergencyLabel.toLowerCase()}. ${bestHospital.hospital} remains the strongest destination because it balances ETA, hospital readiness, and clinical fit.`,
    rationale: [
      `Nearest available ambulance ETA is about ${responseEtaMinutes} minutes.`,
      `${bestHospital.hospital} is ranked first with an estimated total response time of ${bestHospital.totalEtaMinutes} minutes.`,
      `Top decision signals: ${priorities.join(", ")}.`
    ],
    actions: [
      "Keep the access path clear so the ambulance team can reach the patient quickly.",
      "Prepare known medications, allergies, and recent symptoms for the responding crew.",
      alternativeNames.length
        ? `If conditions change, the next fallback hospitals are ${alternativeNames.join(" and ")}.`
        : "Continue monitoring the patient closely until the response team arrives."
    ],
    provider: "local",
    model: "rules-based dispatch assistant",
    note:
      emergencyType === "cardiac" || emergencyType === "stroke"
        ? "High-risk emergency profile detected, so time-to-treatment should stay the main priority."
        : "This AI layer is currently using local reasoning rules until an external model is configured."
  };
}

function extractFirstJsonObject(rawText) {
  const trimmed = String(rawText || "").trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    const startIndex = trimmed.indexOf("{");
    const endIndex = trimmed.lastIndexOf("}");

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      try {
        return JSON.parse(trimmed.slice(startIndex, endIndex + 1));
      } catch (_innerError) {
        return null;
      }
    }
  }

  return null;
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const outputItems = Array.isArray(payload?.output) ? payload.output : [];
  const textParts = [];

  outputItems.forEach((item) => {
    const contents = Array.isArray(item?.content) ? item.content : [];
    contents.forEach((contentItem) => {
      if (typeof contentItem?.text === "string" && contentItem.text.trim()) {
        textParts.push(contentItem.text.trim());
      }
    });
  });

  return textParts.join("\n").trim();
}

async function fetchOpenAiDispatchInsight(context) {
  const prompt = `
You are assisting an ambulance dispatch system.
Return strict JSON only with keys: heading, summary, rationale, actions, note.
Use rationale as an array of 3 short strings.
Use actions as an array of 3 short strings.
Stay concise, medically cautious, and operational.

Emergency type: ${context.emergencyLabel}
User area: ${context.areaQuery || "Not specified"}
Selected ambulance: ${context.selectedAmbulance.ambulance_code}
Ambulance ETA to user: ${context.responseEtaMinutes} minutes
Best hospital: ${context.bestHospital.hospital}
Best hospital ETA total: ${context.bestHospital.totalEtaMinutes} minutes
Traffic: ${context.bestHospital.traffic.level} (${context.bestHospital.traffic.delayMinutes} minutes delay)
Hospital load: ${context.bestHospital.loadPercent}% (${context.bestHospital.loadLabel})
Hospital reason: ${context.bestHospital.reason}
Alternative hospitals: ${(context.alternatives || []).map((item) => item.hospital).join(", ") || "None"}
`;

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: prompt
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI request failed with status ${response.status}`);
  }

  const outputText = extractResponseText(payload);
  const parsed = extractFirstJsonObject(outputText);

  if (!parsed) {
    throw new Error("OpenAI response did not contain valid JSON");
  }

  return {
    heading: parsed.heading || "AI dispatch decision support",
    summary: parsed.summary || "",
    rationale: Array.isArray(parsed.rationale) ? parsed.rationale.slice(0, 3) : [],
    actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 3) : [],
    note: parsed.note || "",
    provider: "openai",
    model: OPENAI_MODEL
  };
}

async function buildAiDispatchInsight(context) {
  if (AI_PROVIDER === "openai" && OPENAI_API_KEY) {
    try {
      return await fetchOpenAiDispatchInsight(context);
    } catch (error) {
      console.error("AI dispatch insight error:", error.message);
    }
  }

  return buildLocalAiDispatchInsight(context);
}

function createLiveDispatchTrack({
  dispatchRequestId,
  selectedAmbulance,
  userLat,
  userLng,
  bestHospital,
  responseEtaMinutes,
  route,
  routeToHospital
}) {
  const trackId = `track_${dispatchRequestId || Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const toUserPoints =
    Array.isArray(route?.geometry) && route.geometry.length >= 2
      ? route.geometry
      : [
          [Number(selectedAmbulance.latitude), Number(selectedAmbulance.longitude)],
          [Number(userLat), Number(userLng)]
        ];
  const toHospitalPoints =
    Array.isArray(routeToHospital?.geometry) && routeToHospital.geometry.length >= 2
      ? routeToHospital.geometry
      : [
          [Number(userLat), Number(userLng)],
          [Number(bestHospital.hospitalLat), Number(bestHospital.hospitalLng)]
        ];
  const legs = [
    {
      points: toUserPoints,
      durationMinutes: Math.max(Number(responseEtaMinutes) || 1, 0.5),
      stageLabel: "🚑 Moving from ambulance base to 📍 user location",
      destinationLabel: "📍 user location"
    },
    {
      points: toHospitalPoints,
      durationMinutes: Math.max(
        (Number(bestHospital.totalEtaMinutes) || Number(responseEtaMinutes) || 1) -
          Number(responseEtaMinutes || 0),
        0.5
      ),
      stageLabel: "🚑 Transporting patient from 📍 user location to 🏥 hospital",
      destinationLabel: "🏥 hospital"
    }
  ];

  liveDispatchTracks.set(trackId, {
    id: trackId,
    createdAt: Date.now(),
    dispatchRequestId: dispatchRequestId || null,
    ambulanceCode: selectedAmbulance.ambulance_code,
    legs,
    totalDurationMinutes: legs.reduce((sum, leg) => sum + leg.durationMinutes, 0)
  });

  return trackId;
}

function getPolylineDistanceKm(points) {
  let totalDistanceKm = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    totalDistanceKm += haversineDistanceKm(
      Number(points[index][0]),
      Number(points[index][1]),
      Number(points[index + 1][0]),
      Number(points[index + 1][1])
    );
  }

  return totalDistanceKm;
}

function interpolateAlongPolyline(points, progress) {
  if (!Array.isArray(points) || !points.length) {
    return [0, 0];
  }

  if (points.length === 1 || progress <= 0) {
    return [Number(points[0][0]), Number(points[0][1])];
  }

  if (progress >= 1) {
    const lastPoint = points[points.length - 1];
    return [Number(lastPoint[0]), Number(lastPoint[1])];
  }

  const totalDistanceKm = getPolylineDistanceKm(points);

  if (totalDistanceKm <= 0) {
    return [Number(points[0][0]), Number(points[0][1])];
  }

  const targetDistanceKm = totalDistanceKm * progress;
  let traversedDistanceKm = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const startPoint = points[index];
    const endPoint = points[index + 1];
    const segmentDistanceKm = haversineDistanceKm(
      Number(startPoint[0]),
      Number(startPoint[1]),
      Number(endPoint[0]),
      Number(endPoint[1])
    );

    if (traversedDistanceKm + segmentDistanceKm >= targetDistanceKm) {
      const segmentProgress =
        segmentDistanceKm > 0 ? (targetDistanceKm - traversedDistanceKm) / segmentDistanceKm : 0;
      return [
        Number((Number(startPoint[0]) + (Number(endPoint[0]) - Number(startPoint[0])) * segmentProgress).toFixed(7)),
        Number((Number(startPoint[1]) + (Number(endPoint[1]) - Number(startPoint[1])) * segmentProgress).toFixed(7))
      ];
    }

    traversedDistanceKm += segmentDistanceKm;
  }

  const finalPoint = points[points.length - 1];
  return [Number(finalPoint[0]), Number(finalPoint[1])];
}

function getLiveDispatchSnapshot(track, now = Date.now()) {
  const demoMsPerEtaMinute = 6000;
  const elapsedMs = Math.max(0, now - track.createdAt);
  const totalDurationMs = track.totalDurationMinutes * demoMsPerEtaMinute;

  if (elapsedMs >= totalDurationMs) {
    const finalLeg = track.legs[track.legs.length - 1];
    const [finalLat, finalLng] = finalLeg.points[finalLeg.points.length - 1];
    return {
      trackingId: track.id,
      dispatchRequestId: track.dispatchRequestId,
      ambulanceCode: track.ambulanceCode,
      status: "completed",
      segmentIndex: track.legs.length - 1,
      latitude: finalLat,
      longitude: finalLng,
      etaMinutesRemaining: 0,
      stageLabel: "🏥 Ambulance arrived at the hospital"
    };
  }

  let segmentIndex = 0;
  let elapsedMinutes = elapsedMs / demoMsPerEtaMinute;
  let segmentElapsedMinutes = elapsedMinutes;

  for (let index = 0; index < track.legs.length; index += 1) {
    const duration = track.legs[index].durationMinutes;

    if (segmentElapsedMinutes <= duration) {
      segmentIndex = index;
      break;
    }

    segmentElapsedMinutes -= duration;
    segmentIndex = index + 1;
  }

  const safeSegmentIndex = Math.min(segmentIndex, track.legs.length - 1);
  const currentLeg = track.legs[safeSegmentIndex];
  const currentSegmentDuration = currentLeg?.durationMinutes || 0.5;
  const progress = Math.min(segmentElapsedMinutes / currentSegmentDuration, 1);
  const [latitude, longitude] = interpolateAlongPolyline(currentLeg.points, progress);
  const etaMinutesRemaining = Math.max(track.totalDurationMinutes - elapsedMinutes, 0);

  return {
    trackingId: track.id,
    dispatchRequestId: track.dispatchRequestId,
    ambulanceCode: track.ambulanceCode,
    status: "moving",
    segmentIndex: safeSegmentIndex,
    latitude,
    longitude,
    etaMinutesRemaining: Number(etaMinutesRemaining.toFixed(2)),
    stageLabel: currentLeg.stageLabel,
    destinationLabel: currentLeg.destinationLabel
  };
}

function sanitizeSessionId(value) {
  const normalized = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{8,64}$/.test(normalized) ? normalized : "";
}

function normalizeCurrentPage(value) {
  const normalized = String(value || "main").trim().toLowerCase();
  return normalized || "main";
}

function parseCapabilities(rawCapabilities, hospitalName) {
  const direct = String(rawCapabilities || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (direct.length) {
    return [...new Set(direct)];
  }

  const inferred = ["emergency"];
  const name = String(hospitalName || "").toLowerCase();

  if (name.includes("fortis") || name.includes("apollo") || name.includes("hosmat")) {
    inferred.push("cardiac", "trauma", "icu");
  }
  if (name.includes("manipal") || name.includes("ramaiah")) {
    inferred.push("stroke", "neuro", "icu");
  }
  if (name.includes("st. john") || name.includes("victoria")) {
    inferred.push("trauma", "icu");
  }
  if (name.includes("cloudnine") || name.includes("children")) {
    inferred.push("maternity", "pediatric", "nicu");
  }
  if (name.includes("aster")) {
    inferred.push("cardiac", "pulmonary", "icu");
  }

  return [...new Set(inferred)];
}

function getHospitalLoadPercent(hospital) {
  const explicitLoad = toNumber(
    hospital.current_load_percent ?? hospital.load_percent ?? hospital.hospital_load
  );

  if (explicitLoad !== null) {
    return clamp(explicitLoad, 5, 100);
  }

  const availableBeds = toNumber(hospital.available_beds);
  const totalBeds = toNumber(hospital.total_beds);

  if (availableBeds !== null && totalBeds !== null && totalBeds > 0) {
    const occupiedRatio = 1 - availableBeds / totalBeds;
    return clamp(Math.round(occupiedRatio * 100), 5, 100);
  }

  const fallbackSeed =
    Math.abs(
      Math.sin((toNumber(hospital.latitude) || 0) * 0.7 + (toNumber(hospital.longitude) || 0) * 0.3)
    ) * 100;
  return clamp(Math.round(35 + fallbackSeed * 0.45), 15, 95);
}

function getLoadLabel(loadPercent) {
  if (loadPercent >= 85) {
    return "Critical";
  }
  if (loadPercent >= 65) {
    return "Busy";
  }
  if (loadPercent >= 40) {
    return "Stable";
  }
  return "Available";
}

function computeEmergencyFit(hospitalCapabilities, emergencyType) {
  const profile = EMERGENCY_PROFILES[emergencyType] || EMERGENCY_PROFILES.general;
  const capabilities = new Set(hospitalCapabilities);
  const matched = profile.preferredCapabilities.filter((capability) => capabilities.has(capability));
  const fitScore = clamp(0.35 + matched.length * 0.22, 0.35, 1);

  let reason = "General emergency readiness";
  if (matched.length) {
    reason = `Strong ${profile.label.toLowerCase()} support via ${matched.join(", ")}`;
  } else if (profile !== EMERGENCY_PROFILES.general) {
    reason = `Fallback option with emergency support, but limited ${profile.label.toLowerCase()} specialization`;
  }

  return {
    score: Number((fitScore * profile.priorityBoost).toFixed(2)),
    matched,
    reason
  };
}

function normalizeScore(value, minValue, maxValue) {
  if (maxValue <= minValue) {
    return 1;
  }

  return clamp(1 - (value - minValue) / (maxValue - minValue), 0, 1);
}

function computeAreaMatch(hospital, areaQuery) {
  if (!areaQuery) {
    return {
      score: 0.5,
      matched: false,
      reason: "No area or landmark filter applied"
    };
  }

  const locality = String(hospital.locality || hospital.area_name || "").toLowerCase();
  const hospitalName = String(hospital.hospital_name || hospital.hospital || "").toLowerCase();
  const matched = locality.includes(areaQuery) || hospitalName.includes(areaQuery);

  return {
    score: matched ? 1 : 0.35,
    matched,
    reason: matched
      ? `Matches the requested area or landmark: ${hospital.locality || hospital.area_name || hospital.hospital_name}`
      : "Outside the requested area, ranked mainly by ETA and emergency fit"
  };
}

function rankHospitals({ hospitals, selectedAmbulance, userLat, userLng, emergencyType, areaQuery }) {
  const profile = EMERGENCY_PROFILES[emergencyType] || EMERGENCY_PROFILES.general;
  const enriched = hospitals
    .map((hospital) => {
      const hospitalLat = toNumber(hospital.latitude ?? hospital.hospitalLat);
      const hospitalLng = toNumber(hospital.longitude ?? hospital.hospitalLng);

      if (hospitalLat === null || hospitalLng === null) {
        return null;
      }

      const userToHospitalDistanceKm = haversineDistanceKm(userLat, userLng, hospitalLat, hospitalLng);
      const ambulanceToHospitalDistanceKm = haversineDistanceKm(
        toNumber(selectedAmbulance.latitude),
        toNumber(selectedAmbulance.longitude),
        hospitalLat,
        hospitalLng
      );
      const traffic = estimateTrafficDelay(
        ambulanceToHospitalDistanceKm,
        emergencyType,
        hospitalLat + hospitalLng
      );
      const capabilities = parseCapabilities(hospital.specialties, hospital.hospital_name || hospital.hospital);
      const loadPercent = getHospitalLoadPercent(hospital);
      const emergencyFit = computeEmergencyFit(capabilities, emergencyType);
      const areaMatch = computeAreaMatch(hospital, areaQuery);

      return {
        hospital: hospital.hospital_name || hospital.hospital || "Hospital",
        locality: hospital.locality || hospital.area_name || "",
        hospitalLat,
        hospitalLng,
        userToHospitalDistanceKm,
        ambulanceToHospitalDistanceKm,
        traffic,
        loadPercent,
        loadLabel: getLoadLabel(loadPercent),
        emergencyFit,
        areaMatch,
        capabilities
      };
    })
    .filter(Boolean)
    .filter((hospital) => hospital.userToHospitalDistanceKm <= HOSPITAL_SEARCH_RADIUS_KM);

  if (!enriched.length) {
    return [];
  }

  const responseDistances = enriched.map((hospital) => hospital.userToHospitalDistanceKm);
  const ambulanceDistances = enriched.map((hospital) => hospital.ambulanceToHospitalDistanceKm);
  const trafficDelays = enriched.map((hospital) => hospital.traffic.delayMinutes);
  const loadPercentages = enriched.map((hospital) => hospital.loadPercent);

  const minResponseDistance = Math.min(...responseDistances);
  const maxResponseDistance = Math.max(...responseDistances);
  const minAmbulanceDistance = Math.min(...ambulanceDistances);
  const maxAmbulanceDistance = Math.max(...ambulanceDistances);
  const minTrafficDelay = Math.min(...trafficDelays);
  const maxTrafficDelay = Math.max(...trafficDelays);
  const minLoad = Math.min(...loadPercentages);
  const maxLoad = Math.max(...loadPercentages);

  return enriched
    .map((hospital) => {
      const responseDistanceScore = normalizeScore(
        hospital.userToHospitalDistanceKm,
        minResponseDistance,
        maxResponseDistance
      );
      const ambulanceHospitalScore = normalizeScore(
        hospital.ambulanceToHospitalDistanceKm,
        minAmbulanceDistance,
        maxAmbulanceDistance
      );
      const trafficScore = normalizeScore(
        hospital.traffic.delayMinutes,
        minTrafficDelay,
        maxTrafficDelay
      );
      const loadScore = normalizeScore(hospital.loadPercent, minLoad, maxLoad);
      const weightedScore =
        responseDistanceScore * (areaQuery ? 0.16 : SCORING_WEIGHTS.responseDistance) +
        ambulanceHospitalScore * SCORING_WEIGHTS.ambulanceToHospitalDistance +
        trafficScore * SCORING_WEIGHTS.trafficDelay +
        loadScore * SCORING_WEIGHTS.hospitalLoad +
        hospital.emergencyFit.score * SCORING_WEIGHTS.emergencyFit +
        hospital.areaMatch.score * (areaQuery ? 0.04 : 0);
      const ambulanceEtaMinutes = Math.max(
        4,
        Math.round(hospital.userToHospitalDistanceKm * 1.9 + hospital.traffic.delayMinutes * 0.25)
      );
      const hospitalEtaMinutes = Math.max(
        6,
        Math.round(hospital.ambulanceToHospitalDistanceKm * 2.3 + hospital.traffic.delayMinutes)
      );
      const totalEtaMinutes = ambulanceEtaMinutes + hospitalEtaMinutes;
      const reasonParts = [
        `${hospital.traffic.level} traffic adds about ${hospital.traffic.delayMinutes} mins`,
        `${hospital.loadLabel.toLowerCase()} load at ${hospital.loadPercent}%`,
        hospital.emergencyFit.reason,
        hospital.areaMatch.reason
      ];

      return {
        ...hospital,
        score: Number((weightedScore * 100).toFixed(1)),
        ambulanceEtaMinutes,
        hospitalEtaMinutes,
        totalEtaMinutes,
        reason: reasonParts.join(". "),
        scoreBreakdown: {
          responseDistance: Number((responseDistanceScore * 100).toFixed(1)),
          ambulanceToHospitalDistance: Number((ambulanceHospitalScore * 100).toFixed(1)),
          trafficDelay: Number((trafficScore * 100).toFixed(1)),
          hospitalLoad: Number((loadScore * 100).toFixed(1)),
          emergencyFit: Number((hospital.emergencyFit.score * 100).toFixed(1)),
          areaMatch: Number((hospital.areaMatch.score * 100).toFixed(1))
        },
        emergencyLabel: profile.label
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

function normalizeExternalHospitals(payload, lat, lng) {
  const candidates = Array.isArray(payload)
    ? payload
    : payload?.hospitals || payload?.data || payload?.results || payload?.items || [];

  return candidates
    .map((item) => {
      const hospitalLat = toNumber(item.latitude ?? item.lat ?? item.y);
      const hospitalLng = toNumber(item.longitude ?? item.lng ?? item.lon ?? item.x);

      if (hospitalLat === null || hospitalLng === null) {
        return null;
      }

      const distanceKm = haversineDistanceKm(lat, lng, hospitalLat, hospitalLng);

      return {
        hospital_name: item.hospital_name || item.name || item.title || "External Hospital",
        latitude: hospitalLat,
        longitude: hospitalLng,
        current_load_percent: toNumber(item.current_load_percent ?? item.load_percent),
        specialties: item.specialties || item.capabilities || "",
        distanceKm: Number(distanceKm.toFixed(2))
      };
    })
    .filter(Boolean)
    .filter((hospital) => hospital.distanceKm <= HOSPITAL_SEARCH_RADIUS_KM)
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, 8);
}

function normalizeOverpassHospitals(payload, lat, lng) {
  const candidates = Array.isArray(payload?.elements) ? payload.elements : [];

  return candidates
    .map((item) => {
      const hospitalLat = toNumber(item.lat ?? item.center?.lat);
      const hospitalLng = toNumber(item.lon ?? item.center?.lon);

      if (hospitalLat === null || hospitalLng === null) {
        return null;
      }

      const distanceKm = haversineDistanceKm(lat, lng, hospitalLat, hospitalLng);

      return {
        hospital_name:
          item.tags?.name ||
          item.tags?.operator ||
          item.tags?.official_name ||
          "OSM Hospital",
        latitude: hospitalLat,
        longitude: hospitalLng,
        locality:
          item.tags?.addr_suburb ||
          item.tags?.addr_city ||
          item.tags?.addr_town ||
          item.tags?.addr_village ||
          item.tags?.addr_street ||
          "",
        specialties: item.tags?.healthcare || item.tags?.amenity || "emergency",
        distanceKm: Number(distanceKm.toFixed(2))
      };
    })
    .filter(Boolean)
    .filter((hospital) => hospital.distanceKm <= HOSPITAL_SEARCH_RADIUS_KM)
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, 8);
}

async function fetchOverpassHospitals(lat, lng) {
  const radiusMeters = Math.round(HOSPITAL_SEARCH_RADIUS_KM * 1000);
  const overpassQuery = `
    [out:json][timeout:25];
    (
      node["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      way["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      relation["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      node["healthcare"="hospital"](around:${radiusMeters},${lat},${lng});
      way["healthcare"="hospital"](around:${radiusMeters},${lat},${lng});
      relation["healthcare"="hospital"](around:${radiusMeters},${lat},${lng});
    );
    out center tags;
  `;

  const response = await fetch(OSM_OVERPASS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "User-Agent": APP_USER_AGENT,
      Accept: "application/json"
    },
    body: overpassQuery
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.remark || `Overpass API failed with status ${response.status}`);
  }

  return normalizeOverpassHospitals(payload, lat, lng);
}

async function fetchExternalHospitals(lat, lng) {
  if (!EXTERNAL_HOSPITALS_API_URL) {
    return [];
  }

  const url = new URL(EXTERNAL_HOSPITALS_API_URL);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lng", String(lng));
  url.searchParams.set("limit", "8");

  const headers = {};

  if (EXTERNAL_HOSPITALS_API_KEY) {
    if (EXTERNAL_HOSPITALS_AUTH_TYPE === "bearer") {
      headers.Authorization = `Bearer ${EXTERNAL_HOSPITALS_API_KEY}`;
    } else {
      headers[EXTERNAL_HOSPITALS_API_KEY_HEADER] = EXTERNAL_HOSPITALS_API_KEY;
    }
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`External hospitals API failed with status ${response.status}`);
  }

  const payload = await response.json();
  return normalizeExternalHospitals(payload, lat, lng);
}

async function fetchOsmHospitals(lat, lng) {
  const url = new URL(OSM_NOMINATIM_URL);
  const latDelta = 1.5;
  const lngDelta = 1.5;
  const left = Math.max(-180, lng - lngDelta);
  const right = Math.min(180, lng + lngDelta);
  const top = Math.min(90, lat + latDelta);
  const bottom = Math.max(-90, lat - latDelta);

  url.searchParams.set("q", "[hospital]");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "8");
  url.searchParams.set("bounded", "1");
  url.searchParams.set("viewbox", `${left},${top},${right},${bottom}`);
  url.searchParams.set("addressdetails", "1");
  if (OSM_CONTACT_EMAIL) {
    url.searchParams.set("email", OSM_CONTACT_EMAIL);
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": APP_USER_AGENT,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`OSM Nominatim failed with status ${response.status}`);
  }

  const payload = await response.json();

  return payload
    .map((item) => {
      const hospitalLat = toNumber(item.lat);
      const hospitalLng = toNumber(item.lon);

      if (hospitalLat === null || hospitalLng === null) {
        return null;
      }

      return {
        hospital_name:
          item.name ||
          item.display_name?.split(",")[0] ||
          item.address?.hospital ||
          "OSM Hospital",
        latitude: hospitalLat,
        longitude: hospitalLng
      };
    })
    .filter(Boolean)
    .filter((hospital) => haversineDistanceKm(lat, lng, hospital.latitude, hospital.longitude) <= HOSPITAL_SEARCH_RADIUS_KM);
}

async function reverseGeocodeArea(lat, lng) {
  const url = new URL(OSM_REVERSE_GEOCODE_URL);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  if (OSM_CONTACT_EMAIL) {
    url.searchParams.set("email", OSM_CONTACT_EMAIL);
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": APP_USER_AGENT,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`OSM reverse geocode failed with status ${response.status}`);
  }

  const payload = await response.json();
  const area = extractAreaFromAddress(payload.address);

  return {
    area,
    displayName: payload.display_name || "",
    address: payload.address || {}
  };
}

async function fetchSafeRoute(startLat, startLng, endLat, endLng) {
  if (ROUTE_PROVIDER === "osrm") {
    const url = new URL(
      `${OSRM_ROUTE_API_URL}/${startLng},${startLat};${endLng},${endLat}`
    );
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });

    const payload = await response.json();

    if (!response.ok || payload.code !== "Ok") {
      throw new Error(payload.message || `OSRM route failed with status ${response.status}`);
    }

    const route = Array.isArray(payload.routes) ? payload.routes[0] : null;
    const coordinates = Array.isArray(route?.geometry?.coordinates)
      ? route.geometry.coordinates
      : [];

    if (!coordinates.length) {
      return null;
    }

    return {
      provider: "osrm",
      mode: "public road route",
      distanceKm: Number((Number(route.distance || 0) / 1000).toFixed(2)),
      durationMinutes: Math.max(1, Math.round(Number(route.duration || 0) / 60)),
      geometry: coordinates.map(([routeLng, routeLat]) => [routeLat, routeLng])
    };
  }

  if (ROUTE_PROVIDER === "openrouteservice" && OPENROUTESERVICE_API_KEY) {
    const response = await fetch(OPENROUTESERVICE_API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json, application/geo+json",
        "Content-Type": "application/json",
        Authorization: OPENROUTESERVICE_API_KEY
      },
      body: JSON.stringify({
        coordinates: [
          [startLng, startLat],
          [endLng, endLat]
        ]
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(
        payload.error?.message || payload.message || `openrouteservice failed with status ${response.status}`
      );
    }

    const feature = Array.isArray(payload.features) ? payload.features[0] : null;
    const coordinates = Array.isArray(feature?.geometry?.coordinates)
      ? feature.geometry.coordinates
      : [];
    const summary = feature?.properties?.summary || {};

    if (!coordinates.length) {
      return null;
    }

    return {
      provider: "openrouteservice",
      mode: "road route",
      distanceKm: Number((Number(summary.distance || 0) / 1000).toFixed(2)),
      durationMinutes: Math.max(1, Math.round(Number(summary.duration || 0) / 60)),
      geometry: coordinates.map(([routeLng, routeLat]) => [routeLat, routeLng])
    };
  }

  if (ROUTE_PROVIDER !== "graphhopper" || !GRAPHHOPPER_API_KEY) {
    return null;
  }

  async function requestGraphHopperRoute(profile) {
    const url = new URL(GRAPHHOPPER_DIRECTIONS_API_URL);
    url.searchParams.append("point", `${startLat},${startLng}`);
    url.searchParams.append("point", `${endLat},${endLng}`);
    url.searchParams.set("profile", profile);
    url.searchParams.set("points_encoded", "false");
    url.searchParams.set("instructions", "true");
    url.searchParams.set("calc_points", "true");
    url.searchParams.set("locale", "en");
    url.searchParams.set("key", GRAPHHOPPER_API_KEY);
    GRAPHHOPPER_SNAP_PREVENTION.split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => url.searchParams.append("snap_prevention", value));

    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });

    const payload = await response.json();

    if (!response.ok) {
      const error = new Error(
        payload.message || `GraphHopper directions failed with status ${response.status}`
      );
      error.status = response.status;
      throw error;
    }

    return { payload, profile };
  }

  let result;

  try {
    result = await requestGraphHopperRoute(GRAPHHOPPER_PROFILE);
  } catch (error) {
    if (error.status === 400 && GRAPHHOPPER_PROFILE !== "car") {
      result = await requestGraphHopperRoute("car");
    } else {
      throw error;
    }
  }

  const route = result.payload.paths?.[0];

  if (!route?.points?.coordinates?.length) {
    return null;
  }

  return {
    provider: "graphhopper",
    mode: result.profile === "car" ? "basic route" : "safer",
    distanceKm: Number((route.distance / 1000).toFixed(2)),
    durationMinutes: Math.max(1, Math.round(route.duration / 60000)),
    geometry: route.points.coordinates.map(([routeLng, routeLat]) => [routeLat, routeLng]),
    instructions: route.instructions || []
  };
}

async function fetchHospitalCandidates(lat, lng, normalizedAreaQuery, normalizedEmergencyType) {
  const earthRadiusKm = 6371;
  let hospitals = [];
  let hospitalsSource = "database";

  if (HOSPITALS_PROVIDER === "osm") {
    try {
      hospitals = await fetchOsmHospitals(lat, lng);
      hospitalsSource = "osm";
    } catch (error) {
      console.error("OSM hospitals API error:", error.message);
    }
  } else if (HOSPITALS_PROVIDER === "overpass") {
    try {
      hospitals = await fetchOverpassHospitals(lat, lng);
      hospitalsSource = "overpass";
    } catch (error) {
      console.error("Overpass API error:", error.message);
    }
  } else if (EXTERNAL_HOSPITALS_API_URL) {
    try {
      hospitals = await fetchExternalHospitals(lat, lng);
      hospitalsSource = "external";
    } catch (error) {
      console.error("External hospitals API error:", error.message);
    }
  }

  if (!hospitals.length) {
    const hospitalQuery = normalizedAreaQuery
      ? `
        SELECT *
        FROM hospitals
        WHERE (
          LOWER(locality) LIKE CONCAT('%', ?, '%')
           OR LOWER(hospital_name) LIKE CONCAT('%', ?, '%')
        )
          AND (
            ${earthRadiusKm} * ACOS(
              LEAST(
                1,
                GREATEST(
                  -1,
                  COS(RADIANS(?)) * COS(RADIANS(latitude)) *
                  COS(RADIANS(longitude) - RADIANS(?)) +
                  SIN(RADIANS(?)) * SIN(RADIANS(latitude))
                )
              )
            )
          ) <= ?
        ORDER BY (
          ${earthRadiusKm} * ACOS(
            LEAST(
              1,
              GREATEST(
                -1,
                COS(RADIANS(?)) * COS(RADIANS(latitude)) *
                COS(RADIANS(longitude) - RADIANS(?)) +
                SIN(RADIANS(?)) * SIN(RADIANS(latitude))
              )
            )
          )
        ) ASC
        LIMIT 12
        `
      : `
        SELECT *
        FROM hospitals
        WHERE (
          ${earthRadiusKm} * ACOS(
            LEAST(
              1,
              GREATEST(
                -1,
                COS(RADIANS(?)) * COS(RADIANS(latitude)) *
                COS(RADIANS(longitude) - RADIANS(?)) +
                SIN(RADIANS(?)) * SIN(RADIANS(latitude))
              )
            )
          )
        ) <= ?
        ORDER BY (
          ${earthRadiusKm} * ACOS(
            LEAST(
              1,
              GREATEST(
                -1,
                COS(RADIANS(?)) * COS(RADIANS(latitude)) *
                COS(RADIANS(longitude) - RADIANS(?)) +
                SIN(RADIANS(?)) * SIN(RADIANS(latitude))
              )
            )
          )
        ) ASC
        LIMIT 12
        `;
    const queryParams = normalizedAreaQuery
      ? [normalizedAreaQuery, normalizedAreaQuery, lat, lng, lat, HOSPITAL_SEARCH_RADIUS_KM, lat, lng, lat]
      : [lat, lng, lat, HOSPITAL_SEARCH_RADIUS_KM, lat, lng, lat];
    const [databaseHospitals] = await dbPool.query(hospitalQuery, queryParams);
    hospitals = databaseHospitals;
    hospitalsSource = "database";
  }

  if (!hospitals.length) {
    hospitals = buildFallbackHospitals(lat, lng, normalizedEmergencyType, normalizedAreaQuery);
    hospitalsSource = "generated";
  }

  return { hospitals, hospitalsSource };
}

async function claimAmbulanceDispatch({
  ambulanceId,
  userLat,
  userLng,
  etaMinutes,
  emergencyType,
  sessionId
}) {
  const connection = await dbPool.getConnection();

  try {
    await connection.beginTransaction();
    const [updateResult] = await connection.query(
      `
      UPDATE ambulances
      SET is_available = 0
      WHERE id = ? AND is_available = 1
      `,
      [ambulanceId]
    );

    if (!updateResult.affectedRows) {
      await connection.rollback();
      return null;
    }

    const [insertResult] = await connection.query(
      `
      INSERT INTO ambulance_requests
      (user_lat, user_lng, ambulance_id, eta_minutes, status, session_id, emergency_type)
      VALUES (?, ?, ?, ?, 'active', ?, ?)
      `,
      [userLat, userLng, ambulanceId, etaMinutes, sessionId, emergencyType]
    );

    await connection.commit();
    return insertResult.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

app.get("/api/ambulances", async (_req, res) => {
  try {
    const [rows] = await dbPool.query(
      `
      SELECT id, ambulance_code, hospital_name, latitude, longitude, is_available, created_at
      FROM ambulances
      ORDER BY id ASC
      `
    );
    return res.json(rows);
  } catch (error) {
    console.error("Database error:", error.message);
    return res.status(500).json({ error: "Failed to fetch ambulances" });
  }
});

app.get("/api/reverse-geocode", async (req, res) => {
  const lat = toNumber(req.query.lat);
  const lng = toNumber(req.query.lng);

  if (lat === null || lng === null) {
    return res.status(400).json({ error: "lat and lng query parameters are required" });
  }

  try {
    const result = await reverseGeocodeArea(lat, lng);
    return res.json(result);
  } catch (error) {
    console.error("Reverse geocode error:", error.message);
    return res.status(500).json({ error: "Failed to resolve area from location" });
  }
});

app.get("/api/area-suggestions", async (req, res) => {
  const query = normalizeAreaQuery(req.query.query || '');
  if (!query) return res.json([]);
  
  try {
    const [rows] = await dbPool.query(
      'SELECT DISTINCT area_name FROM service_areas WHERE LOWER(area_name) LIKE ? LIMIT 8',
      [`%${query}%`]
    );
    res.json(rows.map(r => r.area_name));
  } catch (error) {
    console.error("Area suggestions error:", error.message);
    res.status(500).json({ error: "Failed to fetch area suggestions" });
  }
});

app.post("/api/session-heartbeat", async (req, res) => {
  const sessionId = sanitizeSessionId(req.body?.sessionId);
  const currentPage = normalizeCurrentPage(req.body?.page);
  const userAgent = String(req.headers["user-agent"] || "").slice(0, 255);

  if (!sessionId) {
    return res.status(400).json({ error: "A valid sessionId is required" });
  }

  try {
    await dbPool.query(
      `
      INSERT INTO website_sessions (session_id, user_agent, current_page, last_seen)
      VALUES (?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        user_agent = VALUES(user_agent),
        current_page = VALUES(current_page),
        last_seen = NOW()
      `,
      [sessionId, userAgent, currentPage]
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error("Session heartbeat error:", error.message);
    return res.status(500).json({ error: "Failed to update session heartbeat" });
  }
});

app.post("/api/admin/login", (req, res) => {
  const password = String(req.body?.password || "");

  if (password !== ADMIN_CONSOLE_PASSWORD) {
    return res.status(401).json({ error: "Incorrect admin password" });
  }

  const token = createAdminSession();
  const isProduction = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(
      ADMIN_SESSION_TTL_MS / 1000
    )}${isProduction ? "; Secure" : ""}`
  );

  return res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  const token = getAdminSessionToken(req);

  if (token) {
    adminSessions.delete(token);
  }

  res.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
  );
  return res.json({ ok: true });
});

app.get("/api/dispatch-stream/:trackingId", (req, res) => {
  const track = liveDispatchTracks.get(req.params.trackingId);

  if (!track) {
    return res.status(404).json({ error: "Live dispatch stream not found" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const sendSnapshot = () => {
    const snapshot = getLiveDispatchSnapshot(track);
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`);

    if (snapshot.status === "completed") {
      clearInterval(intervalId);
      liveDispatchTracks.delete(track.id);
      res.end();
    }
  };

  const intervalId = setInterval(sendSnapshot, 1000);
  sendSnapshot();

  req.on("close", () => {
    clearInterval(intervalId);
  });
});

app.get("/api/admin/metrics", async (_req, res) => {
  try {
    const [summaryRows] = await dbPool.query(
      `
      SELECT
        (SELECT COUNT(*) FROM website_sessions) AS total_sessions,
        (
          SELECT COUNT(*)
          FROM website_sessions
          WHERE last_seen >= NOW() - INTERVAL ? MINUTE
        ) AS active_users,
        (SELECT COUNT(*) FROM ambulance_requests) AS total_dispatches,
        (
          SELECT COUNT(*)
          FROM ambulance_requests
          WHERE status = 'active'
        ) AS active_dispatches,
        (SELECT COUNT(*) FROM ambulances) AS total_ambulances,
        (
          SELECT COUNT(*)
          FROM ambulances
          WHERE is_available = 1
        ) AS available_ambulances
      `,
      [ACTIVE_USER_WINDOW_MINUTES]
    );

    const [activeDispatches] = await dbPool.query(
      `
      SELECT
        ar.id,
        ar.user_lat,
        ar.user_lng,
        ar.eta_minutes,
        ar.emergency_type,
        ar.requested_at,
        ar.session_id,
        a.ambulance_code,
        a.hospital_name
      FROM ambulance_requests ar
      JOIN ambulances a ON a.id = ar.ambulance_id
      WHERE ar.status = 'active'
      ORDER BY ar.requested_at DESC
      LIMIT 20
      `
    );

    const summary = summaryRows[0] || {};
    const busyAmbulances = Number(summary.total_ambulances || 0) - Number(summary.available_ambulances || 0);

    return res.json({
      activeUserWindowMinutes: ACTIVE_USER_WINDOW_MINUTES,
      metrics: {
        totalSessions: Number(summary.total_sessions || 0),
        activeUsers: Number(summary.active_users || 0),
        totalDispatches: Number(summary.total_dispatches || 0),
        activeDispatches: Number(summary.active_dispatches || 0),
        totalAmbulances: Number(summary.total_ambulances || 0),
        availableAmbulances: Number(summary.available_ambulances || 0),
        busyAmbulances: busyAmbulances < 0 ? 0 : busyAmbulances
      },
      activeDispatches: activeDispatches.map((dispatch) => ({
        id: dispatch.id,
        ambulanceCode: dispatch.ambulance_code,
        baseHospital: dispatch.hospital_name,
        emergencyType: dispatch.emergency_type,
        etaMinutes: dispatch.eta_minutes,
        requestedAt: dispatch.requested_at,
        sessionId: dispatch.session_id,
        userLat: Number(dispatch.user_lat),
        userLng: Number(dispatch.user_lng)
      }))
    });
  } catch (error) {
    console.error("Admin metrics error:", error.message);
    return res.status(500).json({ error: "Failed to fetch admin metrics" });
  }
});

app.post("/api/admin/dispatches/:id/complete", async (req, res) => {
  const dispatchId = Number(req.params.id);

  if (!Number.isInteger(dispatchId) || dispatchId <= 0) {
    return res.status(400).json({ error: "A valid dispatch id is required" });
  }

  const connection = await dbPool.getConnection();

  try {
    await connection.beginTransaction();
    const [dispatchRows] = await connection.query(
      `
      SELECT ambulance_id, status
      FROM ambulance_requests
      WHERE id = ?
      FOR UPDATE
      `,
      [dispatchId]
    );

    if (!dispatchRows.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Dispatch not found" });
    }

    if (dispatchRows[0].status !== "active") {
      await connection.rollback();
      return res.status(409).json({ error: "Dispatch is already closed" });
    }

    await connection.query(
      `
      UPDATE ambulance_requests
      SET status = 'completed', completed_at = NOW(), completed_by = 'admin'
      WHERE id = ?
      `,
      [dispatchId]
    );

    await connection.query(
      `
      UPDATE ambulances
      SET is_available = 1
      WHERE id = ?
      `,
      [dispatchRows[0].ambulance_id]
    );

    await connection.commit();
    return res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    console.error("Complete dispatch error:", error.message);
    return res.status(500).json({ error: "Failed to complete dispatch" });
  } finally {
    connection.release();
  }
});

app.post("/api/request-ambulance", async (req, res) => {
  const { lat, lng, emergencyType, areaQuery, sessionId } = req.body || {};
  const earthRadiusKm = 6371;
  const normalizedEmergencyType = normalizeEmergencyType(emergencyType);
  const normalizedAreaQuery = normalizeAreaQuery(areaQuery);
  const emergencyProfile = EMERGENCY_PROFILES[normalizedEmergencyType];
  const normalizedSessionId = sanitizeSessionId(sessionId);

  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ error: "lat and lng are required numbers" });
  }

  try {
    const [ambulances] = await dbPool.query(
      `
      SELECT
        id,
        ambulance_code,
        hospital_name,
        latitude,
        longitude,
        (
          ${earthRadiusKm} * ACOS(
            LEAST(
              1,
              GREATEST(
                -1,
                COS(RADIANS(?)) * COS(RADIANS(latitude)) *
                COS(RADIANS(longitude) - RADIANS(?)) +
                SIN(RADIANS(?)) * SIN(RADIANS(latitude))
              )
            )
          )
        ) AS distance_km
      FROM ambulances
      WHERE is_available = 1
      ORDER BY distance_km ASC
      LIMIT 5
      `,
      [lat, lng, lat]
    );

    const { hospitals: providerHospitals, hospitalsSource: initialHospitalsSource } =
      await fetchHospitalCandidates(lat, lng, normalizedAreaQuery, normalizedEmergencyType);
    const candidateAmbulances = ambulances.length
      ? ambulances
      : [buildFallbackAmbulance(lat, lng, normalizedAreaQuery)];

    let selectedAmbulance = null;
    let bestHospital = null;
    let alternatives = [];
    let finalRankedHospitals = [];
    let responseTraffic = null;
    let responseEtaMinutes = null;
    let dispatchRequestId = null;
    let ambulanceSource = ambulances.length ? "database" : "generated";
    let hospitalsSource = initialHospitalsSource;

    for (const ambulanceCandidate of candidateAmbulances) {
      let rankedHospitals = rankHospitals({
        hospitals: providerHospitals,
        selectedAmbulance: ambulanceCandidate,
        userLat: lat,
        userLng: lng,
        emergencyType: normalizedEmergencyType,
        areaQuery: normalizedAreaQuery
      });

      if (!rankedHospitals.length) {
        const fallbackHospitals = buildFallbackHospitals(
          lat,
          lng,
          normalizedEmergencyType,
          normalizedAreaQuery
        );
        rankedHospitals = rankHospitals({
          hospitals: fallbackHospitals,
          selectedAmbulance: ambulanceCandidate,
          userLat: lat,
          userLng: lng,
          emergencyType: normalizedEmergencyType,
          areaQuery: normalizedAreaQuery
        });
        if (rankedHospitals.length) {
          hospitalsSource = "generated";
        }
      }

      if (!rankedHospitals.length) {
        continue;
      }

      const candidateTraffic = estimateTrafficDelay(
        Number(ambulanceCandidate.distance_km),
        normalizedEmergencyType,
        lat + lng
      );
      const candidateEtaMinutes = Math.max(
        4,
        Math.round(Number(ambulanceCandidate.distance_km) * 2.4 + candidateTraffic.delayMinutes * 0.4)
      );

      if (ambulanceCandidate.id) {
        const claimedDispatchId = await claimAmbulanceDispatch({
          ambulanceId: ambulanceCandidate.id,
          userLat: lat,
          userLng: lng,
          etaMinutes: candidateEtaMinutes,
          emergencyType: normalizedEmergencyType,
          sessionId: normalizedSessionId
        });

        if (!claimedDispatchId) {
          continue;
        }

        dispatchRequestId = claimedDispatchId;
      }

      selectedAmbulance = ambulanceCandidate;
      finalRankedHospitals = rankedHospitals;
      bestHospital = rankedHospitals[0];
      alternatives = rankedHospitals.slice(1, 4);
      responseTraffic = candidateTraffic;
      responseEtaMinutes = candidateEtaMinutes;
      break;
    }

    if (!selectedAmbulance || !bestHospital) {
      return res.status(409).json({
        error: "No ambulances are currently available. Please wait for an active dispatch to complete."
      });
    }

    let route = null;
    let routeToHospital = null;
    const aiDispatchInsight = await buildAiDispatchInsight({
      emergencyType: normalizedEmergencyType,
      emergencyLabel: emergencyProfile.label,
      selectedAmbulance,
      bestHospital,
      alternatives,
      responseEtaMinutes,
      areaQuery: normalizedAreaQuery
    });

    try {
      route = await fetchSafeRoute(
        Number(selectedAmbulance.latitude),
        Number(selectedAmbulance.longitude),
        lat,
        lng
      );
    } catch (error) {
      console.error("Safe route API error:", error.message);
    }

    try {
      routeToHospital = await fetchSafeRoute(
        lat,
        lng,
        Number(bestHospital.hospitalLat),
        Number(bestHospital.hospitalLng)
      );
    } catch (error) {
      console.error("Hospital route API error:", error.message);
    }

    const liveTrackingId = createLiveDispatchTrack({
      dispatchRequestId,
      selectedAmbulance,
      userLat: lat,
      userLng: lng,
      bestHospital,
      responseEtaMinutes,
      route,
      routeToHospital
    });

    return res.json({
      dispatchRequestId,
      liveTrackingId,
      emergencyType: normalizedEmergencyType,
      emergencyLabel: emergencyProfile.label,
      selectedAmbulance: {
        id: selectedAmbulance.id,
        ambulanceCode: selectedAmbulance.ambulance_code,
        baseHospital: selectedAmbulance.hospital_name,
        latitude: Number(selectedAmbulance.latitude),
        longitude: Number(selectedAmbulance.longitude),
        distanceKm: Number(Number(selectedAmbulance.distance_km).toFixed(2)),
        etaMinutes: responseEtaMinutes,
        trafficLevel: responseTraffic.level,
        trafficDelayMinutes: responseTraffic.delayMinutes,
        source: ambulanceSource
      },
      bestHospital,
      alternatives,
      topHospitals: finalRankedHospitals,
      hospitalsSource,
      areaQuery: normalizedAreaQuery || null,
      hospitalRadiusKm: HOSPITAL_SEARCH_RADIUS_KM,
      route,
      routeToHospital,
      aiDispatchInsight,
      preArrivalGuidance: buildPreArrivalGuidance(
        normalizedEmergencyType,
        responseEtaMinutes
      ),
      explainability: {
        objective:
          "Minimize response time while balancing traffic, hospital load, and emergency specialization.",
        scoringWeights: {
          responseDistance: SCORING_WEIGHTS.responseDistance,
          ambulanceToHospitalDistance: SCORING_WEIGHTS.ambulanceToHospitalDistance,
          trafficDelay: SCORING_WEIGHTS.trafficDelay,
          hospitalLoad: SCORING_WEIGHTS.hospitalLoad,
          emergencyFit: SCORING_WEIGHTS.emergencyFit
        },
        summary: `${selectedAmbulance.ambulance_code} is the nearest available ambulance. ${bestHospital.hospital} ranked highest for this ${emergencyProfile.label.toLowerCase()} because it balances travel time, ${bestHospital.traffic.level.toLowerCase()} traffic, ${bestHospital.loadLabel.toLowerCase()} occupancy, specialty fit, and ${normalizedAreaQuery ? "the requested area context" : "nearby coverage"}.`,
        selectedReason: bestHospital.reason
      }
    });
  } catch (error) {
    console.error("Database error:", error.message);
    return res.status(500).json({ error: "Database connection failed" });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Stop the existing server, then run npm start again.`
    );
    process.exit(1);
  }

  console.error("Server startup error:", error.message);
  process.exit(1);
});

ensureOperationalTables().catch((error) => {
  console.error("Startup table check failed:", error.message);
  process.exit(1);
});
