#!/usr/bin/env python3
"""
fig4_eval.py — Figure 4: matching accuracy on the curated gold-standard set.

Reads ONLY paper/figures/data/metrics.json (committed snapshot of real eval runs:
evalMatchEngine.js and evalCriterionMatcher.js). Renders:
  (a) Precision / Recall / F1 / Accuracy, weighted scorer vs criterion-level matcher
  (b) Confusion matrix — weighted scorer
  (c) Confusion matrix — criterion-level matcher
  (d) Ranking quality (nDCG@10, scorer only — the gate is not a ranker)
  (e) Worked false-positive example (trial 22615, HER2 requirement)

Output: paper/figures/fig4_eval.png
"""
import os
from matplotlib.gridspec import GridSpec
from matplotlib.patches import FancyBboxPatch, Patch
import matplotlib.pyplot as plt
import numpy as np

from figstyle import set_style, load_metrics, panel_label, value_labels, COL

set_style()
M = load_metrics()
ME = M["match_engine"]
CM = M["criterion_matcher"]
FP = M["false_positive_example"]
GS = M["gold_standard"]

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "fig4_eval.png")

fig = plt.figure(figsize=(7.4, 5.7))
gs = GridSpec(2, 12, figure=fig, height_ratios=[1.0, 0.95],
              hspace=0.62, wspace=2.4,
              left=0.07, right=0.985, top=0.80, bottom=0.12)

ME_COL = COL["amber"]
CM_COL = COL["teal"]

# ---- (a) headline metrics ----------------------------------------------------
axa = fig.add_subplot(gs[0, 0:8])
metrics = ["Precision", "Recall", "F1", "Accuracy"]
me_vals = [ME["precision"], ME["recall"], ME["f1"], ME["accuracy"]]
cm_vals = [CM["precision"], CM["recall"], CM["f1"], CM["accuracy"]]
x = np.arange(len(metrics))
w = 0.38
b1 = axa.bar(x - w / 2, me_vals, w, color=ME_COL, label=ME["label"].split("(")[0].strip())
b2 = axa.bar(x + w / 2, cm_vals, w, color=CM_COL, label=CM["label"].split("(")[0].strip())
value_labels(axa, b1, fmt="{:.0f}")
value_labels(axa, b2, fmt="{:.0f}")
axa.set_xticks(x)
axa.set_xticklabels(metrics)
axa.set_ylabel("Score (%)")
axa.set_ylim(0, 112)
axa.set_yticks([0, 25, 50, 75, 100])
axa.set_title("Eligibility classification on gold standard", pad=6)
# Highlight the precision gap — the paper's central finding.
axa.annotate("", xy=(x[0] + w / 2, cm_vals[0]), xytext=(x[0] - w / 2, me_vals[0]),
             arrowprops=dict(arrowstyle="->", color=COL["red"], lw=1.3,
                             connectionstyle="arc3,rad=-0.25"))
axa.text(x[0], 30, f"+{cm_vals[0] - me_vals[0]:.0f} pts\nprecision",
         ha="center", va="center", fontsize=7.4, color=COL["red"], fontweight="bold")
panel_label(axa, "a", dx=-0.06)

# ---- confusion-matrix helper -------------------------------------------------
def draw_confusion(ax, conf, title, accent):
    """2x2: rows = gold label (Eligible/Ineligible), cols = engine decision."""
    TP, FP_, FN, TN = conf["TP"], conf["FP"], conf["FN"], conf["TN"]
    grid = [[("TP", TP, True), ("FN", FN, False)],
            [("FP", FP_, False), ("TN", TN, True)]]
    for r in range(2):
        for c in range(2):
            name, val, correct = grid[r][c]
            if correct:
                face = accent
                alpha = 0.22 + 0.55 * (val / max(TP + TN, 1))
            else:
                face = COL["red"]
                alpha = 0.0 if val == 0 else 0.30 + 0.55 * (val / max(FP_ + FN, 1))
            ax.add_patch(plt.Rectangle((c, 1 - r), 1, 1, facecolor=face, alpha=alpha,
                                       edgecolor=COL["ink"], lw=0.8))
            ax.text(c + 0.5, 1 - r + 0.60, str(val), ha="center", va="center",
                    fontsize=14, fontweight="bold", color=COL["ink"])
            ax.text(c + 0.5, 1 - r + 0.26, name, ha="center", va="center",
                    fontsize=7.2, color=COL["ink"])
    ax.set_xlim(0, 2)
    ax.set_ylim(0, 2)
    ax.set_xticks([0.5, 1.5])
    ax.set_xticklabels(["Match", "No-match"], fontsize=7.6)
    ax.set_yticks([1.5, 0.5])
    ax.set_yticklabels(["Eligible", "Ineligible"], fontsize=7.6, rotation=90, va="center")
    ax.xaxis.set_ticks_position("none")
    ax.yaxis.set_ticks_position("none")
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_title(title, pad=6, fontsize=8.8)
    ax.set_xlabel("engine decision", fontsize=7.2)

