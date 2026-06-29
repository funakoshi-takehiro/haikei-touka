import "./style.css";
import { removeBackground, type Config } from "@imgly/background-removal";
import { applyStaticTranslations, getLang, setLang, t, type Lang } from "./i18n";

type Status = "waiting" | "processing" | "done" | "error";
type OutFormat = "image/png" | "image/webp";

interface Item {
  id: number;
  file: File;
  baseName: string; // 拡張子を除いたファイル名
  status: Status;
  resultUrl?: string; // 透過結果の ObjectURL
  resultBlob?: Blob;
  card: HTMLElement;
  imgEl: HTMLImageElement;
  overlayEl: HTMLElement;
  dlBtn: HTMLButtonElement;
}

const ACCEPT = ["image/png", "image/jpeg", "image/webp"];

// ---- DOM ----
const uploader = document.getElementById("uploader")!;
const toolbar = document.getElementById("toolbar")!;
const grid = document.getElementById("grid")!;
const dropOverlay = document.getElementById("drop-overlay")!;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const dirInput = document.getElementById("dir-input") as HTMLInputElement;
const uploadBtn = document.getElementById("upload-btn") as HTMLButtonElement;
const formatSelect = document.getElementById("format-select") as HTMLSelectElement;
const downloadAllBtn = document.getElementById("download-all-btn") as HTMLButtonElement;
const addMoreBtn = document.getElementById("add-more-btn") as HTMLButtonElement;
const resetBtn = document.getElementById("reset-btn") as HTMLButtonElement;
const statusSummary = document.getElementById("status-summary")!;

// ---- State ----
const items: Item[] = [];
let nextId = 1;
let queue: Item[] = [];
let processing = false;

// ============ 言語切替 ============
document.querySelectorAll<HTMLButtonElement>(".lang-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const lang = btn.dataset.lang as Lang;
    setLang(lang);
    document
      .querySelectorAll(".lang-btn")
      .forEach((b) => b.classList.toggle("is-active", b === btn));
    refreshDynamicText();
  });
});
setLang("ja");

// ============ アップロード起動 ============
uploadBtn.addEventListener("click", () => fileInput.click());
addMoreBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  if (fileInput.files) addFiles(fileInput.files);
  fileInput.value = "";
});
dirInput.addEventListener("change", () => {
  if (dirInput.files) addFiles(dirInput.files);
  dirInput.value = "";
});

// ============ ドラッグ＆ドロップ ============
// dragover が連続発火する性質を使い、止まったらタイマーで自動的に隠す。
// enter/leave のカウント方式は取りこぼしで表示が固まりやすいため使わない。
let dragHideTimer: number | undefined;

function isFileDrag(e: DragEvent): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
}

window.addEventListener("dragover", (e) => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  dropOverlay.hidden = false;
  if (dragHideTimer) clearTimeout(dragHideTimer);
  dragHideTimer = window.setTimeout(() => (dropOverlay.hidden = true), 120);
});
window.addEventListener("drop", (e) => {
  e.preventDefault();
  if (dragHideTimer) clearTimeout(dragHideTimer);
  dropOverlay.hidden = true;
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
});
window.addEventListener("dragend", () => {
  if (dragHideTimer) clearTimeout(dragHideTimer);
  dropOverlay.hidden = true;
});

// ============ ファイル追加 ============
function addFiles(fileList: FileList) {
  const accepted = Array.from(fileList).filter((f) => ACCEPT.includes(f.type));
  if (accepted.length === 0) return;

  uploader.hidden = true;
  toolbar.hidden = false;
  grid.hidden = false;

  for (const file of accepted) {
    const item = createItem(file);
    items.push(item);
    queue.push(item);
  }
  refreshDynamicText();
  runQueue();
}

function createItem(file: File): Item {
  const id = nextId++;
  const baseName = file.name.replace(/\.[^.]+$/, "");

  const card = document.createElement("div");
  card.className = "card";

  const preview = document.createElement("div");
  preview.className = "card-preview";

  const imgEl = document.createElement("img");
  imgEl.alt = file.name;
  imgEl.src = URL.createObjectURL(file); // まずは元画像を表示
  preview.appendChild(imgEl);

  const overlayEl = document.createElement("div");
  overlayEl.className = "card-overlay";
  preview.appendChild(overlayEl);

  const body = document.createElement("div");
  body.className = "card-body";

  const nameEl = document.createElement("span");
  nameEl.className = "card-name";
  nameEl.textContent = file.name;

  const dlBtn = document.createElement("button");
  dlBtn.className = "btn btn-primary card-dl";
  dlBtn.disabled = true;

  body.append(nameEl, dlBtn);
  card.append(preview, body);
  grid.appendChild(card);

  const item: Item = {
    id,
    file,
    baseName,
    status: "waiting",
    card,
    imgEl,
    overlayEl,
    dlBtn,
  };

  dlBtn.addEventListener("click", () => downloadItem(item));
  setStatus(item, "waiting");
  return item;
}

