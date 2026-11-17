// Run: node --test tests/*.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "tmp/test-build/ocrPlan.js");
esbuild.buildSync({ entryPoints: [path.join(root, "src/utils/ocrPlan.ts")], bundle: true, format: "cjs", outfile: out });
const { ocrOutputPath, ocrArgs } = require(out);

test("plain PDF gets a .ocr.pdf sibling", () => {
  assert.strictEqual(ocrOutputPath("/s/ABC/paper.pdf"), "/s/ABC/paper.ocr.pdf");
});
test("already-OCR'd PDF is overwritten in place, not .ocr.ocr.pdf", () => {
  assert.strictEqual(ocrOutputPath("/s/ABC/paper.ocr.pdf"), "/s/ABC/paper.ocr.pdf");
});
test("only the extension is touched", () => {
  assert.strictEqual(ocrOutputPath("/s/x.pdf.d/my.pdf.notes.PDF"), "/s/x.pdf.d/my.pdf.notes.ocr.pdf");
});
test("uppercase .OCR.PDF also treated as already OCR'd", () => {
  assert.strictEqual(ocrOutputPath("/s/A/scan.OCR.PDF"), "/s/A/scan.OCR.PDF");
});
test("args use --skip-text, never force-ocr", () => {
  const a = ocrArgs("/i.pdf", "/o.pdf", "eng", true);
  assert.deepStrictEqual(a, ["/i.pdf", "/o.pdf", "-l", "eng", "--deskew", "--skip-text"]);
  assert.ok(!a.some((x) => x.startsWith("--force") || x === "-f"));
});
test("deskew off omits the flag (ocrmypdf has no --no-deskew)", () => {
  assert.deepStrictEqual(ocrArgs("/i.pdf", "/o.pdf", "deu+eng", false), ["/i.pdf", "/o.pdf", "-l", "deu+eng", "--skip-text"]);
});
