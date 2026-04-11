from engine.scorer import score_site

test_points = [
    (23.03, 72.56,  "CG Road / Ashram Road (city center)"),
    (23.05, 72.53,  "Navrangpura / Paldi"),
    (23.07, 72.51,  "SG Highway north"),
    (23.00, 72.58,  "Maninagar / Railway Station"),
    (22.97, 72.63,  "Vastral (east)"),
    (23.10, 72.48,  "Bopal / Satellite"),
    (23.02, 72.55,  "Ellisbridge / central"),
    (23.08, 72.60,  "Nikol / Naroda"),
    (23.12, 72.52,  "Gota / Chandkheda"),
    (22.96, 72.67,  "Odhav industrial"),
]

print("=" * 70)
print("SCORING TEST — 10 POINTS ACROSS AHMEDABAD")
print("=" * 70)
print(f"{'Location':<35} {'Score':>6} {'Grade':>6}")
print("-" * 70)

for lat, lon, name in test_points:
    r = score_site(lat, lon)
    score = r["composite_score"]
    grade = r["grade"]
    failures = r.get("hard_constraint_failures", [])
    fail_msg = f"  FAIL: {failures[0][:40]}..." if failures else ""
    print(f"{name:<35} {score:>5}  {grade:>5}{fail_msg}")

print("-" * 70)
