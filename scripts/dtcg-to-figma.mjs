// scripts/dtcg-to-figma.mjs
// Converts the actual DTCG output of `@google/design.md export --format dtcg`
// into a flat Figma-Variables-friendly payload.
//
// Real DTCG quirks this handles:
//   • $type is declared at GROUP level and inherited by descendants
//   • color values are objects: { colorSpace, components: [r,g,b], hex }
//   • dimension values are objects: { value, unit }
//   • typography composite has nested dimension objects for fontSize etc.
//   • lineHeight may be a unitless number
//
// Usage:
//   node scripts/dtcg-to-figma.mjs tokens.json figma-payload.json

import fs from "node:fs";

const [, , inputPath = "tokens.json", outputPath = "figma-payload.json"] =
  process.argv;

const REM_BASE = 16;

const dtcg = JSON.parse(fs.readFileSync(inputPath, "utf8"));

const variables = [];
const seen = new Set();

// ───────────────────────────── helpers ─────────────────────────────

function dimensionToNumber(val) {
  // DTCG dimension is { value: number, unit: "px" | "rem" | "em" | ... }
  if (val && typeof val === "object" && "value" in val) {
    const num = Number(val.value);
    const unit = String(val.unit || "px").toLowerCase();
    if (unit === "rem" || unit === "em") return num * REM_BASE;
    return num; // px or other units treated as px
  }
  // Unitless number (e.g. lineHeight: 1.2)
  if (typeof val === "number") return val;
  // String fallback (rare): "16px", "1.5rem"
  if (typeof val === "string") {
    const m = val.trim().match(/^(-?\d*\.?\d+)\s*(px|rem|em)?$/i);
    if (m) {
      const num = parseFloat(m[1]);
      const unit = (m[2] || "px").toLowerCase();
      return unit === "rem" || unit === "em" ? num * REM_BASE : num;
    }
  }
  throw new Error(`Invalid dimension: ${JSON.stringify(val)}`);
}

function colorToRgba(val) {
  // DTCG 2025.10: { colorSpace: "srgb", components: [r, g, b], hex?: "#..." }
  if (val && typeof val === "object" && Array.isArray(val.components)) {
    const [r, g, b] = val.components;
    const a = typeof val.alpha === "number" ? val.alpha : 1;
    return { r, g, b, a };
  }
  // Hex string fallback
  if (typeof val === "string" && val.startsWith("#")) {
    const h = val.slice(1);
    const expanded = h.length <= 4
      ? h.split("").map((c) => c + c).join("")
      : h;
    return {
      r: parseInt(expanded.slice(0, 2), 16) / 255,
      g: parseInt(expanded.slice(2, 4), 16) / 255,
      b: parseInt(expanded.slice(4, 6), 16) / 255,
      a: expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1,
    };
  }
  throw new Error(`Invalid color: ${JSON.stringify(val)}`);
}

function isReference(value) {
  return typeof value === "string"
    && value.startsWith("{")
    && value.endsWith("}");
}

function refToName(ref) {
  return ref.slice(1, -1).trim().replaceAll(".", "/");
}

function emit(name, type, value) {
  if (seen.has(name)) {
    console.warn(`⚠ Duplicate token name skipped: ${name}`);
    return;
  }
  seen.add(name);
  variables.push({ name, type, value });
}

// ─────────────────────── per-type leaf processors ──────────────────

function processColorLeaf(name, raw) {
  if (isReference(raw)) {
    emit(name, "COLOR", { alias: refToName(raw) });
  } else {
    emit(name, "COLOR", { color: colorToRgba(raw) });
  }
}

function processDimensionLeaf(name, raw) {
  if (isReference(raw)) {
    emit(name, "FLOAT", { alias: refToName(raw) });
  } else {
    emit(name, "FLOAT", { number: dimensionToNumber(raw) });
  }
}

