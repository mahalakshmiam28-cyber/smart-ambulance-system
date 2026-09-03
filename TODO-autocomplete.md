# Area/Landmark Autocomplete Plan
Approved: yes | Status: Planning

## **Info Gathered**
- DB: service_areas table with Bengaluru areas (Indiranagar, MG Road, etc.) + global
- Frontend: #area-query input ready for autocomplete dropdown
- Backend: server.js - add /api/area-suggestions?query=indira → JSON areas
- style.css: Dark theme ready

## **Detailed Plan**
1. **server.js** Add endpoint:
```
app.get('/api/area-suggestions', async (req, res) => {
  const query = normalizeAreaQuery(req.query.query || '');
  if (!query) return res.json([]);
  const [rows] = await dbPool.query(
    'SELECT DISTINCT area_name FROM service_areas WHERE LOWER(area_name) LIKE ? LIMIT 8',
    [`%${query}%`]
  );
  res.json(rows.map(r => r.area_name));
});
```

2. **index.html** Add dropdown container:
```
</label>
<div id="area-suggestions" class="autocomplete-dropdown"></div>
```

3. **main.js** Add autocomplete logic:
```
document.getElementById('area-query').addEventListener('input', async (e) => {
  const query = e.target.value.trim();
  if (query.length < 2) return hideSuggestions();
  
  const res = await fetch(`/api/area-suggestions?query=${encodeURIComponent(query)}`);
  const suggestions = await res.json();
  showSuggestions(suggestions, e.target);
});
```

4. **style.css** Add styles:
```
.autocomplete-dropdown {
  position: absolute;
  z-index: 10;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 16px;
  max-height: 200px;
  overflow-y: auto;
  margin-top: 4px;
}
.suggestion-item { padding: 12px; cursor: pointer; }
.suggestion-item:hover { background: rgba(255,255,255,0.08); }
```

## **Dependent Files**
- server.js (new API)
- index.html (dropdown div)
- main.js (JS logic)
- style.css (styling)

## **Followup**
1. Add server.js endpoint
2. Update HTML/CSS
3. Add JS autocomplete
4. Test: type "Ind" → dropdown Indiranagar...

Approve to create TODO-autocomplete.md & start implementation?

