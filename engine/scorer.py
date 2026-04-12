"""
Scoring Engine — Core Orchestrator (Retail Model)
==================================================
Implements the 6-step Reasoning Protocol with:
  - Retail layer weights
  - Threshold bonuses applied AFTER weighted sum (capped at 100)
  - 4 hard constraints (population, zoning, flood, AQI)
  - Per-layer breakdown always included in output

CONSTRAINTS:
- NEVER return composite score without per-layer breakdown
- NEVER interpolate missing data silently — flag gaps explicitly
- ALWAYS apply distance-decay before scoring proximity features
- Hard-constraint violations → composite_score = 0 unconditionally
"""

import uuid
import logging
from config import LAYER_WEIGHTS, GRADE_THRESHOLDS, THRESHOLD_BONUSES, SCORING_MODEL, DATA_DIR
from engine.layers import process_all_layers, LAYER_PROCESSORS
from engine.hard_constraints import check_all_constraints
from engine.isochrone import generate_isochrone
from engine.data_ingestion import load_all_layers

logger = logging.getLogger("Scorer")

# Preload global layers to prevent disk I/O on every score request
try:
    GLOBAL_LAYERS = load_all_layers(DATA_DIR)
except Exception as e:
    logger.error(f"Failed to preload GLOBAL_LAYERS: {e}")
    GLOBAL_LAYERS = {}


# ─────────────────────────────────────────────
# Grade Assignment
# ─────────────────────────────────────────────

def _assign_grade(score: int) -> str:
    if score >= GRADE_THRESHOLDS["A"]:
        return "A"
    elif score >= GRADE_THRESHOLDS["B"]:
        return "B"
    elif score >= GRADE_THRESHOLDS["C"]:
        return "C"
    elif score >= GRADE_THRESHOLDS["D"]:
        return "D"
    return "F"


# ─────────────────────────────────────────────
# Threshold Bonuses
# ─────────────────────────────────────────────

def _apply_threshold_bonuses(base_score: float,
                             layer_scores: dict,
                             constraint_metadata: dict,
                             reasoning: list) -> tuple:
    """
    Apply configured threshold bonuses AFTER weighted sum.
    Returns (final_score, bonuses_applied_list).

    Bonus sources checked in priority order:
      1. constraint_metadata (populated by hard_constraints.check_all_constraints)
      2. layer_scores[demographics][details]
    """
    # Gather bonus-eligible attribute values
    attrs = {}
    attrs.update(constraint_metadata)

    demo_details = layer_scores.get("demographics", {}).get("details", {})
    attrs.update(demo_details)

    reasoning.append("Step 4b: Applying threshold bonuses")
    bonuses_applied = []
    bonus_total = 0.0

    for (attr_key, op, threshold, points, description) in THRESHOLD_BONUSES:
        val = attrs.get(attr_key)
        if val is None:
            reasoning.append(f"  [SKIP] {description} — attribute '{attr_key}' not available")
            continue

        try:
            val = float(val)
        except (TypeError, ValueError):
            continue

        triggered = False
        if op == ">=" and val >= threshold:
            triggered = True
        elif op == ">" and val > threshold:
            triggered = True
        elif op == "<=" and val <= threshold:
            triggered = True
        elif op == "<" and val < threshold:
            triggered = True

        if triggered:
            bonus_total += points
            bonuses_applied.append({
                "description": description,
                "attribute":   attr_key,
                "value":       val,
                "bonus":       points,
            })
            reasoning.append(f"  [+{points}] {description} "
                             f"({attr_key}={val:.0f} {op} {threshold})")
        else:
            reasoning.append(f"  [--] {description} "
                             f"({attr_key}={val:.0f} did not meet {op} {threshold})")

    final = min(100.0, base_score + bonus_total)
    reasoning.append(f"  Base={base_score:.1f} + Bonuses={bonus_total:.0f} "
                     f"=> Final={final:.1f} (capped at 100)")
    return final, bonuses_applied


# ─────────────────────────────────────────────
# Recommendation Generator
# ─────────────────────────────────────────────

