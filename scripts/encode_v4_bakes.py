"""Encode the matching offline Blender crown renders without new source downloads."""
from pathlib import Path
from PIL import Image
R=Path(__file__).resolve().parents[1]
for region in ['uetliberg','lenzerheide']:
 folder=R/'public/assets'/('lenzerheide' if region=='lenzerheide' else '')
 Image.open(R.parent/'geodata/v4'/(region+'-tree.png')).convert('RGBA').save(folder/'tree-impostor-v4.webp',quality=90,method=6)
