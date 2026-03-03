/**
 * Bokeh blur engine — canvas 2D implementation
 * Applies blur and overlays bokeh-shaped highlights from bright areas
 */

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

function luma(r, g, b) {
  return r * LUMA_R + g * LUMA_G + b * LUMA_B;
}

// Clamp 0–255
function clamp(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

// Color style definitions: [blur tint R, G, B], and optional bokeh transform (r,g,b 0–1 -> r,g,b 0–255)
const COLOR_STYLES = {
  natural: {
    tint: [1, 1, 1],
    bokeh: (r, g, b) => [r * 255, g * 255, b * 255],
  },
  warm: {
    tint: [1.12, 1.02, 0.88],
    bokeh: (r, g, b) => [clamp(r * 255 * 1.15), clamp(g * 255 * 1.02), clamp(b * 255 * 0.85)],
  },
  cool: {
    tint: [0.88, 0.96, 1.12],
    bokeh: (r, g, b) => [clamp(r * 255 * 0.85), clamp(g * 255 * 1.02), clamp(b * 255 * 1.2)],
  },
  vintage: {
    tint: [1.05, 0.92, 0.78],
    bokeh: (r, g, b) => {
      const L = luma(r, g, b);
      const s = 0.6; // desaturate
      const t = (r + g + b) / 3;
      const nr = t + (r - t) * s;
      const ng = t + (g - t) * s;
      const nb = t + (b - t) * s;
      return [clamp(nr * 255 * 1.1), clamp(ng * 255 * 0.95), clamp(nb * 255 * 0.8)];
    },
  },
  cinematic: {
    tint: [0.82, 1, 1.08],
    bokeh: (r, g, b) => [clamp(r * 255 * 1.2), clamp(g * 255 * 0.95), clamp(b * 255 * 0.75)],
  },
  pastel: {
    tint: [1.02, 1.02, 1.05],
    bokeh: (r, g, b) => {
      const L = luma(r, g, b);
      const s = 0.5;
      const t = (r + g + b) / 3;
      const nr = t + (r - t) * s;
      const ng = t + (g - t) * s;
      const nb = t + (b - t) * s;
      return [clamp(nr * 255 * 1.15), clamp(ng * 255 * 1.1), clamp(nb * 255 * 1.15)];
    },
  },
  vivid: {
    tint: [1, 1, 1],
    bokeh: (r, g, b) => {
      const L = luma(r, g, b);
      const sat = 1.5;
      const t = (r + g + b) / 3;
      const nr = t + (r - t) * sat;
      const ng = t + (g - t) * sat;
      const nb = t + (b - t) * sat;
      return [clamp(nr * 255), clamp(ng * 255), clamp(nb * 255)];
    },
  },
  golden: {
    tint: [1.15, 1.02, 0.75],
    bokeh: (r, g, b) => [clamp(r * 255 * 1.2), clamp(g * 255 * 1.05), clamp(b * 255 * 0.7)],
  },
  nocturne: {
    tint: [0.6, 0.7, 1.2],
    bokeh: (r, g, b) => [clamp(r * 255 * 0.6), clamp(g * 255 * 0.8), clamp(b * 255 * 1.3)],
  },
};

function applyColorStyle(ctx, width, height, styleKey) {
  const style = COLOR_STYLES[styleKey] || COLOR_STYLES.natural;
  if (styleKey === 'natural') return;
  const [tr, tg, tb] = style.tint;
  const data = ctx.getImageData(0, 0, width, height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(d[i] * tr);
    d[i + 1] = clamp(d[i + 1] * tg);
    d[i + 2] = clamp(d[i + 2] * tb);
  }
  ctx.putImageData(data, 0, 0);
}

// Box blur one pass (horizontal or vertical)
function boxBlurPass(src, dst, width, height, radius, horizontal) {
  const srcData = src.getImageData(0, 0, width, height);
  const dstData = dst.getImageData(0, 0, width, height);
  const s = srcData.data;
  const d = dstData.data;
  const r = Math.min(radius | 0, width, height);
  const kernelSize = r * 2 + 1;
  const half = (kernelSize / 2) | 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sr = 0, sg = 0, sb = 0, sa = 0, n = 0;
      for (let k = -half; k <= half; k++) {
        let nx = x, ny = y;
        if (horizontal) nx = Math.max(0, Math.min(width - 1, x + k));
        else ny = Math.max(0, Math.min(height - 1, y + k));
        const i = (ny * width + nx) * 4;
        sr += s[i]; sg += s[i + 1]; sb += s[i + 2]; sa += s[i + 3];
        n++;
      }
      const i = (y * width + x) * 4;
      d[i] = sr / n; d[i + 1] = sg / n; d[i + 2] = sb / n; d[i + 3] = sa / n;
    }
  }
  dst.putImageData(dstData, 0, 0);
}