def _generate_recommendation(layer_scores: dict, grade: str,
                              hard_failures: list,
                              bonuses: list) -> str:
    """2-sentence recommendation referencing top-2 scoring drivers."""
    if hard_failures:
        return (f"This site FAILS hard constraints: "
                f"{'; '.join(hard_failures)}. "
                f"Composite score is forced to 0 — site cannot proceed.")

    sorted_layers = sorted(
        layer_scores.items(),
        key=lambda x: x[1].get("weighted", 0),
        reverse=True
    )
    if not sorted_layers:
        return "Insufficient data to generate a recommendation."

    strengths = [n.replace("_", " ").title() for n, _ in sorted_layers[:2]]
    weaknesses = [n.replace("_", " ").title()
                  for n, s in sorted_layers[-2:] if s.get("raw", 0) < 50]

    rec = f"Primary strengths are {' and '.join(strengths)} (grade: {grade})."

    if bonuses:
        bonus_descs = [b["description"].split("(")[0].strip() for b in bonuses]
        rec += f" Bonus points awarded for {', '.join(bonus_descs)}."
    elif weaknesses:
        rec += (f" Mitigation needed for {' and '.join(weaknesses)}, "
                f"which scored below the acceptable threshold.")
    else:
        rec += " All layers are performing at an acceptable level."

    return rec


# ─────────────────────────────────────────────
# Main Scoring Entry Point
# ─────────────────────────────────────────────

