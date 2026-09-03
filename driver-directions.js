// Driver Directions Panel
let directionsPanelVisible = false;
let currentRoutes = { toUser: null, toHospital: null };

function toggleDriverPanel() {
  directionsPanelVisible = !directionsPanelVisible;
  const panel = document.getElementById('driver-directions-panel');
  panel.style.display = directionsPanelVisible ? 'block' : 'none';
}

function renderDriverDirections(legIndex, progress) {
  const route = legIndex === 0 ? currentRoutes.toUser : currentRoutes.toHospital;
  if (!route || !route.instructions || route.instructions.length === 0) {
    document.getElementById('directions-list').innerHTML = '<div>No turn-by-turn directions available</div>';
    return;
  }

  const instructions = route.instructions;
  const currentIndex = Math.min(Math.floor(progress * instructions.length), instructions.length - 1);
  
  document.getElementById('directions-list').innerHTML = instructions.map((instr, index) => {
    const distance = (instr.distance || 0) / 1000;
    const isCurrent = index === currentIndex;
    const isNext = index === (currentIndex + 1) % instructions.length;
    
    return `
      <div class="direction-item ${isCurrent ? 'current' : isNext ? 'next' : ''}">
        <span class="direction-icon">→</span>
        <div>
          <strong>${instr.text || 'Continue straight'}</strong>
          <span class="distance">${distance.toFixed(1)}km</span>
        </div>
      </div>
    `;
  }).join('');
  
  document.getElementById('current-direction').innerHTML = `
    <strong>Leg ${legIndex + 1}/2:</strong> ${instructions[currentIndex]?.text || 'Continue'} 
    <span class="distance">(${instructions[currentIndex]?.distance / 1000 || 0}km)</span>
  `;
}

function updateDriverDirections(snapshot) {
  if (!liveDispatchState) return;
  
  renderDriverDirections(snapshot.segmentIndex || 0, snapshot.progress || 0);
}

// Init directions after dispatch (call from main.js)
function initDriverDirections(routeToUser, routeToHospital) {
  currentRoutes = { toUser: routeToUser, toHospital: routeToHospital };
  if (directionsPanelVisible) {
    renderDriverDirections(0, 0);
  }
}

