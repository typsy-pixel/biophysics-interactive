# Bio × Physics — Interactive Biophysics Notebook

A self-contained browser website for exploring interactive biophysics simulations, concept maps, and experiments.

## Use it like a normal website

### Mac: double-click to open
Double-click **`OPEN_BIOPHYSICS.command`**. It starts a tiny local web server and opens the site automatically in your default browser.

### Any computer: open the site file
Double-click **`index.html`**. The project has no Node/npm/build requirement.

For the most reliable local behavior, the Mac launcher is recommended because it serves the files over `http://localhost` just like a normal website.

## GitHub Pages

1. Create a GitHub repository.
2. Upload the contents of this folder to the repository root.
3. Go to **Settings → Pages**.
4. Choose **Deploy from a branch**, select `main`, and select `/ (root)`.
5. Save. GitHub Pages will publish `index.html`.

The project uses relative asset paths, so it works from both the repository root and a GitHub Pages project URL.

## Project structure

```text
.
├── index.html
├── README.md
├── .gitignore
├── .nojekyll
├── OPEN_BIOPHYSICS.command
└── assets/
    ├── css/
    │   └── styles.css
    ├── js/
    │   └── app.js
    └── images/
```

## Dependencies

No package manager or build step is required. The simulations use standard HTML, CSS, JavaScript, and Canvas APIs.

Google Fonts are optional; fallback system fonts are defined so the site remains usable without them.

The animal nervous-system explorer uses built-in reference data and does not require an API key or backend.


## Interactive experiments

Six parameter-driven modules now expose an explicit experiment workflow. Change the controls, then press **Run** to apply those values to the model/calculation: DNA mechanics, Kinesin, ATP synthase, Plant transport, Mammal transport, and Photosynthesis. Other modules keep their native start, pause, fire, load, or reset controls.

Canvas circles are drawn through a small safety wrapper that clamps invalid radii, preventing `IndexSizeError` crashes on very small viewports.
