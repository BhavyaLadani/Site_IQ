import argparse
import base64
import os
from io import BytesIO

import numpy as np
import pandas as pd
import geopandas as gpd
import matplotlib.pyplot as plt
from scipy.stats import pearsonr, spearmanr
from scipy.optimize import minimize
from jinja2 import Template

from engine.data_ingestion import load_all_layers
from engine.scoring_model import compute_score
from config import DATA_DIR

def evaluate(use_case=None):
    print("=" * 60)
    print("Booting Site Readiness Validation Engine")
    print("=" * 60)
    
    print("[*] Pre-loading all geometric spatial layers into RAM...")
    layers = load_all_layers(DATA_DIR)
    
    expert_path = os.path.join(DATA_DIR, "expert_labeled_sites.geojson")
    if not os.path.exists(expert_path):
        print(f"Error: Could not locate ground truth datasets at {expert_path}")
        return
        
    print(f"[*] Parsing Geometry & Ground Truth matrices from {expert_path}")
    expert_gdf = gpd.read_file(expert_path)
    
    if use_case:
        expert_gdf = expert_gdf[expert_gdf["use_case"] == use_case]
        print(f"[*] Filtered strictly by use_case='{use_case}'. Active targets N={len(expert_gdf)}")
        
    y_expert = expert_gdf["expert_score"].values
    
    # ---------------------------------------------------------
    # Baseline Score Evaluation
    # ---------------------------------------------------------
    def_config = {
        "demographics": 0.25,
        "transport": 0.20,
        "poi": 0.20,
        "land_use": 0.20,
        "environment": 0.15
    }
    keys = list(def_config.keys())

    print("[*] Computing initial model regressions against baseline configuration...")
    y_pred = []
    layer_scores_list = []
    for idx, row in expert_gdf.iterrows():
        pt = row.geometry
        # The compute_score expects variables exactly mapping its sub-hooks
        res = compute_score(pt.y, pt.x, layers, {"weights": def_config})
        y_pred.append(res["total_score"])
        layer_scores_list.append(res["layer_scores"])
        
    y_pred = np.array(y_pred)
    expert_gdf["pred_score"] = y_pred
    expert_gdf["error"] = np.abs(expert_gdf["expert_score"] - expert_gdf["pred_score"])
    
    mae = np.mean(np.abs(y_expert - y_pred))
    rmse = np.sqrt(np.mean((y_expert - y_pred)**2))
    
    pearson_r, _ = pearsonr(y_expert, y_pred) if len(y_expert) > 1 else (0, 0)
    spearman_rho, _ = spearmanr(y_expert, y_pred) if len(y_expert) > 1 else (0, 0)
    
    print("\n--- BASELINE METRICS ---")
    print(f"  MAE (Mean Absolute Error)     : {mae:.2f}")
    print(f"  RMSE (Root Mean Square Error) : {rmse:.2f}")
    print(f"  Pearson Correlation           : {pearson_r:.3f}")
    print(f"  Spearman Rank Correlation     : {spearman_rho:.3f}")
    
    # ---------------------------------------------------------
    # SciPy Non-Linear Optimization (L-BFGS-B & Nelder-Mead)
    # ---------------------------------------------------------
    print("\n[*] Initializing Non-Linear Weights Optimization Sequence...")
    print("    -> Boundary constraints applied [0.05, 0.50] with sum=1.00 normalization")
    
    # Objective function minimizing RMSE
    def objective(w_array):
        # Enforce bounds dynamically inside objective (handles Nelder-Mead unconstrained bleeding)
        w_norm = np.clip(w_array, 0.05, 0.5)
        # Enforce sum = 1
        w_norm = w_norm / np.sum(w_norm)
        
        cfg = dict(zip(keys, w_norm))
        y_temp_pred = []
        for i, row in expert_gdf.iterrows():
            pt = row.geometry
            res = compute_score(pt.y, pt.x, layers, {"weights": cfg})
            y_temp_pred.append(res["total_score"])
        return np.sqrt(np.mean((y_expert - np.array(y_temp_pred))**2))

    init_w_array = np.array(list(def_config.values()))
    bounds = [(0.05, 0.5) for _ in range(len(keys))]
    
    print("    -> Deploying L-BFGS-B descent (max_iter=30)...")
    res_lbfgs = minimize(objective, init_w_array, method='L-BFGS-B', bounds=bounds, options={'maxiter': 30})
    
    # Nelder-Mead simplex
    print("    -> Deploying Nelder-Mead simplex (max_iter=30)...")
    res_nelder = minimize(objective, init_w_array, method='Nelder-Mead', options={'maxiter': 30})
    
    # Select tournament winner
    opt_res = res_lbfgs if res_lbfgs.fun < res_nelder.fun else res_nelder
    best_w = np.clip(opt_res.x, 0.05, 0.5)
    best_w = best_w / np.sum(best_w)
    opt_config = dict(zip(keys, best_w))
    
    print("\n--- OPTIMAL CONFIGURATION ---")
    print(f"  Winning Optimizer : {'L-BFGS-B' if res_lbfgs.fun < res_nelder.fun else 'Nelder-Mead'}")
    print(f"  Optimal RMSE      : {opt_res.fun:.2f}")
    for k, v in opt_config.items():
        print(f"  {k.ljust(15)} : {v:.4f}")
    
    # ---------------------------------------------------------
    # Visual Output Generation
    # ---------------------------------------------------------
    print("\n[*] Synthesizing validation plot arrays for base64 encapsulation...")
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14,6))
    
    # Plot 1: Scatter
    ax1.scatter(y_expert, y_pred, alpha=0.7, c='#3b82f6', s=50, edgecolors='black')
    ax1.plot([0, 100], [0, 100], 'r--', label='Perfect Accuracy (y=x)')
    ax1.set_xlabel('Expert Ground Truth Score')
    ax1.set_ylabel('Model Predicted Score')
    ax1.set_title('Site Readiness: Model vs Ground Truth')
    ax1.grid(True, linestyle='--', alpha=0.5)
    ax1.legend()
    
    # Plot 2: Residuals
    residuals = y_pred - y_expert
    ax2.axhline(0, color='r', linestyle='--')
    ax2.scatter(y_pred, residuals, alpha=0.7, c='#8b5cf6', s=50, edgecolors='black')
    ax2.set_xlabel('Predicted Score')
    ax2.set_ylabel('Residuals (Pred - Actual)')
    ax2.set_title('Residual Mapping Configuration')
    ax2.grid(True, linestyle='--', alpha=0.5)
    
    buf = BytesIO()
    plt.tight_layout()
    plt.savefig(buf, format='png', dpi=120)
    buf.seek(0)
    plot_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close()
    
    best_sites = expert_gdf.sort_values('error').head(5)[["expert_score", "pred_score", "error", "use_case"]].to_dict(orient="records")
    worst_sites = expert_gdf.sort_values('error', ascending=False).head(5)[["expert_score", "pred_score", "error", "use_case"]].to_dict(orient="records")
    
    print("[*] Extrapolating Jinja2 Document Outputs...")
    html_template = """
    <html>
    <head>
        <title>Validation Report | Site Readiness Engine</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; color: #1e293b; background: #f8fafc;}
            h2 { border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; }
            .metric-box { background: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); margin-bottom: 20px;}
            table { border-collapse: collapse; width: 100%; margin-bottom: 30px; background: white; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border-radius: 8px; overflow: hidden;}
            th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #e2e8f0; }
            th { background-color: #f1f5f9; color: #334155; font-weight: 600; text-transform: uppercase; font-size: 12px;}
            tr:last-child td { border-bottom: none; }
            .img-container { margin: 30px 0; max-width: 1000px; border: 1px solid #cbd5e1; border-radius: 8px; background: white; padding: 20px;}
            img { width: 100%; height: auto; }
        </style>
    </head>
    <body>
        <h2>Site Readiness Analyzer: Spatial Validation Report {{ " (" ~ use_case ~ ")" if use_case else "" }}</h2>
        
        <div class="metric-box">
            <h3>Baseline Statistical Accuracy Matrix</h3>
            <p><strong>Mean Absolute Error (MAE):</strong> {{ "%.2f"|format(mae) }}</p>
            <p><strong>Root Mean Square Error (RMSE):</strong> {{ "%.2f"|format(rmse) }}</p>
            <p><strong>Pearson Correlation:</strong> {{ "%.3f"|format(pearson_r) }}</p>
            <p><strong>Spearman Rank Correlation:</strong> {{ "%.3f"|format(spearman_rho) }}</p>
        </div>
        
        <div class="metric-box">
            <h3>Optimized Weighting Configurations (Sum=1.0)</h3>
            <p>Target Goal: Minimizing RMSE boundaries across constraints [0.05, 0.50] evaluated via Scipy.Optimize.</p>
            <ul>
            {% for k, v in opt_config.items() %}
                <li><strong>{{ k.replace('_', ' ').capitalize() }}</strong>: {{ "%.3f"|format(v) }}</li>
            {% endfor %}
            </ul>
        </div>
        
        <div class="img-container">
            <img src="data:image/png;base64,{{ plot_url }}" alt="Plot Scatter & Residuals"/>
        </div>
        
        <h3>Top Predicted Matches (Lowest Delta)</h3>
        <table>
            <tr><th>Expert Target</th><th>Model Pred.</th><th>Calculated Error</th><th>Use Case Classification</th></tr>
            {% for site in best_sites %}
            <tr><td>{{ site.expert_score }}</td><td>{{ "%.1f"|format(site.pred_score) }}</td><td><strong style="color: #10b981;">{{ "%.1f"|format(site.error) }}</strong></td><td>{{ site.use_case }}</td></tr>
            {% endfor %}
        </table>
        
        <h3>Lowest Predicted Matches (Anomalies)</h3>
        <table>
            <tr><th>Expert Target</th><th>Model Pred.</th><th>Calculated Error</th><th>Use Case Classification</th></tr>
            {% for site in worst_sites %}
            <tr><td>{{ site.expert_score }}</td><td>{{ "%.1f"|format(site.pred_score) }}</td><td><strong style="color: #ef4444;">{{ "%.1f"|format(site.error) }}</strong></td><td>{{ site.use_case }}</td></tr>
            {% endfor %}
        </table>
    </body>
    </html>
    """
    
    template = Template(html_template)
    html_out = template.render(
        mae=mae, rmse=rmse, pearson_r=pearson_r, spearman_rho=spearman_rho,
        opt_config=opt_config, plot_url=plot_base64, best_sites=best_sites, worst_sites=worst_sites, use_case=use_case
    )
    
    out_file = "validation_report.html"
    with open(out_file, "w") as f:
        f.write(html_out)
        
    print(f"\n[SUCCESS] Document completely serialized and written directly to -> {out_file}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate GeoSpatial scoring methodologies systematically.")
    parser.add_argument('--use_case', type=str, default=None, help="Process regressions by specified categorical target bounds")
    args = parser.parse_args()
    evaluate(args.use_case)
