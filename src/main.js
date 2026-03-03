import { renderBokeh } from './bokehEngine.js';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const RENDER_DEBOUNCE_MS = 180;
const SAMPLE_IMAGE_URL = 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=800&q=80'; // forest lights, good for bokeh

const state = {
  image: null,
  objectUrl: null,
  options: {
    maxDimension: 1200,
    blurStrength: 12,
    bokehSize: 8,
    threshold: 0.65,
    intensity: 1.2,
    sizeVariation: 0,
    intensityVariation: 0,
    softBokeh: 0,
    vignette: 0,
    blurQuality: 'standard',
    saturationWeight: 0,
    bokehDensity: 1,
    maxBokehCount: 800,
    sampleDetail: 0.5,
    thresholdSoftness: 0,
    bokehRotation: 0,
    bokehRotationRandom: false,
    chromaticAberration: 0,
    shape: 'circle',
    colorStyle: 'natural',
  },
  viewMode: 'split',
  viewerZoom: 'fit',
  rendering: false,
  renderDebounceTimer: null,
  renderId: 0,
};
const LAST_OPTIONS_KEY = 'boken-last-options';
const OPTIONS_SAVE_DEBOUNCE_MS = 800;
let optionsSaveTimer = null;

const PRESETS = {
  portrait: { blurStrength: 18, bokehSize: 10, threshold: 0.6, intensity: 1.4, shape: 'circle', colorStyle: 'warm' },
  landscape: { blurStrength: 14, bokehSize: 12, threshold: 0.55, intensity: 1.1, shape: 'hexagon', colorStyle: 'natural' },
  dramatic: { blurStrength: 28, bokehSize: 16, threshold: 0.5, intensity: 1.8, shape: 'circle', colorStyle: 'cinematic' },
  subtle: { blurStrength: 6, bokehSize: 5, threshold: 0.75, intensity: 0.7, shape: 'circle', colorStyle: 'pastel' },
  vintage: { blurStrength: 22, bokehSize: 14, threshold: 0.58, intensity: 1.3, shape: 'pentagon', colorStyle: 'vintage' },
};

const $ = (id) => document.getElementById(id);
const uploadZone = $('uploadZone');
const fileInput = $('fileInput');
const urlInput = $('urlInput');
const browseBtn = $('browseBtn');
const workspace = $('workspace');
const originalImg = $('originalImg');
const resultCanvas = $('resultCanvas');
const comparison = $('comparison');
const comparisonSlider = $('comparisonSlider');
const comparisonBefore = $('comparisonBefore');
const comparisonAfter = $('comparisonAfter');

const blurStrengthEl = $('blurStrength');
const bokehSizeEl = $('bokehSize');
const thresholdEl = $('threshold');
const intensityEl = $('intensity');
const sizeVariationEl = $('sizeVariation');
const intensityVariationEl = $('intensityVariation');
const bokehShapeEl = $('bokehShape');
const colorStyleEl = $('colorStyle');
const softBokehEl = $('softBokeh');
const vignetteEl = $('vignette');
const jpegQualityEl = $('jpegQuality');
const blurQualityEl = $('blurQuality');
const saturationWeightEl = $('saturationWeight');
const bokehDensityEl = $('bokehDensity');
const maxBokehCountEl = $('maxBokehCount');
const sampleDetailEl = $('sampleDetail');
const previewSizeEl = $('previewSize');
const thresholdSoftnessEl = $('thresholdSoftness');
const bokehRotationEl = $('bokehRotation');
const bokehRotationRandomEl = $('bokehRotationRandom');
const chromaticAberrationEl = $('chromaticAberration');

const blurValueEl = $('blurValue');
const bokehSizeValueEl = $('bokehSizeValue');
const thresholdValueEl = $('thresholdValue');
const intensityValueEl = $('intensityValue');
const sizeVariationValueEl = $('sizeVariationValue');
const intensityVariationValueEl = $('intensityVariationValue');
const softBokehValueEl = $('softBokehValue');
const vignetteValueEl = $('vignetteValue');
const saturationWeightValueEl = $('saturationWeightValue');
const bokehDensityValueEl = $('bokehDensityValue');
const maxBokehCountValueEl = $('maxBokehCountValue');
const sampleDetailValueEl = $('sampleDetailValue');
const thresholdSoftnessValueEl = $('thresholdSoftnessValue');
const bokehRotationValueEl = $('bokehRotationValue');
const chromaticAberrationValueEl = $('chromaticAberrationValue');

const newImageBtn = $('newImageBtn');
const downloadPng = $('downloadPng');
const downloadJpeg = $('downloadJpeg');
const fullResCheckbox = $('fullResCheckbox');
const tipBanner = $('tipBanner');
const tipDismiss = $('tipDismiss');
const viewerInfo = $('viewerInfo');

function setImage(img) {
  state.image = img;
  originalImg.src = img.src;
  originalImg.onload = () => {
    uploadZone.classList.add('hidden');
    uploadZone.setAttribute('data-state', 'hidden');
    workspace.classList.remove('hidden');
    workspace.classList.add('workspace-visible');
    syncControlsFromState();
    render();
    resetComparisonSliderPosition();
    setViewMode(state.viewMode);
    showTipOnce();
    updateViewerInfo();
    const zs = document.getElementById('viewerZoomSelect');
    if (zs) zs.value = state.viewerZoom === 'fit' ? 'fit' : String(state.viewerZoom);
  };
}

