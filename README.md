# Climate Map App

A lightweight, static web application for visualizing climate-organization data
on an interactive Mapbox map.

## Live Map
Once GitHub Pages is enabled, the map will be available at:

https://<your-username>.github.io/<your-repo-name>/

## Project Structure
index.html          # Main application entry point
app.js              # Map logic, filters, popups
styles.css          # UI styling
data/
  map_data.geojson  # Geocoded organization data

## Development
To preview locally:

python -m http.server

Then open:
http://localhost:8000

## Deployment
GitHub Pages serves the site from the repository root.

## Mapbox Token
Your Mapbox public token must allow:
https://<your-username>.github.io/*