// Multiple box blur passes approximate Gaussian; more passes = smoother (more accurate)
function gaussianBlur(ctx, width, height, radius, numPasses = 3) {
  const passes = Math.max(2, Math.min(6, numPasses));
  const r = Math.max(1, (radius / passes) | 0);
  const buf1 = document.createElement('canvas');
  buf1.width = width;
  buf1.height = height;
  const buf2 = document.createElement('canvas');
  buf2.width = width;
  buf2.height = height;
  const c1 = buf1.getContext('2d', { willReadFrequently: true });
  const c2 = buf2.getContext('2d', { willReadFrequently: true });
  c1.drawImage(ctx.canvas, 0, 0);
  for (let p = 0; p < passes; p++) {
    boxBlurPass(c1, c2, width, height, r, true);
    boxBlurPass(c2, c1, width, height, r, false);
  }
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(buf1, 0, 0);
}

// Get polygon points for bokeh shape (unit radius ~1)
function getShapePoints(shape, segments = 32) {
  const points = [];
  const n = shape === 'circle' ? segments : (shape === 'hexagon' ? 6 : 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    points.push([Math.cos(a), Math.sin(a)]);
  }
  return points;
}

// Draw a single bokeh blob at (cx, cy) with radius and color
// softEdge 0 = hard disk, 1 = soft radial falloff (more lens-like)
// rotation in radians (applied to polygon shapes only)
function drawBokehBlob(ctx, cx, cy, radius, color, shape, intensity, softEdge = 0, rotation = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  if (rotation !== 0) ctx.rotate(rotation);
  ctx.globalAlpha = Math.min(1, intensity);

  if (shape === 'donut') {
    const inner = radius * 0.45;
    const outer = radius;
    ctx.strokeStyle = color;
    ctx.lineWidth = (outer - inner) * 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, (outer + inner) / 2, 0, Math.PI * 2);
    ctx.stroke();
  } else if (softEdge > 0.01) {
    const r = radius * (1 + softEdge);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, color);
    grad.addColorStop(Math.max(0.1, 1 - softEdge * 0.8), color);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const points = getShapePoints(shape);
    ctx.scale(radius, radius);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function applyVignette(ctx, width, height, strength) {
  if (strength <= 0) return;
  const data = ctx.getImageData(0, 0, width, height);
  const d = data.data;
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const t = Math.min(1, dist / maxR);
      const factor = 1 - strength * (t * t);
      const i = (y * width + x) * 4;
      d[i] = clamp(d[i] * factor);
      d[i + 1] = clamp(d[i + 1] * factor);
      d[i + 2] = clamp(d[i + 2] * factor);
    }
  }
  ctx.putImageData(data, 0, 0);
}

// Chromatic aberration: RGB channel shift (stronger toward edges) for a lens-like look
function applyChromaticAberration(ctx, width, height, strength) {
  if (strength <= 0) return;
  const data = ctx.getImageData(0, 0, width, height);
  const src = new Uint8ClampedArray(data.data);
  const d = data.data;
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.max(1, Math.sqrt(cx * cx + cy * cy));
  const maxOffset = 1 + Math.round(strength * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const t = Math.min(1, dist / maxR);
      const offset = Math.round(maxOffset * t * t);
      if (offset === 0) continue;
      const i = (y * width + x) * 4;
      const xL = Math.max(0, Math.min(width - 1, x - offset));
      const xR = Math.max(0, Math.min(width - 1, x + offset));
      const iL = (y * width + xL) * 4;
      const iR = (y * width + xR) * 4;
      d[i] = src[iL];
      d[i + 1] = src[i + 1];
      d[i + 2] = src[iR];
    }
  }
  ctx.putImageData(data, 0, 0);
}

