# PipelineLab

Open the published site and choose **Get started** to enter Learn. The workspace includes eight lessons, a four-stage simulator, a numerical solver, four hazard demonstrations, 30 practice questions and eight presentation steps.

## Run locally

Extract the ZIP first. Install Python 3 if it is not already available. From the extracted PipelineLab directory, run:

```powershell
python start.py
```

On Windows you can also use `py start.py`; on macOS/Linux use `python3 start.py`. The launcher opens your browser automatically. Keep the terminal open while using the app; press Ctrl+C to stop. If the port is busy, run `python start.py --port 8735`.

Alternatively, start a static server manually:

```powershell
python -m http.server 8734 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:8734/ in a browser. The app uses browser ES modules, so serve it over HTTP.

## Verify

```powershell
node --test tests/model.test.mjs
```

No build step, backend, login or AI API is required. Settings, saved programs, saved calculator problems and learning progress use versioned browser local storage.

All application code and video/image assets are included in `dist/`. Edit `app.css` for the glass learning workspace, `app.mjs` for application views, `content.mjs` for lessons/questions, and `engine.mjs` for CPU simulation. The landing page uses `index.html`, `style.css`, and `motion.js`. Node.js is optional and only needed to run the tests above.

Google Fonts loads the display fonts when online; the site uses system fallback fonts offline. The app and bundled video work without external APIs. Browser-saved progress belongs to the browser and local URL you use and is not included in the ZIP.

## Model boundaries

The Pipeline Model panel documents all execution rules. The simulator supports ADD, SUB, LOAD, STORE, BEQ and NOP, eight registers, 32 word memory addresses, 64 source instructions and 256 cycles per run. LOAD and STORE occupy Execute for two cycles. Shared memory reserves its port for both cycles of a memory transaction. The calculator independently supports up to 20 stages and 10,000 instructions.

The video retains the source's 1280 × 720 resolution. The former logo area was interpolated from nearby pixels and may look slightly softer. Video camera frames follow the original film.

## Verification performed

22 automated tests cover numerical formulas, instruction parsing, register dependencies, forwarding, load-use waiting, memory conflicts, branches, register and memory results, snapshot restoration, execution bounds, unit tolerance and storage recovery. Browser checks cover landing-page navigation, all six application areas, calculator output, reverse stepping, instruction errors, forwarding, practice progress after reload, presentation controls and mobile layout.