function updateViewerInfo() {
  if (!viewerInfo) return;
  if (!state.image) {
    viewerInfo.textContent = '';
    return;
  }
  const w = state.image.naturalWidth || state.image.width;
  const h = state.image.naturalHeight || state.image.height;
  viewerInfo.textContent = `${w} × ${h}`;
}

const ZOOM_LEVELS = ['fit', 50, 75, 100, 125, 150, 200];

function getZoomScale(zoom) {
  if (zoom === 'fit') return 0;
  return Number(zoom) / 100;
}

function getZoomIndex(zoom) {
  const v = state.viewerZoom;
  if (v === 'fit') return 0;
  const i = ZOOM_LEVELS.indexOf(Number(v));
  return i >= 0 ? i : 3; // default 100%
}

function applyViewerZoom(zoomToPoint) {
  const viewer = document.getElementById('viewer');
  if (!viewer || !comparison) return;
  const zoom = state.viewerZoom;
  const scale = getZoomScale(zoom);
  const isZoomed = zoom !== 'fit' && scale > 0;
  viewer.classList.toggle('viewer-zoomed', isZoomed);

  if (zoom === 'fit') {
    comparison.style.width = '';
    comparison.style.height = '';
    comparison.style.minWidth = '';
    comparison.style.minHeight = '';
    return;
  }

  const c = resultCanvas;
  if (!c || !c.width || !c.height) return;

  const w = c.width;
  const h = c.height;
  comparison.style.width = `${w * scale}px`;
  comparison.style.height = `${h * scale}px`;
  comparison.style.minWidth = `${w * scale}px`;
  comparison.style.minHeight = `${h * scale}px`;

  function centerZoomedContent() {
      if (zoomToPoint && isZoomed) {
        const { x, y, oldScale } = zoomToPoint;
        if (oldScale > 0) {
          viewer.scrollLeft = (viewer.scrollLeft + x) * (scale / oldScale) - x;
          viewer.scrollTop = (viewer.scrollTop + y) * (scale / oldScale) - y;
        }
      } else if (isZoomed) {
        const contentW = comparison.scrollWidth;
        const contentH = comparison.scrollHeight;
        const viewW = viewer.clientWidth;
        const viewH = viewer.clientHeight;
        viewer.scrollLeft = Math.max(0, (contentW - viewW) / 2);
        viewer.scrollTop = Math.max(0, (contentH - viewH) / 2);
      }
    }
  requestAnimationFrame(() => {
    requestAnimationFrame(centerZoomedContent);
  });
}

function setViewerZoom(value, zoomToPoint) {
  state.viewerZoom = value === 'fit' ? 'fit' : Number(value);
  const sel = document.getElementById('viewerZoomSelect');
  if (sel) sel.value = String(state.viewerZoom);
  applyViewerZoom(zoomToPoint);
}

function stepViewerZoom(direction, zoomToPoint) {
  const i = getZoomIndex(state.viewerZoom);
  const next = direction > 0 ? Math.min(i + 1, ZOOM_LEVELS.length - 1) : Math.max(i - 1, 0);
  const nextVal = ZOOM_LEVELS[next];
  setViewerZoom(nextVal === 'fit' ? 'fit' : nextVal, zoomToPoint);
}

function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  if (file.size > MAX_FILE_SIZE) {
    alert('File too large. Max 100MB.');
    return;
  }
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }
  const url = URL.createObjectURL(file);
  state.objectUrl = url;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => setImage(img);
  img.onerror = () => {
    URL.revokeObjectURL(url);
    state.objectUrl = null;
    showError('Failed to load image. The file may be corrupted or not a supported format.');
  };
  img.src = url;
}

function isValidImageUrl(s) {
  const t = s.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}
function loadUrl(urlString) {
  const url = urlString.trim();
  if (!url) return;
  if (!isValidImageUrl(url)) {
    showError('Please enter a valid image URL (e.g. https://…).');
    return;
  }
  hideError();
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => setImage(img);
  img.onerror = () => showError('Could not load image. Check the URL or try another image.');
  img.src = url;
}

function loadSampleImage() {
  loadUrl(SAMPLE_IMAGE_URL);
}

