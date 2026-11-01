"""Encode the offline Blender fir bake for the static game package."""
from pathlib import Path
from PIL import Image
R=Path(__file__).resolve().parents[1]
Image.open(R.parent/'geodata/lenzerheide/fir-impostor.png').convert('RGBA').save(R/'public/assets/lenzerheide/tree-impostor.webp',quality=88,method=6)
