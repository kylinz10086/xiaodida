import glob, os
from PIL import Image

root = r"F:\xiaodida\apps\user"
files = sorted(glob.glob(os.path.join(root, "static", "**", "*.png"), recursive=True),
               key=os.path.getsize, reverse=True)[:20]
for f in files:
    im = Image.open(f)
    print(f.replace(root + "\\", ""), im.size, im.mode, round(os.path.getsize(f) / 1024, 1), "KB")