function syncControlsFromState() {
  const o = state.options;
  blurStrengthEl.value = o.blurStrength;
  bokehSizeEl.value = o.bokehSize;
  thresholdEl.value = o.threshold;
  intensityEl.value = o.intensity;
  if (sizeVariationEl) sizeVariationEl.value = o.sizeVariation ?? 0;
  if (intensityVariationEl) intensityVariationEl.value = o.intensityVariation ?? 0;
  bokehShapeEl.value = o.shape;
  if (colorStyleEl) colorStyleEl.value = o.colorStyle || 'natural';
  if (softBokehEl) softBokehEl.value = o.softBokeh ?? 0;
  if (vignetteEl) vignetteEl.value = o.vignette ?? 0;
  if (blurQualityEl) blurQualityEl.value = o.blurQuality || 'standard';
  if (previewSizeEl) {
    const md = o.maxDimension;
    previewSizeEl.value = md == null ? 'full' : ([600, 1200, 2400].includes(md) ? String(md) : '1200');
  }
  if (saturationWeightEl) saturationWeightEl.value = o.saturationWeight ?? 0;
  if (bokehDensityEl) bokehDensityEl.value = o.bokehDensity ?? 1;
  if (maxBokehCountEl) maxBokehCountEl.value = o.maxBokehCount ?? 800;
  if (sampleDetailEl) sampleDetailEl.value = o.sampleDetail ?? 0.5;
  if (thresholdSoftnessEl) thresholdSoftnessEl.value = o.thresholdSoftness ?? 0;
  if (bokehRotationEl) bokehRotationEl.value = o.bokehRotation ?? 0;
  if (bokehRotationRandomEl) bokehRotationRandomEl.checked = !!o.bokehRotationRandom;
  if (chromaticAberrationEl) chromaticAberrationEl.value = o.chromaticAberration ?? 0;
  blurValueEl.textContent = o.blurStrength;
  bokehSizeValueEl.textContent = o.bokehSize;
  thresholdValueEl.textContent = o.threshold.toFixed(2);
  intensityValueEl.textContent = o.intensity.toFixed(1);
  if (sizeVariationValueEl) sizeVariationValueEl.textContent = Math.round((o.sizeVariation ?? 0) * 100) + '%';
  if (intensityVariationValueEl) intensityVariationValueEl.textContent = Math.round((o.intensityVariation ?? 0) * 100) + '%';
  if (softBokehValueEl) softBokehValueEl.textContent = Math.round((o.softBokeh ?? 0) * 100) + '%';
  if (vignetteValueEl) vignetteValueEl.textContent = Math.round((o.vignette ?? 0) * 100) + '%';
  if (saturationWeightValueEl) saturationWeightValueEl.textContent = Math.round((o.saturationWeight ?? 0) * 100) + '%';
  if (bokehDensityValueEl) bokehDensityValueEl.textContent = (o.bokehDensity ?? 1).toFixed(1) + '×';
  if (maxBokehCountValueEl) maxBokehCountValueEl.textContent = o.maxBokehCount ?? 800;
  if (sampleDetailValueEl) sampleDetailValueEl.textContent = Math.round((o.sampleDetail ?? 0.5) * 100) + '%';
  if (thresholdSoftnessValueEl) thresholdSoftnessValueEl.textContent = Math.round((o.thresholdSoftness ?? 0) * 100) + '%';
  if (bokehRotationValueEl) bokehRotationValueEl.textContent = Math.round(o.bokehRotation ?? 0) + '°';
  if (chromaticAberrationValueEl) chromaticAberrationValueEl.textContent = Math.round((o.chromaticAberration ?? 0) * 100) + '%';
}

function syncStateFromControls() {
  const maxDim = previewSizeEl?.value === 'full' ? null : Number(previewSizeEl?.value || 1200);
  state.options = {
    maxDimension: maxDim,
    blurStrength: Number(blurStrengthEl.value),
    bokehSize: Number(bokehSizeEl.value),
    threshold: Number(thresholdEl.value),
    intensity: Number(intensityEl.value),
    sizeVariation: Number(sizeVariationEl?.value ?? 0),
    intensityVariation: Number(intensityVariationEl?.value ?? 0),
    softBokeh: Number(softBokehEl?.value ?? 0),
    vignette: Number(vignetteEl?.value ?? 0),
    blurQuality: blurQualityEl?.value || 'standard',
    saturationWeight: Number(saturationWeightEl?.value ?? 0),
    bokehDensity: Number(bokehDensityEl?.value ?? 1),
    maxBokehCount: Number(maxBokehCountEl?.value ?? 800),
    sampleDetail: Number(sampleDetailEl?.value ?? 0.5),
    thresholdSoftness: Number(thresholdSoftnessEl?.value ?? 0),
    bokehRotation: Number(bokehRotationEl?.value ?? 0),
    bokehRotationRandom: !!bokehRotationRandomEl?.checked,
    chromaticAberration: Number(chromaticAberrationEl?.value ?? 0),
    shape: bokehShapeEl.value,
    colorStyle: colorStyleEl?.value || 'natural',
  };
}

const renderingOverlay = document.getElementById('renderingOverlay');

function showError(msg) {
  const banner = document.getElementById('errorBanner');
  const text = document.getElementById('errorMessage');
  if (banner && text) { text.textContent = msg; banner.classList.remove('hidden'); }
}
function hideError() {
  const banner = document.getElementById('errorBanner');
  if (banner) banner.classList.add('hidden');
}
document.getElementById('errorDismiss')?.addEventListener('click', hideError);

function render(opts = {}) {
  if (!state.image || state.rendering) return;
  if (state.renderDebounceTimer) {
    clearTimeout(state.renderDebounceTimer);
    state.renderDebounceTimer = null;
  }
  const doRender = () => {
    state.rendering = true;
    const thisRenderId = ++state.renderId;
    workspace.classList.add('rendering');
    if (renderingOverlay) renderingOverlay.classList.add('visible');
    hideError();
    requestAnimationFrame(() => {
      try {
        syncStateFromControls();
        const options = { ...state.options };
        if (opts.fullResolution) options.maxDimension = null;
        renderBokeh(state.image, resultCanvas, options);
        if (thisRenderId !== state.renderId) return;
        updateComparisonClip();
        applyViewerZoom();
        saveLastOptionsDebounced();
      } catch (e) {
        if (thisRenderId === state.renderId) showError(e?.message || 'Something went wrong. Try a smaller image or different settings.');
      } finally {
        if (thisRenderId === state.renderId) {
          state.rendering = false;
          workspace.classList.remove('rendering');
          if (renderingOverlay) { renderingOverlay.classList.remove('visible'); renderingOverlay.textContent = 'Applying bokeh…'; }
        }
      }
    });
  };
  if (opts.debounce) {
    state.renderDebounceTimer = setTimeout(() => { state.renderDebounceTimer = null; doRender(); }, RENDER_DEBOUNCE_MS);
  } else {
    doRender();
  }
}

