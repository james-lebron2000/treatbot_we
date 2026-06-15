"""
figstyle.py — shared plotting style + data loader for Treatbot manuscript figures.

Every figure script imports from here so that (a) all panels share one
Nature-style visual language, and (b) all data-driven numbers are loaded from a
single committed snapshot (figures/data/metrics.json) whose provenance is
documented in its own `_provenance` block. No figure hard-codes a result.
"""
import json
import os
import matplotlib as mpl
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data", "metrics.json")

# ---- Colour palette (colourblind-aware) --------------------------------------
COL = {
    "blue":      "#2C6FB5",
    "teal":      "#1F9E8F",
    "amber":     "#E8A13A",
    "red":       "#D1495B",
    "green":     "#3FA15B",
    "purple":    "#6A4C93",
    "gray":      "#7A8699",
    "lightgray": "#DCE1EA",
    "paper":     "#F4F6F9",
    "ink":       "#1E2A38",
}


def load_metrics():
    """Load the single committed metrics snapshot that every figure reads from."""
    with open(DATA, "r", encoding="utf-8") as f:
        return json.load(f)


def set_style():
    """Apply a consistent, journal-style rcParams configuration."""
    mpl.rcParams.update({
        "figure.dpi": 150,
        "savefig.dpi": 300,
        "savefig.bbox": "tight",
        "font.family": "sans-serif",
        "font.sans-serif": ["Helvetica", "Arial", "DejaVu Sans"],
        "font.size": 8.5,
        "axes.titlesize": 9.5,
        "axes.titleweight": "bold",
        "axes.labelsize": 8.5,
        "axes.edgecolor": COL["ink"],
        "axes.linewidth": 0.8,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": False,
        "xtick.color": COL["ink"],
        "ytick.color": COL["ink"],
        "text.color": COL["ink"],
        "axes.labelcolor": COL["ink"],
        "legend.frameon": False,
        "legend.fontsize": 7.8,
    })


def panel_label(ax, letter, dx=-0.02, dy=1.06, fontsize=12):
    """Place a bold lower-case panel label (a, b, c …) at the top-left of an axis."""
    ax.text(dx, dy, letter, transform=ax.transAxes,
            fontsize=fontsize, fontweight="bold", va="top", ha="right")


def value_labels(ax, bars, fmt="{:.1f}", dy=0.5, fontsize=7.6, color=None):
    """Annotate each bar with its value just above the bar top."""
    for b in bars:
        h = b.get_height()
        ax.text(b.get_x() + b.get_width() / 2, h + dy, fmt.format(h),
                ha="center", va="bottom", fontsize=fontsize,
                color=color or COL["ink"])


# ---- schematic helpers (Fig 1 / 3 / 5; use a 0..100 axis) --------------------
def schematic_ax(ax):
    """Configure an axis as a blank 0..100 schematic canvas."""
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.set_aspect("auto")
    ax.axis("off")


def add_box(ax, x, y, w, h, title="", body=None, fc="#FFFFFF", ec=None, tc=None,
            title_size=8.6, body_size=6.9, lw=1.2, rounding=2.2,
            title_weight="bold", title_dy=None):
    """Rounded box on a 0..100 schematic axis. Returns (x, y, w, h)."""
    ec = ec or COL["ink"]
    tc = tc or COL["ink"]
    p = FancyBboxPatch((x, y), w, h,
                       boxstyle=f"round,pad=0,rounding_size={rounding}",
                       linewidth=lw, edgecolor=ec, facecolor=fc,
                       mutation_aspect=1.0)
    ax.add_patch(p)
    cx = x + w / 2
    if title and body is not None:
        ax.text(cx, y + h * 0.68, title, ha="center", va="center",
                fontsize=title_size, fontweight=title_weight, color=tc)
        ax.text(cx, y + h * 0.32, body, ha="center", va="center",
                fontsize=body_size, color=tc, linespacing=1.25)
    elif title:
        ty = y + h / 2 if title_dy is None else y + title_dy
        ax.text(cx, ty, title, ha="center", va="center",
                fontsize=title_size, fontweight=title_weight, color=tc,
                linespacing=1.25)
    return (x, y, w, h)


def add_arrow(ax, p_from, p_to, color=None, lw=1.6, style="-|>", rad=0.0,
              mutation_scale=13):
    """Arrow between two points on a schematic axis."""
    a = FancyArrowPatch(p_from, p_to, arrowstyle=style, mutation_scale=mutation_scale,
                        lw=lw, color=color or COL["ink"],
                        connectionstyle=f"arc3,rad={rad}", shrinkA=3, shrinkB=3)
    ax.add_patch(a)


def right(b):
    """Right-edge midpoint of a box tuple (x,y,w,h)."""
    x, y, w, h = b
    return (x + w, y + h / 2)


def left(b):
    x, y, w, h = b
    return (x, y + h / 2)


def top(b):
    x, y, w, h = b
    return (x + w / 2, y + h)


def bottom(b):
    x, y, w, h = b
    return (x + w / 2, y)
