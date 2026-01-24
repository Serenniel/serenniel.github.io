document.addEventListener('DOMContentLoaded', () => {
    const raceSearchInput = document.getElementById('raceSearchInput');
    const raceList = document.getElementById('raceList');
    const raceDetailView = document.getElementById('raceDetailView');
    const searchSection = document.querySelector('.search-section');
    const backButton = document.getElementById('backButton');
    const driverSearchInput = document.getElementById('driverSearchInput');
    const linksPanel = document.getElementById('linksPanel'); // NEW
    
    let allRaces = [];

    // 1. Initialize
    fetch('results/manifest.json')
        .then(response => response.json())
        .then(data => {
            allRaces = data;
            renderRaceList(allRaces);
            handleUrlRoute();
        })
        .catch(err => console.error("Could not load manifest.json", err));

    window.addEventListener('popstate', handleUrlRoute);

    function handleUrlRoute() {
        const params = new URLSearchParams(window.location.search);
        const raceSlug = params.get('race');
        
        if (raceSlug) {
            const cleanSlug = decodeURIComponent(raceSlug);
            const match = allRaces.find(r => r.filename.replace(/\.csv$/i, '') === cleanSlug);
            
            if (match) loadRaceDetail(match.filename, false);
            else loadRaceDetail(cleanSlug + '.csv', false);
        } else {
            showSearchView();
        }
    }

    // 2. Search Logic
    raceSearchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allRaces.filter(race => {
            return Object.values(race).some(val => 
                String(val).toLowerCase().includes(term)
            );
        });
        renderRaceList(filtered);
    });

    function renderRaceList(races) {
        raceList.innerHTML = '';
        if (races.length === 0) {
            raceList.innerHTML = '<div class="race-item">No results found</div>';
            return;
        }

        races.forEach(race => {
            const div = document.createElement('div');
            div.className = 'race-item';
            div.textContent = `${race.date} - ${race.series} - #${race.race_num} - ${race.map} - ${race.car} - Div ${race.division}`;
            
            div.addEventListener('click', () => {
                const cleanName = race.filename.replace(/\.csv$/i, '');
                const newUrl = new URL(window.location);
                newUrl.searchParams.set('race', cleanName);
                window.history.pushState({}, '', newUrl);
                loadRaceDetail(race.filename, true);
            });
            raceList.appendChild(div);
        });
    }

    function showSearchView() {
        searchSection.style.display = 'block';
        raceList.style.display = 'block'; 
        raceDetailView.style.display = 'none';
        document.title = "Race Results Hub";
    }

    function loadRaceDetail(filename, isClick) {
        searchSection.style.display = 'none';
        raceDetailView.style.display = 'block';

        fetch(`results/${filename}`)
            .then(res => {
                if (!res.ok) throw new Error("File not found");
                return res.text();
            })
            .then(csvText => parseAndDisplay(csvText))
            .catch(err => {
                console.error(err);
                showSearchView();
            });
    }

    backButton.addEventListener('click', () => {
        const newUrl = new URL(window.location);
        newUrl.searchParams.delete('race');
        window.history.pushState({}, '', newUrl);
        showSearchView();
        driverSearchInput.value = ''; 
    });

    // 3. CSV Parser & Display Logic (UPDATED)
    function parseAndDisplay(csvText) {
        const lines = csvText.split('\n').map(l => l.trim()).filter(l => l);
        
        // --- A. Metadata Parsing (First 6 lines) ---
        const metaDict = {};
        for(let i=0; i<6; i++) {
            if(!lines[i]) continue;
            const parts = lines[i].split(',');
            const key = parts[0].trim();
            const val = parts.slice(1).filter(p => p.trim()).join(', ').trim();
            metaDict[key] = val;
        }

        // Render Metadata
        const metaPanel = document.getElementById('metadataPanel');
        metaPanel.innerHTML = '';
        const displayOrder = ['Date', 'Race Series', 'Race #', 'Map', 'Car', 'Division'];
        displayOrder.forEach(key => {
            const val = metaDict[key] || '-';
            const row = document.createElement('div');
            row.className = 'meta-row';
            row.innerHTML = `<span class="meta-label">${key}:</span> <span class="meta-value">${val}</span>`;
            metaPanel.appendChild(row);
        });

        // --- B. Split Table Data vs Links ---
        // Header is line 6 (index 6)
        // Data starts at line 7 (index 7)
        const headerLine = lines[6];
        const rawDataRows = lines.slice(7);

        const tableRows = [];
        const linkRows = [];
        let parsingTable = true;

        rawDataRows.forEach(rowStr => {
            // Check if row is empty or just commas (separator)
            const isSeparator = rowStr.replace(/,/g, '').trim() === '';

            if (parsingTable) {
                if (isSeparator) {
                    parsingTable = false; // Switch to Link mode
                } else {
                    tableRows.push(rowStr);
                }
            } else {
                if (!isSeparator) {
                    linkRows.push(rowStr);
                }
            }
        });

        // --- C. Render Links (NEW) ---
        linksPanel.innerHTML = ''; // Clear old links
        
        if (linkRows.length > 0) {
            linkRows.forEach(row => {
                const parts = row.split(',');
                // Left value = Label (parts[0])
                // Right value = URL (parts[1])
                const label = parts[0].trim();
                const url = parts[1] ? parts[1].trim() : '';

                if (label && url) {
                    const a = document.createElement('a');
                    a.href = url;
                    a.target = "_blank"; // Open in new tab
                    a.className = 'race-link-btn';
                    a.textContent = label;
                    linksPanel.appendChild(a);
                }
            });
            linksPanel.style.display = 'flex';
        } else {
            linksPanel.style.display = 'none';
        }

        // --- D. Render Table ---
        const headers = headerLine.split(',');

        // Stats Logic
        const bestLapIdx = headers.indexOf('Best Lap');
        const racePosIdx = headers.indexOf('Race Position'); 
        let minLapTime = Infinity;

        const parseTime = (t) => {
            if (!t || t.toUpperCase() === 'DNF') return Infinity;
            const parts = t.split(':');
            if (parts.length < 2) return Infinity; 
            return (parseInt(parts[0]) * 60) + parseFloat(parts[1]);
        };

        if (bestLapIdx > -1) {
            tableRows.forEach(row => {
                const cells = row.split(',');
                if (cells[bestLapIdx]) {
                    const t = parseTime(cells[bestLapIdx].trim());
                    if (t < minLapTime) minLapTime = t;
                }
            });
        }

        // Build Table Header
        const tableHead = document.getElementById('tableHead');
        tableHead.innerHTML = '';
        headers.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            tableHead.appendChild(th);
        });

        // Build Table Body
        const tableBody = document.getElementById('tableBody');
        tableBody.innerHTML = '';
        
        tableRows.forEach((rowStr, idx) => {
            const row = document.createElement('tr');
            const cells = rowStr.split(',');

            if (idx === 0) row.classList.add('podium-1');
            if (idx === 1) row.classList.add('podium-2');
            if (idx === 2) row.classList.add('podium-3');

            if (racePosIdx > -1 && cells[racePosIdx] && cells[racePosIdx].trim().toUpperCase() === 'DNF') {
                row.classList.add('dnf-row');
                row.classList.remove('podium-1', 'podium-2', 'podium-3'); 
            }

            cells.forEach((cell, cellIdx) => {
                const td = document.createElement('td');
                if (cellIdx === bestLapIdx) {
                    const t = parseTime(cell.trim());
                    if (t !== Infinity && t === minLapTime) {
                        td.innerHTML = `${cell} <span title="Fastest Lap" style="cursor:help;">⭐</span>`;
                    } else {
                        td.textContent = cell;
                    }
                } else {
                    td.textContent = cell;
                }
                row.appendChild(td);
            });
            tableBody.appendChild(row);
        });
        
        driverSearchInput.oninput = function() {
            const term = this.value.toLowerCase();
            const rows = tableBody.querySelectorAll('tr');
            rows.forEach(r => {
                r.style.display = r.textContent.toLowerCase().includes(term) ? '' : 'none';
            });
        };
    }
});