function showTipOnce() {
  if (!tipBanner) return;
  if (sessionStorage.getItem('boken-tip-dismissed')) {
    tipBanner.classList.add('hidden');
    return;
  }
  tipBanner.classList.remove('hidden');
  if (tipDismiss) {
    tipDismiss.onclick = () => {
      tipBanner.classList.add('hidden');
      sessionStorage.setItem('boken-tip-dismissed', '1');
    };
  }
}

function updateComparisonClip() {
  const x = parseFloat(comparisonSlider.style.getPropertyValue('--x') || '0.5');
  comparisonBefore.style.clipPath = `inset(0 ${(1 - x) * 100}% 0 0)`;
  comparisonAfter.style.clipPath = `inset(0 0 0 ${x * 100}%)`;
}

function setupComparisonSlider() {
  let dragging = false;
  let activePointerId = null;

  function setSplitPosition(x) {
    if (!comparisonSlider || !comparisonBefore || !comparisonAfter) return;
    const val = Math.max(0, Math.min(1, x));
    comparisonSlider.style.setProperty('--x', val);
    comparisonSlider.style.left = `${val * 100}%`;
    comparisonBefore.style.clipPath = `inset(0 ${(1 - val) * 100}% 0 0)`;
    comparisonAfter.style.clipPath = `inset(0 0 0 ${val * 100}%)`;
  }

  function move(clientX) {
    if (!comparison || !comparisonSlider) return;
    const rect = comparison.getBoundingClientRect();
    setSplitPosition((clientX - rect.left) / rect.width);
  }

  function stopDrag() {
    dragging = false;
    activePointerId = null;
  }

  // Use pointer events so one code path for mouse and touch; pointercancel fires when gesture is cancelled
  comparisonSlider.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (dragging) return;
    dragging = true;
    activePointerId = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    move(e.clientX);
  });

  comparisonSlider.addEventListener('pointermove', (e) => {
    if (dragging && e.pointerId === activePointerId) move(e.clientX);
  });

  comparisonSlider.addEventListener('pointerup', (e) => {
    if (e.pointerId === activePointerId) stopDrag();
  });

  comparisonSlider.addEventListener('pointercancel', (e) => {
    if (e.pointerId === activePointerId) stopDrag();
  });

  comparisonSlider.addEventListener('pointerleave', (e) => {
    if (e.pointerId === activePointerId) stopDrag();
  });

  // Fallback: release when window loses focus (e.g. tab switch) so slider never stays stuck
  window.addEventListener('blur', stopDrag);

  comparison.addEventListener('click', (e) => {
    if (!e.target.closest('.comparison-slider')) move(e.clientX);
  });

  // Keyboard: arrow keys move split; 1/2/3 jump to 0%, 50%, 100%
  if (comparison) {
    comparison.setAttribute('tabindex', '0');
    comparison.setAttribute('aria-label', 'Before and after comparison. Arrow keys move divider. Keys 1, 2, 3: original, half, result.');
    comparison.addEventListener('keydown', (e) => {
      if (e.key === '1' || e.key === '2' || e.key === '3') {
        e.preventDefault();
        const pos = e.key === '1' ? 0 : e.key === '2' ? 0.5 : 1;
        setSplitPosition(pos);
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const current = parseFloat(comparisonSlider.style.getPropertyValue('--x') || '0.5');
      const step = 0.02;
      if (e.key === 'ArrowLeft') setSplitPosition(current - step);
      else setSplitPosition(current + step);
    });
  }

  comparisonSlider.style.left = '50%';
  comparisonSlider.style.setProperty('--x', '0.5');
  updateComparisonClip();
}

function resetComparisonSliderPosition() {
  if (!comparisonSlider || !comparisonBefore || !comparisonAfter) return;
  comparisonSlider.style.left = '50%';
  comparisonSlider.style.setProperty('--x', '0.5');
  updateComparisonClip();
}

// Upload zone
uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.setAttribute('data-state', 'over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.setAttribute('data-state', 'empty'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.setAttribute('data-state', 'empty');
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});
browseBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) loadFile(file);
  fileInput.value = '';
});
urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadUrl(urlInput.value); });
urlInput.addEventListener('blur', () => { if (urlInput.value.trim()) loadUrl(urlInput.value); });

document.addEventListener('paste', (e) => {
  const item = e.clipboardData?.items?.[0];
  if (item?.kind === 'file' && item.type.startsWith('image/')) {
    e.preventDefault();
    loadFile(item.getAsFile());
  }
});

