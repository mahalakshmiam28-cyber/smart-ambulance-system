# Driver Directions TODO
Status: Plan Approved

**Files**: server.js (backend route instructions), main.js (driver UI panel), index.html (driver toggle)

**1. Backend - GraphHopper Instructions**
- Add `instructions=true` to `requestGraphHopperRoute()`
- Return `route.instructions` array with distance, turn, street names
- Add `legs` array with instructions per segment (user→hospital)

**2. Frontend - Driver Panel**
- Add directions sidebar toggle button
- Render instructions list synced with ambulance animation position
- Highlight current/next instruction
- Distance remaining to next turn

**3. HTML/CSS**
- `.driver-panel` sidebar (right side, collapsible)
- Directions list styling + current step highlight

**4. Test**
- Bangalore → dispatch → driver mode → "Turn left in 200m" list

Next: Backend GraphHopper update (add instructions=true)
