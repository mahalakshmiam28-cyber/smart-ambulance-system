const map = L.map("map").setView([12.9716, 77.5946], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {}).addTo(map);

let userMarker;
let ambulanceMarker;
let routeLine;
let routeLineToUser;
let routeLineToHospital;
let selectedLocation = null;
let hospitalMarkers = [];
let ambulanceAnimationFrame;
let geolocationWatchId = null;
let liveDispatchState = null;
let areaLookupController = null;
let dispatchEventSource = null;
const WEBSITE_SESSION_KEY = "smart_ambulance_session_id";

function setDispatchFlow(activeStep, states = {}, announcement) {
  document.querySelectorAll("[data-flow-step]").forEach((step) => {
    const stepNumber = Number(step.dataset.flowStep);
    const state = states[stepNumber] || (stepNumber === activeStep ? "active" : "pending");
    const stateLabel = step.querySelector(".flow-state");
    step.classList.remove("is-active", "is-complete", "is-error");

    if (state === "active") step.classList.add("is-active");
    if (state === "complete") step.classList.add("is-complete");
    if (state === "error") step.classList.add("is-error");

    if (stateLabel) {
      stateLabel.textContent =
        state === "complete" ? "Complete" : state === "active" ? "In progress" : state === "error" ? "Needs attention" : "Waiting";
    }
  });

  if (announcement) document.getElementById("flow-announcement").textContent = announcement;
}

function getSessionId() {
  let sessionId = window.localStorage.getItem(WEBSITE_SESSION_KEY);

  if (!sessionId) {
    sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(WEBSITE_SESSION_KEY, sessionId);
  }

  return sessionId;
}

async function sendSessionHeartbeat() {
  try {
    await fetch("/api/session-heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: getSessionId(),
        page: "main"
      })
    });
  } catch (_error) {
    // Keep the main emergency flow resilient even if analytics tracking fails.
  }
}