// Double-click slider to reset that control to default
function addSliderReset(el, valueEl, key, defaultVal, format = (v) => v) {
  if (!el) return;
  el.addEventListener('dblclick', () => {
    const d = SLIDER_DEFAULTS[key] ?? defaultVal;
    el.value = d;
    if (valueEl) valueEl.textContent = format(d);
    state.options[key] = d;
    render({ debounce: true });
  });
}
addSliderReset(blurStrengthEl, blurValueEl, 'blurStrength', 12);
addSliderReset(bokehSizeEl, bokehSizeValueEl, 'bokehSize', 8);
addSliderReset(thresholdEl, thresholdValueEl, 'threshold', 0.65, (v) => Number(v).toFixed(2));
addSliderReset(intensityEl, intensityValueEl, 'intensity', 1.2, (v) => Number(v).toFixed(1));
addSliderReset(sizeVariationEl, sizeVariationValueEl, 'sizeVariation', 0, (v) => Math.round(Number(v) * 100) + '%');
addSliderReset(intensityVariationEl, intensityVariationValueEl, 'intensityVariation', 0, (v) => Math.round(Number(v) * 100) + '%');
addSliderReset(softBokehEl, softBokehValueEl, 'softBokeh', 0, (v) => Math.round(Number(v) * 100) + '%');
addSliderReset(vignetteEl, vignetteValueEl, 'vignette', 0, (v) => Math.round(Number(v) * 100) + '%');
addSliderReset(saturationWeightEl, saturationWeightValueEl, 'saturationWeight', 0, (v) => Math.round(Number(v) * 100) + '%');
addSliderReset(bokehDensityEl, bokehDensityValueEl, 'bokehDensity', 1, (v) => Number(v).toFixed(1) + '×');
addSliderReset(maxBokehCountEl, maxBokehCountValueEl, 'maxBokehCount', 800);
addSliderReset(sampleDetailEl, sampleDetailValueEl, 'sampleDetail', 0.5, (v) => Math.round(Number(v) * 100) + '%');
addSliderReset(thresholdSoftnessEl, thresholdSoftnessValueEl, 'thresholdSoftness', 0, (v) => Math.round(Number(v) * 100) + '%');
addSliderReset(bokehRotationEl, bokehRotationValueEl, 'bokehRotation', 0, (v) => Math.round(Number(v)) + '°');
addSliderReset(chromaticAberrationEl, chromaticAberrationValueEl, 'chromaticAberration', 0, (v) => Math.round(Number(v) * 100) + '%');

// Controls — update value display immediately, debounce actual render
blurStrengthEl.addEventListener('input', () => { blurValueEl.textContent = blurStrengthEl.value; render({ debounce: true }); });
bokehSizeEl.addEventListener('input', () => { bokehSizeValueEl.textContent = bokehSizeEl.value; render({ debounce: true }); });
thresholdEl.addEventListener('input', () => { thresholdValueEl.textContent = thresholdEl.value; render({ debounce: true }); });
intensityEl.addEventListener('input', () => { intensityValueEl.textContent = intensityEl.value; render({ debounce: true }); });
if (sizeVariationEl) {
  sizeVariationEl.addEventListener('input', () => {
    if (sizeVariationValueEl) sizeVariationValueEl.textContent = Math.round(Number(sizeVariationEl.value) * 100) + '%';
    render({ debounce: true });
  });
}
if (intensityVariationEl) {
  intensityVariationEl.addEventListener('input', () => {
    if (intensityVariationValueEl) intensityVariationValueEl.textContent = Math.round(Number(intensityVariationEl.value) * 100) + '%';
    render({ debounce: true });
  });
}
bokehShapeEl.addEventListener('change', () => render());
if (colorStyleEl) colorStyleEl.addEventListener('change', () => render());
if (softBokehEl) softBokehEl.addEventListener('input', () => { if (softBokehValueEl) softBokehValueEl.textContent = Math.round(Number(softBokehEl.value) * 100) + '%'; render({ debounce: true }); });
if (vignetteEl) vignetteEl.addEventListener('input', () => { if (vignetteValueEl) vignetteValueEl.textContent = Math.round(Number(vignetteEl.value) * 100) + '%'; render({ debounce: true }); });
if (blurQualityEl) blurQualityEl.addEventListener('change', () => render());
if (previewSizeEl) previewSizeEl.addEventListener('change', () => render());
if (saturationWeightEl) saturationWeightEl.addEventListener('input', () => { if (saturationWeightValueEl) saturationWeightValueEl.textContent = Math.round(Number(saturationWeightEl.value) * 100) + '%'; render({ debounce: true }); });
if (bokehDensityEl) bokehDensityEl.addEventListener('input', () => { if (bokehDensityValueEl) bokehDensityValueEl.textContent = Number(bokehDensityEl.value).toFixed(1) + '×'; render({ debounce: true }); });
if (maxBokehCountEl) maxBokehCountEl.addEventListener('input', () => { if (maxBokehCountValueEl) maxBokehCountValueEl.textContent = maxBokehCountEl.value; render({ debounce: true }); });
if (sampleDetailEl) sampleDetailEl.addEventListener('input', () => { if (sampleDetailValueEl) sampleDetailValueEl.textContent = Math.round(Number(sampleDetailEl.value) * 100) + '%'; render({ debounce: true }); });
if (thresholdSoftnessEl) thresholdSoftnessEl.addEventListener('input', () => { if (thresholdSoftnessValueEl) thresholdSoftnessValueEl.textContent = Math.round(Number(thresholdSoftnessEl.value) * 100) + '%'; render({ debounce: true }); });
if (bokehRotationEl) bokehRotationEl.addEventListener('input', () => { if (bokehRotationValueEl) bokehRotationValueEl.textContent = Math.round(Number(bokehRotationEl.value)) + '°'; render({ debounce: true }); });
if (bokehRotationRandomEl) bokehRotationRandomEl.addEventListener('change', () => render());
if (chromaticAberrationEl) chromaticAberrationEl.addEventListener('input', () => { if (chromaticAberrationValueEl) chromaticAberrationValueEl.textContent = Math.round(Number(chromaticAberrationEl.value) * 100) + '%'; render({ debounce: true }); });

