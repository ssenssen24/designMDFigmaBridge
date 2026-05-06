// scripts/merge.mjs
//
// Resolves DESIGN.md inheritance via the YAML front-matter `extends` field.
// Reads a target DESIGN.md, walks its inheritance chain, deep-merges the
// YAML front matter, and writes a fully-flattened DESIGN.md to stdout
// (or a file). Markdown prose is concatenated in inheritance order, with
// the most specific file last.
//
// Inheritance:
//   { extends: "brands/_base" }     - resolves to brands/_base/DESIGN.md
//   { extends: "brands/heritage" }  - resolves to brands/heritage/DESIGN.md
//   No `extends` field              - file is standalone (used as-is)
//
// Cycles are detected and rejected. The output is a valid DESIGN.md that
// design.md CLI can lint and export without further processing.
//
// Usage:
//   node scripts/merge.mjs <path-to-DESIGN.md> [output-path]

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const [, , inputPath, outputPath] = process.argv;
if (!inputPath) {
  console.error("Usage: node scripts/merge.mjs <DESIGN.md> [output]");
  process.exit(2);
}

const ROOT = process.cwd();

// Skip-keys: present in YAML but not part of the design system itself
const META_KEYS = new Set(["extends", "expires"]);

function parseDesign(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) {
    throw new Error(`No YAML front matter in ${filePath}`);
  }
  const front = yaml.load(m[1]) || {};
  const body = m[2] || "";
  return { front, body, filePath };
}

function resolveExtends(extendsValue, fromFile) {
  // `extends: brands/_base` → `<root>/brands/_base/DESIGN.md`
  // Always relative to repo root.
  const target = path.join(ROOT, extendsValue, "DESIGN.md");
  if (!fs.existsSync(target)) {
    throw new Error(
      `Cannot resolve "extends: ${extendsValue}" from ${fromFile}\n` +
        `  Looked for: ${target}`,
    );
  }
  return target;
}

// Walk the chain, oldest ancestor first.
function buildChain(startPath, visited = new Set()) {
  const abs = path.resolve(startPath);
  if (visited.has(abs)) {
    throw new Error(
      `Inheritance cycle detected at ${abs}\nChain: ${[...visited, abs].join(" → ")}`,
    );
  }
  visited.add(abs);

  const parsed = parseDesign(abs);
  const ext = parsed.front.extends;
  if (!ext) return [parsed];

  const parentPath = resolveExtends(ext, abs);
  return [...buildChain(parentPath, visited), parsed];
}

// Deep merge: child overrides parent. Arrays are replaced (not concatenated).
function deepMerge(a, b) {
  if (b === undefined) return a;
  if (a === undefined) return b;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) ||
    Array.isArray(b)
  ) {
    return b; // primitive or array — child wins
  }
  const out = { ...a };
  for (const key of Object.keys(b)) {
    out[key] = deepMerge(a[key], b[key]);
  }
  return out;
}

function stripMeta(obj) {
  const out = {};
  for (const key of Object.keys(obj)) {
    if (!META_KEYS.has(key)) out[key] = obj[key];
  }
  return out;
}

// ----- main -----

const chain = buildChain(inputPath);

// Merge YAML in chain order
let merged = {};
for (const link of chain) {
  merged = deepMerge(merged, link.front);
}
const cleanFront = stripMeta(merged);

// Prose policy: use the most-specific (last) file's prose. If empty, fall
// back up the chain. Concatenating prose from all ancestors causes section
// order conflicts and is rarely what authors want — child prose is meant
// to replace, not append.
let mergedBody = "";
for (let i = chain.length - 1; i >= 0; i--) {
  if (chain[i].body.trim().length > 0) {
    mergedBody = chain[i].body.trim();
    break;
  }
}

const output =
  "---\n" +
  yaml.dump(cleanFront, { lineWidth: -1, quotingType: '"' }) +
  "---\n\n" +
  mergedBody +
  "\n";

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);
  console.error(
    `✅ Merged ${chain.length} file(s) → ${outputPath} ` +
      `(chain: ${chain.map((l) => path.relative(ROOT, l.filePath)).join(" → ")})`,
  );
} else {
  process.stdout.write(output);
}
