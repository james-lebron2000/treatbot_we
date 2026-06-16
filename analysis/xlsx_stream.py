"""Streaming reader for the CRF-export .xlsx files.

These files declare a bogus <dimension ref="A1"/> and store almost all text as
inline strings, so openpyxl read_only mode only yields the top-left cell.
We stream the worksheet XML directly with iterparse, ignoring the dimension,
handling inline strings / shared strings / numbers, and placing sparse cells
by parsing the column letter from each cell's r="B5" reference.

Memory-safe even for the 1.5GB-uncompressed sheet (elements are cleared).
"""
import zipfile, re
import xml.etree.ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_col_re = re.compile(r"([A-Z]+)")


def col_to_idx(ref):
    """'B5' -> 1 (0-based column index)."""
    letters = _col_re.match(ref).group(1)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - ord("A") + 1)
    return n - 1


def load_shared_strings(z):
    try:
        data = z.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    out = []
    root = ET.fromstring(data)
    for si in root.findall(f"{NS}si"):
        # concatenate all <t> under this <si>
        out.append("".join(t.text or "" for t in si.iter(f"{NS}t")))
    return out


def stream_rows(path, max_rows=None):
    """Yield rows as lists (None for empty cells), ignoring bogus dimension."""
    with zipfile.ZipFile(path) as z:
        shared = load_shared_strings(z)
        with z.open("xl/worksheets/sheet1.xml") as fh:
            ctx = ET.iterparse(fh, events=("end",))
            n = 0
            for event, elem in ctx:
                if elem.tag == f"{NS}row":
                    cells = {}
                    maxc = -1
                    for c in elem.findall(f"{NS}c"):
                        ref = c.get("r")
                        ci = col_to_idx(ref) if ref else 0
                        t = c.get("t")
                        val = None
                        if t == "inlineStr":
                            is_el = c.find(f"{NS}is")
                            if is_el is not None:
                                val = "".join(x.text or "" for x in is_el.iter(f"{NS}t"))
                        elif t == "s":
                            v = c.find(f"{NS}v")
                            if v is not None and v.text is not None:
                                val = shared[int(v.text)]
                        else:
                            v = c.find(f"{NS}v")
                            if v is not None:
                                val = v.text
                        cells[ci] = val
                        if ci > maxc:
                            maxc = ci
                    row = [cells.get(i) for i in range(maxc + 1)]
                    elem.clear()
                    yield row
                    n += 1
                    if max_rows and n >= max_rows:
                        return
