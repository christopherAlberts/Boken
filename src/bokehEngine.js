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

// Multiple box blur passes approximate Gaussian
function gaussianBlur(ctx, width, height, radius) {
  const passes = 3;
  const r = Math.max(1, (radius / passes) | 0);
  const buf1 = document.createElement('canvas');
  buf1.width = width;
  buf1.height = height;
  const buf2 = document.createElement('canvas');
  buf2.width = width;
  buf2.height = height;
  const c1 = buf1.getContext('2d');
  const c2 = buf2.getContext('2d');
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
function drawBokehBlob(ctx, cx, cy, radius, color, shape, intensity) {
  const points = getShapePoints(shape);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(radius, radius);
  ctx.fillStyle = color;
  ctx.globalAlpha = Math.min(1, intensity);
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Sample bright spots from image and draw bokeh (use original for sharper highlight detection)
function extractAndDrawBokeh(ctxBlurred, ctxOut, width, height, options, originalData) {
  const { bokehSize, threshold, intensity, shape } = options;
  const imgData = originalData || ctxBlurred.getImageData(0, 0, width, height);
  const data = imgData.data;
  const step = Math.max(2, (bokehSize / 2) | 0);
  const spots = [];

  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const L = luma(r, g, b);
      if (L >= threshold) {
        const brightness = (L - threshold) / (1 - threshold + 1e-6);
        spots.push({
          x, y,
          r: data[i], g: data[i + 1], b: data[i + 2],
          brightness: Math.pow(brightness, 0.7),
        });
      }
    }
  }

  // Sort by brightness and draw larger/brighter first (optional: limit count for perf)
  spots.sort((a, b) => b.brightness - a.brightness);
  const maxSpots = 800;
  const toDraw = spots.slice(0, maxSpots);

  for (const s of toDraw) {
    const radius = bokehSize * (0.5 + 0.5 * s.brightness);
    const color = `rgb(${s.r | 0},${s.g | 0},${s.b | 0})`;
    drawBokehBlob(ctxOut, s.x, s.y, radius, color, shape, intensity * s.brightness);
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
 */
export function renderBokeh(image, outputCanvas, options = {}) {
  const {
    blurStrength = 12,
    bokehSize = 8,
    threshold = 0.65,
    intensity = 1.2,
    shape = 'circle',
  } = options;

  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;

  // Limit size for performance
  const maxDim = 1200;
  let scale = 1;
  if (w > maxDim || h > maxDim) {
    scale = maxDim / Math.max(w, h);
  }
  const width = (w * scale) | 0;
  const height = (h * scale) | 0;

  outputCanvas.width = width;
  outputCanvas.height = height;
  const ctx = outputCanvas.getContext('2d');

  // Work canvas for blur
  const work = document.createElement('canvas');
  work.width = width;
  work.height = height;
  const wctx = work.getContext('2d');
  wctx.drawImage(image, 0, 0, width, height);

  // 1) Blur the image
  gaussianBlur(wctx, width, height, blurStrength);

  // 2) Draw blurred image to output
  ctx.drawImage(work, 0, 0);

  // 3) Extract highlights from *original* for crisp bokeh spots, draw on top
  const origCanvas = document.createElement('canvas');
  origCanvas.width = width;
  origCanvas.height = height;
  const origCtx = origCanvas.getContext('2d');
  origCtx.drawImage(image, 0, 0, width, height);
  const originalData = origCtx.getImageData(0, 0, width, height);
  extractAndDrawBokeh(wctx, ctx, width, height, {
    bokehSize,
    threshold,
    intensity,
    shape,
  }, originalData);

  return { width, height, scale };
}
