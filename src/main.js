import { renderBokeh } from './bokehEngine.js';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const state = {
  image: null,
  options: {
    blurStrength: 12,
    bokehSize: 8,
    threshold: 0.65,
    intensity: 1.2,
    shape: 'circle',
  },
  rendering: false,
};

const PRESETS = {
  portrait: { blurStrength: 18, bokehSize: 10, threshold: 0.6, intensity: 1.4, shape: 'circle' },
  landscape: { blurStrength: 14, bokehSize: 12, threshold: 0.55, intensity: 1.1, shape: 'hexagon' },
  dramatic: { blurStrength: 28, bokehSize: 16, threshold: 0.5, intensity: 1.8, shape: 'circle' },
  subtle: { blurStrength: 6, bokehSize: 5, threshold: 0.75, intensity: 0.7, shape: 'circle' },
  vintage: { blurStrength: 22, bokehSize: 14, threshold: 0.58, intensity: 1.3, shape: 'pentagon' },
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
const bokehShapeEl = $('bokehShape');

const blurValueEl = $('blurValue');
const bokehSizeValueEl = $('bokehSizeValue');
const thresholdValueEl = $('thresholdValue');
const intensityValueEl = $('intensityValue');

const newImageBtn = $('newImageBtn');
const downloadPng = $('downloadPng');
const downloadJpeg = $('downloadJpeg');

function setImage(img) {
  state.image = img;
  originalImg.src = img.src;
  originalImg.onload = () => {
    uploadZone.classList.add('hidden');
    uploadZone.setAttribute('data-state', 'hidden');
    workspace.classList.remove('hidden');
    syncControlsFromState();
    render();
    setupComparisonSlider();
  };
}

function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  if (file.size > MAX_FILE_SIZE) {
    alert('File too large. Max 20MB.');
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => { URL.revokeObjectURL(url); setImage(img); };
  img.onerror = () => { URL.revokeObjectURL(url); alert('Failed to load image.'); };
  img.src = url;
}

function loadUrl(urlString) {
  const url = urlString.trim();
  if (!url) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => setImage(img);
  img.onerror = () => alert('Failed to load image from URL.');
  img.src = url;
}

function syncControlsFromState() {
  const o = state.options;
  blurStrengthEl.value = o.blurStrength;
  bokehSizeEl.value = o.bokehSize;
  thresholdEl.value = o.threshold;
  intensityEl.value = o.intensity;
  bokehShapeEl.value = o.shape;
  blurValueEl.textContent = o.blurStrength;
  bokehSizeValueEl.textContent = o.bokehSize;
  thresholdValueEl.textContent = o.threshold.toFixed(2);
  intensityValueEl.textContent = o.intensity.toFixed(1);
}

function syncStateFromControls() {
  state.options = {
    blurStrength: Number(blurStrengthEl.value),
    bokehSize: Number(bokehSizeEl.value),
    threshold: Number(thresholdEl.value),
    intensity: Number(intensityEl.value),
    shape: bokehShapeEl.value,
  };
}

const renderingOverlay = document.getElementById('renderingOverlay');

function render() {
  if (!state.image || state.rendering) return;
  state.rendering = true;
  workspace.classList.add('rendering');
  if (renderingOverlay) renderingOverlay.classList.add('visible');
  requestAnimationFrame(() => {
    try {
      syncStateFromControls();
      renderBokeh(state.image, resultCanvas, state.options);
      updateComparisonClip();
    } finally {
      state.rendering = false;
      workspace.classList.remove('rendering');
      if (renderingOverlay) renderingOverlay.classList.remove('visible');
    }
  });
}

function updateComparisonClip() {
  const x = parseFloat(comparisonSlider.style.getPropertyValue('--x') || '0.5');
  comparisonBefore.style.clipPath = `inset(0 ${(1 - x) * 100}% 0 0)`;
  comparisonAfter.style.clipPath = `inset(0 0 0 ${x * 100}%)`;
}

function setupComparisonSlider() {
  let dragging = false;
  function move(e) {
    const rect = comparison.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    comparisonSlider.style.setProperty('--x', x);
    comparisonSlider.style.left = `${x * 100}%`;
    comparisonBefore.style.clipPath = `inset(0 ${(1 - x) * 100}% 0 0)`;
    comparisonAfter.style.clipPath = `inset(0 0 0 ${x * 100}%)`;
  }
  comparisonSlider.addEventListener('mousedown', () => { dragging = true; });
  document.addEventListener('mouseup', () => { dragging = false; });
  document.addEventListener('mousemove', (e) => { if (dragging) move(e); });
  comparisonSlider.addEventListener('touchstart', (e) => { dragging = true; move(e.touches[0]); });
  document.addEventListener('touchend', () => { dragging = false; });
  document.addEventListener('touchmove', (e) => { if (dragging) { e.preventDefault(); move(e.touches[0]); } }, { passive: false });
  comparison.addEventListener('click', (e) => { if (!e.target.closest('.comparison-slider')) move(e); });
  comparisonSlider.style.left = '50%';
  comparisonSlider.style.setProperty('--x', '0.5');
  updateComparisonClip();
}

// Upload zone
uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.setAttribute('data-state', 'over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.setAttribute('data-state', 'empty'););
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

// Controls
blurStrengthEl.addEventListener('input', () => { blurValueEl.textContent = blurStrengthEl.value; render(); });
bokehSizeEl.addEventListener('input', () => { bokehSizeValueEl.textContent = bokehSizeEl.value; render(); });
thresholdEl.addEventListener('input', () => { thresholdValueEl.textContent = thresholdEl.value; render(); });
intensityEl.addEventListener('input', () => { intensityValueEl.textContent = intensityEl.value; render(); });
bokehShapeEl.addEventListener('change', render);

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
  state.image = null;
  workspace.classList.add('hidden');
  uploadZone.classList.remove('hidden');
  uploadZone.setAttribute('data-state', 'empty');
  urlInput.value = '';
});

function download(filename, type, quality) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = resultCanvas.toDataURL(type, quality);
  link.click();
}
downloadPng.addEventListener('click', () => download('boken-bokeh.png', 'image/png'));
downloadJpeg.addEventListener('click', () => download('boken-bokeh.jpg', 'image/jpeg', 0.92));
