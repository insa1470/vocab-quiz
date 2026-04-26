"""
下載學測英文歷屆試題 PDF（110~114年）
來源：升學王 go100.com.tw
"""

import urllib.request
import os
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "原始資料" / "學測"

EXAMS = {
    "110": "https://www.go100.com.tw/file/exam/S110-GSAT/110GSAT_English.pdf",
    "111": "https://www.go100.com.tw/file/exam/S111-GSAT/111GSAT_English.pdf",
    "112": "https://www.go100.com.tw/file/exam/S112-GSAT/112GSAT_English.pdf",
    "113": "https://www.go100.com.tw/file/exam/S113-GSAT/113GSAT_English.pdf",
    "114": "https://www.go100.com.tw/file/exam/S114-GSAT/114GSAT_English.pdf",
}

def download(year, url):
    dest = OUTPUT_DIR / f"學測_{year}_英文.pdf"
    if dest.exists():
        print(f"[跳過] {dest.name} 已存在")
        return
    print(f"[下載] {year}年學測英文 ...", end=" ", flush=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp, open(dest, "wb") as f:
            f.write(resp.read())
        size_kb = dest.stat().st_size // 1024
        print(f"完成（{size_kb} KB）")
    except Exception as e:
        print(f"失敗：{e}")

if __name__ == "__main__":
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for year, url in EXAMS.items():
        download(year, url)
    print("\n完成。請把國中會考 PDF 手動放進 原始資料/會考/ 資料夾。")
