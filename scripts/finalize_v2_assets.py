"""Encode the offline Blender bake for the runtime; no runtime baking/downloads."""
from pathlib import Path
from PIL import Image
R=Path(__file__).resolve().parents[1]
Image.open(R.parent/'geodata/v2/tree-impostor.png').convert('RGBA').save(R/'public/assets/tree-impostor.webp',quality=88,method=6)
