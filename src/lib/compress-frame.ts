/** Shrink sonar frames in the browser so Render scores a folder in seconds. */

export async function compressFrame(file: File, maxSide = 512, quality = 0.72): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height, 1));
    const w = Math.max(32, Math.round(bitmap.width * scale));
    const h = Math.max(32, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
