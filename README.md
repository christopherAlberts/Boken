# Boken

Transform any image with **bokeh blur** in the browser. No uploads, no server — everything runs locally.

![Boken](https://img.shields.io/badge/bokeh-blur-7c6cf6)

## Features

- **Drag & drop** or **paste** images, or paste an image URL
- **Real-time bokeh effect**: Gaussian blur + highlight extraction with circle, hexagon, or pentagon bokeh shapes
- **Before/after comparison** slider
- **Presets**: Portrait, Landscape, Dramatic, Subtle, Vintage
- **Adjustable controls**: Blur strength, bokeh size, highlight threshold, intensity, shape
- **Download** as PNG or JPEG
- **Privacy-first**: All processing happens in your browser; no data is sent anywhere

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Drop an image and tweak the sliders.

## Build

```bash
npm run build
```

Output is in `dist/`. Deploy to GitHub Pages, Netlify, or any static host. For GitHub Pages, set `base: './'` in `vite.config.js` (already set).

## Tech

- **Vite** for dev and build
- **Canvas 2D** for blur and bokeh (no WebGL deps, works everywhere)
- Vanilla JS, no framework

## License

MIT
