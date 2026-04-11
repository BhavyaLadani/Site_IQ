import json
from engine.ingestion import load_spatial_data

def test_pipeline():
    print("Testing Valid WKT (should succeed)...")
    valid_wkt = "POLYGON ((-74.00 40.71, -73.99 40.71, -73.99 40.72, -74.00 40.72, -74.00 40.71))"
    res1 = load_spatial_data(valid_wkt)
    print(json.dumps(res1, indent=2))
    print("\n----------------\n")
    
    print("Testing Invalid Geometry (Self-intersecting Polygon) (should produce buffer(0) fix warning)...")
    invalid_wkt = "POLYGON ((-74.00 40.71, -73.99 40.72, -73.99 40.71, -74.00 40.72, -74.00 40.71))"
    res2 = load_spatial_data(invalid_wkt)
    print(json.dumps(res2, indent=2))
    print("\n----------------\n")
    
    print("Testing Deduplication (3 points, 2 are identical)...")
    wkt3 = "MULTIPOINT (-74.0 40.7, -74.0 40.7, -73.9 40.8)"
    res3 = load_spatial_data(wkt3)
    print("WARNINGS:", res3.get("ingestion_warnings"))
    print("\n----------------\n")
    
    print("Testing File System Load with non-existent file...")
    res4 = load_spatial_data("path/to/nothing.shp")
    print(json.dumps(res4, indent=2))

if __name__ == "__main__":
    test_pipeline()
