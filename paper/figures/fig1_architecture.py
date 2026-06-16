#!/usr/bin/env python3
"""
fig1_architecture.py — Figure 1: end-to-end system architecture / workflow.

Schematic (no fitted data). The one quantitative annotation — corpus size — is
read from metrics.json so it cannot drift from the rest of the manuscript.

Output: paper/figures/fig1_architecture.png
"""
import os
import matplotlib.pyplot as plt

from figstyle import (set_style, load_metrics, schematic_ax, add_box, add_arrow,
                      right, left, COL)

set_style()
M = load_metrics()
N_TRIALS = M["corpus"]["trials_indexed"]

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "fig1_architecture.png")

# light tints for stage fills
TINT = {
    "blue": "#DCE8F5", "teal": "#D6F0EB", "amber": "#FBEDD4",
    "purple": "#E6DCF1", "green": "#DAEFE1", "gray": "#E7EAF0",
}

fig, ax = plt.subplots(figsize=(7.5, 3.9))
schematic_ax(ax)

# ---- pipeline stages ---------------------------------------------------------
stages = [
    ("1 · Upload", "Record images\n& PDFs", "blue"),
    ("2 · OCR", "Vision-LLM chain\nDoubao, Kimi fallback", "teal"),
    ("3 · Extraction", "LLM + Zod schema\nSSE-streamed fields", "amber"),
    ("4 · Matching", "SQL filter, then\nscore + criterion gate", "purple"),
    ("5 · Results", "Ranked trials +\nplain-language reasons", "green"),
]
x0, w, gap, y, h = 3.0, 16.2, 3.2, 52, 26
boxes = []
for i, (title, body, ckey) in enumerate(stages):
    bx = x0 + i * (w + gap)
    b = add_box(ax, bx, y, w, h, title=title, body=body,
                fc=TINT[ckey], ec=COL[ckey], tc=COL["ink"],
                title_size=8.7, body_size=6.9, rounding=2.0)
    boxes.append(b)
for i in range(len(boxes) - 1):
    add_arrow(ax, right(boxes[i]), left(boxes[i + 1]), color=COL["gray"], lw=1.8)

# input / output captions above the ends
ax.text(left(boxes[0])[0] + 8.1, y + h + 5.5,
        "Real-world Chinese oncology records", ha="center", va="center",
        fontsize=7.6, style="italic", color=COL["ink"])
ax.text(right(boxes[-1])[0] - 8.1, y + h + 5.5,
        "Explained, ranked matches", ha="center", va="center",
        fontsize=7.6, style="italic", color=COL["ink"])
add_arrow(ax, (left(boxes[0])[0] - 1.5, y + h / 2),
          (left(boxes[0])[0] + 0.2, y + h / 2), color=COL["gray"], lw=1.8)

# ---- system-wide property chips ---------------------------------------------
ax.plot([3, 97], [42, 42], color=COL["lightgray"], lw=1.0)
ax.text(3, 38.5, "System-wide properties", ha="left", va="center",
        fontsize=7.8, fontweight="bold", color=COL["gray"])

chips = [
    ("Privacy by design", f"Reversible PII scrub\nbefore any LLM call", "blue"),
    ("Streaming UX", "SSE field-groups,\nfast first paint", "teal"),
    ("Corpus", f"{N_TRIALS} recruiting trials,\ndecomposed criteria", "purple"),
    ("Deployed", "Web H5 +\nWeChat mini-program", "green"),
]
cw, cgap, cy, ch = 22.0, 2.4, 6, 24
cx0 = 3.0
for i, (title, body, ckey) in enumerate(chips):
    cx = cx0 + i * (cw + cgap)
    add_box(ax, cx, cy, cw, ch, title=title, body=body,
            fc="#FFFFFF", ec=COL[ckey], tc=COL["ink"],
            title_size=7.9, body_size=6.6, lw=1.1, rounding=1.8)

fig.suptitle("An end-to-end system for trial matching from real-world records",
             fontsize=10.8, fontweight="bold", y=0.98)
fig.subplots_adjust(left=0.01, right=0.99, top=0.90, bottom=0.02)
fig.savefig(OUT)
print(f"wrote {OUT}")
