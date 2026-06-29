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
  editBtn: HTMLButtonElement;
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

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const editBtn = document.createElement("button");
  editBtn.className = "btn card-dl";
  editBtn.disabled = true;

  const dlBtn = document.createElement("button");
  dlBtn.className = "btn btn-primary card-dl";
  dlBtn.disabled = true;

  actions.append(editBtn, dlBtn);
  body.append(nameEl, actions);
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
    editBtn,
  };

  dlBtn.addEventListener("click", () => downloadItem(item));
  editBtn.addEventListener("click", () => openEditor(item));
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

  item.dlBtn.textContent = t("download");
  item.editBtn.textContent = t("edit");

  if (status === "done") {
    overlay.style.display = "none";
    item.dlBtn.disabled = false;
    item.editBtn.disabled = false;
    return;
  }

  overlay.style.display = "flex";
  item.dlBtn.disabled = true;
  item.editBtn.disabled = true;

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

// ============ 編集モーダル（ブラシヒント → GrabCut で再処理） ============
const editorModal = document.getElementById("editor")!;
const editorCanvas = document.getElementById("editor-canvas") as HTMLCanvasElement;
const editorCloseBtn = document.getElementById("editor-close") as HTMLButtonElement;
const editorApplyBtn = document.getElementById("editor-apply") as HTMLButtonElement;
const editorResetBtn = document.getElementById("editor-reset") as HTMLButtonElement;
const modeEraseBtn = document.getElementById("mode-erase") as HTMLButtonElement;
const modeKeepBtn = document.getElementById("mode-keep") as HTMLButtonElement;
const brushSizeInput = document.getElementById("brush-size") as HTMLInputElement;
const editorBusy = document.getElementById("editor-busy")!;
const editorBusyText = document.getElementById("editor-busy-text")!;

// ブラシ色（GrabCutヒントの判定に使う）: 緑=残す(前景)、赤=消す(背景)
const KEEP_COLOR = "rgba(0,200,0,1)";
const ERASE_COLOR = "rgba(224,0,0,1)";

type BrushMode = "erase" | "keep";

let editTarget: Item | null = null;
let originalBmp: ImageBitmap | null = null; // 元画像
let priorCanvas: HTMLCanvasElement | null = null; // AI結果（推定前景/背景の初期マスク）
let scribbleCanvas: HTMLCanvasElement | null = null; // ユーザーのヒント線（緑/赤）
let scribbleCtx: CanvasRenderingContext2D | null = null;
let editCtx: CanvasRenderingContext2D | null = null;
let brushMode: BrushMode = "keep";
let drawing = false;
let lastPt: { x: number; y: number } | null = null;

async function openEditor(item: Item) {
  if (!item.resultBlob) return;
  editTarget = item;

  const priorBmp = await createImageBitmap(item.resultBlob);
  const w = priorBmp.width;
  const h = priorBmp.height;
  originalBmp = await createImageBitmap(item.file);

  editorCanvas.width = w;
  editorCanvas.height = h;
  editCtx = editorCanvas.getContext("2d")!;

  priorCanvas = document.createElement("canvas");
  priorCanvas.width = w;
  priorCanvas.height = h;
  priorCanvas.getContext("2d")!.drawImage(priorBmp, 0, 0);
  priorBmp.close();

  scribbleCanvas = document.createElement("canvas");
  scribbleCanvas.width = w;
  scribbleCanvas.height = h;
  scribbleCtx = scribbleCanvas.getContext("2d")!;

  setBrushMode("keep");
  compose();
  editorModal.hidden = false;
}

function closeEditor() {
  editorModal.hidden = true;
  editorBusy.hidden = true;
  originalBmp?.close();
  originalBmp = null;
  priorCanvas = null;
  scribbleCanvas = null;
  scribbleCtx = null;
  editCtx = null;
  editTarget = null;
  lastPt = null;
  drawing = false;
}

function setBrushMode(mode: BrushMode) {
  brushMode = mode;
  modeEraseBtn.classList.toggle("is-active", mode === "erase");
  modeKeepBtn.classList.toggle("is-active", mode === "keep");
}

