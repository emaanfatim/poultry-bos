// A tiny, dependency-free single-page PDF writer — good enough for a
// one-page text receipt without pulling in a PDF library. Shared by both
// ReceiptPreview (fixed layout) and DynamicReceiptPreview (owner-configured
// layout) export buttons.

export function escapePdfText(value: string) {
  return value
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

export function estimatePdfTextWidth(value: string, fontSize: number) {
  return value.length * fontSize * 0.52;
}

export interface PdfBuilder {
  text: (
    value: string,
    x: number,
    size?: number,
    align?: "left" | "right" | "center",
  ) => void;
  rule: (offset?: number) => void;
  advance: (offset: number) => void;
  getY: () => number;
  pageWidth: number;
  margin: number;
  toBlob: () => Blob;
}

export function createSinglePagePdf(options?: {
  pageWidth?: number;
  pageHeight?: number;
  margin?: number;
  startY?: number;
}): PdfBuilder {
  const pageWidth = options?.pageWidth ?? 595.28;
  const pageHeight = options?.pageHeight ?? 841.89;
  const margin = options?.margin ?? 48;
  let y = options?.startY ?? 790;
  const contentLines: string[] = [];

  function text(
    value: string,
    x: number,
    size = 10,
    align: "left" | "right" | "center" = "left",
  ) {
    let drawX = x;
    if (align === "right") drawX = x - estimatePdfTextWidth(value, size);
    if (align === "center") drawX = x - estimatePdfTextWidth(value, size) / 2;
    contentLines.push(
      `BT /F1 ${size} Tf ${drawX.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(value)}) Tj ET`,
    );
  }

  function rule(offset = 10) {
    y -= offset;
    contentLines.push(
      `0.5 w ${margin} ${y.toFixed(2)} m ${pageWidth - margin} ${y.toFixed(2)} l S`,
    );
    y -= 16;
  }

  function advance(offset: number) {
    y -= offset;
  }

  function toBlob(): Blob {
    const content = contentLines.join("\n");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ];

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((obj, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets.slice(1)) {
      pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return new Blob([pdf], { type: "application/pdf" });
  }

  return {
    text,
    rule,
    advance,
    getY: () => y,
    pageWidth,
    margin,
    toBlob,
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
