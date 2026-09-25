"""Stage a real rendered MTG sheet using the site's existing light-float treatment.
Capture sheet.html?s=set-fra at a 1280px viewport with the browser tool and save
its full-page PNG as art-source/mtg/sheet-page.png. Crop coordinates are the
observed .paper rectangle at capture time; no page text or art is synthesized.
"""
from pathlib import Path
import importlib.util
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("thumbs", ROOT / "tools/make-project-thumbs.py")
thumbs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(thumbs)
source = Image.open(ROOT / "art-source/mtg/sheet-page.png").convert("RGB")
sheet = source.crop((225, 151, 1041, 1207))
sheet.save(ROOT / "art-source/mtg/reality-fracture-sheet.png")
# A close crop keeps the actual heading and rules legible at project-card size.
preview = sheet.crop((0, 0, 816, 540))
thumbs.float_card(preview, ambient_src=sheet, rot=2.4, width=.85).save(
    ROOT / "public/assets/cards/mtg-cheat-sheet-preview.jpg", quality=90,
    optimize=True, progressive=True)
