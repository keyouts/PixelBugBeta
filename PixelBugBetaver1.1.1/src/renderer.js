// DOM refs
const $ = sel => document.querySelector(sel);
const canvas = $("#pixel-canvas");
const ctx = canvas.getContext("2d");
const statusBox = $("#status");
const colorPicker = $("#color-picker");
const brushSizeInput = $("#brush-size");
const brushSizeOutput = $("#brush-size-output");
const canvasSizeSelect = $("#canvas-size");
const customSizeBtn = $("#custom-size-btn");
const customSizeOverlay = $("#custom-size-overlay");
const customSizeInput = $("#custom-size-input");
const closeCustomSizeBtn = $("#close-custom-size-btn");
const applyCustomSizeBtn = $("#apply-custom-size-btn");
const frameDurationInput = $("#frame-duration");
const layerOpacityInput = $("#layer-opacity");
const paletteColorWheel = $("#palette-color-wheel");
const paletteHexInput = $("#palette-hex-input");
const palettePresetSelect = $("#palette-preset-select");
const presetNameInput = $("#preset-name-input");
const imageImportInput = $("#image-import-input");
const pixelizeSizeInput = $("#pixelize-size");
const pixelizeSizeOutput = $("#pixelize-size-output");
const pixelizeColorsInput = $("#pixelize-colors");
const pixelizeColorsOutput = $("#pixelize-colors-output");
const pixelizeFitInput = $("#pixelize-fit");
const pixelizePreviewCanvas = $("#pixelize-preview");
const pixelizePreviewCtx = pixelizePreviewCanvas.getContext("2d");
const pixelizerOverlay = $("#pixelizer-overlay");
const openPixelizerBtn = $("#open-pixelizer-btn");
const closePixelizerBtn = $("#close-pixelizer-btn");
const privacyOverlay = $("#privacy-overlay");
const openPrivacyBtn = $("#open-privacy-btn");
const closePrivacyBtn = $("#close-privacy-btn");
const rearrangeBtn = $("#rearrange-btn");
const STORAGE_LAYOUT_KEY = "pixel-bug-beta-layout";
const STORAGE_KEY = "pixel-bug-beta-autosave";


// Tool list
const TOOLS = [
  ["pencil", "Pencil", "B"], ["eraser", "Eraser", "E"], ["fill", "Fill", "G"],
  ["eyedropper", "Pick Color", "I"], ["line", "Line", "L"], ["rect", "Rec", "R"], ["ellipse", "Ellipse", "O"]
];
const DEFAULT_PALETTE = ["#000000", "#ffffff", "#ff0000", "#00aa00", "#0055ff", "#ffff00", "#ff66cc", "#ff9900", "#8b5cf6", "#00c2c7", "#7a4a26", "#777777"];


// App state
let state = freshProject(32);
let tool = "pencil";
let color = "#000000";
let brushSize = 1;
let showGrid = true;
let showOnion = true;
let drawing = false;
let startPixel = null;
let previewLayer = null;
let undoStack = [];
let redoStack = [];
let importedImage = null;
let pixelizedPixels = null;


// Project data
function freshProject(size) {
  return {
    name: "Pixel Bug Beta Project", size, palette: [...DEFAULT_PALETTE], activePalettePreset: 0, palettePresets: [{ name: "Base", colors: [...DEFAULT_PALETTE] }], activeFrame: 0, activeLayer: 0,
    frames: [{ duration: 120, layers: [newLayer(size, "Layer 1")] }]
  };
}
function newLayer(size, name = "Layer") { return { name, visible: true, opacity: 1, pixels: blankPixels(size) }; }
function blankPixels(size) { return Array.from({ length: size }, () => Array.from({ length: size }, () => null)); }
function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function frame() { return state.frames[state.activeFrame]; }
function layer() { return frame().layers[state.activeLayer]; }
function setStatus(msg) { statusBox.textContent = msg; }
function isHexColor(value) { return /^#[0-9a-f]{6}$/i.test(value); }
function syncColorInputs(nextColor = color) { colorPicker.value = nextColor; if (paletteColorWheel) paletteColorWheel.value = nextColor; if (paletteHexInput) paletteHexInput.value = nextColor; }
function saveLocal() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_err) { /* Local autosave is best-effort. */ } }
function loadLocal() { try { const saved = localStorage.getItem(STORAGE_KEY); if (!saved) return false; state = JSON.parse(saved); normalizeProject(); clampActive(); return true; } catch (_err) { return false; } }
function pushHistory() { undoStack.push(clone(state)); if (undoStack.length > 60) undoStack.shift(); redoStack = []; }
function restore(next) { state = next; clampActive(); syncControls(); renderAll(); }
function normalizeProject() {
  if (!Array.isArray(state.palettePresets) || !state.palettePresets.length) {
    state.palettePresets = [{ name: "Base", colors: Array.isArray(state.palette) ? [...state.palette] : [...DEFAULT_PALETTE] }];
  }
  state.palettePresets = state.palettePresets.map((preset, index) => ({
    name: preset.name || `Preset ${index + 1}`,
    colors: Array.isArray(preset.colors) && preset.colors.length ? preset.colors : [...DEFAULT_PALETTE]
  }));
  state.activePalettePreset = Math.max(0, Math.min(Number(state.activePalettePreset) || 0, state.palettePresets.length - 1));
  state.palette = state.palettePresets[state.activePalettePreset].colors;
}
function clampActive() { normalizeProject(); state.activeFrame = Math.max(0, Math.min(state.activeFrame, state.frames.length - 1)); state.activeLayer = Math.max(0, Math.min(state.activeLayer, frame().layers.length - 1)); state.activePalettePreset = Math.max(0, Math.min(state.activePalettePreset || 0, state.palettePresets.length - 1)); state.palette = state.palettePresets[state.activePalettePreset].colors; }
function activePreset() { normalizeProject(); return state.palettePresets[state.activePalettePreset]; }