function setViewMode(mode) {
  state.viewMode = mode;
  const comparison = document.getElementById('comparison');
  if (comparison) {
    comparison.dataset.view = mode;
    comparison.className = 'comparison view-' + mode;
  }
  if (mode === 'original' && state.image && originalImg) {
    originalImg.src = state.image.src;
    originalImg.style.display = '';
  }
  document.querySelectorAll('.view-mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === mode);
  });
}
document.querySelectorAll('.view-mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => setViewMode(btn.dataset.view));
});

const DEFAULT_OPTIONS = {
  maxDimension: 1200,
  blurStrength: 12,
  bokehSize: 8,
  threshold: 0.65,
  intensity: 1.2,
  sizeVariation: 0,
  intensityVariation: 0,
  softBokeh: 0,
  vignette: 0,
  blurQuality: 'standard',
  saturationWeight: 0,
  bokehDensity: 1,
  maxBokehCount: 800,
  sampleDetail: 0.5,
  thresholdSoftness: 0,
  bokehRotation: 0,
  bokehRotationRandom: false,
  chromaticAberration: 0,
  shape: 'circle',
  colorStyle: 'natural',
};
const SLIDER_DEFAULTS = {
  blurStrength: 12,
  bokehSize: 8,
  threshold: 0.65,
  intensity: 1.2,
  sizeVariation: 0,
  intensityVariation: 0,
  softBokeh: 0,
  vignette: 0,
  saturationWeight: 0,
  bokehDensity: 1,
  maxBokehCount: 800,
  sampleDetail: 0.5,
  thresholdSoftness: 0,
  bokehRotation: 0,
  chromaticAberration: 0,
};

function saveLastOptionsDebounced() {
  if (optionsSaveTimer) clearTimeout(optionsSaveTimer);
  optionsSaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LAST_OPTIONS_KEY, JSON.stringify(state.options));
    } catch (_) {}
    optionsSaveTimer = null;
  }, OPTIONS_SAVE_DEBOUNCE_MS);
}
function loadLastOptions() {
  try {
    const raw = localStorage.getItem(LAST_OPTIONS_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object') state.options = { ...DEFAULT_OPTIONS, ...o };
    }
  } catch (_) {}
}
const resetDefaultsBtn = document.getElementById('resetDefaultsBtn');
if (resetDefaultsBtn) {
  resetDefaultsBtn.addEventListener('click', () => {
    state.options = { ...DEFAULT_OPTIONS };
    syncControlsFromState();
    render();
  });
}

const CUSTOM_PRESETS_KEY = 'boken-custom-presets';
function getCustomPresets() {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveCustomPresets(presets) {
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
}
function renderCustomPresetsList() {
  const container = document.getElementById('customPresetsContainer');
  if (!container) return;
  const presets = getCustomPresets();
  const names = Object.keys(presets);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  container.innerHTML = names.length === 0 ? '' : names.map((name) => {
    const att = esc(name);
    return `<button type="button" class="custom-preset-btn" data-custom-preset="${att}" title="Apply preset">${att} <span class="delete-preset" data-delete-preset="${att}" title="Delete preset">×</span></button>`;
  }).join('');
  container.querySelectorAll('.custom-preset-btn').forEach((btn) => {
    const name = btn.getAttribute('data-custom-preset');
    if (!name) return;
    btn.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-preset')) {
        e.preventDefault();
        e.stopPropagation();
        const presets = getCustomPresets();
        const key = e.target.getAttribute('data-delete-preset');
        if (key) { delete presets[key]; saveCustomPresets(presets); renderCustomPresetsList(); }
      } else {
        const presets = getCustomPresets();
        const key = btn.getAttribute('data-custom-preset');
        if (key && presets[key]) { state.options = { ...state.options, ...presets[key] }; syncControlsFromState(); render(); }
      }
    });
  });
}
const savePresetBtn = document.getElementById('savePresetBtn');
if (savePresetBtn) {
  savePresetBtn.addEventListener('click', () => {
    const name = prompt('Preset name:');
    if (!name || !name.trim()) return;
    syncStateFromControls();
    const presets = getCustomPresets();
    presets[name.trim()] = { ...state.options };
    saveCustomPresets(presets);
    renderCustomPresetsList();
  });
}
renderCustomPresetsList();

document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const preset = PRESETS[btn.dataset.preset];
    if (!preset) return;
    state.options = { ...state.options, ...preset };
    syncControlsFromState();
    render();
  });
});

newImageBtn.addEventListener('click', () => {
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }
  state.image = null;
  workspace.classList.add('hidden');
  uploadZone.classList.remove('hidden');
  uploadZone.setAttribute('data-state', 'empty');
  urlInput.value = '';
});

