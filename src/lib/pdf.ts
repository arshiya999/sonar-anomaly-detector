/** ASCII PDF 1.4. Offsets counted on the final byte string. */

function toAscii(text: string): string {
  return Array.from(text)
    .map((ch) => (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) < 127 ? ch : ch === "\n" ? "\n" : "?"))
    .join("");
}

function pdfEscape(text: string): string {
  return toAscii(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(line: string, width: number): string[] {
  const clean = toAscii(line);
  if (clean.length <= width) return [clean || " "];
  const out: string[] = [];
  let rest = clean;
  while (rest.length > width) {
    let cut = rest.lastIndexOf(" ", width);
    if (cut < 16) cut = width;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

export function textLinesToPdf(title: string, lines: string[]): Blob {
  const pageW = 595;
  const pageH = 842;
  const margin = 50;
  const leading = 14;
  const maxLines = 48;
  const pages: string[][] = [];
  let buf: string[] = [toAscii(title || "Aqua Vision report")];
  const source = lines.length ? lines : ["No contacts yet. Run Analyze, then download again."];
  for (const line of source) {
    for (const w of wrapLine(line, 86)) {
      if (buf.length >= maxLines) {
        pages.push(buf);
        buf = [];
      }
      buf.push(w);
    }
  }
  if (buf.length) pages.push(buf);

  const contentStreams = pages.map((page, p) => {
    const ops: string[] = ["BT", "/F1 11 Tf", `${leading} TL`, `${margin} ${pageH - margin} Td`];
    page.forEach((line, i) => {
      if (p === 0 && i === 0) ops.push("/F1 16 Tf");
      else if (p === 0 && i === 1) ops.push("/F1 11 Tf");
      ops.push(`(${pdfEscape(line)}) Tj`);
      ops.push("T*");
    });
    ops.push("ET");
    return ops.join("\n");
  });

  const objs: string[] = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const n = contentStreams.length;
  const fontId = 3;
  const firstContent = 4;
  const firstPage = firstContent + n;
  objs[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  contentStreams.forEach((stream, i) => {
    objs[firstContent + i] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  const kids = Array.from({ length: n }, (_, i) => `${firstPage + i} 0 R`).join(" ");
  objs[2] = `<< /Type /Pages /Kids [ ${kids} ] /Count ${n} >>`;
  for (let i = 0; i < n; i++) {
    objs[firstPage + i] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${firstContent + i} 0 R >>`;
  }

  const header = "%PDF-1.4\n";
  const pieces: string[] = [header];
  const offsets = [0];
  let pos = header.length;
  for (let i = 1; i < objs.length; i++) {
    if (!objs[i]) continue;
    offsets[i] = pos;
    const block = `${i} 0 obj\n${objs[i]}\nendobj\n`;
    pieces.push(block);
    pos += block.length;
  }
  const xrefPos = pos;
  const maxId = objs.length - 1;
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= maxId; i++) {
    xref += `${String(offsets[i] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  pieces.push(xref);
  pieces.push(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
  const pdf = pieces.join("");
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}
