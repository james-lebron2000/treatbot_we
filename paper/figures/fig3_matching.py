#!/usr/bin/env python3
"""
fig3_matching.py — Figure 3: explainable two-stage patient-trial matching.

(a) funnel schematic (corpus -> coarse filter -> candidates -> score+gate -> shortlist)
(b) scoring-dimension weights  [REAL: read from metrics.json scoring_weights]
(c) illustrative explainable decision, with the criterion gate overriding the score

Output: paper/figures/fig3_matching.png
"""
import os
from matplotlib.gridspec import GridSpec
import matplotlib.pyplot as plt
import numpy as np

from figstyle import (set_style, load_metrics, schematic_ax, add_box, add_arrow,
                      bottom, top, panel_label, COL)

set_style()
M = load_metrics()
W = M["scoring_weights"]
N_TRIALS = M["corpus"]["trials_indexed"]
THR = M["match_engine"]["threshold"]

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "fig3_matching.png")

fig = plt.figure(figsize=(7.5, 4.7))
gs = GridSpec(2, 12, figure=fig, height_ratios=[1.12, 0.88],
              hspace=0.35, wspace=1.4,
              left=0.04, right=0.975, top=0.88, bottom=0.06)

# ---- (a) funnel --------------------------------------------------------------
axa = fig.add_subplot(gs[:, 0:5])
schematic_ax(axa)
panel_label(axa, "a", dx=0.04, dy=1.02)
axa.set_title("Two-stage funnel", pad=2)

fn = [
    (8, 80, 84, 13, f"Corpus — {N_TRIALS} recruiting trials", COL["blue"], "#DCE8F5"),
    (20, 49, 60, 13, "Candidate trials", COL["purple"], "#E6DCF1"),
    (28, 16, 44, 15, "Ranked shortlist\n+ reasons", COL["green"], "#DAEFE1"),
]
fb = []
for (x, y, w, h, label, ec, fc) in fn:
    fb.append(add_box(axa, x, y, w, h, title=label, fc=fc, ec=ec,
                      title_size=8.0, rounding=2.0))
add_arrow(axa, bottom(fb[0]), top(fb[1]), color=COL["gray"], lw=1.8)
add_arrow(axa, bottom(fb[1]), top(fb[2]), color=COL["gray"], lw=1.8)
axa.text(82, 65.5, "Stage 1\nSQL coarse filter\n(disease · status ·\ngeography)",
         ha="right", va="center", fontsize=6.7, color=COL["ink"], linespacing=1.3)
axa.text(82, 33, "Stage 2\nweighted score +\ncriterion gate",
         ha="right", va="center", fontsize=6.7, color=COL["ink"], linespacing=1.3)

# ---- (b) scoring weights (REAL) ---------------------------------------------
axb = fig.add_subplot(gs[0, 5:12])
items = [
    ("disease — exact", W["disease_exact"], COL["teal"]),
    ("disease — direction", W["disease_direction"], COL["teal"]),
    ("gene / mutation", W["gene_mutation"], COL["amber"]),
    ("stage", W["stage"], COL["blue"]),
    ("treatment line", W["treatment_line"], COL["blue"]),
    ("base", W["base"], COL["gray"]),
    ("ECOG", W["ecog"], COL["blue"]),
    ("PD-L1", W["pdl1"], COL["blue"]),
    ("disease tag", W["disease_tag_bonus"], COL["gray"]),
    ("city", W["city"], COL["gray"]),
]
items.sort(key=lambda t: t[1], reverse=True)
labels = [t[0] for t in items]
vals = [t[1] for t in items]
colors = [t[2] for t in items]
ypos = np.arange(len(items))[::-1]
bars = axb.barh(ypos, vals, color=colors, height=0.66)
for yi, v in zip(ypos, vals):
    axb.text(v + 0.6, yi, f"+{v}", va="center", ha="left", fontsize=7.0)
axb.set_yticks(ypos)
axb.set_yticklabels(labels, fontsize=7.2)
axb.set_xlim(0, max(vals) * 1.18)
axb.set_xlabel("points contributed to match score")
axb.set_title("Scoring dimensions", pad=3)
axb.text(0.99, 1.04, f"max attainable {W['max']} · match threshold {THR}",
         transform=axb.transAxes, ha="right", va="bottom",
         fontsize=6.6, color=COL["gray"], style="italic")
panel_label(axb, "b", dx=-0.20, dy=1.08)

# ---- (c) explainable decision (illustrative) --------------------------------
axc = fig.add_subplot(gs[1, 5:12])
schematic_ax(axc)
panel_label(axc, "c", dx=-0.02, dy=1.10)
axc.set_title("Explainable decision (illustrative; weights as in b)", pad=2)

pos_chips = [
    (f"lung adeno = trial disease  +{W['disease_exact']}", COL["teal"]),
    (f"EGFR L858R required & present  +{W['gene_mutation']}", COL["amber"]),
    (f"stage IV eligible  +{W['stage']}", COL["blue"]),
    (f"ECOG 1 ≤ 2  +{W['ecog']}", COL["blue"]),
]
y = 86
for txt, c in pos_chips:
    axc.text(3, y, txt, ha="left", va="center", fontsize=7.0, color=COL["ink"],
             bbox=dict(boxstyle="round,pad=0.30", fc="#FFFFFF", ec=c, lw=1.1))
    y -= 17
axc.text(70, 60, "score 80\n MATCH ", ha="center", va="center", fontsize=8.2,
         fontweight="bold", color=COL["green"],
         bbox=dict(boxstyle="round,pad=0.45", fc="#DAEFE1", ec=COL["green"], lw=1.3))

axc.plot([2, 98], [27, 27], color=COL["lightgray"], lw=0.9)
axc.text(3, 16, "HER2 activating mutation required — NOT MET",
         ha="left", va="center", fontsize=7.0, color=COL["red"],
         bbox=dict(boxstyle="round,pad=0.30", fc="#FBE3E7", ec=COL["red"], lw=1.1))
axc.text(70, 16, "criterion gate\n EXCLUDES ", ha="center", va="center", fontsize=7.6,
         fontweight="bold", color=COL["red"],
         bbox=dict(boxstyle="round,pad=0.40", fc="#FBE3E7", ec=COL["red"], lw=1.2))
add_arrow(axc, (47, 16), (58, 16), color=COL["red"], lw=1.6)

fig.suptitle("Transparent matching: a weighted score plus a hard criterion gate",
             fontsize=10.8, fontweight="bold", y=0.975)
fig.savefig(OUT)
print(f"wrote {OUT}")