function createEmojiIcon(emoji, modifierClass) {
  return L.divIcon({
    className: `emoji-marker ${modifierClass}`,
    html: `<span>${emoji}</span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -18]
  });
}

const userIcon = createEmojiIcon("📍", "user-marker");
const ambulanceIcon = createEmojiIcon("🚑", "ambulance-marker");
const hospitalIcon = createEmojiIcon("🏥", "hospital-marker");

function updateDebug(message) {
  document.getElementById("debug").textContent = message;
}

function updateTrackingStatus(message) {
  document.getElementById("tracking-status").textContent = message;
}

function updateSelectedLocation(lat, lng) {
  const selectedLocationElement = document.getElementById("selected-location");
  selectedLocationElement.textContent =
    `Selected location: Latitude ${lat.toFixed(6)}, Longitude ${lng.toFixed(6)}`;
}

function syncLocationInputs(lat, lng) {
  document.getElementById("test-lat").value = lat.toFixed(6);
  document.getElementById("test-lng").value = lng.toFixed(6);
  updateSelectedLocation(lat, lng);
}

function setAreaQuery(value) {
  document.getElementById("area-query").value = value;
}

function setUserMarker(lat, lng, label) {
  if (userMarker) {
    map.removeLayer(userMarker);
  }

  userMarker = L.marker([lat, lng], { icon: userIcon })
    .addTo(map)
    .bindPopup(`📍 ${label}<br>Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`)
    .openPopup();
}

function clearHospitalMarkers() {
  hospitalMarkers.forEach((marker) => map.removeLayer(marker));
  hospitalMarkers = [];
}

function renderHospitalMarkers(bestHospital, alternatives) {
  clearHospitalMarkers();

  const allHospitals = [bestHospital, ...(Array.isArray(alternatives) ? alternatives : [])].filter(Boolean);

  hospitalMarkers = allHospitals.map((hospital, index) =>
    L.marker([hospital.hospitalLat, hospital.hospitalLng], { icon: hospitalIcon })
      .addTo(map)
      .bindPopup(
        `🏥 ${index === 0 ? "Best match" : `Alternative ${index}`}: ${hospital.hospital}<br>` +
          `ETA: ${hospital.totalEtaMinutes} mins<br>` +
          `Traffic: ${hospital.traffic.level}<br>` +
          `Lat: ${hospital.hospitalLat.toFixed(5)}, Lng: ${hospital.hospitalLng.toFixed(5)}`
      )
  );
}

function stopAmbulanceAnimation() {
  if (ambulanceAnimationFrame) {
    cancelAnimationFrame(ambulanceAnimationFrame);
    ambulanceAnimationFrame = null;
  }
}

function closeDispatchStream() {
  if (dispatchEventSource) {
    dispatchEventSource.close();
    dispatchEventSource = null;
  }
}

function fitDispatchBounds(points) {
  const validPoints = points.filter(
    (point) => Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1])
  );

  if (!validPoints.length) {
    return;
  }

  map.fitBounds(validPoints, { padding: [40, 40] });
}

function formatEta(minutes) {
  if (minutes <= 0) {
    return "Arrived";
  }

  if (minutes < 1) {
    const seconds = Math.max(1, Math.ceil(minutes * 60));
    return `${seconds} sec`;
  }

  return `${Math.ceil(minutes)} mins`;
}

function calculateSegmentDistanceKm(startPoint, endPoint) {
  return haversineDistanceKm(startPoint[0], startPoint[1], endPoint[0], endPoint[1]);
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

async function autofillAreaFromCoordinates(lat, lng) {
  if (areaLookupController) {
    areaLookupController.abort();
  }

  areaLookupController = new AbortController();

  try {
    const response = await fetch(`/api/reverse-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`, {
      signal: areaLookupController.signal
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Reverse geocoding failed");
    }

    if (data.area) {
      setAreaQuery(data.area);
      updateDebug(`Area detected automatically: ${data.area}`);
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      updateDebug(`Could not auto-detect area from map location: ${error.message}`);
    }
  }
}

function updateLiveEtaFromState() {
  if (!liveDispatchState || !ambulanceMarker) {
    return;
  }

  const {
    routePoints,
    segmentIndex,
    progress,
    totalDurationMinutes,
    segmentDurations,
    ambulanceCode
  } = liveDispatchState;

  const currentPoint = ambulanceMarker.getLatLng();
  const elapsedBeforeSegment = segmentDurations
    .slice(0, segmentIndex)
    .reduce((sum, value) => sum + value, 0);
  const currentSegmentDuration = segmentDurations[Math.min(segmentIndex, segmentDurations.length - 1)] || 0;
  const elapsedMinutes = elapsedBeforeSegment + currentSegmentDuration * progress;
  const remainingMinutes = Math.max(totalDurationMinutes - elapsedMinutes, 0);
  const stageLabel =
    segmentIndex === 0
      ? "🚑 Moving from ambulance base to 📍 user location"
      : "🚑 Transporting patient from 📍 user location to 🏥 hospital";
  const destinationLabel = segmentIndex === 0 ? "📍 user location" : "🏥 hospital";

  ambulanceMarker.bindPopup(
    `🚑 ${ambulanceCode}<br>` +
      `${stageLabel}<br>` +
      `Lat: ${currentPoint.lat.toFixed(5)}, Lng: ${currentPoint.lng.toFixed(5)}<br>` +
      `ETA to ${destinationLabel}: ${formatEta(remainingMinutes)}`
  );
  updateTrackingStatus(
    `${stageLabel}. Current ambulance position: ${currentPoint.lat.toFixed(5)}, ${currentPoint.lng.toFixed(5)}. ETA remaining: ${formatEta(remainingMinutes)}`
  );
}

function updateAmbulanceFromStream(snapshot) {
  if (!ambulanceMarker) {
    return;
  }

  const nextLatLng = [Number(snapshot.latitude), Number(snapshot.longitude)];
  ambulanceMarker.setLatLng(nextLatLng);
  
  // Update driver directions
  if (liveDispatchState) {
    updateDriverDirections(snapshot);
  }
  ambulanceMarker.bindPopup(
    `🚑 ${snapshot.ambulanceCode}<br>` +
      `${snapshot.stageLabel}<br>` +
      `Lat: ${Number(snapshot.latitude).toFixed(5)}, Lng: ${Number(snapshot.longitude).toFixed(5)}<br>` +
      `ETA remaining: ${formatEta(Number(snapshot.etaMinutesRemaining))}`
  );
  updateTrackingStatus(
    `${snapshot.stageLabel}. Current ambulance position: ${Number(snapshot.latitude).toFixed(5)}, ${Number(snapshot.longitude).toFixed(5)}. ETA remaining: ${formatEta(Number(snapshot.etaMinutesRemaining))}`
  );

  setDispatchFlow(4, { 1: "complete", 2: "complete", 3: "complete", 4: snapshot.status === "completed" ? "complete" : "active" }, snapshot.status === "completed" ? "Patient transfer completed at the selected hospital." : "Ambulance is en route. Follow the live map and pre-arrival guidance.");

  if (snapshot.status === "completed") {
    ambulanceMarker.openPopup();
    liveDispatchState = null;
    closeDispatchStream();
  }
}

function subscribeToLiveDispatch(trackingId, fallbackRoutePoints, etaConfig) {
  closeDispatchStream();
  stopAmbulanceAnimation();

  if (!trackingId || typeof EventSource === "undefined") {
    animateAmbulance(fallbackRoutePoints, etaConfig);
    return;
  }

  dispatchEventSource = new EventSource(`/api/dispatch-stream/${encodeURIComponent(trackingId)}`);
  dispatchEventSource.onmessage = (event) => {
    const snapshot = JSON.parse(event.data);
    updateAmbulanceFromStream(snapshot);
  };
  dispatchEventSource.onerror = () => {
    closeDispatchStream();
    animateAmbulance(fallbackRoutePoints, etaConfig);
  };
}

function animateAmbulance(routePoints, etaConfig) {
  if (!ambulanceMarker || !Array.isArray(routePoints) || routePoints.length < 2) {
    return;
  }

  stopAmbulanceAnimation();

  let segmentIndex = 0;
  let progress = 0;
  let lastTimestamp = null;
  const segmentDurations = [
    Math.max(etaConfig?.toUserMinutes || 1, 0.5),
    Math.max((etaConfig?.toHospitalMinutes || 1) - (etaConfig?.toUserMinutes || 0), 0.5)
  ];
  const totalDuration = segmentDurations.reduce((sum, value) => sum + value, 0);
  const demoSecondsPerEtaMinute = 6;

  function getStageLabel(index) {
    if (index === 0) {
      return "🚑 Moving from ambulance base to 📍 user location";
    }

    return "🚑 Transporting patient from 📍 user location to 🏥 hospital";
  }

  function step(timestamp) {
    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
    }

    if (segmentIndex >= routePoints.length - 1) {
      ambulanceMarker.setLatLng(routePoints[routePoints.length - 1]);
      ambulanceMarker
        .bindPopup(
          `🚑 ${etaConfig?.ambulanceCode || "Ambulance"}<br>` +
            "🏥 Ambulance arrived at the hospital<br>ETA remaining: Arrived"
        )
        .openPopup();
      updateTrackingStatus("🚑 Live status: ambulance reached 🏥 hospital. Dispatch completed.");
      liveDispatchState = null;
      ambulanceAnimationFrame = null;
      return;
    }

    const [startLat, startLng] = routePoints[segmentIndex];
    const [endLat, endLng] = routePoints[segmentIndex + 1];
    const deltaSeconds = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;
    const currentSegmentDurationMinutes = segmentDurations[Math.min(segmentIndex, segmentDurations.length - 1)];
    const currentSegmentDurationSeconds = currentSegmentDurationMinutes * demoSecondsPerEtaMinute;
    progress += deltaSeconds / currentSegmentDurationSeconds;

    if (progress >= 1) {
      progress = 0;
      segmentIndex += 1;
      liveDispatchState = {
        routePoints,
        segmentIndex,
        progress,
        totalDurationMinutes: totalDuration,
        segmentDurations,
        ambulanceCode: etaConfig?.ambulanceCode || "Ambulance"
      };
      ambulanceAnimationFrame = requestAnimationFrame(step);
      return;
    }

    const nextLat = startLat + (endLat - startLat) * progress;
    const nextLng = startLng + (endLng - startLng) * progress;
    ambulanceMarker.setLatLng([nextLat, nextLng]);
    liveDispatchState = {
      routePoints,
      segmentIndex,
      progress,
      totalDurationMinutes: totalDuration,
      segmentDurations,
      ambulanceCode: etaConfig?.ambulanceCode || "Ambulance"
    };
    updateLiveEtaFromState();
    
    // Update driver directions during animation
    if (liveDispatchState && liveDispatchState.route) {
      updateDriverDirections({
        segmentIndex: liveDispatchState.segmentIndex,
        progress: liveDispatchState.progress
      });
    }
    
    ambulanceAnimationFrame = requestAnimationFrame(step);
  }

  ambulanceAnimationFrame = requestAnimationFrame(step);
}

function drawRoute(center, data) {
  [routeLine, routeLineToUser, routeLineToHospital].forEach((line) => {
    if (line) {
      map.removeLayer(line);
    }
  });

  const routePoints = [
    [data.selectedAmbulance.latitude, data.selectedAmbulance.longitude],
    [center.lat, center.lng],
    [data.bestHospital.hospitalLat, data.bestHospital.hospitalLng]
  ];
  const routeToUserPoints =
    Array.isArray(data.route?.geometry) && data.route.geometry.length >= 2
      ? data.route.geometry
      : [routePoints[0], routePoints[1]];
  const routeToHospitalPoints =
    Array.isArray(data.routeToHospital?.geometry) && data.routeToHospital.geometry.length >= 2
      ? data.routeToHospital.geometry
      : [routePoints[1], routePoints[2]];

  routeLineToUser = L.polyline(routeToUserPoints, {
    color: "#ff6b3d",
    weight: 5,
    opacity: 0.9
  })
    .addTo(map)
    .bindPopup(
      data.route?.provider
        ? `🚑 -> 📍 Ambulance traveling to the user via ${data.route.provider}`
        : "🚑 -> 📍 Ambulance traveling to the user"
    );

  routeLineToHospital = L.polyline(routeToHospitalPoints, {
    color: "#35d0ba",
    weight: 5,
    opacity: 0.9
  })
    .addTo(map)
    .bindPopup(
      data.routeToHospital?.provider
        ? `📍 -> 🏥 Patient transfer to hospital via ${data.routeToHospital.provider}`
        : "📍 -> 🏥 Patient transfer to hospital"
    );

  routeLine = L.featureGroup([routeLineToUser, routeLineToHospital]);

  fitDispatchBounds([...routeToUserPoints, ...routeToHospitalPoints]);
  updateTrackingStatus(
    `🚑 Live route ready: ambulance at ${data.selectedAmbulance.latitude.toFixed(5)}, ${data.selectedAmbulance.longitude.toFixed(5)} moving from 📍 user location to 🏥 hospital.`
  );
  subscribeToLiveDispatch(data.liveTrackingId, routePoints, {
    ambulanceCode: data.selectedAmbulance.ambulanceCode,
    toUserMinutes: data.selectedAmbulance.etaMinutes,
    toHospitalMinutes: data.bestHospital.totalEtaMinutes
  });
  
  // Init driver directions
  initDriverDirections(data.route, data.routeToHospital);
}

function formatAlternativeCard(hospital, index) {
  return `
    <article class="alternative-card">
      <div class="card-header">
        <div>
          <h4>${index + 1}. ${hospital.hospital}</h4>
          <p class="detail-meta">${hospital.emergencyLabel}</p>
        </div>
        <span class="score-pill">${hospital.score}</span>
      </div>
      <div class="detail-grid">
        <div class="detail-item">
          <strong>Total ETA</strong>
          <span>${hospital.totalEtaMinutes} mins</span>
        </div>
        <div class="detail-item">
          <strong>Traffic</strong>
          <span>${hospital.traffic.level} (${hospital.traffic.delayMinutes} mins)</span>
        </div>
        <div class="detail-item">
          <strong>Hospital Load</strong>
          <span>${hospital.loadPercent}% - ${hospital.loadLabel}</span>
        </div>
        <div class="detail-item">
          <strong>Ambulance to Hospital</strong>
          <span>${hospital.ambulanceToHospitalDistanceKm.toFixed(2)} km</span>
        </div>
      </div>
      <p class="detail-meta">${hospital.reason}</p>
    </article>
  `;
}

function renderBestResult(data) {
  const { selectedAmbulance, bestHospital, explainability } = data;
  const sourceLabelMap = {
    google_places: "Google Places",
    database: "MySQL database",
    "database-fallback": "MySQL fallback",
    generated: "Generated local fallback",
    external: "External API",
    osm: "OpenStreetMap"
  };
  const hospitalSourceLabel = sourceLabelMap[data.hospitalsSource] || data.hospitalsSource || "Unknown";

  document.getElementById("info").innerHTML = `
    <article class="result-card featured">
      <div class="card-header">
        <div>
          <span class="tag">${data.emergencyLabel}</span>
          <h3>${bestHospital.hospital}</h3>
          <p class="detail-meta">Best-ranked hospital for this incident</p>
        </div>
        <span class="score-pill">Score ${bestHospital.score}</span>
      </div>

      <div class="source-banner">
        Hospital source: ${hospitalSourceLabel}
      </div>

      <div class="detail-grid">
        <div class="detail-item">
          <strong>Selected Ambulance</strong>
          <span>${selectedAmbulance.ambulanceCode}</span>
        </div>
        <div class="detail-item">
          <strong>Ambulance ETA to User</strong>
          <span>${selectedAmbulance.etaMinutes} mins</span>
        </div>
        <div class="detail-item">
          <strong>Total Estimated Response</strong>
          <span>${bestHospital.totalEtaMinutes} mins</span>
        </div>
        <div class="detail-item">
          <strong>Traffic Level</strong>
          <span>${bestHospital.traffic.level} (${bestHospital.traffic.delayMinutes} mins)</span>
        </div>
        <div class="detail-item">
          <strong>User to Hospital</strong>
          <span>${bestHospital.userToHospitalDistanceKm.toFixed(2)} km</span>
        </div>
        <div class="detail-item">
          <strong>Hospital Load</strong>
          <span>${bestHospital.loadPercent}% - ${bestHospital.loadLabel}</span>
        </div>
        <div class="detail-item">
          <strong>Ambulance Source</strong>
          <span>${selectedAmbulance.source || "database"}</span>
        </div>
      </div>

      <div class="score-grid">
        <div class="score-card">
          <strong>Response Distance</strong>
          <span>${bestHospital.scoreBreakdown.responseDistance}</span>
        </div>
        <div class="score-card">
          <strong>Traffic Score</strong>
          <span>${bestHospital.scoreBreakdown.trafficDelay}</span>
        </div>
        <div class="score-card">
          <strong>Emergency Fit</strong>
          <span>${bestHospital.scoreBreakdown.emergencyFit}</span>
        </div>
        <div class="score-card">
          <strong>Area Match</strong>
          <span>${bestHospital.scoreBreakdown.areaMatch}</span>
        </div>
      </div>

      <div class="explain-box">
        <strong>Why this hospital?</strong>
        <p>${explainability.summary}</p>
        <p>${bestHospital.reason}</p>
      </div>
    </article>
  `;
}

function renderAlternatives(alternatives) {
  const container = document.getElementById("alternatives");

  if (!Array.isArray(alternatives) || !alternatives.length) {
    container.innerHTML = '<div class="empty-state">No alternative hospitals were returned.</div>';
    return;
  }

  container.innerHTML = alternatives.map(formatAlternativeCard).join("");
}

function renderPreArrivalGuidance(guidance) {
  const container = document.getElementById("guidance");

  if (!guidance) {
    container.innerHTML =
      '<div class="empty-state">No pre-arrival guidance is available for this dispatch.</div>';
    return;
  }

  const precautionItems = Array.isArray(guidance.precautions)
    ? guidance.precautions.map((item) => `<li>${item}</li>`).join("")
    : "";
  const warningItems = Array.isArray(guidance.warnings)
    ? guidance.warnings.map((item) => `<li>${item}</li>`).join("")
    : "";

  container.innerHTML = `
    <article class="guidance-card">
      <h3>${guidance.heading}</h3>
      <p>${guidance.summary}</p>
      <p class="detail-meta">${guidance.etaWindow}</p>
      <ul class="guidance-list">${precautionItems}</ul>
      <div class="warning-banner">
        <strong>Warning signs</strong>
        <ul class="guidance-list">${warningItems}</ul>
      </div>
      <p class="detail-meta">${guidance.disclaimer}</p>
    </article>
  `;
}

function renderAiDispatchInsight(aiInsight) {
  const container = document.getElementById("ai-dispatch-insight");

  if (!aiInsight) {
    container.innerHTML =
      '<div class="empty-state">No AI dispatch insight is available for this request.</div>';
    return;
  }

  const rationaleItems = Array.isArray(aiInsight.rationale)
    ? aiInsight.rationale.map((item) => `<li>${item}</li>`).join("")
    : "";
  const actionItems = Array.isArray(aiInsight.actions)
    ? aiInsight.actions.map((item) => `<li>${item}</li>`).join("")
    : "";

  container.innerHTML = `
    <article class="guidance-card ai-insight-card">
      <div class="card-header">
        <div>
          <h3>${aiInsight.heading}</h3>
          <p class="detail-meta">${aiInsight.model} via ${aiInsight.provider}</p>
        </div>
        <span class="tag">AI Layer</span>
      </div>
      <p>${aiInsight.summary}</p>
      <div class="detail-grid">
        <div class="detail-item">
          <strong>Why this dispatch?</strong>
          <ul class="guidance-list">${rationaleItems}</ul>
        </div>
        <div class="detail-item">
          <strong>Recommended actions</strong>
          <ul class="guidance-list">${actionItems}</ul>
        </div>
      </div>
      <p class="detail-meta">${aiInsight.note || ""}</p>
    </article>
  `;
}

function useTestLocation() {
  const lat = Number(document.getElementById("test-lat").value);
  const lng = Number(document.getElementById("test-lng").value);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    document.getElementById("info").innerHTML =
      '<div class="empty-state">Enter valid latitude and longitude values to test the dispatch flow.</div>';
    return;
  }

  selectedLocation = { lat, lng };
  syncLocationInputs(lat, lng);
  map.setView([lat, lng], 15);
  setUserMarker(lat, lng, "Incident location");
  autofillAreaFromCoordinates(lat, lng);
  updateDebug(`Manual coordinates selected: lat=${lat}, lng=${lng}`);
  setDispatchFlow(1, { 1: "active" }, "Incident location captured. You can now run dispatch.");
}

function useLiveLocation() {
  startLiveLocationTracking(true);
}

let areaSuggestions = [];
let suggestionTimeout = null;

async function fetchAreaSuggestions(query) {
  if (query.length < 2) return [];
  
  try {
    const response = await fetch(`/api/area-suggestions?query=${encodeURIComponent(query)}`);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error('Area suggestions fetch error:', error);
    return [];
  }
}

function showSuggestions(suggestions, inputEl) {
  const dropdown = document.getElementById('area-suggestions');
  dropdown.innerHTML = '';
  
  if (!suggestions.length) {
    dropdown.style.display = 'none';
    return;
  }
  
  suggestions.forEach((area, index) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.textContent = area;
    item.dataset.index = index;
    item.addEventListener('click', () => selectSuggestion(area));
    dropdown.appendChild(item);
  });
  
  dropdown.style.display = 'block';
  dropdown.scrollTop = 0;
}

function hideSuggestions() {
  const dropdown = document.getElementById('area-suggestions');
  dropdown.innerHTML = '';
  dropdown.style.display = 'none';
}

function selectSuggestion(area) {
  document.getElementById('area-query').value = area;
  hideSuggestions();
}

document.addEventListener('DOMContentLoaded', () => {
  setDispatchFlow(0, {}, "Select an incident location to begin.");
  const areaInput = document.getElementById('area-query');
  
  areaInput.addEventListener('input', async () => {
    const query = areaInput.value.trim();
    hideSuggestions();
    
    if (query.length < 2) return;
    
    if (suggestionTimeout) clearTimeout(suggestionTimeout);
    suggestionTimeout = setTimeout(async () => {
      areaSuggestions = await fetchAreaSuggestions(query);
      showSuggestions(areaSuggestions, areaInput);
    }, 200);
  });
  
  areaInput.addEventListener('blur', () => {
    setTimeout(hideSuggestions, 200);
  });
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.controls-grid')) {
      hideSuggestions();
    }
  });
});

map.on("click", (event) => {
  const { lat, lng } = event.latlng;
  selectedLocation = { lat, lng };
  syncLocationInputs(lat, lng);
  setUserMarker(lat, lng, "Incident selected on map");
  autofillAreaFromCoordinates(lat, lng);
  updateDebug(`Map click selected incident point: lat=${lat}, lng=${lng}`);
  setDispatchFlow(1, { 1: "active" }, "Incident location captured. You can now run dispatch.");
});

function startLiveLocationTracking(shouldCenterMap) {
  if (!navigator.geolocation) {
    updateDebug("Live geolocation is not available in this browser.");
    return;
  }

  if (geolocationWatchId !== null) {
    navigator.geolocation.clearWatch(geolocationWatchId);
  }

  geolocationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      selectedLocation = { lat, lng };
      syncLocationInputs(lat, lng);

      if (shouldCenterMap) {
        map.setView([lat, lng], 15);
      }

      setUserMarker(lat, lng, `Live user location (accuracy ${Math.round(accuracy)} m)`);
      autofillAreaFromCoordinates(lat, lng);
      updateDebug(
        `Exact live location tracked: lat=${lat}, lng=${lng}, accuracy=${Math.round(accuracy)}m`
      );
      setDispatchFlow(1, { 1: "active" }, "Live incident location captured. You can now run dispatch.");
      updateLiveEtaFromState();
    },
    () => {
      updateDebug("Live location was blocked, so manual coordinates are still available.");
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    }
  );
}

startLiveLocationTracking(true);
sendSessionHeartbeat();
window.setInterval(sendSessionHeartbeat, 60000);

async function requestAmbulance() {
  const center = selectedLocation || map.getCenter();
  const emergencyType = document.getElementById("emergency-type").value;
  const areaQuery = document.getElementById("area-query").value.trim();
  closeDispatchStream();
  stopAmbulanceAnimation();

  updateDebug(
    `Dispatch requested for ${emergencyType} at lat=${center.lat}, lng=${center.lng}${areaQuery ? `, area=${areaQuery}` : ""}`
  );
  setDispatchFlow(2, { 1: "complete", 2: "active" }, "Finding the nearest available ambulance.");

  try {
    const response = await fetch("/api/request-ambulance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: center.lat,
        lng: center.lng,
        emergencyType,
        areaQuery,
        sessionId: getSessionId()
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Backend request failed");
    }

    renderBestResult(data);
    renderAlternatives(data.alternatives);
    renderAiDispatchInsight(data.aiDispatchInsight);
    renderPreArrivalGuidance(data.preArrivalGuidance);
    setDispatchFlow(4, { 1: "complete", 2: "complete", 3: "complete", 4: "active" }, "Ambulance and hospital selected. Live tracking is now active.");

    if (ambulanceMarker) {
      map.removeLayer(ambulanceMarker);
    }

    ambulanceMarker = L.marker(
      [data.selectedAmbulance.latitude, data.selectedAmbulance.longitude],
      { icon: ambulanceIcon }
    )
      .addTo(map)
      .bindPopup(
        `🚑 ${data.selectedAmbulance.ambulanceCode}<br>` +
          `Current position highlighted on map<br>` +
          `ETA to user: ${data.selectedAmbulance.etaMinutes} mins<br>` +
          `Traffic: ${data.selectedAmbulance.trafficLevel}`
      );

    renderHospitalMarkers(data.bestHospital, data.alternatives);
    drawRoute(center, data);

    updateDebug(
      `${data.selectedAmbulance.ambulanceCode} dispatched. ${data.bestHospital.hospital} ranked first with score ${data.bestHospital.score}.`
    );
  } catch (error) {
    setDispatchFlow(2, { 1: selectedLocation ? "complete" : "pending", 2: "error" }, "Dispatch could not be completed. Check the connection and try again.");
    document.getElementById("info").innerHTML = `
      <div class="empty-state">
        Dispatch failed: ${error.message}. Make sure the Node server and database are available.
      </div>
    `;
    document.getElementById("alternatives").innerHTML =
      '<div class="empty-state">No alternatives available because the dispatch call failed.</div>';
    document.getElementById("ai-dispatch-insight").innerHTML =
      '<div class="empty-state">AI dispatch insight is unavailable because the dispatch call failed.</div>';
    document.getElementById("guidance").innerHTML =
      '<div class="empty-state">Pre-arrival guidance is unavailable because the dispatch call failed.</div>';
    closeDispatchStream();
    updateDebug(`Dispatch request failed: ${error.message}`);
  }
}