function download(filename, type, quality, fullRes = false) {
  if (fullRes && state.image) {
    const overlay = renderingOverlay;
    if (overlay) { overlay.classList.add('visible'); overlay.textContent = 'Preparing full resolution…'; }
    syncStateFromControls();
    const options = { ...state.options, maxDimension: null };
    const exportCanvas = document.createElement('canvas');
    requestAnimationFrame(() => {
      try {
        renderBokeh(state.image, exportCanvas, options);
        const link = document.createElement('a');
        link.download = filename;
        link.href = exportCanvas.toDataURL(type, quality);
        link.click();
      } finally {
        if (overlay) { overlay.classList.remove('visible'); overlay.textContent = 'Applying bokeh…'; }
      }
    });
  } else {
    const link = document.createElement('a');
    link.download = filename;
    link.href = resultCanvas.toDataURL(type, quality);
    link.click();
  }
}
downloadPng.addEventListener('click', () => download('boken-bokeh.png', 'image/png', undefined, fullResCheckbox?.checked));
downloadJpeg.addEventListener('click', () => {
  const q = jpegQualityEl ? Number(jpegQualityEl.value) : 0.92;
  download('boken-bokeh.jpg', 'image/jpeg', q, fullResCheckbox?.checked);
});
const downloadWebp = document.getElementById('downloadWebp');
if (downloadWebp) {
  downloadWebp.addEventListener('click', () => {
    const q = jpegQualityEl ? Number(jpegQualityEl.value) : 0.92;
    download('boken-bokeh.webp', 'image/webp', q, fullResCheckbox?.checked);
  });
}

const copyImageBtn = document.getElementById('copyImageBtn');
if (copyImageBtn) {
  copyImageBtn.addEventListener('click', async () => {
    if (!state.image) return;
    try {
      const blob = await new Promise((resolve) => resultCanvas.toBlob(resolve, 'image/png'));
      if (blob && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        const label = copyImageBtn.textContent;
        copyImageBtn.textContent = 'Copied!';
        setTimeout(() => { copyImageBtn.textContent = label; }, 2000);
      } else {
        alert('Copy not supported in this browser.');
      }
    } catch (e) {
      alert('Could not copy to clipboard.');
    }
  });
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  if (e.key === 'Escape') {
    if (state.image) newImageBtn.click();
  } else if (e.key === 'r' || e.key === 'R') {
    if (state.image) render();
  } else if (e.key === 'd' || e.key === 'D') {
    if (state.image) download('boken-bokeh.png', 'image/png', undefined, fullResCheckbox?.checked);
  } else if (e.key === 'v' || e.key === 'V') {
    if (state.image) {
      const modes = ['split', 'original', 'result'];
      const i = modes.indexOf(state.viewMode);
      setViewMode(modes[(i + 1) % 3]);
    }
  } else if (e.key === 'f' || e.key === 'F') {
    if (state.image && document.fullscreenElement) document.exitFullscreen?.();
    else if (state.image) document.getElementById('viewer')?.requestFullscreen?.();
  } else if ((e.key === '=' || e.key === '+') && !e.shiftKey) {
    if (state.image) { e.preventDefault(); stepViewerZoom(1); }
  } else if (e.key === '-') {
    if (state.image) { e.preventDefault(); stepViewerZoom(-1); }
  } else if (e.key === '0') {
    if (state.image) { e.preventDefault(); setViewerZoom('fit'); }
  }
});

// Theme toggle
const themeToggle = document.getElementById('themeToggle');
function updateThemeIcon() {
  const icon = themeToggle?.querySelector('.theme-icon');
  if (icon) icon.textContent = document.documentElement.classList.contains('theme-light') ? '🌙' : '☀️';
}
if (themeToggle) {
  const saved = localStorage.getItem('boken-theme');
  if (saved === 'light') document.documentElement.classList.add('theme-light');
  updateThemeIcon();
  themeToggle.addEventListener('click', () => {
    document.documentElement.classList.toggle('theme-light');
    localStorage.setItem('boken-theme', document.documentElement.classList.contains('theme-light') ? 'light' : 'dark');
    updateThemeIcon();
  });
}

// Sample image button
const sampleBtn = document.getElementById('sampleImageBtn');
if (sampleBtn) sampleBtn.addEventListener('click', loadSampleImage);

// Fullscreen
const fullscreenBtn = document.getElementById('fullscreenBtn');
const viewerEl = document.getElementById('viewer');
if (fullscreenBtn && viewerEl) {
  fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else viewerEl.requestFullscreen?.();
  });
}

// Viewer zoom: select + zoom in/out buttons
const viewerZoomSelect = document.getElementById('viewerZoomSelect');
const viewerZoomInBtn = document.getElementById('viewerZoomIn');
const viewerZoomOutBtn = document.getElementById('viewerZoomOut');

if (viewerZoomSelect) {
  viewerZoomSelect.addEventListener('change', () => {
    const val = viewerZoomSelect.value;
    setViewerZoom(val);
  });
}
if (viewerZoomInBtn) viewerZoomInBtn.addEventListener('click', () => stepViewerZoom(1));
if (viewerZoomOutBtn) viewerZoomOutBtn.addEventListener('click', () => stepViewerZoom(-1));

// Ctrl+wheel over viewer: zoom in/out toward cursor
if (viewerEl) {
  viewerEl.addEventListener('wheel', (e) => {
    if (!e.ctrlKey || !state.image) return;
    e.preventDefault();
    const rect = viewerEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const oldScale = getZoomScale(state.viewerZoom);
    if (e.deltaY < 0) stepViewerZoom(1, oldScale > 0 ? { x, y, oldScale } : null);
    else stepViewerZoom(-1, oldScale > 0 ? { x, y, oldScale } : null);
  }, { passive: false });
}

// Preview full resolution (one-time render at full res in the main canvas)
const previewFullResBtn = document.getElementById('previewFullResBtn');
if (previewFullResBtn) {
  previewFullResBtn.addEventListener('click', () => {
    if (!state.image) return;
    if (renderingOverlay) {
      renderingOverlay.classList.add('visible');
      renderingOverlay.textContent = 'Rendering at full resolution…';
    }
    render({ fullResolution: true, debounce: false });
  });
}

