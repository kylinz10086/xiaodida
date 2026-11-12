"""压缩小程序静态图，降低主包体积（保留原始文件到 .asset-originals）。"""
import os
import shutil
from PIL import Image

ROOT = r"F:\xiaodida\apps\user"
BACKUP = r"F:\xiaodida\.asset-originals"
TARGETS = {
    r"static\icon\logo1.png": (600, 600),
    r"static\icon\head1.png": (192, 192),
    r"static\icon\head2.png": (192, 192),
    r"static\icon\checkall.png": (128, 128),
    r"static\icon\share.png": (128, 128),
    r"static\icon\home.png": (128, 128),
    r"static\img\qq.png": (128, 128),
}

os.makedirs(BACKUP, exist_ok=True)
for rel, box in TARGETS.items():
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        print("SKIP missing", rel)
        continue
    backup = os.path.join(BACKUP, rel.replace("\\", "__"))
    if not os.path.exists(backup):
        shutil.copy2(path, backup)
    before = os.path.getsize(path)
    im = Image.open(path)
    im.thumbnail(box, Image.LANCZOS)
    im.save(path, "PNG", optimize=True)
    after = os.path.getsize(path)
    print(f"{rel}: {before // 1024}KB -> {after // 1024}KB, size={im.size}")