// Tool UI
function setupTools() {
  const grid = $("#tool-grid");
  grid.innerHTML = "";
  TOOLS.forEach(([id, label, key]) => {
    const b = document.createElement("button");
    b.className = "tool-btn" + (id === tool ? " active" : "");
    b.dataset.tool = id;
    b.type = "button";
    b.setAttribute("aria-pressed", id === tool ? "true" : "false");
    b.setAttribute("aria-label", `${label} tool. Shortcut ${key}.`);
    b.textContent = `${label} ${key}`;
    b.addEventListener("click", () => setTool(id));
    grid.appendChild(b);
  });
}
function toolDisplayName(id) { const match = TOOLS.find(([toolId]) => toolId === id); return match ? match[1].toLowerCase() : id; }
function setTool(id) { tool = id; setupTools(); setStatus(`${toolDisplayName(id)} selected.`); }


// Canvas draw
function renderAll() { drawCanvas(); renderFrames(); renderLayers(); renderPalette(); saveLocal(); }
function cellSize() { return canvas.width / state.size; }
function drawCanvas() {
  const size = state.size, cell = cellSize();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (showOnion && state.activeFrame > 0) drawCompositedFrame(state.frames[state.activeFrame - 1], 0.22);
  drawCompositedFrame(frame(), 1);
  if (previewLayer) drawPixelGrid(previewLayer, 1);
  if (showGrid) drawGrid(size, cell);
}
function drawCompositedFrame(f, alphaMul) { f.layers.forEach(l => { if (l.visible) drawPixelGrid(l.pixels, l.opacity * alphaMul); }); }
function drawPixelGrid(pixels, alpha) {
  const cell = cellSize(); ctx.save(); ctx.globalAlpha = alpha;
  for (let y = 0; y < state.size; y++) for (let x = 0; x < state.size; x++) {
    const c = pixels[y][x]; if (!c) continue; ctx.fillStyle = c; ctx.fillRect(x * cell, y * cell, cell, cell);
  }
  ctx.restore();
}
function drawGrid(size, cell) {
  ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 1;
  for (let i = 0; i <= size; i++) {
    const p = Math.round(i * cell) + .5;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(canvas.width, p); ctx.stroke();
  }
}

// Drawing input
function getPixel(e) {
  const r = canvas.getBoundingClientRect(), c = cellSize();
  return { x: Math.max(0, Math.min(state.size - 1, Math.floor((e.clientX - r.left) * (canvas.width / r.width) / c))), y: Math.max(0, Math.min(state.size - 1, Math.floor((e.clientY - r.top) * (canvas.height / r.height) / c))) };
}
function setPixel(x, y, c, target = layer().pixels) {
  const half = Math.floor(brushSize / 2);
  for (let yy = y - half; yy <= y + half; yy++) for (let xx = x - half; xx <= x + half; xx++) {
    if (xx >= 0 && yy >= 0 && xx < state.size && yy < state.size) target[yy][xx] = c;
  }
}
function beginDraw(e) { drawing = true; startPixel = getPixel(e); pushHistory(); applyTool(e, true); canvas.setPointerCapture(e.pointerId); }
function moveDraw(e) {
  if (!drawing) return;
  if (["line", "rect", "ellipse"].includes(tool)) { previewShape(getShapeEnd(e)); return; }
  applyTool(e, false);
}
function endDraw(e) {
  if (!drawing) return;
  if (["line", "rect", "ellipse"].includes(tool)) { drawShape(startPixel, getShapeEnd(e), layer().pixels); previewLayer = null; }
  drawing = false;
  drawCanvas();
  renderFrames();
  saveLocal();
}
function getShapeEnd(e) {
  const p = getPixel(e);
  if (!e.ctrlKey || !startPixel) return p;

  if (tool === "line") return snapLineEnd(p);
  if (tool === "rect" || tool === "ellipse") return snapBoxEnd(p);

  return p;
}
function clampPixelPoint(x, y) {
  return {
    x: Math.max(0, Math.min(state.size - 1, x)),
    y: Math.max(0, Math.min(state.size - 1, y))
  };
}
function snapBoxEnd(p) {
  const dx = p.x - startPixel.x;
  const dy = p.y - startPixel.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return clampPixelPoint(
    startPixel.x + Math.sign(dx || 1) * size,
    startPixel.y + Math.sign(dy || 1) * size
  );
}
function snapLineEnd(p) {
  const dx = p.x - startPixel.x;
  const dy = p.y - startPixel.y;
  if (dx === 0 && dy === 0) return p;

  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  const length = Math.max(Math.abs(dx), Math.abs(dy));

  return clampPixelPoint(
    Math.round(startPixel.x + Math.cos(snapped) * length),
    Math.round(startPixel.y + Math.sin(snapped) * length)
  );
}
function applyTool(e, initial) {
  const p = getPixel(e), l = layer().pixels;
  if (tool === "pencil") setPixel(p.x, p.y, color, l);
  if (tool === "eraser") setPixel(p.x, p.y, null, l);
  if (tool === "fill" && initial) floodFill(p.x, p.y, l[p.y][p.x], color, l);
  if (tool === "eyedropper" && initial) pickColor(p.x, p.y);
  drawCanvas();
}
function previewShape(end) { previewLayer = blankPixels(state.size); drawShape(startPixel, end, previewLayer); drawCanvas(); }
function drawShape(a, b, target) {
  if (tool === "line") drawLine(a.x, a.y, b.x, b.y, target);
  if (tool === "rect") drawRect(a.x, a.y, b.x, b.y, target);
  if (tool === "ellipse") drawEllipse(a.x, a.y, b.x, b.y, target);
}
function drawLine(x0, y0, x1, y1, target) {
  let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1, err = dx + dy;
  while (true) { setPixel(x0, y0, color, target); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
}
function drawRect(x0, y0, x1, y1, target) {
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
  for (let x = minX; x <= maxX; x++) { setPixel(x, minY, color, target); setPixel(x, maxY, color, target); }
  for (let y = minY; y <= maxY; y++) { setPixel(minX, y, color, target); setPixel(maxX, y, color, target); }
}
function drawEllipse(x0, y0, x1, y1, target) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.max(1, Math.abs(x1 - x0) / 2), ry = Math.max(1, Math.abs(y1 - y0) / 2);
  for (let t = 0; t < Math.PI * 2; t += 0.01) setPixel(Math.round(cx + Math.cos(t) * rx), Math.round(cy + Math.sin(t) * ry), color, target);
}
function floodFill(x, y, target, replacement, pixels) {
  if (target === replacement) return; const stack = [[x, y]];
  while (stack.length) { const [cx, cy] = stack.pop(); if (cx < 0 || cy < 0 || cx >= state.size || cy >= state.size || pixels[cy][cx] !== target) continue; pixels[cy][cx] = replacement; stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]); }
}
function pickColor(x, y) {
  for (let i = frame().layers.length - 1; i >= 0; i--) { const l = frame().layers[i]; if (l.visible && l.pixels[y][x]) { color = l.pixels[y][x]; syncColorInputs(color); setStatus(`Picked ${color}.`); return; } }
}


