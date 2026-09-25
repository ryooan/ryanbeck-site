# MTG project preview

Updated September 25, 2026. The project card uses a capture of the actual
Reality Fracture printable cheat sheet, including its real heading, definitions,
counts, symbols and colors. No generated illustration or invented text.

- Served thumbnail: public/assets/cards/mtg-cheat-sheet-preview.jpg (1200 x 750).
- Source capture: art-source/mtg/sheet-page.png.
- Cropped full sheet: art-source/mtg/reality-fracture-sheet.png.
- Rebuild: python tools/make-mtg-thumb.py.

Capture URL: http://localhost:8787/mtg-cheat-sheet/sheet.html?s=set-fra.
The browser capture viewport was 1280px wide; the .paper rectangle was
x=224.5, y=151.1875, width=816, height=1056. Full-page capture was used because
clipped browser screenshots applied an inconsistent offset. The script crops
that full capture, then shows its upper portion with the same light-float
staging used by the other project cards. Refresh crop coordinates when recapturing.

The source snapshot reflects the local September 24 data build, including its
pending-definition notice. It is a product preview, not a separately edited sheet.
The prior generated illustration was rejected for failing to preview the tool;
it is preserved in Git history and removed from served assets.