# ---- (d) ranking quality (nDCG@10, scorer only) ------------------------------
axd = fig.add_subplot(gs[0, 8:12])
ndcg = ME["ndcg_at_10"]
bd = axd.bar([0], [ndcg], 0.5, color=ME_COL)
value_labels(axd, bd, fmt="{:.1f}", dy=1.0)
axd.set_xlim(-0.6, 0.6)
axd.set_ylim(0, 112)
axd.set_yticks([0, 25, 50, 75, 100])
axd.set_xticks([0])
axd.set_xticklabels(["Weighted\nscorer"], fontsize=7.6)
axd.set_ylabel("nDCG@10 (%)")
axd.set_title("Ranking quality", pad=6)
axd.text(0.0, -0.30, "criterion gate does\nnot rank (n/a)",
         transform=axd.transAxes, ha="center", va="top",
         fontsize=6.9, color=COL["gray"], style="italic")
panel_label(axd, "d", dx=-0.14)

# ---- (b),(c) confusion matrices ---------------------------------------------
axb = fig.add_subplot(gs[1, 0:3])
draw_confusion(axb, ME["confusion"], "Weighted scorer", ME_COL)
panel_label(axb, "b", dx=-0.10, dy=1.14)

axc = fig.add_subplot(gs[1, 3:6])
draw_confusion(axc, CM["confusion"], "Criterion-level matcher", CM_COL)
panel_label(axc, "c", dx=-0.10, dy=1.14)

# ---- (e) worked false-positive example --------------------------------------
axe = fig.add_subplot(gs[1, 6:12])
axe.axis("off")
panel_label(axe, "e", dx=0.0, dy=1.14)
box = FancyBboxPatch((0.01, 0.02), 0.98, 0.96,
                     boxstyle="round,pad=0.015,rounding_size=0.03",
                     transform=axe.transAxes, facecolor=COL["paper"],
                     edgecolor=COL["lightgray"], lw=1.0)
axe.add_patch(box)
scores = FP["match_engine_scores"]
pts = ", ".join(f"{k}={v}" for k, v in scores.items())
# Fixed line positions + manual wrapping so the callout always fits its box.
rows = [
    (0.90, f"Worked example — trial {FP['trial_id']}", "bold", COL["ink"], 9.6),
    (0.765, "Requires HER2 TKD activating mutation; these", "italic", COL["ink"], 7.5),
    (0.69, "patients carry EGFR / ALK / other drivers.", "italic", COL["ink"], 7.5),
    (0.55, f"Weighted scorer matched {len(scores)} ineligible patients", "bold", COL["red"], 8.1),
    (0.475, f"above threshold  ({pts})", "normal", COL["red"], 7.3),
    (0.325, "Criterion-level matcher", "bold", CM_COL, 8.1),
    (0.25, f"{FP['criterion_matcher_verdict']}", "normal", CM_COL, 7.3),
]
for y, text, style_, color, size in rows:
    weight = "bold" if style_ == "bold" else "normal"
    italic = "italic" if style_ == "italic" else "normal"
    axe.text(0.055, y, text, transform=axe.transAxes, ha="left", va="center",
             fontsize=size, color=color, fontweight=weight, fontstyle=italic)

# ---- caption strip -----------------------------------------------------------
nat = GS["nature"]
cap = (f"Gold standard: {GS['patients']} patients, {GS['pairs']} patient–trial pairs "
       f"({GS['labels']['eligible']} eligible / {GS['labels']['ineligible']} ineligible / "
       f"{GS['labels']['uncertain']} uncertain). {nat}.")
fig.text(0.5, 0.005, cap, ha="center", va="bottom", fontsize=6.6,
         color=COL["gray"], style="italic", wrap=True)

handles = [Patch(facecolor=ME_COL, label="Weighted scorer (matchEngine)"),
           Patch(facecolor=CM_COL, label="Criterion-level matcher")]
fig.legend(handles=handles, loc="upper center", bbox_to_anchor=(0.5, 0.925),
           ncol=2, frameon=False, handlelength=1.1, columnspacing=1.6)
fig.suptitle("Criterion-level matching removes the false positives that weighted scoring cannot",
             fontsize=10.5, fontweight="bold", y=0.985)

fig.savefig(OUT)
print(f"wrote {OUT}")
