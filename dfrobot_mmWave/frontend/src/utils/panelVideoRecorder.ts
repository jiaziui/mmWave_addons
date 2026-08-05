type RecorderHandles = {
  stop: () => Promise<Blob>;
};

/** Presentation props that CSS applies on the live SVG but are lost when serializing alone. */
const SVG_STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "opacity",
  "visibility",
  "display",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
  "alignment-baseline",
  "color",
  "paint-order",
  "vector-effect",
  "stop-color",
  "stop-opacity",
] as const;

const PANEL_BACKGROUND = "#f4f7fc";

const pickMimeType = (): string => {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "video/webm";
};

const waitForImage = (image: HTMLImageElement) =>
  new Promise<void>((resolve, reject) => {
    if (image.complete && image.naturalWidth > 0) {
      resolve();
      return;
    }
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("雷达画面帧捕获失败"));
  });

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("图片读取失败"));
    reader.readAsDataURL(blob);
  });

const resolveAbsoluteUrl = (href: string): string => {
  if (href.startsWith("data:") || href.startsWith("blob:")) {
    return href;
  }
  try {
    return new URL(href, window.location.href).href;
  } catch {
    return href;
  }
};

const urlToDataUrl = async (href: string, cache: Map<string, string>): Promise<string | null> => {
  if (href.startsWith("data:")) {
    return href;
  }
  const absolute = resolveAbsoluteUrl(href);
  const cached = cache.get(absolute) ?? cache.get(href);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(absolute);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const dataUrl = await blobToDataUrl(await response.blob());
    cache.set(absolute, dataUrl);
    cache.set(href, dataUrl);
    return dataUrl;
  } catch {
    // Fallback: draw through an Image element (same-origin / CORS-enabled only).
    try {
      const image = new Image();
      image.decoding = "sync";
      image.crossOrigin = "anonymous";
      image.src = absolute;
      await waitForImage(image);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, image.naturalWidth);
      canvas.height = Math.max(1, image.naturalHeight);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return null;
      }
      ctx.drawImage(image, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");
      cache.set(absolute, dataUrl);
      cache.set(href, dataUrl);
      return dataUrl;
    } catch {
      return null;
    }
  }
};

const inlineComputedStyles = (sourceRoot: Element, cloneRoot: Element) => {
  const sourceEls = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll("*"))];
  const cloneEls = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll("*"))];
  const count = Math.min(sourceEls.length, cloneEls.length);
  for (let index = 0; index < count; index += 1) {
    const source = sourceEls[index];
    const clone = cloneEls[index];
    if (!source || !clone || source.tagName !== clone.tagName) {
      continue;
    }
    const computed = window.getComputedStyle(source);
    const parts: string[] = [];
    for (const prop of SVG_STYLE_PROPS) {
      const value = computed.getPropertyValue(prop).trim();
      if (!value) {
        continue;
      }
      parts.push(`${prop}:${value}`);
    }
    if (parts.length > 0) {
      clone.setAttribute("style", parts.join(";"));
    }
  }
};

const embedSvgImages = async (clone: SVGSVGElement, cache: Map<string, string>) => {
  const images = Array.from(clone.querySelectorAll("image"));
  await Promise.all(
    images.map(async (image) => {
      const href = image.getAttribute("href") || image.getAttributeNS("http://www.w3.org/1999/xlink", "href");
      if (!href) {
        return;
      }
      const dataUrl = await urlToDataUrl(href, cache);
      if (!dataUrl) {
        return;
      }
      image.setAttribute("href", dataUrl);
      image.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
    }),
  );
};

const prepareSvgClone = async (
  svg: SVGSVGElement,
  width: number,
  height: number,
  imageCache: Map<string, string>,
): Promise<SVGSVGElement> => {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", svg.getAttribute("viewBox") ?? `0 0 ${width} ${height}`);
  }

  inlineComputedStyles(svg, clone);
  await embedSvgImages(clone, imageCache);

  // CSS background on <svg> does not serialize; paint an explicit backdrop.
  const backdrop = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  backdrop.setAttribute("x", "0");
  backdrop.setAttribute("y", "0");
  backdrop.setAttribute("width", "100%");
  backdrop.setAttribute("height", "100%");
  backdrop.setAttribute("fill", PANEL_BACKGROUND);
  clone.insertBefore(backdrop, clone.firstChild);

  return clone;
};

const drawSvgFrame = async (
  svg: SVGSVGElement,
  canvas: HTMLCanvasElement,
  imageCache: Map<string, string>,
) => {
  const rect = svg.getBoundingClientRect();
  const width = Math.max(2, Math.round(rect.width));
  const height = Math.max(2, Math.round(rect.height));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  const clone = await prepareSvgClone(svg, width, height, imageCache);
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.decoding = "sync";
    image.src = url;
    await waitForImage(image);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建录制画布");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PANEL_BACKGROUND;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** Record an SVG radar panel to a WebM blob via canvas captureStream. */
export const startPanelVideoRecorder = async (
  svg: SVGSVGElement,
  options?: { fps?: number },
): Promise<RecorderHandles> => {
  if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error("当前浏览器不支持网页录制视频");
  }

  const fps = options?.fps ?? 15;
  const canvas = document.createElement("canvas");
  const imageCache = new Map<string, string>();
  await drawSvgFrame(svg, canvas, imageCache);
  const stream = canvas.captureStream(fps);
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_500_000 });
  const chunks: BlobPart[] = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  let frameTimer: number | null = null;
  let drawing = false;
  const tick = async () => {
    if (drawing) {
      return;
    }
    drawing = true;
    try {
      await drawSvgFrame(svg, canvas, imageCache);
      const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
      track?.requestFrame?.();
    } catch {
      // Keep last good frame if a transient draw fails.
    } finally {
      drawing = false;
    }
  };

  recorder.start(500);
  frameTimer = window.setInterval(() => {
    void tick();
  }, Math.max(40, Math.round(1000 / fps)));

  return {
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        if (frameTimer !== null) {
          window.clearInterval(frameTimer);
          frameTimer = null;
        }
        recorder.onerror = () => reject(new Error("录制失败"));
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          resolve(new Blob(chunks, { type: mimeType }));
        };
        if (recorder.state === "inactive") {
          stream.getTracks().forEach((track) => track.stop());
          resolve(new Blob(chunks, { type: mimeType }));
          return;
        }
        recorder.stop();
      }),
  };
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const formatRecordingClock = (elapsedMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
};