// Export / Import settings
function exportSettings() {
  syncStateFromControls();
  const blob = new Blob([JSON.stringify(state.options, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'boken-settings.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
function importSettings(jsonString) {
  try {
    const o = JSON.parse(jsonString);
    if (o && typeof o === 'object') {
      state.options = { ...DEFAULT_OPTIONS, ...o };
      syncControlsFromState();
      render();
      hideError();
    } else showError('Invalid settings file.');
  } catch (e) {
    showError('Could not read settings file.');
  }
}
document.getElementById('exportSettingsBtn')?.addEventListener('click', exportSettings);
const importSettingsInput = document.getElementById('importSettingsInput');
document.getElementById('importSettingsBtn')?.addEventListener('click', () => importSettingsInput?.click());
importSettingsInput?.addEventListener('change', () => {
  const f = importSettingsInput.files?.[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => importSettings(String(r.result));
  r.readAsText(f);
  importSettingsInput.value = '';
});

// Share link: read URL params on load, build share URL and copy
function paramsFromOptions() {
  const o = state.options;
  const p = {
    md: o.maxDimension == null ? 'full' : o.maxDimension,
    b: o.blurStrength,
    s: o.bokehSize,
    t: o.threshold,
    i: o.intensity,
    sv: o.sizeVariation,
    iv: o.intensityVariation,
    soft: o.softBokeh,
    vig: o.vignette,
    shape: o.shape,
    c: o.colorStyle,
    q: o.blurQuality,
    sw: o.saturationWeight,
    bd: o.bokehDensity,
    mb: o.maxBokehCount,
    sd: o.sampleDetail,
    ts: o.thresholdSoftness,
    rot: o.bokehRotation,
    ca: o.chromaticAberration,
  };
  if (o.bokehRotationRandom) p.rotRnd = '1';
  return p;
}
function optionsFromParams(params) {
  const o = { ...state.options };
  if (params.md !== undefined) o.maxDimension = params.md === 'full' ? null : Number(params.md);
  if (params.b != null) o.blurStrength = Number(params.b) || o.blurStrength;
  if (params.s != null) o.bokehSize = Number(params.s) || o.bokehSize;
  if (params.t != null) o.threshold = Number(params.t);
  if (params.i != null) o.intensity = Number(params.i);
  if (params.sv != null) o.sizeVariation = Number(params.sv);
  if (params.iv != null) o.intensityVariation = Number(params.iv);
  if (params.soft != null) o.softBokeh = Number(params.soft);
  if (params.vig != null) o.vignette = Number(params.vig);
  if (params.shape) o.shape = params.shape;
  if (params.c) o.colorStyle = params.c;
  if (params.q) o.blurQuality = params.q;
  if (params.sw != null) o.saturationWeight = Number(params.sw);
  if (params.bd != null) o.bokehDensity = Number(params.bd);
  if (params.mb != null) o.maxBokehCount = Number(params.mb);
  if (params.sd != null) o.sampleDetail = Number(params.sd);
  if (params.ts != null) o.thresholdSoftness = Number(params.ts);
  if (params.rot != null) o.bokehRotation = Number(params.rot);
  if (params.rotRnd !== undefined) o.bokehRotationRandom = params.rotRnd === '1' || params.rotRnd === true;
  if (params.ca != null) o.chromaticAberration = Number(params.ca);
  return o;
}
function applyParamsFromUrl() {
  const q = new URLSearchParams(window.location.search);
  if (q.toString() === '') return;
  const p = Object.fromEntries(q.entries());
  state.options = optionsFromParams(p);
}
function buildShareUrl() {
  const p = paramsFromOptions();
  const q = new URLSearchParams(p).toString();
  return q ? `${window.location.origin}${window.location.pathname}?${q}` : window.location.href;
}
document.getElementById('shareLinkBtn')?.addEventListener('click', async () => {
  syncStateFromControls();
  const url = buildShareUrl();
  try {
    await navigator.clipboard?.writeText(url);
    const btn = document.getElementById('shareLinkBtn');
    if (btn) { const t = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = t; }, 2000); }
  } catch (_) {
    showError('Could not copy to clipboard.');
  }
});

// Export before/after (one image: original left, result right)
document.getElementById('exportBeforeAfterBtn')?.addEventListener('click', () => {
  if (!state.image || !resultCanvas) return;
  const w = resultCanvas.width;
  const h = resultCanvas.height;
  const totalW = w * 2;
  const c = document.createElement('canvas');
  c.width = totalW;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(originalImg, 0, 0, originalImg.naturalWidth || w, originalImg.naturalHeight || h, 0, 0, w, h);
  ctx.drawImage(resultCanvas, 0, 0, w, h, w, 0, w, h);
  const a = document.createElement('a');
  a.download = 'boken-before-after.png';
  a.href = c.toDataURL('image/png');
  a.click();
});

// Settings bar fixed on the right
function applySettingsPosition() {
  if (!workspace) return;
  workspace.classList.remove('controls-position-left', 'controls-position-top', 'controls-position-bottom');
  workspace.classList.add('controls-position-right');
}
function loadSettingsPosition() {
  applySettingsPosition();
}

// Load last options and URL params on startup
loadLastOptions();
applyParamsFromUrl();
loadSettingsPosition();
setupComparisonSlider();
