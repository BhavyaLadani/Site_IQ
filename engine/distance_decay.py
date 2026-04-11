"""
Distance-Decay Functions
========================
Transforms raw distance values into normalized scores [0, 1].
All proximity features MUST use these functions before scoring.

Retail Model — uses kilometre-based exponential decay:
  score(d) = base_score * exp(-lambda * d_km)
  lambda values are feature-specific (see config.DECAY_LAMBDA).
"""

import math
from config import DECAY_CONFIG, DECAY_LAMBDA


# ─────────────────────────────────────────────
# Core: Exponential Decay (km-based, feature-specific lambda)
# ─────────────────────────────────────────────

def exponential_decay_km(distance_m: float,
                         feature: str = "default",
                         base_score: float = 1.0) -> float:
    """
    Exponential decay keyed to a named geospatial feature.

    score = base_score * exp(-lambda * d_km)

    Parameters
    ----------
    distance_m : float
        Distance in metres to the feature.
    feature : str
        Feature key from DECAY_LAMBDA config
        ("highway_ramp", "transit_stop", "competitor",
         "flood_zone", "default").
    base_score : float
        Base score multiplier (0–1). Default 1.0.

    Returns
    -------
    float  in [0, base_score]
    """
    lam = DECAY_LAMBDA.get(feature, DECAY_LAMBDA["default"])
    d_km = max(distance_m, 0) / 1000.0
    return base_score * math.exp(-lam * d_km)


# ─────────────────────────────────────────────
# Legacy: Generic Exponential (metre-based, for backward compat)
# ─────────────────────────────────────────────

def exponential_decay(distance_m: float,
                      max_distance_m: float = None,
                      decay_rate: float = None) -> float:
    """
    Generic exponential decay: score = exp(-rate * d)
    Used internally by layer processors that have not yet been
    migrated to per-feature lambda.
    """
    if max_distance_m is None:
        max_distance_m = DECAY_CONFIG["max_distance_m"]
    if decay_rate is None:
        decay_rate = DECAY_CONFIG["decay_rate"]

    if distance_m <= 0:
        return 1.0
    if distance_m >= max_distance_m:
        return 0.0

    return math.exp(-decay_rate * distance_m)


def linear_decay(distance_m: float,
                 max_distance_m: float = None) -> float:
    """Linear decay: score = 1 - d / d_max"""
    if max_distance_m is None:
        max_distance_m = DECAY_CONFIG["max_distance_m"]
    if distance_m <= 0:
        return 1.0
    if distance_m >= max_distance_m:
        return 0.0
    return 1.0 - (distance_m / max_distance_m)


def inverse_square_decay(distance_m: float,
                         max_distance_m: float = None,
                         reference_distance_m: float = 100.0) -> float:
    """Inverse-square decay: score = 1 / (1 + (d/d_ref)^2)"""
    if max_distance_m is None:
        max_distance_m = DECAY_CONFIG["max_distance_m"]
    if distance_m <= 0:
        return 1.0
    if distance_m >= max_distance_m:
        return 0.0
    return 1.0 / (1.0 + (distance_m / reference_distance_m) ** 2)


def apply_decay(distance_m: float,
                method: str = None,
                feature: str = "default",
                **kwargs) -> float:
    """
    Unified decay dispatcher.

    For the retail model the default method is "exponential" which
    routes to the km-based, feature-specific lambda version.
    """
    if method is None:
        method = DECAY_CONFIG["default_method"]

    if method == "exponential":
        # Use the feature-specific km-based version for the retail model
        return exponential_decay_km(distance_m, feature=feature)
    elif method == "linear":
        return linear_decay(distance_m, **kwargs)
    elif method == "inverse_square":
        return inverse_square_decay(distance_m, **kwargs)
    else:
        raise ValueError(f"Unknown decay method: {method}. "
                         f"Choose from exponential, linear, inverse_square")
