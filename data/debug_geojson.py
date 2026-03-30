# debug_geojson.py

import json
from pathlib import Path
from collections import defaultdict
import math

INPUT = Path("data/map_data.geojson")
OUTPUT = Path("data/map_data_cleaned.geojson")  # optional

def is_valid_coord(coord):
    if not isinstance(coord, (list, tuple)) or len(coord) != 2:
        return False
    lon, lat = coord
    if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)):
        return False
    if math.isnan(lon) or math.isnan(lat):
        return False
    return -180 <= lon <= 180 and -90 <= lat <= 90

def main():
    data = json.loads(INPUT.read_text())
    features = data.get("features", [])

    duplicates = defaultdict(list)
    invalid = []
    seen = set()

    for f in features:
        props = f.get("properties", {})
        name = (props.get("name") or "").strip().lower()
        coords = f.get("geometry", {}).get("coordinates")

        if not is_valid_coord(coords):
            invalid.append(f)
            continue

        key = (name, round(coords[0], 6), round(coords[1], 6))
        duplicates[key].append(f)

    # Report duplicates
    dup_count = 0
    print("\n=== DUPLICATES (same name + same coordinates) ===")
    for key, feats in duplicates.items():
        if len(feats) > 1:
            dup_count += len(feats) - 1
            print(f"\nName: {key[0]}  Coords: {key[1:]}")
            print(f"Count: {len(feats)}")

    # Report invalid
    print("\n=== INVALID COORDINATES ===")
    for f in invalid:
        print(f.get("properties", {}).get("name"), f.get("geometry"))

    print("\n=== SUMMARY ===")
    print(f"Total features: {len(features)}")
    print(f"Duplicate entries: {dup_count}")
    print(f"Invalid coordinate entries: {len(invalid)}")

    # Optional cleaned output
    cleaned = []
    seen_keys = set()

    for f in features:
        props = f.get("properties", {})
        name = (props.get("name") or "").strip().lower()
        coords = f.get("geometry", {}).get("coordinates")

        if not is_valid_coord(coords):
            continue

        key = (name, round(coords[0], 6), round(coords[1], 6))
        if key in seen_keys:
            continue
        seen_keys.add(key)
        cleaned.append(f)

    cleaned_geojson = {"type": "FeatureCollection", "features": cleaned}
    OUTPUT.write_text(json.dumps(cleaned_geojson, indent=2))
    print(f"\nCleaned file written to {OUTPUT}")

if __name__ == "__main__":
    main()