/** 元画像 + ヒント線（半透明）を表示用キャンバスへ描画 */
function compose() {
  if (!editCtx || !originalBmp || !scribbleCanvas) return;
  const { width: w, height: h } = editorCanvas;
  editCtx.globalAlpha = 1;
  editCtx.clearRect(0, 0, w, h);
  editCtx.drawImage(originalBmp, 0, 0, w, h);
  editCtx.globalAlpha = 0.5;
  editCtx.drawImage(scribbleCanvas, 0, 0);
  editCtx.globalAlpha = 1;
}

function toCanvasPt(e: PointerEvent): { x: number; y: number } {
  const rect = editorCanvas.getBoundingClientRect();
  const sx = editorCanvas.width / rect.width;
  const sy = editorCanvas.height / rect.height;
  return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
}

function brushWidthCanvasPx(): number {
  const rect = editorCanvas.getBoundingClientRect();
  const scale = editorCanvas.width / rect.width;
  return Number(brushSizeInput.value) * scale;
}

function stroke(from: { x: number; y: number }, to: { x: number; y: number }) {
  if (!scribbleCtx) return;
  scribbleCtx.globalCompositeOperation = "source-over";
  scribbleCtx.lineCap = "round";
  scribbleCtx.lineJoin = "round";
  scribbleCtx.lineWidth = brushWidthCanvasPx();
  scribbleCtx.strokeStyle = brushMode === "keep" ? KEEP_COLOR : ERASE_COLOR;
  scribbleCtx.beginPath();
  scribbleCtx.moveTo(from.x, from.y);
  scribbleCtx.lineTo(to.x, to.y);
  scribbleCtx.stroke();
  compose();
}

editorCanvas.addEventListener("pointerdown", (e) => {
  if (!scribbleCtx || !editorBusy.hidden) return;
  drawing = true;
  editorCanvas.setPointerCapture(e.pointerId);
  const p = toCanvasPt(e);
  lastPt = p;
  stroke(p, p);
});
editorCanvas.addEventListener("pointermove", (e) => {
  if (!drawing || !lastPt) return;
  const p = toCanvasPt(e);
  stroke(lastPt, p);
  lastPt = p;
});
function endStroke() {
  drawing = false;
  lastPt = null;
}
editorCanvas.addEventListener("pointerup", endStroke);
editorCanvas.addEventListener("pointercancel", endStroke);

modeEraseBtn.addEventListener("click", () => setBrushMode("erase"));
modeKeepBtn.addEventListener("click", () => setBrushMode("keep"));
editorCloseBtn.addEventListener("click", closeEditor);
editorModal.addEventListener("click", (e) => {
  if (e.target === editorModal) closeEditor();
});

editorResetBtn.addEventListener("click", () => {
  if (!scribbleCtx || !scribbleCanvas) return;
  scribbleCtx.clearRect(0, 0, scribbleCanvas.width, scribbleCanvas.height);
  compose();
});

editorApplyBtn.addEventListener("click", async () => {
  if (!editTarget || !originalBmp || !priorCanvas || !scribbleCanvas) return;
  const item = editTarget;
  setEditorBusy(true, t("loadingEngine"));
  try {
    const out = await grabCutRefine(originalBmp, priorCanvas, scribbleCanvas);
    await new Promise<void>((resolve) =>
      out.toBlob((blob) => {
        if (blob) {
          if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
          item.resultBlob = blob;
          item.resultUrl = URL.createObjectURL(blob);
          item.imgEl.src = item.resultUrl;
        }
        resolve();
      }, currentFormat()),
    );
    closeEditor();
  } catch (err) {
    console.error(err);
    alert("再処理に失敗しました / Re-processing failed");
    setEditorBusy(false);
  }
});

function setEditorBusy(busy: boolean, text = "") {
  editorBusy.hidden = !busy;
  editorBusyText.textContent = text;
}

