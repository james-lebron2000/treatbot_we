#!/usr/bin/env python3
"""
fig2_ocr_benchmark.py — Figure 2: real multi-provider document-extraction benchmark.

Reads ONLY paper/figures/data/metrics.json (committed snapshot of the
2026-05-01 benchmark, docs/bench-vision-llm-2026-05-01.md). Renders:
  (a) Total cost over the 6-document set, per provider
  (b) Mean per-document latency, per provider
  (c) Capability / faithfulness matrix (vision, success, faithful, usable)
  (d) Published token pricing (input / output, CNY per 1M tokens)
  (e) Per-document cost, Doubao vs Kimi

Output: paper/figures/fig2_ocr_benchmark.png
"""
import os
from matplotlib.gridspec import GridSpec
import matplotlib.pyplot as plt
import numpy as np

from figstyle import set_style, load_metrics, panel_label, value_labels, COL

set_style()
M = load_metrics()
B = M["ocr_benchmark"]
P = B["providers"]
PER = M["ocr_benchmark_per_file"]

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "fig2_ocr_benchmark.png")

DOUBAO, KIMI, MINIMAX = COL["blue"], COL["amber"], COL["gray"]

fig = plt.figure(figsize=(7.4, 5.4))
gs = GridSpec(2, 6, figure=fig, height_ratios=[1.0, 1.05],
              hspace=0.62, wspace=1.7,
              left=0.07, right=0.985, top=0.86, bottom=0.13)

# ---- (a) total cost ----------------------------------------------------------
axa = fig.add_subplot(gs[0, 0:2])
prov = ["Doubao", "Kimi"]
cost = [P["doubao"]["total_cny"], P["kimi"]["total_cny"]]
ba = axa.bar(prov, cost, color=[DOUBAO, KIMI], width=0.6)
value_labels(axa, ba, fmt="¥{:.3f}", dy=0.004)
axa.set_ylabel("Total cost, 6 docs (CNY)")
axa.set_ylim(0, max(cost) * 1.25)
axa.set_title("Cost", pad=4)
panel_label(axa, "a", dx=-0.16)

# ---- (b) mean latency --------------------------------------------------------
axb = fig.add_subplot(gs[0, 2:4])
lat = [P["doubao"]["avg_latency_ms"] / 1000.0, P["kimi"]["avg_latency_ms"] / 1000.0]
bb = axb.bar(prov, lat, color=[DOUBAO, KIMI], width=0.6)
value_labels(axb, bb, fmt="{:.1f}s", dy=1.2)
axb.set_ylabel("Mean latency / doc (s)")
axb.set_ylim(0, max(lat) * 1.25)
axb.set_title("Latency", pad=4)
panel_label(axb, "b", dx=-0.16)

# ---- (d) token pricing -------------------------------------------------------
axd = fig.add_subplot(gs[0, 4:6])
price = B["pricing_cny_per_1m_tokens"]
provs3 = ["Doubao", "Kimi", "MiniMax"]
keys3 = ["doubao", "kimi", "minimax"]
inp = [price[k]["input"] for k in keys3]
out = [price[k]["output"] for k in keys3]
x = np.arange(3)
w = 0.38
axd.bar(x - w / 2, inp, w, color=COL["teal"], label="input")
axd.bar(x + w / 2, out, w, color=COL["purple"], label="output")
for xi, (vi, vo) in enumerate(zip(inp, out)):
    axd.text(xi - w / 2, vi + 0.4, f"{vi:.2f}", ha="center", va="bottom", fontsize=6.6)
    axd.text(xi + w / 2, vo + 0.4, f"{vo:.1f}", ha="center", va="bottom", fontsize=6.6)
axd.set_xticks(x)
axd.set_xticklabels(provs3, fontsize=7.4)
axd.set_ylabel("CNY / 1M tokens")
axd.set_ylim(0, max(out) * 1.22)
axd.set_title("Published token price", pad=4)
axd.legend(loc="upper left", handlelength=1.0)
panel_label(axd, "d", dx=-0.16)

