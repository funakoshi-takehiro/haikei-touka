export type Lang = "ja" | "en";

type Dict = Record<string, string>;

const ja: Dict = {
  title: "背景透過",
  uploadCta: "画像を選択",
  uploadHint: "またはドラッグ＆ドロップ（複数・フォルダ可）/ JPEG・PNG・WebP",
  privacy: "画像はあなたの端末内だけで処理され、外部に送信されません。",
  dropHere: "ここにドロップ",
  format: "出力形式",
  downloadAll: "すべてダウンロード",
  addMore: "追加",
  reset: "クリア",
  poweredBy: "ブラウザ内AI処理 · @imgly/background-removal",
  statusWaiting: "待機中",
  statusProcessing: "処理中…",
  statusDone: "完了",
  statusError: "エラー",
  download: "ダウンロード",
  summary: "{done}/{total} 完了",
  loadingModel: "AIモデルを読み込み中…（初回のみ）",
  edit: "編集",
  editTitle: "ブラシで指定して再処理",
  editHint: "残す部分・消す部分をブラシでなぞり、「適用」で背景透過をやり直します。",
  modeErase: "消す（背景）",
  modeKeep: "残す（前景）",
  brushSize: "ブラシ",
  applyEdit: "適用して再処理",
  cancel: "キャンセル",
  reprocessing: "再処理中…",
  loadingEngine: "処理エンジンを読み込み中…（初回のみ）",
};

const en: Dict = {
  title: "Background Remover",
  uploadCta: "Select images",
  uploadHint: "or drag & drop (multiple / folders) — JPEG, PNG, WebP",
  privacy: "Images are processed entirely on your device and never uploaded.",
  dropHere: "Drop here",
  format: "Output",
  downloadAll: "Download all",
  addMore: "Add",
  reset: "Clear",
  poweredBy: "In-browser AI · @imgly/background-removal",
  statusWaiting: "Waiting",
  statusProcessing: "Processing…",
  statusDone: "Done",
  statusError: "Error",
  download: "Download",
  summary: "{done}/{total} done",
  loadingModel: "Loading AI model… (first time only)",
  edit: "Edit",
  editTitle: "Mark with brush & re-run",
  editHint: "Brush the areas to keep / remove, then Apply to re-run background removal.",
  modeErase: "Erase (bg)",
  modeKeep: "Keep (fg)",
  brushSize: "Brush",
  applyEdit: "Apply & re-run",
  cancel: "Cancel",
  reprocessing: "Re-processing…",
  loadingEngine: "Loading engine… (first time only)",
};

const dicts: Record<Lang, Dict> = { ja, en };

let current: Lang = "ja";

export function setLang(lang: Lang) {
  current = lang;
  document.documentElement.lang = lang;
  applyStaticTranslations();
}

export function getLang(): Lang {
  return current;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  let s = dicts[current][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
}

/** data-i18n 属性を持つ要素にまとめて翻訳を適用する */
export function applyStaticTranslations() {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n!;
    el.textContent = t(key);
  });
}