// Side panels
function renderFrames() {
  const list = $("#frames-list"); list.innerHTML = "";
  state.frames.forEach((f, i) => { const row = document.createElement("div"); row.className = "frame-row" + (i === state.activeFrame ? " active" : ""); row.innerHTML = `<button class="frame-chip" aria-label="Select frame ${i + 1}">${i + 1}</button><span>Frame ${i + 1}</span><small>${f.duration}ms</small>`; row.onclick = () => { state.activeFrame = i; clampActive(); syncControls(); renderAll(); }; list.appendChild(row); });
}
function renderLayers() {
  const list = $("#layers-list"); list.innerHTML = "";
  frame().layers.forEach((l, i) => { const row = document.createElement("div"); row.className = "layer-row" + (i === state.activeLayer ? " active" : ""); row.innerHTML = `<button class="layer-eye" aria-label="Toggle visibility for ${l.name}">${l.visible ? "●" : "○"}</button><input aria-label="Layer name" value="${escapeHtml(l.name)}"><small>${Math.round(l.opacity*100)}%</small>`; row.onclick = e => { if (!e.target.classList.contains("layer-eye") && e.target.tagName !== "INPUT") { state.activeLayer = i; syncControls(); renderAll(); } }; row.querySelector(".layer-eye").onclick = e => { e.stopPropagation(); pushHistory(); l.visible = !l.visible; renderAll(); }; row.querySelector("input").onchange = e => { pushHistory(); l.name = e.target.value || `Layer ${i+1}`; renderAll(); }; list.appendChild(row); });
}
function escapeHtml(s) { return s.replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[ch])); }
function renderPalette() {
  const preset = activePreset();
  state.palette = preset.colors;
  if (presetNameInput) presetNameInput.value = preset.name;
  palettePresetSelect.innerHTML = "";
  state.palettePresets.forEach((item, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = item.name;
    option.selected = index === state.activePalettePreset;
    palettePresetSelect.appendChild(option);
  });
  const p = $("#palette");
  p.innerHTML = "";
  preset.colors.forEach((c, index) => {
    const wrap = document.createElement("div");
    wrap.className = "swatch-wrap";
    const b = document.createElement("button");
    b.className = "swatch" + (c.toLowerCase() === color.toLowerCase() ? " active" : "");
    b.style.background = c;
    b.setAttribute("aria-label", `Use color ${c}`);
    b.onclick = () => { color = c; syncColorInputs(c); renderPalette(); };
    const remove = document.createElement("button");
    remove.className = "swatch-remove";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${c} from ${preset.name}`);
    remove.onclick = event => { event.stopPropagation(); removeColorFromPreset(index); };
    wrap.appendChild(b);
    wrap.appendChild(remove);
    p.appendChild(wrap);
  });
}
function syncControls() {
  const sizeOption = Array.from(canvasSizeSelect.options).some(option => option.value === String(state.size));
  canvasSizeSelect.value = sizeOption ? String(state.size) : "";
  frameDurationInput.value = frame().duration;
  layerOpacityInput.value = Math.round(layer().opacity * 100);
  syncColorInputs(color);
}


// Image pixelizer
function quantizeChannel(value, levels) {
  if (levels <= 1) return value < 128 ? 0 : 255;
  return Math.round(Math.round((value / 255) * (levels - 1)) * (255 / (levels - 1)));
}
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}
function updatePixelizerLabels() {
  const size = Number(pixelizeSizeInput.value);
  const levels = Number(pixelizeColorsInput.value);
  pixelizeSizeOutput.textContent = `${size} × ${size}`;
  pixelizeColorsOutput.textContent = `${levels} levels`;
}
function clearPixelizerPreview(message = "Upload an image to pixelize.") {
  pixelizePreviewCtx.clearRect(0, 0, pixelizePreviewCanvas.width, pixelizePreviewCanvas.height);
  pixelizePreviewCtx.fillStyle = "#fff";
  pixelizePreviewCtx.fillRect(0, 0, pixelizePreviewCanvas.width, pixelizePreviewCanvas.height);
  pixelizePreviewCtx.fillStyle = "#000";
  pixelizePreviewCtx.font = "bold 12px system-ui, sans-serif";
  pixelizePreviewCtx.textAlign = "center";
  pixelizePreviewCtx.fillText(message, pixelizePreviewCanvas.width / 2, pixelizePreviewCanvas.height / 2);
}
function makePixelizedPixels() {
  if (!importedImage) return null;
  const target = Number(pixelizeSizeInput.value);
  const levels = Number(pixelizeColorsInput.value);
  const fit = pixelizeFitInput.checked;
  const tmp = document.createElement("canvas");
  tmp.width = target;
  tmp.height = target;
  const tx = tmp.getContext("2d", { willReadFrequently: true });
  tx.imageSmoothingEnabled = true;
  tx.clearRect(0, 0, target, target);

  let dw = target, dh = target, dx = 0, dy = 0;
  const imgRatio = importedImage.width / importedImage.height;
  if (fit) {
    if (imgRatio >= 1) { dw = target; dh = Math.max(1, Math.round(target / imgRatio)); dy = Math.floor((target - dh) / 2); }
    else { dh = target; dw = Math.max(1, Math.round(target * imgRatio)); dx = Math.floor((target - dw) / 2); }
  }
  tx.drawImage(importedImage, dx, dy, dw, dh);
  const data = tx.getImageData(0, 0, target, target);
  const out = Array.from({ length: target }, () => Array.from({ length: target }, () => null));
  for (let y = 0; y < target; y++) {
    for (let x = 0; x < target; x++) {
      const idx = (y * target + x) * 4;
      const a = data.data[idx + 3];
      if (a < 20) continue;
      const r = quantizeChannel(data.data[idx], levels);
      const g = quantizeChannel(data.data[idx + 1], levels);
      const b = quantizeChannel(data.data[idx + 2], levels);
      out[y][x] = rgbToHex(r, g, b);
    }
  }
  return out;
}
function drawPixelizerPreview() {
  updatePixelizerLabels();
  pixelizedPixels = makePixelizedPixels();
  pixelizePreviewCtx.imageSmoothingEnabled = false;
  pixelizePreviewCtx.clearRect(0, 0, pixelizePreviewCanvas.width, pixelizePreviewCanvas.height);
  pixelizePreviewCtx.fillStyle = "#fff";
  pixelizePreviewCtx.fillRect(0, 0, pixelizePreviewCanvas.width, pixelizePreviewCanvas.height);
  if (!pixelizedPixels) return clearPixelizerPreview();
  const size = pixelizedPixels.length;
  const scale = pixelizePreviewCanvas.width / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = pixelizedPixels[y][x];
      if (!c) continue;
      pixelizePreviewCtx.fillStyle = c;
      pixelizePreviewCtx.fillRect(Math.floor(x * scale), Math.floor(y * scale), Math.ceil(scale), Math.ceil(scale));
    }
  }
}
function resamplePixelsToProject(sourcePixels, targetSize) {
  const sourceSize = sourcePixels.length;
  const out = blankPixels(targetSize);
  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      const sx = Math.min(sourceSize - 1, Math.floor((x / targetSize) * sourceSize));
      const sy = Math.min(sourceSize - 1, Math.floor((y / targetSize) * sourceSize));
      out[y][x] = sourcePixels[sy][sx];
    }
  }
  return out;
}
function importPixelizedImage() {
  if (!pixelizedPixels) drawPixelizerPreview();
  if (!pixelizedPixels) return setStatus("Upload an image before importing.");
  pushHistory();
  layer().pixels = resamplePixelsToProject(pixelizedPixels, state.size);
  const colors = new Set(state.palette.map(c => c.toLowerCase()));
  pixelizedPixels.flat().forEach(c => { if (c && !colors.has(c.toLowerCase()) && state.palette.length < 64) { colors.add(c.toLowerCase()); state.palette.push(c); } });
  renderAll();
  setStatus("Pixelized image imported into the active layer.");
}
function loadImageFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      importedImage = img;
      drawPixelizerPreview();
      setStatus(`Loaded ${file.name} for pixelizing.`);
    };
    img.onerror = () => setStatus("That image could not be loaded.");
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}



// Frame layer
function addFrame(copy=false) { pushHistory(); const f = copy ? clone(frame()) : { duration: Number(frameDurationInput.value) || 120, layers: [newLayer(state.size, "Layer 1")] }; state.frames.splice(state.activeFrame + 1, 0, f); state.activeFrame++; state.activeLayer = 0; renderAll(); }
function deleteFrame() { if (state.frames.length === 1) return setStatus("At least one frame is required."); pushHistory(); state.frames.splice(state.activeFrame, 1); clampActive(); renderAll(); }
function addLayer(copy=false) { pushHistory(); const l = copy ? clone(layer()) : newLayer(state.size, `Layer ${frame().layers.length + 1}`); frame().layers.splice(state.activeLayer + 1, 0, l); state.activeLayer++; renderAll(); }
function deleteLayer() { if (frame().layers.length === 1) return setStatus("At least one layer is required."); pushHistory(); frame().layers.splice(state.activeLayer, 1); clampActive(); renderAll(); }
function moveLayer(dir) { const layers = frame().layers, i = state.activeLayer, j = i + dir; if (j < 0 || j >= layers.length) return; pushHistory(); [layers[i], layers[j]] = [layers[j], layers[i]]; state.activeLayer = j; renderAll(); }
function resizePixels(pixels, nextSize) {
  const next = blankPixels(nextSize);
  const copySize = Math.min(pixels.length, nextSize);
  for (let y = 0; y < copySize; y++) {
    for (let x = 0; x < copySize; x++) {
      next[y][x] = pixels[y][x];
    }
  }
  return next;
}

function resizeProject(size) {
  if (!Number.isInteger(size) || size < 1) return setStatus("Use a valid canvas size.");
  if (size === state.size) return;
  pushHistory();
  state.size = size;
  state.frames.forEach(projectFrame => {
    projectFrame.layers.forEach(projectLayer => {
      projectLayer.pixels = resizePixels(projectLayer.pixels, size);
    });
  });
  syncControls();
  renderAll();
  setStatus(`Resized to ${size} by ${size}.`);
}

function resetProject(size) {
  pushHistory();
  state = freshProject(size);
  syncControls();
  renderAll();
  setStatus(`New ${size} by ${size} project.`);
}


// Palette presets
function addColorToPreset() {
  const next = (paletteHexInput.value || paletteColorWheel.value || color).trim().toLowerCase();
  if (!isHexColor(next)) return setStatus("Use a valid #RRGGBB color.");
  const preset = activePreset();
  color = next;
  syncColorInputs(color);
  if (preset.colors.some(c => c.toLowerCase() === color)) {
    renderPalette();
    return setStatus(`${color} is already in ${preset.name}.`);
  }
  pushHistory();
  preset.colors.push(color);
  state.palette = preset.colors;
  renderPalette();
  saveLocal();
  setStatus(`Added ${color} to ${preset.name}.`);
}
function removeColorFromPreset(index) {
  const preset = activePreset();
  if (preset.colors.length <= 1) return setStatus("Preset needs at least one color.");
  const removed = preset.colors.splice(index, 1)[0];
  state.palette = preset.colors;
  renderPalette();
  saveLocal();
  setStatus(`Removed ${removed}.`);
}
function uniquePresetName(baseName) {
  const base = (baseName || "Preset").trim() || "Preset";
  const names = new Set(state.palettePresets.map(p => p.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let i = 2;
  while (names.has(`${base} ${i}`.toLowerCase())) i++;
  return `${base} ${i}`;
}
function createPreset() {
  const typedName = presetNameInput ? presetNameInput.value.trim() : "";
  const defaultName = `Preset ${state.palettePresets.length + 1}`;
  const name = uniquePresetName(typedName && typedName !== activePreset().name ? typedName : defaultName);
  pushHistory();
  state.palettePresets.push({ name, colors: [color] });
  state.activePalettePreset = state.palettePresets.length - 1;
  state.palette = activePreset().colors;
  renderPalette();
  saveLocal();
  setStatus(`Created ${name}.`);
}
function renamePreset() {
  const preset = activePreset();
  const typedName = presetNameInput ? presetNameInput.value.trim() : "";
  if (!typedName) return setStatus("Type a preset name first.");
  if (typedName === preset.name) return setStatus("Type a new name first.");
  pushHistory();
  preset.name = uniquePresetName(typedName);
  renderPalette();
  saveLocal();
  setStatus(`Renamed preset to ${preset.name}.`);
}
function deletePreset() {
  if (state.palettePresets.length <= 1) return setStatus("At least one preset is required.");
  const preset = activePreset();
  if (!confirm(`Delete ${preset.name}?`)) return;
  pushHistory();
  state.palettePresets.splice(state.activePalettePreset, 1);
  state.activePalettePreset = Math.max(0, state.activePalettePreset - 1);
  state.palette = activePreset().colors;
  renderPalette();
  saveLocal();
  setStatus("Preset deleted.");
}
function switchPreset(index) {
  state.activePalettePreset = Number(index);
  state.palette = activePreset().colors;
  if (state.palette.length) color = state.palette[0];
  syncColorInputs(color);
  renderPalette();
  saveLocal();
  setStatus(`Using ${activePreset().name}.`);
}


// Privacy modal
function openPrivacyModal() {
  privacyOverlay.hidden = false;
  openPrivacyBtn.setAttribute("aria-expanded", "true");
  closePrivacyBtn.focus();
}
function closePrivacyModal() {
  privacyOverlay.hidden = true;
  openPrivacyBtn.setAttribute("aria-expanded", "false");
  openPrivacyBtn.focus();
}


// Export helpers
function flattenedPixels(f) { const out = blankPixels(state.size); f.layers.forEach(l => { if (!l.visible) return; for (let y=0;y<state.size;y++) for (let x=0;x<state.size;x++) if (l.pixels[y][x]) out[y][x] = l.pixels[y][x]; }); return out; }
function pixelsToCanvas(pixels, scale=1) { const c = document.createElement("canvas"); c.width = state.size * scale; c.height = state.size * scale; const cx = c.getContext("2d"); cx.imageSmoothingEnabled = false; for (let y=0;y<state.size;y++) for (let x=0;x<state.size;x++) if (pixels[y][x]) { cx.fillStyle = pixels[y][x]; cx.fillRect(x*scale,y*scale,scale,scale); } return c; }
function dataUrlBase64(url) { return url.replace(/^data:image\/\w+;base64,/, ""); }
async function exportPNG() { const c = pixelsToCanvas(flattenedPixels(frame()), 1); await saveBase64("Export PNG", "pixel-bug-frame.png", "PNG Image", "png", dataUrlBase64(c.toDataURL("image/png"))); }
async function exportSheet() { const sheet = document.createElement("canvas"); sheet.width = state.size * state.frames.length; sheet.height = state.size; const sx = sheet.getContext("2d"); sx.imageSmoothingEnabled = false; state.frames.forEach((f,i)=>sx.drawImage(pixelsToCanvas(flattenedPixels(f),1), i*state.size, 0)); await saveBase64("Export Spritesheet", "pixel-bug-sheet.png", "PNG Image", "png", dataUrlBase64(sheet.toDataURL("image/png"))); }
async function saveBase64(title, defaultPath, name, ext, data) { const res = await window.pixelBug.saveFile({ title, defaultPath, filters:[{name, extensions:[ext]}], data, encoding:"base64" }); setStatus(res.ok ? `Saved ${defaultPath}.` : "Save cancelled."); }
async function saveProject() { const res = await window.pixelBug.saveFile({ title:"Save Pixel Bug Beta Project", defaultPath:"project.pxbuild", filters:[{name:"Pixel Bug Beta Project", extensions:["pxbuild"]}], data: JSON.stringify(state, null, 2) }); if (res.ok) saveLocal(); setStatus(res.ok ? "Project saved." : "Save cancelled."); }
async function openProject() { const res = await window.pixelBug.openProject(); if (!res.ok) return setStatus("Open cancelled."); const parsed = JSON.parse(res.text); state = parsed; normalizeProject(); clampActive(); undoStack=[]; redoStack=[]; syncControls(); renderAll(); saveLocal(); setStatus("Project opened."); }
async function exportGIF() { const gifBytes = encodeGif(state.frames.map(f => ({ pixels: flattenedPixels(f), delay: Math.max(2, Math.round(f.duration / 10)) })), state.size, state.size); const b64 = bytesToBase64(gifBytes); await saveBase64("Export Animated GIF", "pixel-bug-animation.gif", "GIF Image", "gif", b64); }
function bytesToBase64(bytes) { let bin=""; bytes.forEach(b=>bin+=String.fromCharCode(b)); return btoa(bin); }
function hexToRgb(hex) { const n = parseInt(hex.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; }
function collectPalette(frames) { const colors = [null]; const seen = new Set(); frames.forEach(f => f.pixels.flat().forEach(c => { if (c && !seen.has(c)) { seen.add(c); colors.push(c); } })); while (colors.length < 256) colors.push("#000000"); return colors.slice(0,256); }
function encodeGif(frames, w, h) {
  const pal = collectPalette(frames), colorIndex = new Map(); pal.forEach((c,i)=>{ if(c) colorIndex.set(c,i); }); const out=[]; const str=s=>[...s].forEach(ch=>out.push(ch.charCodeAt(0))); const word=n=>{out.push(n&255,(n>>8)&255);};
  str("GIF89a"); word(w); word(h); out.push(0xF7,0,0); pal.forEach(c=>{ const [r,g,b]=c?hexToRgb(c):[0,0,0]; out.push(r,g,b); });
  out.push(0x21,0xFF,11); str("NETSCAPE2.0"); out.push(3,1,0,0,0);
  frames.forEach(f=>{ out.push(0x21,0xF9,4,0x09); word(f.delay); out.push(0,0); out.push(0x2C); word(0); word(0); word(w); word(h); out.push(0); out.push(8); const idx=[]; for(let y=0;y<h;y++) for(let x=0;x<w;x++) idx.push(colorIndex.get(f.pixels[y][x]) ?? 0); const data = lzwEncode(idx, 8); for(let i=0;i<data.length;i+=255){ const chunk=data.slice(i,i+255); out.push(chunk.length,...chunk); } out.push(0); });
  out.push(0x3B); return new Uint8Array(out);
}
function lzwEncode(indices, minCodeSize) {
  const clear=1<<minCodeSize, end=clear+1; let codeSize=minCodeSize+1, dict=new Map(), next=end+1, bits=[]; const reset=()=>{dict=new Map(); for(let i=0;i<clear;i++)dict.set(String(i),i); next=end+1; codeSize=minCodeSize+1;}; const write=code=>{ for(let i=0;i<codeSize;i++) bits.push((code>>i)&1); }; reset(); write(clear); let phrase=String(indices[0] ?? 0);
  for(let i=1;i<indices.length;i++){ const k=indices[i], combo=phrase+","+k; if(dict.has(combo)) phrase=combo; else { write(dict.get(phrase)); if(next<4096){ dict.set(combo,next++); if(next === (1<<codeSize) && codeSize<12) codeSize++; } else { write(clear); reset(); } phrase=String(k); } }
  write(dict.get(phrase)); write(end); const bytes=[]; for(let i=0;i<bits.length;i+=8){ let b=0; for(let j=0;j<8;j++) if(bits[i+j]) b|=1<<j; bytes.push(b); } return bytes;
}


// Layout tools
let rearrangeMode = false;
let draggedDockCard = null;
let autoScrollFrame = null;
let latestDragEvent = null;

function dockZones() {
  return Array.from(document.querySelectorAll(".rearrange-zone"));
}

function dockCards() {
  return Array.from(document.querySelectorAll(".dock-card"));
}

function saveDockLayout() {
  const layout = {};
  dockZones().forEach(zone => {
    layout[zone.dataset.zone] = Array.from(zone.querySelectorAll(".dock-card")).map(card => card.dataset.dockId);
  });
  localStorage.setItem(STORAGE_LAYOUT_KEY, JSON.stringify(layout));
}

function loadDockLayout() {
  try {
    const layout = JSON.parse(localStorage.getItem(STORAGE_LAYOUT_KEY) || "{}");
    dockZones().forEach(zone => {
      const ids = layout[zone.dataset.zone];
      if (!Array.isArray(ids)) return;
      ids.forEach(id => {
        const card = zone.querySelector(`[data-dock-id="${id}"]`);
        if (card) zone.appendChild(card);
      });
    });
  } catch (_err) {
    /* Layout restore is best-effort. */
  }
}

function setRearrangeMode(enabled) {
  rearrangeMode = enabled;
  document.body.classList.toggle("rearrange-mode", enabled);
  rearrangeBtn.setAttribute("aria-pressed", String(enabled));
  rearrangeBtn.textContent = enabled ? "Done" : "Rearrange";
  dockCards().forEach(card => card.draggable = enabled);
  setStatus(enabled ? "Rearrange side panels. Canvas stays fixed." : "Layout saved.");
  if (!enabled) saveDockLayout();
}

function cardAfterPointer(zone, y) {
  const cards = Array.from(zone.querySelectorAll(".dock-card:not(.dragging)"));
  return cards.reduce((closest, card) => {
    const box = card.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, card };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, card: null }).card;
}

function stopDockAutoScroll() {
  if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame);
  autoScrollFrame = null;
  latestDragEvent = null;
}

function runDockAutoScroll() {
  if (!latestDragEvent || !rearrangeMode) return stopDockAutoScroll();

  const margin = 82;
  const maxSpeed = 18;
  const y = latestDragEvent.clientY;
  const zones = dockZones();
  const activeZone = zones.find(zone => {
    const box = zone.getBoundingClientRect();
    return latestDragEvent.clientX >= box.left && latestDragEvent.clientX <= box.right;
  });

  let target = null;
  let delta = 0;

  if (activeZone) {
    const box = activeZone.getBoundingClientRect();
    const canScroll = activeZone.scrollHeight > activeZone.clientHeight;
    if (canScroll && y < box.top + margin) {
      target = activeZone;
      delta = -Math.ceil(maxSpeed * (1 - Math.max(0, y - box.top) / margin));
    } else if (canScroll && y > box.bottom - margin) {
      target = activeZone;
      delta = Math.ceil(maxSpeed * (1 - Math.max(0, box.bottom - y) / margin));
    }
  }

  if (!target && y < margin) {
    target = document.scrollingElement || document.documentElement;
    delta = -Math.ceil(maxSpeed * (1 - Math.max(0, y) / margin));
  } else if (!target && y > window.innerHeight - margin) {
    target = document.scrollingElement || document.documentElement;
    delta = Math.ceil(maxSpeed * (1 - Math.max(0, window.innerHeight - y) / margin));
  }

  if (target && delta) target.scrollTop += delta;
  autoScrollFrame = requestAnimationFrame(runDockAutoScroll);
}

function setupDockRearrange() {
  dockCards().forEach(card => {
    card.addEventListener("dragstart", event => {
      if (!rearrangeMode) return event.preventDefault();
      draggedDockCard = card;
      card.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", card.dataset.dockId || "dock-card");
      setStatus("Drag blocks within or between the sidebars.");
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      dockCards().forEach(item => item.classList.remove("drag-over"));
      draggedDockCard = null;
      stopDockAutoScroll();
      if (rearrangeMode) saveDockLayout();
    });
  });

  dockZones().forEach(zone => {
    zone.addEventListener("dragenter", event => {
      if (!rearrangeMode || !draggedDockCard) return;
      event.preventDefault();
      zone.classList.add("zone-ready");
    });

    zone.addEventListener("dragleave", event => {
      if (!zone.contains(event.relatedTarget)) zone.classList.remove("zone-ready");
    });

    zone.addEventListener("dragover", event => {
      if (!rearrangeMode || !draggedDockCard) return;
      event.preventDefault();
      latestDragEvent = event;
      if (!autoScrollFrame) autoScrollFrame = requestAnimationFrame(runDockAutoScroll);

      const after = cardAfterPointer(zone, event.clientY);
      if (after == null) zone.appendChild(draggedDockCard);
      else zone.insertBefore(draggedDockCard, after);
    });

    zone.addEventListener("drop", event => {
      if (!rearrangeMode || !draggedDockCard) return;
      event.preventDefault();
      zone.classList.remove("zone-ready");
      saveDockLayout();
    });
  });
}



// Modal controls
function openPixelizerModal() {
  pixelizerOverlay.hidden = false;
  openPixelizerBtn.setAttribute("aria-expanded", "true");
  setTimeout(() => imageImportInput.focus(), 0);
}
function closePixelizerModal() {
  pixelizerOverlay.hidden = true;
  openPixelizerBtn.setAttribute("aria-expanded", "false");
  openPixelizerBtn.focus();
}

function openCustomSizeModal() {
  customSizeInput.value = state.size;
  customSizeOverlay.hidden = false;
  customSizeBtn.setAttribute("aria-expanded", "true");
  setTimeout(() => customSizeInput.focus(), 0);
}

function closeCustomSizeModal() {
  customSizeOverlay.hidden = true;
  customSizeBtn.setAttribute("aria-expanded", "false");
  customSizeBtn.focus();
}

function applyCustomSize() {
  const nextSize = Math.floor(Number(customSizeInput.value));
  if (!Number.isInteger(nextSize) || nextSize < 1 || nextSize > 2048) {
    return setStatus("Custom size must be between 1 and 2048.");
  }
  closeCustomSizeModal();
  resizeProject(nextSize);
}

// Event wiring
canvas.addEventListener("pointerdown", beginDraw); canvas.addEventListener("pointermove", moveDraw); canvas.addEventListener("pointerup", endDraw); canvas.addEventListener("pointerleave", endDraw);
colorPicker.oninput = e => { color = e.target.value; syncColorInputs(color); renderPalette(); saveLocal(); };
paletteColorWheel.oninput = e => { color = e.target.value; syncColorInputs(color); renderPalette(); };
paletteHexInput.oninput = e => { const next = e.target.value.trim(); if (isHexColor(next)) { color = next; syncColorInputs(color); renderPalette(); } };
brushSizeInput.oninput = e => { brushSize = Number(e.target.value); brushSizeOutput.textContent = `${brushSize} px`; };
canvasSizeSelect.onchange = e => resizeProject(Number(e.target.value));
frameDurationInput.onchange = e => { pushHistory(); frame().duration = Number(e.target.value) || 120; renderFrames(); saveLocal(); };
layerOpacityInput.oninput = e => { layer().opacity = Number(e.target.value)/100; drawCanvas(); renderLayers(); };
layerOpacityInput.onchange = () => { pushHistory(); saveLocal(); };
$("#toggle-grid-btn").onclick = e => { showGrid=!showGrid; e.target.textContent=showGrid?"Grid On":"Grid Off"; e.target.setAttribute("aria-pressed", String(showGrid)); drawCanvas(); saveLocal(); };
$("#toggle-onion-btn").onclick = e => { showOnion=!showOnion; e.target.textContent=showOnion?"Onion On":"Onion Off"; e.target.setAttribute("aria-pressed", String(showOnion)); drawCanvas(); saveLocal(); };
$("#undo-btn").onclick = () => { if(!undoStack.length) return; redoStack.push(clone(state)); restore(undoStack.pop()); };
$("#redo-btn").onclick = () => { if(!redoStack.length) return; undoStack.push(clone(state)); restore(redoStack.pop()); };
$("#new-project-btn").onclick = () => resetProject(state.size); $("#save-project-btn").onclick = saveProject; $("#open-project-btn").onclick = openProject; $("#export-png-btn").onclick = exportPNG; $("#export-sheet-btn").onclick = exportSheet; $("#export-gif-btn").onclick = exportGIF;
$("#add-frame-btn").onclick = () => addFrame(false); $("#duplicate-frame-btn").onclick = () => addFrame(true); $("#delete-frame-btn").onclick = deleteFrame;
$("#add-layer-btn").onclick = () => addLayer(false); $("#duplicate-layer-btn").onclick = () => addLayer(true); $("#delete-layer-btn").onclick = deleteLayer; $("#layer-up-btn").onclick = () => moveLayer(1); $("#layer-down-btn").onclick = () => moveLayer(-1);
openPixelizerBtn.setAttribute("aria-haspopup", "dialog");
openPixelizerBtn.setAttribute("aria-expanded", "false");
openPixelizerBtn.onclick = openPixelizerModal;
closePixelizerBtn.onclick = closePixelizerModal;
pixelizerOverlay.addEventListener("click", e => { if (e.target === pixelizerOverlay) closePixelizerModal(); });
customSizeBtn.setAttribute("aria-haspopup", "dialog");
customSizeBtn.setAttribute("aria-expanded", "false");
customSizeBtn.onclick = openCustomSizeModal;
closeCustomSizeBtn.onclick = closeCustomSizeModal;
applyCustomSizeBtn.onclick = applyCustomSize;
customSizeInput.addEventListener("keydown", e => { if (e.key === "Enter") applyCustomSize(); });
customSizeOverlay.addEventListener("click", e => { if (e.target === customSizeOverlay) closeCustomSizeModal(); });
$("#add-palette-btn").onclick = addColorToPreset;
palettePresetSelect.onchange = e => switchPreset(e.target.value);
$("#new-preset-btn").onclick = createPreset;
$("#rename-preset-btn").onclick = renamePreset;
$("#delete-preset-btn").onclick = deletePreset;
rearrangeBtn.onclick = () => setRearrangeMode(!rearrangeMode);
openPrivacyBtn.setAttribute("aria-haspopup", "dialog");
openPrivacyBtn.setAttribute("aria-expanded", "false");
openPrivacyBtn.onclick = openPrivacyModal;
closePrivacyBtn.onclick = closePrivacyModal;
privacyOverlay.addEventListener("click", e => { if (e.target === privacyOverlay) closePrivacyModal(); });
imageImportInput.onchange = e => loadImageFile(e.target.files[0]);
pixelizeSizeInput.oninput = () => { updatePixelizerLabels(); if (importedImage) drawPixelizerPreview(); };
pixelizeColorsInput.oninput = () => { updatePixelizerLabels(); if (importedImage) drawPixelizerPreview(); };
pixelizeFitInput.onchange = () => { if (importedImage) drawPixelizerPreview(); };
$("#pixelize-import-btn").onclick = importPixelizedImage;
window.addEventListener("keydown", e => { if(e.key === "Escape" && !pixelizerOverlay.hidden) { closePixelizerModal(); return; } if(e.key === "Escape" && !customSizeOverlay.hidden) { closeCustomSizeModal(); return; } if(e.key === "Escape" && !privacyOverlay.hidden) { closePrivacyModal(); return; } const mod=e.ctrlKey||e.metaKey; if(mod&&e.key.toLowerCase()==="s"){e.preventDefault();saveProject();} if(mod&&e.key.toLowerCase()==="o"){e.preventDefault();openProject();} if(mod&&e.key.toLowerCase()==="z"){e.preventDefault(); e.shiftKey ? $("#redo-btn").click() : $("#undo-btn").click();} if(mod&&e.key.toLowerCase()==="y"){e.preventDefault();$("#redo-btn").click();} const map={b:"pencil",e:"eraser",g:"fill",i:"eyedropper",l:"line",r:"rect",o:"ellipse"}; if(!mod && map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]); });
loadDockLayout();
setupDockRearrange();
if (loadLocal()) setStatus("Restored local autosave.");
setupTools(); syncControls(); updatePixelizerLabels(); clearPixelizerPreview(); renderAll();