def score_site(lat: float, lon: float,
               site_id: str = None,
               weights: dict = None,
               use_case: str = "retail",
               include_isochrone: bool = True,
               isochrone_profile: str = None,
               isochrone_range: list = None) -> dict:
    """
    Score a single site — Retail Model.

    Reasoning Protocol:
      Step 1 — Layer data availability check
      Step 2 — Distance-decay applied inside each layer processor
      Step 3 — Hard constraint evaluation (short-circuit to 0 on failure)
      Step 4 — Weighted sum + threshold bonuses (cap at 100)
      Step 5 — Grade assignment
      Step 6 — Recommendation generation

    Returns
    -------
    dict matching the Output Contract JSON schema.
    """
    if site_id is None:
        site_id = f"site_{uuid.uuid4().hex[:8]}"
    if weights is None:
        weights = LAYER_WEIGHTS.copy()

    all_data_gaps = []
    reasoning = []
    reasoning.append(
        f"[{use_case.replace('_',' ').title()} Site Readiness v2.0] "
        f"Scoring ({lat:.4f}, {lon:.4f})"
    )

    # ── Step 1: Layer data availability ──────────────────────────
    reasoning.append("► Phase 1: Synthesizing Spatial Data Availability")
    layer_results = process_all_layers(lat, lon, datasets=GLOBAL_LAYERS)

    for name, result in layer_results.items():
        status = "data available" if result["data_available"] else "NO DATA"
        reasoning.append(f"  [{status}] {name}")
        all_data_gaps.extend(result.get("gaps", []))

    # ── Step 2: Decay note (applied inside processors) ───────────
    reasoning.append(
        "► Phase 2: Applying Exponential Distance-Decay Transformation "
        "(λ tuned per-feature geometry)"
    )

    # ── Step 3: Hard constraints ──────────────────────────────────
    reasoning.append("► Phase 3: Evaluating Hard Environment & Policy Constraints")
    constraint_result = check_all_constraints(
        lat, lon,
        flood_data=GLOBAL_LAYERS.get("environment"),
        zoning_data=GLOBAL_LAYERS.get("land_use"),
        demo_data=GLOBAL_LAYERS.get("demographics"),
        env_data=GLOBAL_LAYERS.get("environment")
    )
    hard_failures = constraint_result["failures"]
    constraint_meta = constraint_result.get("metadata", {})
    all_data_gaps.extend(constraint_result["data_gaps"])

    if not constraint_result["all_passed"]:
        for f in hard_failures:
            reasoning.append(f"  [FAIL] {f}")
        reasoning.append("  => Short-circuiting: composite_score = 0")

        formatted_layers = {
            name: {
                "raw":     res["raw_score"],
                "weighted": 0.0,
                "weight":  weights.get(name, 0),
                "details": res.get("details", {}),
            }
            for name, res in layer_results.items()
        }

        iso = generate_isochrone(lat, lon, isochrone_profile, isochrone_range) \
              if include_isochrone else {}

        return {
            "site_id":                  site_id,
            "coordinates":              {"lat": lat, "lon": lon},
            "composite_score":          0,
            "grade":                    "F",
            "layer_scores":             formatted_layers,
            "hard_constraint_failures": hard_failures,
            "data_gaps":                all_data_gaps,
            "bonuses_applied":          [],
            "isochrone_geojson":        iso,
            "recommendation":           _generate_recommendation(
                                            formatted_layers, "F",
                                            hard_failures, []),
            "reasoning_trace":          reasoning,
            "scoring_model":            {
                "name": f"{use_case.replace('_',' ').title()} Site Readiness",
                "version": "2.0",
                "use_case": use_case,
            },
        }

    reasoning.append("  => All hard constraints PASSED")

    # ── Step 4: Weighted sum ──────────────────────────────────────
    reasoning.append("► Phase 4: Computing Multi-Layered Convolutional Composite Score")

    formatted_layers = {}
    weighted_sum = 0.0
    total_weight = 0.0

    for name, result in layer_results.items():
        w = weights.get(name, 0)
        raw = result["raw_score"]
        weighted = raw * w

        formatted_layers[name] = {
            "raw":     round(raw, 2),
            "weighted": round(weighted, 2),
            "weight":  w,
            "details": result.get("details", {}),
        }

        reasoning.append(
            f"  {name}: raw={raw:.1f} x weight={w:.2f} = {weighted:.1f}"
        )

        if result["data_available"]:
            weighted_sum += weighted
            total_weight += w

    # Renormalize if some layers had no data
    if 0 < total_weight < 1.0:
        base_composite = weighted_sum / total_weight
        reasoning.append(
            f"  Renormalized (active weight={total_weight:.2f}): "
            f"{base_composite:.1f}"
        )
    else:
        base_composite = weighted_sum

    reasoning.append(f"  Weighted sum (before bonuses): {base_composite:.1f}")

    # ── Step 4b: Threshold bonuses ────────────────────────────────
    final_composite, bonuses_applied = _apply_threshold_bonuses(
        base_composite, formatted_layers, constraint_meta, reasoning
    )

    composite_score = int(round(min(max(final_composite, 0), 100)))

    # ── Step 5: Grade ─────────────────────────────────────────────
    grade = _assign_grade(composite_score)
    reasoning.append(f"► Phase 5: Executing Threshold Classification => Grade {grade}")

    # ── Step 6: Recommendation ────────────────────────────────────
    reasoning.append("► Phase 6: Synthesizing Final Actionable Recommendation")
    recommendation = _generate_recommendation(
        formatted_layers, grade, hard_failures, bonuses_applied
    )
    reasoning.append(f"  => {recommendation}")

    # ── Isochrone ─────────────────────────────────────────────────
    iso = generate_isochrone(lat, lon, isochrone_profile, isochrone_range) \
          if include_isochrone else {}

    return {
        "site_id":                  site_id,
        "coordinates":              {"lat": lat, "lon": lon},
        "composite_score":          composite_score,
        "grade":                    grade,
        "layer_scores":             formatted_layers,
        "hard_constraint_failures": hard_failures,
        "data_gaps":                all_data_gaps,
        "bonuses_applied":          bonuses_applied,
        "isochrone_geojson":        iso,
        "recommendation":           recommendation,
        "reasoning_trace":          reasoning,
        "scoring_model":            {
            "name": f"{use_case.replace('_',' ').title()} Site Readiness",
            "version": "2.0",
            "use_case": use_case,
        },
    }


# ─────────────────────────────────────────────
# Batch Scoring
# ─────────────────────────────────────────────

def score_batch(sites: list, weights: dict = None,
                include_isochrone: bool = False) -> list:
    """
    Score multiple sites (max 50 per request).

    Parameters
    ----------
    sites : list[dict]
        Each dict: {"lat": float, "lon": float, "site_id": str (opt)}
    weights : dict, optional
        Custom layer weights for all sites.
    include_isochrone : bool
        Default False for batch (expensive).
    """
    results = []
    for site in sites:
        result = score_site(
            lat=float(site["lat"]),
            lon=float(site["lon"]),
            site_id=site.get("site_id"),
            weights=weights,
            include_isochrone=include_isochrone,
        )
        results.append(result)
    return results
