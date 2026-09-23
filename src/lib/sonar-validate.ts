export type ValidateOk = { ok: true; meanSat: number; highFrac: number };
export type ValidateFail = { ok: false; reason: string; meanSat: number; highFrac: number };
export type ValidateResult = ValidateOk | ValidateFail;

const EXT = /\.(png|jpe?g|webp|tif{1,2}|bmp)$/i;

function hsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const v = max / 255;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, v };
}

/** Conservative: only reject clearly colourful RGB photos, not gold/grey sonar. */
export function sonarLikelyFromPixels(
  data: Uint8ClampedArray,
): ValidateResult {
  const n = Math.floor(data.length / 4);
  if (n < 16) return { ok: false, reason: "Image has no readable pixels", meanSat: 0, highFrac: 0 };
  let satSum = 0;
  let highSat = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const { h, s } = hsv(r, g, b);
    satSum += s;
    if (s > 0.4) highSat += 1;
    const rad = (h * Math.PI) / 180;
    cx += Math.cos(rad);
    cy += Math.sin(rad);
  }
  const meanSat = satSum / n;
  const highFrac = highSat / n;
  const R = Math.hypot(cx / n, cy / n);
  const hueStd = Math.sqrt(Math.max(0, -2 * Math.log(Math.max(R, 1e-6)))) * (180 / Math.PI);

  const colourfulPhoto = highFrac > 0.42 && hueStd > 48 && meanSat > 0.28;
  if (colourfulPhoto) {
    return {
      ok: false,
      reason: "Looks like a normal colour photograph, not side-scan sonar (rejected before YOLO)",
      meanSat,
      highFrac,
    };
  }
  return { ok: true, meanSat, highFrac };
}

export async function validateSonarFile(file: File): Promise<ValidateResult> {
  if (file.size < 512) return { ok: false, reason: "File too small to be a sonar ping", meanSat: 0, highFrac: 0 };
  if (file.size > 64 * 1024 * 1024) return { ok: false, reason: "File larger than 64 MB", meanSat: 0, highFrac: 0 };
  if (!EXT.test(file.name) && !/^image\//.test(file.type)) {
    return { ok: false, reason: "Not a supported image (JPEG, PNG, WebP, or TIFF)", meanSat: 0, highFrac: 0 };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, reason: "File could not be decoded as an image", meanSat: 0, highFrac: 0 };
  }
  try {
    if (bitmap.width < 48 || bitmap.height < 48) {
      return { ok: false, reason: "Image is too small for side-scan analysis", meanSat: 0, highFrac: 0 };
    }
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { ok: true, meanSat: 0, highFrac: 0 };
    ctx.drawImage(bitmap, 0, 0, 64, 64);
    return sonarLikelyFromPixels(ctx.getImageData(0, 0, 64, 64).data);
  } finally {
    bitmap.close();
  }
}
