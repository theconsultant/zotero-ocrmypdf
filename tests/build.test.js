// Run: node --test tests/
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const { execSync } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const bundle = path.join(root, "builds/addon/chrome/content/scripts/zotero-ocrmypdf.js");

test("build succeeds", () => {
  execSync("node scripts/build.js", { cwd: root, stdio: "pipe" });
  assert.ok(fs.existsSync(bundle));
});

test("bundle never loads legacy .jsm modules (removed in Zotero 10)", () => {
  const js = fs.readFileSync(bundle, "utf8");
  assert.doesNotMatch(js, /\.jsm["'`)]/, "bundle references a .jsm path");
  assert.doesNotMatch(js, /\.sys\\\.mjs\$\/,\s*"\.jsm"/, "bundle rewrites .sys.mjs to .jsm");
  assert.doesNotMatch(js, /ChromeUtils\.import\(/, "bundle calls ChromeUtils.import");
});

test("manifest allows Zotero 10", () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, "builds/addon/manifest.json"), "utf8"));
  assert.strictEqual(m.applications.zotero.strict_max_version, "10.*");
});

test("icons referenced by manifest and chrome:// URIs are in the xpi", () => {
  const listing = execSync("unzip -Z1 builds/zotero-ocrmypdf.xpi", { cwd: root, encoding: "utf8" }).split("\n");
  const m = JSON.parse(fs.readFileSync(path.join(root, "builds/addon/manifest.json"), "utf8"));
  for (const p of Object.values(m.icons)) assert.ok(listing.includes(p), `missing ${p}`);
  // chrome://zotero-ocrmypdf/content/X maps to chrome/content/X
  assert.ok(listing.includes("chrome/content/icons/favicon.svg"), "missing chrome/content/icons/favicon.svg");
});