// Saturation 0..1 (max of (max-min)/max per channel)
function saturation(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max <= 1e-6) return 0;
  return (max - min) / max;
}

// Sample bright spots from image and draw bokeh (use original for sharper highlight detection)
function extractAndDrawBokeh(ctxBlurred, ctxOut, width, height, options, originalData) {
  const {
    bokehSize,
    threshold,
    intensity,
    shape,
    colorStyle = 'natural',
    sizeVariation = 0,
    intensityVariation = 0,
    softBokeh = 0,
    saturationWeight = 0,
    bokehDensity = 1,
    maxBokehCount = 800,
    sampleDetail = 0.5,
    thresholdSoftness = 0,
    bokehRotation = 0,
    bokehRotationRandom = false,
  } = options;
  const style = COLOR_STYLES[colorStyle] || COLOR_STYLES.natural;
  const bokehTransform = style.bokeh;
  const imgData = originalData || ctxBlurred.getImageData(0, 0, width, height);
  const data = imgData.data;
  const baseStep = Math.max(1, (bokehSize / 2) | 0);
  const step = Math.max(1, Math.round(baseStep * (1.6 - sampleDetail)));
  const spots = [];
  const low = Math.max(0, threshold - thresholdSoftness);
  const range = 1 - low + 1e-6;

  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const L = luma(r, g, b);
      if (L >= low) {
        const brightness = (L - low) / range;
        const sat = saturation(r, g, b);
        const score = Math.pow(brightness, 0.7) + saturationWeight * sat;
        spots.push({
          x, y,
          r: data[i], g: data[i + 1], b: data[i + 2],
          brightness: Math.pow(Math.min(1, brightness), 0.7),
          score,
        });
      }
    }
  }

  spots.sort((a, b) => (b.score !== undefined ? b.score : b.brightness) - (a.score !== undefined ? a.score : a.brightness));
  const baseMax = Math.max(50, Math.min(2500, Math.round((maxBokehCount ?? 800) * bokehDensity)));
  const maxSpots = baseMax;
  const toDraw = spots.slice(0, maxSpots);

  // Size variation: 0 = uniform by brightness only; 1 = wide range + randomness (different sizes at once)
  const variation = Math.max(0, Math.min(1, sizeVariation));
  const minMult = 0.5 - 0.35 * variation;
  const maxMult = 1.0 + 0.6 * variation;

  const intVar = Math.max(0, Math.min(1, intensityVariation));
  // Use a curve so even 30–50% slider gives a visible spread; full range 0.2x–2x for strong variation
  const intVarCurved = intVar * intVar;
  const intensitySpread = 1.8 * intVarCurved;

  const rotationRad = (bokehRotation * Math.PI) / 180;
  for (const s of toDraw) {
    const r = s.r / 255, g = s.g / 255, b = s.b / 255;
    const [nr, ng, nb] = bokehTransform(r, g, b);
    const color = `rgb(${clamp(nr)},${clamp(ng)},${clamp(nb)})`;
    const t = (1 - 0.5 * variation) * s.brightness + 0.5 * variation * Math.random();
    const radius = bokehSize * (minMult + (maxMult - minMult) * Math.max(0, Math.min(1, t)));
    const intensityMult = 1 + (Math.random() - 0.5) * 2 * intensitySpread;
    const alpha = Math.min(1, Math.max(0, intensity * s.brightness * Math.max(0.2, intensityMult)));
    const rotation = bokehRotationRandom ? Math.random() * Math.PI * 2 : rotationRad;
    drawBokehBlob(ctxOut, s.x, s.y, radius, color, shape, alpha, softBokeh, rotation);
  }
}

