// === Map initialization ===
const map = L.map('map').setView([35.33, 25.14], 3);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// --- Parameters ---
const subCells = 10;
const tileSize = 256;

// --- Hover rectangle ---
let hoverRect = L.rectangle([[0,0],[0,0]], { color: '#ee9127', weight: 2, fillOpacity: 0.2 }).addTo(map);
hoverRect.setStyle({ opacity: 0, fillOpacity: 0 });

// --- Selection management ---
const selectedCells = new Map(); // key -> { rect, bounds }

// --- Custom Grid Layer ---
const SquareGrid = L.GridLayer.extend({
  createTile: function(coords) {
    const tile = L.DomUtil.create('canvas', 'leaflet-tile');
    tile.width = tile.height = tileSize;
    const ctx = tile.getContext('2d');
    const cellSize = tileSize / subCells;

    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < subCells; i++) {
      for (let j = 0; j < subCells; j++) {
        ctx.strokeRect(j * cellSize, i * cellSize, cellSize, cellSize);
      }
    }
    return tile;
  }
});
const squareGrid = new SquareGrid();
squareGrid.addTo(map);

// --- Helpers ---
function getCellKey(zoom, tileX, tileY, subX, subY) {
  return `${zoom}:${tileX}:${tileY}:${subX}:${subY}`;
}

function getCellBounds(latlng) {
  const zoom = map.getZoom();
  const tileCoords = map.project(latlng, zoom).divideBy(tileSize).floor();
  const tileOrigin = L.point(tileCoords.x * tileSize, tileCoords.y * tileSize);
  const pixel = map.project(latlng, zoom).subtract(tileOrigin);

  const cellSize = tileSize / subCells;
  const cellX = Math.floor(pixel.x / cellSize);
  const cellY = Math.floor(pixel.y / cellSize);

  const nwPixel = tileOrigin.add(L.point(cellX*cellSize, cellY*cellSize));
  const sePixel = nwPixel.add(L.point(cellSize, cellSize));
  const nwLatLng = map.unproject(nwPixel, zoom);
  const seLatLng = map.unproject(sePixel, zoom);
  const bounds = L.latLngBounds(nwLatLng, seLatLng);

  return {
    bounds,
    zoom,
    tileX: tileCoords.x,
    tileY: tileCoords.y,
    subX: cellX,
    subY: cellY
  };
}

// --- Hover effect ---
map.on('mousemove', function(e) {
  const cell = getCellBounds(e.latlng);
  hoverRect.setBounds(cell.bounds);
  hoverRect.setStyle({ opacity: 1, fillOpacity: 0.2 });
});

map.on('mouseout', function() {
  hoverRect.setStyle({ opacity: 0, fillOpacity: 0 });
});

map.on('movestart', function() {
  hoverRect.setStyle({ opacity: 0, fillOpacity: 0 });
});

// --- Click selection ---
map.on('click', function(e) {
  const cell = getCellBounds(e.latlng);
  const key = getCellKey(cell.zoom, cell.tileX, cell.tileY, cell.subX, cell.subY);
  const shiftPressed = e.originalEvent.shiftKey;

  if (!shiftPressed) {
    selectedCells.forEach(entry => entry.rect.remove());
    selectedCells.clear();
  }

  // Use geographic bounds as persistence key
  const existing = Array.from(selectedCells.entries()).find(([_, v]) =>
    v.bounds.equals(cell.bounds)
  );

  if (existing) {
    existing[1].rect.remove();
    selectedCells.delete(existing[0]);
  } else {
    const rect = L.rectangle(cell.bounds, {
      color: '#21588f',
      weight: 2,
      fillOpacity: 0.25,
      fillColor: '#e9f0fa'
    }).addTo(map);
    selectedCells.set(key, { rect, bounds: cell.bounds });
  }
});

// --- Keep selections visible after zoom/pan ---
map.on('zoomend moveend', function() {
  selectedCells.forEach((entry) => {
    entry.rect.setBounds(entry.bounds);
  });
});

// --- Shift key visual feedback ---
map.getContainer().addEventListener('keydown', e => {
  if (e.key === 'Shift') map.getContainer().style.cursor = 'copy';
});
map.getContainer().addEventListener('keyup', e => {
  if (e.key === 'Shift') map.getContainer().style.cursor = '';
});

// --- Export selected bounds ---
function getSelectedBounds() {
  return Array.from(selectedCells.values()).map(v => v.bounds);
}
window.getSelectedBounds = getSelectedBounds; // accessible from console
