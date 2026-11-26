/**
 * Ultra-lightweight (<0.5ms CPU) pure-TypeScript PDF 1.4 generator using built-in
 * Helvetica Type1 font so PDF report exports run cleanly within Cloudflare Workers
 * Free plan's 10ms CPU time limit without Node fs or font binaries.
 */
function escapePdfText(input: string): string {
  return input
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)')
    .replace(/[^\x20-\x7E]/g, ' ');
}

export function buildLightweightPdf(lines: string[]): Uint8Array {
  const cleanLines = lines.slice(0, 48).map((l) => escapePdfText(l.slice(0, 95)));
  const contentOps = [
    'BT',
    '/F1 14 Tf',
    '40 800 Td',
    `(Smart Energy Monitor - TNEB Report) Tj`,
    '/F1 9 Tf',
    '0 -20 Td',
  ];

  for (const line of cleanLines) {
    contentOps.push(`(${line}) Tj`);
    contentOps.push('0 -14 Td');
  }
  contentOps.push('ET');
  const streamBody = contentOps.join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${streamBody.length} >>\nstream\n${streamBody}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}