// ---- OpenCV.js の遅延ロード ----
let cvReady: Promise<any> | null = null;
function loadOpenCV(): Promise<any> {
  const w = window as any;
  if (w.cv && w.cv.Mat) return Promise.resolve(w.cv);
  if (cvReady) return cvReady;
  cvReady = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.10.0/opencv.js";
    script.async = true;
    script.onload = () => {
      const cv = w.cv;
      if (cv && cv.Mat) resolve(cv);
      else if (cv) cv.onRuntimeInitialized = () => resolve(w.cv);
      else reject(new Error("opencv load failed"));
    };
    script.onerror = () => reject(new Error("opencv fetch failed"));
    document.head.appendChild(script);
  });
  return cvReady;
}

/**
 * AI結果を初期マスク、ブラシ線を確定前景/背景の制約として GrabCut を実行し、
 * 透過済みの結果キャンバスを返す。
 */
async function grabCutRefine(
  original: ImageBitmap,
  prior: HTMLCanvasElement,
  scribble: HTMLCanvasElement,
): Promise<HTMLCanvasElement> {
  const cv = await loadOpenCV();
  setEditorBusy(true, t("reprocessing"));
  // UIへ反映する猶予
  await new Promise((r) => setTimeout(r, 16));

  const fullW = original.width;
  const fullH = original.height;
  const maxDim = 900; // 処理は縮小して高速化、マスクは後で拡大
  const scale = Math.min(1, maxDim / Math.max(fullW, fullH));
  const w = Math.max(1, Math.round(fullW * scale));
  const h = Math.max(1, Math.round(fullH * scale));

  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext("2d")!;

  tctx.clearRect(0, 0, w, h);
  tctx.drawImage(original, 0, 0, w, h);
  const imgData = tctx.getImageData(0, 0, w, h);

  tctx.clearRect(0, 0, w, h);
  tctx.drawImage(prior, 0, 0, w, h);
  const priorData = tctx.getImageData(0, 0, w, h).data;

  tctx.clearRect(0, 0, w, h);
  tctx.drawImage(scribble, 0, 0, w, h);
  const scrData = tctx.getImageData(0, 0, w, h).data;

  const src = cv.matFromImageData(imgData);
  const rgb = new cv.Mat();
  cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);

  const mask = new cv.Mat(h, w, cv.CV_8UC1);
  for (let i = 0; i < w * h; i++) {
    const a = priorData[i * 4 + 3];
    let v = a > 128 ? cv.GC_PR_FGD : cv.GC_PR_BGD;
    const r = scrData[i * 4];
    const g = scrData[i * 4 + 1];
    const sa = scrData[i * 4 + 3];
    if (sa > 40) {
      if (g > 120 && r < 110) v = cv.GC_FGD; // 緑=確定前景
      else if (r > 120 && g < 110) v = cv.GC_BGD; // 赤=確定背景
    }
    mask.data[i] = v;
  }

  const bgd = new cv.Mat();
  const fgd = new cv.Mat();
  const rect = new cv.Rect(0, 0, w, h);
  cv.grabCut(rgb, mask, rect, bgd, fgd, 3, cv.GC_INIT_WITH_MASK);

  const alpha = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const m = mask.data[i];
    const fg = m === cv.GC_FGD || m === cv.GC_PR_FGD;
    alpha[i * 4] = 255;
    alpha[i * 4 + 1] = 255;
    alpha[i * 4 + 2] = 255;
    alpha[i * 4 + 3] = fg ? 255 : 0;
  }
  src.delete();
  rgb.delete();
  mask.delete();
  bgd.delete();
  fgd.delete();

  const maskSmall = document.createElement("canvas");
  maskSmall.width = w;
  maskSmall.height = h;
  maskSmall.getContext("2d")!.putImageData(new ImageData(alpha, w, h), 0, 0);

  // 元解像度で合成（マスクは滑らかに拡大）
  const out = document.createElement("canvas");
  out.width = fullW;
  out.height = fullH;
  const octx = out.getContext("2d")!;
  octx.imageSmoothingEnabled = true;
  octx.drawImage(original, 0, 0, fullW, fullH);
  octx.globalCompositeOperation = "destination-in";
  octx.drawImage(maskSmall, 0, 0, fullW, fullH);
  octx.globalCompositeOperation = "source-over";
  return out;
}

// 初期翻訳適用
applyStaticTranslations();
void getLang;
