/** Minimal PDF 1.4 writer for operator reports (no extra dependency). */

function pdfEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(line: string, width: number): string[] {
  if (line.length <= width) return [line || " "];
  const out: string[] = [];
  let rest = line;
  while (rest.length > width) {
    let cut = rest.lastIndexOf(" ", width);
    if (cut < 20) cut = width;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

export function textLinesToPdf(title: string, lines: string[]): Blob {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 48;
  const maxLines = 48;
  const chunks: string[][] = [];
  let buf: string[] = [title, " "];
  for (const line of lines) {
    for (const w of wrapLine(line, 90)) {
      if (buf.length >= maxLines) {
        chunks.push(buf);
        buf = [];
      }
      buf.push(w);
    }
  }
  if (buf.length) chunks.push(buf);

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const fontObj = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const contents = chunks.map((chunk, pageIdx) => {
    const cmds = ["BT", `${margin} ${pageHeight - margin} Td`, "14 TL"];
    chunk.forEach((line, idx) => {
      cmds.push(pageIdx === 0 && idx === 0 ? "/F1 16 Tf" : "/F1 11 Tf");
      cmds.push(`(${pdfEscape(line)}) Tj`);
      cmds.push("T*");
    });
    cmds.push("ET");
    const stream = cmds.join("\n");
    return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  const n = chunks.length;
  const fontId = 3;
  const contentStart = 4;
  const pageStart = contentStart + n;
  const kids = Array.from({ length: n }, (_, i) => `${pageStart + i} 0 R`).join(" ");
  objects.push(`<< /Type /Pages /Kids [ ${kids} ] /Count ${n} >>`);
  objects.push(fontObj);
  contents.forEach((c) => objects.push(c));
  for (let i = 0; i < n; i++) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentStart + i} 0 R >>`,
    );
  }
  const out: string[] = ["%PDF-1.4\n"];
  const offsets = [0];
  let loc = out[0].length;
  objects.forEach((body, i) => {
    offsets.push(loc);
    const block = `${i + 1} 0 obj\n${body}\nendobj\n`;
    out.push(block);
    loc += block.length;
  });
  const xrefPos = loc;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  out.push(xref);
  out.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
  return new Blob(out, { type: "application/pdf" });
}
