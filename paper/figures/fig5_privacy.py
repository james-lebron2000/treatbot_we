#!/usr/bin/env python3
"""
fig5_privacy.py — Figure 5: privacy- and observability-by-design (schematic).

Every element depicts a VERIFIED repo module (paths in the manuscript Methods):
  (a) dual-path PII handling — reversible scrubForLlm vs one-way scrubForLog
      (server/utils/piiScrubber.js)
  (b) defense-in-depth controls — llmSchemas.js (Zod), csvSafe.js (CWE-1236),
      adminAuth.js + auditLog.js (RBAC/audit), promptRegistry.js (versioned prompts)
  (c) observability — Prometheus registry treatbot_* (server/middleware/metrics.js)

No fitted data; this is an architecture figure. (We do NOT claim a prompt-injection
fence: no such mechanism was found in the prompt-construction code.)

Output: paper/figures/fig5_privacy.png
"""
import os
from matplotlib.gridspec import GridSpec
import matplotlib.pyplot as plt

from figstyle import (set_style, schematic_ax, add_box, add_arrow,
                      right, left, panel_label, COL)

set_style()
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "fig5_privacy.png")

TINT = {"amber": "#FBEDD4", "teal": "#D6F0EB", "green": "#DAEFE1",
        "blue": "#DCE8F5", "gray": "#E7EAF0", "purple": "#E6DCF1"}

fig = plt.figure(figsize=(7.5, 5.3))
gs = GridSpec(2, 12, figure=fig, height_ratios=[1.18, 0.82],
              hspace=0.30, wspace=1.1,
              left=0.03, right=0.98, top=0.89, bottom=0.04)

# ---- (a) dual-path PII handling ---------------------------------------------
axa = fig.add_subplot(gs[0, :])
schematic_ax(axa)
panel_label(axa, "a", dx=0.02, dy=1.02)
axa.set_title("Two scrub policies, chosen by destination  (piiScrubber.js)", pad=4)

raw = add_box(axa, 2, 38, 15, 23, title="Raw record",
              body="names · IDs ·\nphones · address",
              fc=TINT["amber"], ec=COL["amber"], title_size=8.2, body_size=6.8)

# top lane — reversible LLM path
t1 = add_box(axa, 23, 64, 21, 15, title="scrubForLlm",
             body="<NAME_1> <PHONE_1>", fc=TINT["teal"], ec=COL["teal"],
             title_size=7.8, body_size=6.6)
t2 = add_box(axa, 47, 64, 17, 15, title="LLM", body="sees only\nplaceholders",
             fc="#FFFFFF", ec=COL["teal"], title_size=7.8, body_size=6.6)
t3 = add_box(axa, 67, 64, 24, 15, title="restoreFromLlm",
             body="user sees real values", fc=TINT["green"], ec=COL["green"],
             title_size=7.8, body_size=6.6)
for a, b in [(t1, t2), (t2, t3)]:
    add_arrow(axa, right(a), left(b), color=COL["teal"], lw=1.6)
axa.text(57, 83.5, "LLM path — reversible: in-memory placeholder-to-value mapping, "
         "never logged or persisted", ha="center", va="center",
         fontsize=6.7, color=COL["teal"], style="italic")

# bottom lane — irreversible log path
b1 = add_box(axa, 23, 14, 21, 15, title="scrubForLog",
             body="***1234 · <ID_REDACTED>", fc=TINT["gray"], ec=COL["gray"],
             title_size=7.8, body_size=6.6)
b2 = add_box(axa, 47, 14, 26, 15, title="Logs / Sentry",
             body="one-way mask, no mapping", fc="#FFFFFF", ec=COL["gray"],
             title_size=7.8, body_size=6.6)
add_arrow(axa, right(b1), left(b2), color=COL["gray"], lw=1.6)
axa.text(48, 7, "log path — irreversible: phone keeps last 4 digits, all other PII redacted",
         ha="center", va="center", fontsize=6.7, color=COL["gray"], style="italic")

# fork arrows
add_arrow(axa, right(raw), left(t1), color=COL["teal"], lw=1.7, rad=0.18)
add_arrow(axa, right(raw), left(b1), color=COL["gray"], lw=1.7, rad=-0.18)

# ---- (b) defense-in-depth ----------------------------------------------------
axb = fig.add_subplot(gs[1, 0:7])
schematic_ax(axb)
panel_label(axb, "b", dx=0.02, dy=1.08)
axb.set_title("Defense-in-depth (verified modules)", pad=4)
chips = [
    ("Reversible PII scrub before any LLM call", COL["green"], "piiScrubber.js"),
    ("Zod schema validation on every LLM output", COL["teal"], "llmSchemas.js"),
    ("CSV formula-injection escape · CWE-1236", COL["amber"], "csvSafe.js"),
    ("RBAC auth (401 / 403) + audit-log middleware", COL["blue"], "adminAuth.js · auditLog.js"),
    ("Versioned prompts + multi-provider fallback", COL["purple"], "promptRegistry.js"),
]
y = 88
for text, c, src in chips:
    axb.text(3, y, text, ha="left", va="center", fontsize=7.2, color=COL["ink"],
             bbox=dict(boxstyle="round,pad=0.34", fc="#FFFFFF", ec=c, lw=1.2))
    axb.text(97, y, src, ha="right", va="center", fontsize=6.0,
             color=COL["gray"], family="monospace")
    y -= 19

# ---- (c) observability -------------------------------------------------------
axc = fig.add_subplot(gs[1, 7:12])
schematic_ax(axc)
panel_label(axc, "c", dx=0.0, dy=1.08)
axc.set_title("Observability (metrics.js)", pad=4)
add_box(axc, 3, 8, 94, 80, title="", fc=TINT["blue"], ec=COL["blue"], lw=1.2)
axc.text(50, 80, "Prometheus registry  treatbot_*", ha="center", va="center",
         fontsize=8.0, fontweight="bold", color=COL["blue"])
lines = [
    "HTTP request duration  {method, route, status}",
    "OCR queue depth  {waiting, active, failed, completed}",
    "Match-score summary  {score buckets}",
    "LLM call duration  {provider, model, operation, status}",
    "+ default process metrics · /metrics endpoint",
]
yy = 64
for ln in lines:
    axc.text(8, yy, "•", ha="left", va="center", fontsize=8, color=COL["blue"])
    axc.text(13, yy, ln, ha="left", va="center", fontsize=6.6, color=COL["ink"])
    yy -= 13

fig.suptitle("Privacy- and observability-by-design",
             fontsize=10.8, fontweight="bold", y=0.965)
fig.savefig(OUT)
print(f"wrote {OUT}")
