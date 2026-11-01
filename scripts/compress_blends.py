"""Losslessly recompress editable Blender sources for GitHub's blob API limits."""
from pathlib import Path
import zstandard as zstd
import sys
root=Path(__file__).resolve().parents[1]
for name in (sys.argv[1:] or ['Uetliberg.blend','Lenzerheide.blend','Rider.blend']):
 path=root/name
 with path.open('rb') as source:raw=zstd.ZstdDecompressor().stream_reader(source).read()
 if not raw.startswith(b'BLENDER'):raise ValueError('Unexpected Blender source: '+name)
 packed=zstd.ZstdCompressor(level=19,threads=2).compress(raw)
 if zstd.ZstdDecompressor().decompress(packed)!=raw:raise ValueError('Roundtrip mismatch: '+name)
 if len(packed)<path.stat().st_size:path.write_bytes(packed)
 print(name,path.stat().st_size,flush=True)