# ---- (c) capability / faithfulness matrix -----------------------------------
axc = fig.add_subplot(gs[1, 0:3])
cols = ["Vision\ncapable", "6/6\nsuccess", "Faithful\n(no hallucin.)", "Production\nusable"]
rows = ["Doubao", "Kimi", "MiniMax*"]
#  yes / no / partial
cap = [
    ["yes", "yes", "yes", "yes"],       # Doubao
    ["yes", "yes", "partial", "yes"],   # Kimi
    ["no", "no", "no", "no"],           # MiniMax
]
sym = {"yes": ("✓", COL["green"]), "no": ("✗", COL["red"]), "partial": ("≈", COL["amber"])}
nrow, ncol = len(rows), len(cols)
for r in range(nrow):
    for c in range(ncol):
        s, color = sym[cap[r][c]]
        axc.add_patch(plt.Rectangle((c, nrow - 1 - r), 1, 1, facecolor=color, alpha=0.14,
                                    edgecolor=COL["lightgray"], lw=0.8))
        axc.text(c + 0.5, nrow - 1 - r + 0.5, s, ha="center", va="center",
                 fontsize=13, fontweight="bold", color=color,
                 fontfamily="DejaVu Sans")
axc.set_xlim(0, ncol)
axc.set_ylim(0, nrow)
axc.set_xticks(np.arange(ncol) + 0.5)
axc.set_xticklabels(cols, fontsize=6.9)
axc.set_yticks(np.arange(nrow) + 0.5)
axc.set_yticklabels(rows[::-1], fontsize=7.8)
axc.xaxis.set_ticks_position("none")
axc.yaxis.set_ticks_position("none")
for sp in axc.spines.values():
    sp.set_visible(False)
axc.set_title("Capability & faithfulness", pad=4)
axc.text(0.0, -0.42,
         "≈ Kimi: repetition / max-token truncation on long records.\n"
         "* MiniMax (text-only key): HTTP 200 but ignores image and fabricates text.",
         transform=axc.transAxes, ha="left", va="top", fontsize=6.2,
         color=COL["gray"], style="italic")
panel_label(axc, "c", dx=-0.06, dy=1.13)

# ---- (e) per-document cost ---------------------------------------------------
axe = fig.add_subplot(gs[1, 3:6])
files, dcost, kcost = [], {}, {}
for row in PER:
    f = row["file"]
    if f not in dcost and f not in kcost:
        files.append(f)
    if row["provider"] == "doubao":
        dcost[f] = row["cny"]
    elif row["provider"] == "kimi":
        kcost[f] = row["cny"]
# preserve first-seen order
seen, order = set(), []
for row in PER:
    if row["file"] not in seen:
        seen.add(row["file"])
        order.append(row["file"])
xpos = np.arange(len(order))
dv = [dcost.get(f, 0) for f in order]
kv = [kcost.get(f, 0) for f in order]
axe.bar(xpos - w / 2, dv, w, color=DOUBAO, label="Doubao")
axe.bar(xpos + w / 2, kv, w, color=KIMI, label="Kimi")
short = [f.replace("-", "\n").replace(".png", "") for f in order]
axe.set_xticks(xpos)
axe.set_xticklabels(short, fontsize=6.0)
axe.set_ylabel("Cost / doc (CNY)")
axe.set_title("Per-document cost", pad=4)
axe.legend(loc="upper right", handlelength=1.0)
panel_label(axe, "e", dx=-0.10, dy=1.13)

# ---- caption -----------------------------------------------------------------
cap_txt = (f"{B['n_documents']} de-identified real-world records (gene reports + record "
           f"images), {B['date']}. {B['path_note']}")
fig.text(0.5, 0.012, cap_txt, ha="center", va="bottom", fontsize=6.4,
         color=COL["gray"], style="italic", wrap=True)
fig.suptitle("Multi-provider document extraction: cost, latency and faithfulness trade-offs",
             fontsize=10.5, fontweight="bold", y=0.965)

fig.savefig(OUT)
print(f"wrote {OUT}")