/**
 * Main export: render bokeh blur from image to canvas
 * @param {HTMLImageElement} image
 * @param {HTMLCanvasElement} outputCanvas
 * @param {Object} options
 * @param {number} options.blurStrength - blur radius (pixels)
 * @param {number} options.bokehSize - radius of bokeh blobs
 * @param {number} options.threshold - luminance threshold 0..1 for highlights
 * @param {number} options.intensity - bokeh overlay intensity
 * @param {string} options.shape - 'circle' | 'hexagon' | 'pentagon'
 * @param {number|null} options.maxDimension - max width/height for preview (null = full res)
 * @param {string} options.colorStyle - 'natural' | 'warm' | 'cool' | ...
 * @param {number} options.sizeVariation - 0..1 mix of small and large bokeh
 * @param {number} options.intensityVariation - 0..1 mix of strong and soft bokeh
 * @param {number} options.softBokeh - 0..1 soft edge on bokeh
 * @param {number} options.vignette - 0..1 edge darkening
 * @param {string} options.blurQuality - 'fast' | 'standard' | 'smooth' (blur passes)
 * @param {number} options.saturationWeight - 0..1 prefer colored highlights
 * @param {number} options.bokehDensity - 0.25..2 max bokeh count multiplier
 * @param {number} options.sampleDetail - 0..1 higher = finer sampling, more bokeh
 * @param {number} options.thresholdSoftness - 0..0.3 include softer highlights
 * @param {number} options.bokehRotation - degrees for polygon shapes
 * @param {boolean} options.bokehRotationRandom - random rotation per blob
 * @param {number} options.chromaticAberration - 0..1 lens-like RGB fringing
 */
export function renderBokeh(image, outputCanvas, options = {}) {
  const {
    blurStrength = 12,
    bokehSize = 8,
    threshold = 0.65,
    intensity = 1.2,
    shape = 'circle',
    maxDimension = 1200,
    colorStyle = 'natural',
    sizeVariation = 0,
    intensityVariation = 0,
    softBokeh = 0,
    vignette = 0,
    blurQuality = 'standard',
    saturationWeight = 0,
    bokehDensity = 1,
    maxBokehCount = 800,
    sampleDetail = 0.5,
    thresholdSoftness = 0,
    bokehRotation = 0,
    bokehRotationRandom = false,
    chromaticAberration = 0,
  } = options;

  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;

  let scale = 1;
  if (maxDimension != null && (w > maxDimension || h > maxDimension)) {
    scale = maxDimension / Math.max(w, h);
  }
  const width = (w * scale) | 0;
  const height = (h * scale) | 0;

  outputCanvas.width = width;
  outputCanvas.height = height;
  const ctx = outputCanvas.getContext('2d', { willReadFrequently: true });

  // Work canvas for blur
  const work = document.createElement('canvas');
  work.width = width;
  work.height = height;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  wctx.drawImage(image, 0, 0, width, height);

  const blurPasses = blurQuality === 'smooth' ? 5 : blurQuality === 'fast' ? 2 : 3;
  gaussianBlur(wctx, width, height, blurStrength, blurPasses);

  // 2) Draw blurred image to output and apply color tint to the blur layer only
  ctx.drawImage(work, 0, 0);
  applyColorStyle(ctx, width, height, colorStyle);

  // 3) Extract highlights from *original* for crisp bokeh spots, draw on top (with style-specific bokeh colors)
  const origCanvas = document.createElement('canvas');
  origCanvas.width = width;
  origCanvas.height = height;
  const origCtx = origCanvas.getContext('2d', { willReadFrequently: true });
  origCtx.drawImage(image, 0, 0, width, height);
  const originalData = origCtx.getImageData(0, 0, width, height);
  extractAndDrawBokeh(wctx, ctx, width, height, {
    bokehSize,
    threshold,
    intensity,
    shape,
    colorStyle,
    sizeVariation,
    intensityVariation,
    softBokeh,
    saturationWeight,
    bokehDensity,
    maxBokehCount,
    sampleDetail,
    thresholdSoftness,
    bokehRotation,
    bokehRotationRandom,
  }, originalData);

  if (vignette > 0) applyVignette(ctx, width, height, Math.min(1, vignette));
  if (chromaticAberration > 0) applyChromaticAberration(ctx, width, height, Math.min(1, chromaticAberration));

  return { width, height, scale };
}
