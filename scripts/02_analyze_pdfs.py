"""
用 Gemini 2.5 Flash 分析 PDF 考卷，萃取高頻單字並生成完整資料庫。

使用方式：
  1. 設定環境變數 GEMINI_API_KEY
     export GEMINI_API_KEY=AIza...
  2. python 02_analyze_pdfs.py --level 高中   （分析學測考卷）
  3. python 02_analyze_pdfs.py --level 國中   （分析會考考卷）

輸出：data/高中.json 或 data/國中.json
"""

import argparse
import json
import os
import time
from pathlib import Path

from google import genai
from google.genai import types

ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"
PDF_DIRS = {
    "高中": ROOT / "原始資料" / "學測",
    "國中": ROOT / "原始資料" / "會考",
}

MODEL = "gemini-2.5-flash"

EXTRACT_PROMPT = """你是台灣英文考試專家。以下是一份{level}英文考試試題。

請從這份試題中找出所有對考生重要的英文單字（不含 a/an/the/is/are 等基礎功能詞）。

只回傳一個 JSON 陣列，不要有任何其他文字或 markdown：
[
  {{
    "word": "單字原形",
    "phonetic": "IPA 音標，例如 /ˈstrʌɡəl/",
    "pos": "詞性，例如 v. / n. / adj. / adv.",
    "definition_zh": "簡潔的中文解釋",
    "example": "從試題取出或符合{level}程度的例句",
    "example_zh": "例句的中文翻譯",
    "usage": [
      {{"pattern": "常見搭配或片語，例如 struggle to V", "meaning_zh": "中文說明"}}
    ]
  }}
]"""

MERGE_PROMPT = """以下是從多份{level}考卷萃取的單字清單（JSON 陣列），可能有重複。

請：
1. 合併重複單字，同一個字只保留一筆，選最完整的資料
2. 依出現次數由高到低排序，加入 "frequency_rank" 欄位（1 = 最高頻）
3. 只回傳合併後的 JSON 陣列，不要有任何其他文字或 markdown

輸入資料：
{words_json}"""


def extract_words_from_pdf(client: genai.Client, pdf_path: Path, level: str) -> list:
    print(f"  分析：{pdf_path.name} ...", end=" ", flush=True)
    try:
        pdf_bytes = pdf_path.read_bytes()

        response = client.models.generate_content(
            model=MODEL,
            contents=[
                types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
                EXTRACT_PROMPT.format(level=level),
            ],
        )

        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        # 截斷到最後一個完整的 } 之後加上 ]
        last_brace = text.rfind("},")
        if last_brace != -1:
            try:
                json.loads(text)
            except json.JSONDecodeError:
                text = text[:last_brace + 1] + "\n]"

        words = json.loads(text)
        print(f"找到 {len(words)} 個單字")
        return words

    except Exception as e:
        print(f"失敗：{e}")
        return []


def is_valid_example(example: str) -> bool:
    """過濾掉中文例句或考試說明文字"""
    if not example:
        return False
    chinese_chars = sum(1 for c in example if '一' <= c <= '鿿')
    return chinese_chars / max(len(example), 1) < 0.3


def merge_and_rank(all_words: list) -> list:
    print("\n合併重複單字並排序 ...", end=" ", flush=True)

    seen: dict = {}
    for word in all_words:
        key = word.get("word", "").lower().strip()
        if not key:
            continue
        if key not in seen:
            seen[key] = {"entry": word, "count": 1}
        else:
            seen[key]["count"] += 1
            existing = seen[key]["entry"]
            # 保留用法最多的那筆
            if len(word.get("usage", [])) > len(existing.get("usage", [])):
                seen[key]["entry"] = word
            # 修正例句：優先選英文例句
            if not is_valid_example(existing.get("example", "")) and is_valid_example(word.get("example", "")):
                seen[key]["entry"]["example"] = word["example"]
                seen[key]["entry"]["example_zh"] = word.get("example_zh", "")

    # 依出現次數排序，加入 frequency_rank
    ranked = sorted(seen.values(), key=lambda x: x["count"], reverse=True)
    result = []
    for rank, item in enumerate(ranked, start=1):
        entry = item["entry"]
        entry["frequency_rank"] = rank
        # 修正例句中英文顛倒的情況
        ex = entry.get("example", "")
        ex_zh = entry.get("example_zh", "")
        if not is_valid_example(ex) and is_valid_example(ex_zh):
            entry["example"], entry["example_zh"] = ex_zh, ex
        result.append(entry)

    print(f"完成，共 {len(result)} 個不重複單字")
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--level", choices=["高中", "國中"], required=True)
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("錯誤：請先設定 GEMINI_API_KEY 環境變數")
        print("  export GEMINI_API_KEY=AIza...")
        return

    client = genai.Client(api_key=api_key)
    pdf_dir = PDF_DIRS[args.level]
    pdfs = sorted(pdf_dir.glob("*.pdf"))

    if not pdfs:
        print(f"找不到 PDF，請先把考卷放入：{pdf_dir}")
        return

    print(f"\n開始分析 {args.level} 考卷（共 {len(pdfs)} 份）\n")

    all_words = []
    for pdf in pdfs:
        words = extract_words_from_pdf(client, pdf, args.level)
        all_words.extend(words)
        time.sleep(1)

    if not all_words:
        print("沒有萃取到任何單字")
        return

    merged = merge_and_rank(all_words)

    for word in merged:
        word["level"] = args.level

    DATA_DIR.mkdir(exist_ok=True)
    output = DATA_DIR / f"{args.level}.json"
    output.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n資料庫已儲存：{output}")
    print(f"共 {len(merged)} 個單字")


if __name__ == "__main__":
    main()
