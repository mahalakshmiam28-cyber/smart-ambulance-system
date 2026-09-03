const adminStatus = document.getElementById("admin-status");
const dispatchTable = document.getElementById("dispatch-table");
const refreshButton = document.getElementById("refresh-admin");
const logoutButton = document.getElementById("logout-admin");
const fleetUtilizationChart = document.getElementById("fleet-utilization-chart");
const demandBars = document.getElementById("demand-bars");
const etaDistribution = document.getElementById("eta-distribution");

function setMetricValue(id, value) {
  document.getElementById(id).textContent = value;
}

function formatTimestamp(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function renderDispatches(dispatches) {
  if (!Array.isArray(dispatches) || !dispatches.length) {
    dispatchTable.innerHTML = '<div class="empty-state">No active dispatches right now.</div>';
    return;
  }

  dispatchTable.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Dispatch</th>
          <th>Ambulance</th>
          <th>Emergency</th>
          <th>ETA</th>
          <th>User Location</th>
          <th>Requested</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${dispatches
          .map(
            (dispatch) => `
              <tr>
                <td>#${dispatch.id}</td>
                <td>
                  <strong>${dispatch.ambulanceCode}</strong><br />
                  <span class="detail-meta">${dispatch.baseHospital}</span>
                </td>
                <td>${dispatch.emergencyType}</td>
                <td>${dispatch.etaMinutes} mins</td>
                <td>${dispatch.userLat.toFixed(5)}, ${dispatch.userLng.toFixed(5)}</td>
                <td>${formatTimestamp(dispatch.requestedAt)}</td>
                <td>
                  <button
                    type="button"
                    class="primary-button admin-action-button"
                    data-dispatch-id="${dispatch.id}"
                  >
                    Complete
                  </button>
                </td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderFleetUtilization(metrics) {
  const total = Math.max(Number(metrics.totalAmbulances || 0), 1);
  const busy = Number(metrics.busyAmbulances || 0);
  const available = Number(metrics.availableAmbulances || 0);
  const busyRatio = Math.max(0, Math.min(busy / total, 1));
  const busyPercent = Math.round(busyRatio * 100);

  document.getElementById("fleet-utilization-label").textContent = `${busyPercent}% busy`;
  document.getElementById("fleet-available-label").textContent = available;
  document.getElementById("fleet-busy-label").textContent = busy;
  fleetUtilizationChart.innerHTML = `
    <svg viewBox="0 0 120 120" class="radial-chart-svg" aria-hidden="true">
      <circle cx="60" cy="60" r="44" class="radial-track"></circle>
      <circle
        cx="60"
        cy="60"
        r="44"
        class="radial-progress"
        stroke-dasharray="${2 * Math.PI * 44}"
        stroke-dashoffset="${2 * Math.PI * 44 * (1 - busyRatio)}"
      ></circle>
    </svg>
    <div class="radial-chart-center">
      <strong>${busyPercent}%</strong>
      <span>Fleet busy</span>
    </div>
  `;
}

function renderDemandBars(metrics) {
  const bars = [
    {
      label: "Active Users",
      value: Number(metrics.activeUsers || 0),
      max: Math.max(Number(metrics.totalSessions || 0), Number(metrics.activeUsers || 0), 1),
      tone: "teal-bar"
    },
    {
      label: "Active Dispatches",
      value: Number(metrics.activeDispatches || 0),
      max: Math.max(Number(metrics.totalDispatches || 0), Number(metrics.activeDispatches || 0), 1),
      tone: "accent-bar"
    },
    {
      label: "Busy Ambulances",
      value: Number(metrics.busyAmbulances || 0),
      max: Math.max(Number(metrics.totalAmbulances || 0), Number(metrics.busyAmbulances || 0), 1),
      tone: "gold-bar"
    }
  ];

  const demandScore =
    bars.reduce((sum, bar) => sum + Math.min(bar.value / bar.max, 1), 0) / bars.length;
  const intensityLabel =
    demandScore > 0.66 ? "High Load" : demandScore > 0.33 ? "Moderate Load" : "Light Load";

  document.getElementById("demand-intensity-label").textContent = intensityLabel;
  demandBars.innerHTML = bars
    .map((bar) => {
      const widthPercent = Math.max(10, Math.round((bar.value / bar.max) * 100));
      return `
        <div class="bar-row">
          <div class="bar-meta">
            <span>${bar.label}</span>
            <strong>${bar.value}</strong>
          </div>
          <div class="bar-track">
            <div class="bar-fill ${bar.tone}" style="width: ${widthPercent}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderEtaDistribution(dispatches) {
  if (!Array.isArray(dispatches) || !dispatches.length) {
    document.getElementById("eta-summary-label").textContent = "No active ETAs";
    etaDistribution.innerHTML = '<div class="empty-state">ETA graph will appear when dispatches are active.</div>';
    return;
  }

  const buckets = [
    { label: "0-5 mins", min: 0, max: 5, count: 0 },
    { label: "6-10 mins", min: 6, max: 10, count: 0 },
    { label: "11-15 mins", min: 11, max: 15, count: 0 },
    { label: "16+ mins", min: 16, max: Number.POSITIVE_INFINITY, count: 0 }
  ];

  dispatches.forEach((dispatch) => {
    const eta = Number(dispatch.etaMinutes || 0);
    const bucket = buckets.find((item) => eta >= item.min && eta <= item.max);
    if (bucket) {
      bucket.count += 1;
    }
  });

  const averageEta = Math.round(
    dispatches.reduce((sum, dispatch) => sum + Number(dispatch.etaMinutes || 0), 0) / dispatches.length
  );
  const maxBucketCount = Math.max(...buckets.map((bucket) => bucket.count), 1);

  document.getElementById("eta-summary-label").textContent = `Avg ETA ${averageEta} mins`;
  etaDistribution.innerHTML = buckets
    .map((bucket) => {
      const heightPercent = Math.max(12, Math.round((bucket.count / maxBucketCount) * 100));
      return `
        <div class="eta-column">
          <div class="eta-bar-wrap">
            <div class="eta-bar" style="height: ${heightPercent}%"></div>
          </div>
          <strong>${bucket.count}</strong>
          <span>${bucket.label}</span>
        </div>
      `;
    })
    .join("");
}

async function loadAdminMetrics() {
  adminStatus.textContent = "Loading admin metrics...";

  try {
    const response = await fetch("/api/admin/metrics");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Admin metrics request failed");
    }

    setMetricValue("metric-active-users", data.metrics.activeUsers);
    setMetricValue("metric-total-sessions", data.metrics.totalSessions);
    setMetricValue("metric-active-dispatches", data.metrics.activeDispatches);
    setMetricValue("metric-available-ambulances", data.metrics.availableAmbulances);
    setMetricValue("metric-busy-ambulances", data.metrics.busyAmbulances);
    setMetricValue("metric-total-dispatches", data.metrics.totalDispatches);
    document.getElementById("admin-window-label").textContent =
      `Users active in the last ${data.activeUserWindowMinutes} minutes.`;
    adminStatus.textContent =
      `Live operations: ${data.metrics.activeUsers} active users, ${data.metrics.activeDispatches} active dispatches, and ${data.metrics.availableAmbulances} ambulances ready.`;
    renderFleetUtilization(data.metrics);
    renderDemandBars(data.metrics);
    renderEtaDistribution(data.activeDispatches);
    renderDispatches(data.activeDispatches);
  } catch (error) {
    adminStatus.textContent = `Could not load admin metrics: ${error.message}`;
    fleetUtilizationChart.innerHTML = "";
    demandBars.innerHTML = '<div class="empty-state">Demand graph is unavailable right now.</div>';
    etaDistribution.innerHTML = '<div class="empty-state">ETA graph is unavailable right now.</div>';
    dispatchTable.innerHTML = '<div class="empty-state">Dispatch table is unavailable right now.</div>';
  }
}

async function completeDispatch(dispatchId) {
  adminStatus.textContent = `Completing dispatch #${dispatchId}...`;

  try {
    const response = await fetch(`/api/admin/dispatches/${dispatchId}/complete`, {
      method: "POST"
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not complete dispatch");
    }

    adminStatus.textContent = `Dispatch #${dispatchId} completed. The ambulance is available again.`;
    await loadAdminMetrics();
  } catch (error) {
    adminStatus.textContent = `Could not complete dispatch #${dispatchId}: ${error.message}`;
  }
}

refreshButton.addEventListener("click", () => {
  loadAdminMetrics();
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/admin/logout", {
    method: "POST"
  });
  window.location.href = "/admin-login.html";
});

dispatchTable.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-dispatch-id]");

  if (!trigger) {
    return;
  }

  const dispatchId = Number(trigger.getAttribute("data-dispatch-id"));

  if (Number.isInteger(dispatchId) && dispatchId > 0) {
    completeDispatch(dispatchId);
  }
});

loadAdminMetrics();
window.setInterval(loadAdminMetrics, 30000);
