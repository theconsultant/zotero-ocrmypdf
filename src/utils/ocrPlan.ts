/**
 * Output path and ocrmypdf arguments for one PDF.
 *
 * - "paper.pdf"     → "paper.ocr.pdf"
 * - "paper.ocr.pdf" → itself (re-running OCR updates the file in place
 *   instead of piling up "paper.ocr.ocr.pdf" copies; ocrmypdf supports
 *   input == output)
 */
const OCR_SUFFIX = /\.ocr\.pdf$/i;
const PDF_EXT = /\.pdf$/i;

export function ocrOutputPath(inputPath: string): string {
  if (OCR_SUFFIX.test(inputPath)) return inputPath;
  if (PDF_EXT.test(inputPath)) return inputPath.replace(PDF_EXT, ".ocr.pdf");
  return inputPath + ".ocr.pdf";
}

/**
 * --skip-text: OCR only pages without text; pages that already have text
 * (born-digital or previously OCR'd) are left alone. The old "--force" was
 * argparse shorthand for --force-ocr, which rasterized real text.
 * ocrmypdf has no --no-deskew; deskew off means omitting --deskew.
 */
export function ocrArgs(inputPath: string, outputPath: string, language: string, deskew: boolean): string[] {
  const args = [inputPath, outputPath, "-l", language];
  if (deskew) args.push("--deskew");
  args.push("--skip-text");
  return args;
}
