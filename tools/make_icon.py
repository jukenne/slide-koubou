"""アプリのアイコン（app/icon.png と app/icon.ico）を作る。Python 標準機能だけで描く。
使い方: python tools/make_icon.py
"""
import struct, zlib
from pathlib import Path

N, SS = 256, 3   # 256px。ふちをなめらかにするため 3倍で描いて縮める


def inside(x, y, x0, y0, x1, y1, r):
    """角丸の四角の中か"""
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def color(x, y):
    if not inside(x, y, 8, 8, 248, 248, 54):
        return (0, 0, 0, 0)
    if inside(x, y, 50, 70, 206, 170, 12):          # 白いスライド
        if inside(x, y, 68, 90, 150, 104, 7):        # 見出しの線
            return (37, 99, 235, 255)
        if inside(x, y, 68, 118, 188, 126, 4) or inside(x, y, 68, 138, 170, 146, 4):
            return (182, 188, 198, 255)
        return (255, 255, 255, 255)
    if inside(x, y, 122, 170, 134, 196, 2) or inside(x, y, 92, 194, 164, 206, 6):   # 台
        return (255, 255, 255, 255)
    return (37, 99, 235, 255)


rows = []
for py in range(N):
    row = bytearray([0])
    for px in range(N):
        acc = [0, 0, 0, 0]
        for sy in range(SS):
            for sx in range(SS):
                r, g, b, a = color(px + (sx + .5) / SS, py + (sy + .5) / SS)
                acc[0] += r * a; acc[1] += g * a; acc[2] += b * a; acc[3] += a
        a = acc[3]
        row += bytes([round(acc[0] / a), round(acc[1] / a), round(acc[2] / a), round(a / SS / SS)] if a else [0, 0, 0, 0])
    rows.append(bytes(row))


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))


png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', N, N, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')
out = Path(__file__).resolve().parent.parent / 'app'
(out / 'icon.png').write_bytes(png)
# .ico は「PNG を1枚入れた箱」として作る（Windows Vista 以降で使える形）
(out / 'icon.ico').write_bytes(struct.pack('<HHH', 0, 1, 1) + struct.pack('<BBBBHHII', 0, 0, 0, 0, 1, 32, len(png), 22) + png)
print('ok', len(png))