// ============ キュー処理（逐次） ============
async function runQueue() {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const item = queue.shift()!;
    await processItem(item);
    refreshDynamicText();
  }
  processing = false;
}

async function processItem(item: Item) {
  setStatus(item, "processing");
  try {
    const config: Config = {
      output: { format: currentFormat() },
      progress: (key, current, total) => {
        // モデルDL中のみ進捗を表示（初回）
        if (key.startsWith("fetch")) {
          item.overlayEl.querySelector(".overlay-text")!.textContent =
            `${t("loadingModel")} ${Math.round((current / total) * 100)}%`;
        }
      },
    };
    const blob = await removeBackground(item.file, config);
    if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    item.resultBlob = blob;
    item.resultUrl = URL.createObjectURL(blob);
    item.imgEl.src = item.resultUrl;
    setStatus(item, "done");
  } catch (err) {
    console.error(err);
    setStatus(item, "error");
  }
}

function currentFormat(): OutFormat {
  return formatSelect.value as OutFormat;
}

// ============ ダウンロード ============
function extFor(format: OutFormat): string {
  return format === "image/webp" ? "webp" : "png";
}

function downloadItem(item: Item) {
  if (!item.resultBlob) return;
  const a = document.createElement("a");
  a.href = item.resultUrl!;
  a.download = `${item.baseName}_transparent.${extFor(currentFormat())}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

downloadAllBtn.addEventListener("click", async () => {
  const done = items.filter((i) => i.status === "done");
  // ブラウザの連続ダウンロード抑止を避けるため少し間隔を空ける
  for (const item of done) {
    downloadItem(item);
    await sleep(300);
  }
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ============ リセット ============
resetBtn.addEventListener("click", () => {
  queue = [];
  for (const item of items) {
    if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    URL.revokeObjectURL(item.imgEl.src);
  }
  items.length = 0;
  grid.innerHTML = "";
  uploader.hidden = false;
  toolbar.hidden = true;
  grid.hidden = true;
});

// ============ 出力形式の変更（完了済みのDL名に反映、再処理はしない） ============
formatSelect.addEventListener("change", () => {
  // 既存の結果は維持。次回処理分から新形式が適用される。
  // （完了済みを新形式で出したい場合は再アップロードを案内）
});

// ============ ステータス表示 ============
function setStatus(item: Item, status: Status) {
  item.status = status;
  const overlay = item.overlayEl;
  overlay.classList.remove("is-error");
  overlay.innerHTML = "";

  if (status === "done") {
    overlay.style.display = "none";
    item.dlBtn.disabled = false;
    item.dlBtn.textContent = t("download");
    return;
  }

  overlay.style.display = "flex";
  item.dlBtn.disabled = true;
  item.dlBtn.textContent = t("download");

  if (status === "processing") {
    const sp = document.createElement("div");
    sp.className = "spinner";
    const txt = document.createElement("span");
    txt.className = "overlay-text";
    txt.textContent = t("statusProcessing");
    overlay.append(sp, txt);
  } else if (status === "error") {
    overlay.classList.add("is-error");
    const txt = document.createElement("span");
    txt.className = "overlay-text";
    txt.textContent = t("statusError");
    overlay.append(txt);
  } else {
    const txt = document.createElement("span");
    txt.className = "overlay-text";
    txt.textContent = t("statusWaiting");
    overlay.append(txt);
  }
}

// ============ 動的テキスト更新（言語切替・件数） ============
function refreshDynamicText() {
  const done = items.filter((i) => i.status === "done").length;
  statusSummary.textContent = t("summary", { done, total: items.length });
  downloadAllBtn.disabled = done === 0;
  // 言語切替時、各カードのステータス文言も更新
  for (const item of items) setStatus(item, item.status);
}

// 初期翻訳適用
applyStaticTranslations();
void getLang;