function processStringLeaf(name, raw) {
  if (isReference(raw)) {
    emit(name, "STRING", { alias: refToName(raw) });
  } else {
    emit(name, "STRING", { string: String(raw) });
  }
}

function processNumberLeaf(name, raw) {
  if (isReference(raw)) {
    emit(name, "FLOAT", { alias: refToName(raw) });
    return;
  }
  if (typeof raw === "number") {
    emit(name, "FLOAT", { number: raw });
  } else if (typeof raw === "string" && /^-?\d*\.?\d+$/.test(raw.trim())) {
    emit(name, "FLOAT", { number: Number(raw) });
  } else {
    // Treat as STRING (e.g. named font weights like "bold")
    emit(name, "STRING", { string: String(raw) });
  }
}

// ─────────────────────── typography composite ──────────────────────

function processTypography(basePath, value) {
  // value shape: { fontFamily?, fontSize?, fontWeight?, lineHeight?, letterSpacing? }
  // Each sub-property may be: a primitive, a {value,unit} dimension, or a reference string.
  if (!value || typeof value !== "object") return;

  if ("fontFamily" in value) {
    processStringLeaf(`${basePath}/fontFamily`, value.fontFamily);
  }
  if ("fontSize" in value) {
    processDimensionLeaf(`${basePath}/fontSize`, value.fontSize);
  }
  if ("fontWeight" in value) {
    processNumberLeaf(`${basePath}/fontWeight`, value.fontWeight);
  }
  if ("lineHeight" in value) {
    // lineHeight: unitless number → keep as-is; dimension → convert to px
    const lh = value.lineHeight;
    if (typeof lh === "number") {
      emit(`${basePath}/lineHeight`, "FLOAT", { number: lh });
    } else {
      processDimensionLeaf(`${basePath}/lineHeight`, lh);
    }
  }
  if ("letterSpacing" in value) {
    processDimensionLeaf(`${basePath}/letterSpacing`, value.letterSpacing);
  }
}

// ────────────────────────── tree traversal ─────────────────────────

function walk(node, path = [], inheritedType = null) {
  if (!node || typeof node !== "object") return;

  // A node may declare $type for itself and all descendants.
  const nodeType = node.$type ?? inheritedType;

  // Leaf: has $value (with $type either on this node or inherited)
  if ("$value" in node) {
    const name = path.join("/");
    const val = node.$value;
    const type = nodeType;

    if (!type) {
      console.warn(`⚠ Token "${name}" has no $type — skipped`);
      return;
    }

    switch (type) {
      case "color":
        processColorLeaf(name, val);
        break;
      case "dimension":
        processDimensionLeaf(name, val);
        break;
      case "fontWeight":
      case "number":
        processNumberLeaf(name, val);
        break;
      case "fontFamily":
      case "string":
        processStringLeaf(name, val);
        break;
      case "typography":
        processTypography(name, val);
        break;
      default:
        // Best-effort fallback
        processStringLeaf(name, val);
    }
    return;
  }

  // Group: recurse, propagating $type to children
  for (const key of Object.keys(node)) {
    if (key.startsWith("$")) continue;
    walk(node[key], [...path, key], nodeType);
  }
}

// ───────────────────────────── main ────────────────────────────────

walk(dtcg);

// Validate alias targets exist (warn only)
const allNames = new Set(variables.map((v) => v.name));
for (const v of variables) {
  if (v.value.alias && !allNames.has(v.value.alias)) {
    console.warn(
      `⚠ Unresolved alias: ${v.name} -> {${v.value.alias.replaceAll("/", ".")}}`,
    );
  }
}

const output = {
  generated: new Date().toISOString(),
  collection: process.env.FIGMA_COLLECTION_NAME || "Brand",
  mode: process.env.FIGMA_MODE_NAME || "Default",
  variables,
};

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(
  `✅ ${variables.length} variables written to ${outputPath} ` +
    `(collection: "${output.collection}")`,
);
