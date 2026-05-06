// figma-plugin/code.ts
//
// DESIGN.md Importer v2 — fetches a manifest.json listing available
// collections, lets the user pick one or more via checkboxes, and imports
// each as an independent Figma Variables Collection. Re-running on the
// same payload updates values without creating duplicates.

interface PayloadValue {
  color?: { r: number; g: number; b: number; a: number };
  number?: number;
  string?: string;
  alias?: string;
}

interface PayloadVariable {
  name: string;
  type: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
  value: PayloadValue;
}

interface Payload {
  generated: string;
  collection: string;
  mode: string;
  variables: PayloadVariable[];
}

interface ManifestEntry {
  name: string;
  url: string;
  kind: "brand" | "promotion";
}

const STORAGE_MANIFEST_URL = "design-md.manifest-url";

figma.showUI(__html__, { width: 420, height: 540, themeColors: true });

(async () => {
  const url = (await figma.clientStorage.getAsync(STORAGE_MANIFEST_URL)) || "";
  figma.ui.postMessage({ type: "init", manifestUrl: url });
  if (url) await loadManifest(url);
})();

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === "set-manifest") {
      await figma.clientStorage.setAsync(STORAGE_MANIFEST_URL, msg.url);
      await loadManifest(msg.url);
    } else if (msg.type === "import") {
      await importMany(msg.entries);
    } else if (msg.type === "close") {
      figma.closePlugin();
    }
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    figma.ui.postMessage({ type: "log", message: `❌ ${m}` });
    figma.notify(`❌ ${m}`, { error: true });
    figma.ui.postMessage({ type: "done" });
  }
};

async function loadManifest(url: string) {
  figma.ui.postMessage({ type: "log", message: `📥 Loading manifest…` });
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Manifest HTTP ${res.status}`);
  const entries = (await res.json()) as ManifestEntry[];
  if (!Array.isArray(entries)) throw new Error("Invalid manifest format");

  // Sort: brands first, then promotions by name.
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "brand" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // Annotate which collections already exist locally
  const existingNames = new Set(
    figma.variables.getLocalVariableCollections().map((c) => c.name),
  );
  const annotated = entries.map((e) => ({
    ...e,
    existsLocally: existingNames.has(e.name),
  }));

  figma.ui.postMessage({ type: "manifest-loaded", entries: annotated });
}

async function importMany(entries: ManifestEntry[]) {
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const entry of entries) {
    figma.ui.postMessage({
      type: "log",
      message: `\n📦 ${entry.name}…`,
    });
    const res = await fetch(entry.url, { cache: "no-store" });
    if (!res.ok) {
      figma.ui.postMessage({
        type: "log",
        message: `  ❌ HTTP ${res.status} — skipped`,
      });
      continue;
    }
    const payload = (await res.json()) as Payload;
    const result = importPayload(payload);
    totalCreated += result.created;
    totalUpdated += result.updated;
    totalSkipped += result.skipped;
    figma.ui.postMessage({
      type: "log",
      message: `  ✅ +${result.created} new, ~${result.updated} updated, ${result.skipped} skipped`,
    });
  }

  figma.ui.postMessage({
    type: "log",
    message:
      `\n🎉 Done. Total: +${totalCreated} new, ~${totalUpdated} updated, ` +
      `${totalSkipped} skipped across ${entries.length} collection(s).`,
  });
  figma.notify(`✅ Imported ${totalCreated + totalUpdated} variables`);
  figma.ui.postMessage({ type: "done" });
}

function importPayload(payload: Payload) {
  const collections = figma.variables.getLocalVariableCollections();
  let collection = collections.find((c) => c.name === payload.collection);
  if (!collection) {
    collection = figma.variables.createVariableCollection(payload.collection);
  }

  const modeId = collection.modes[0].modeId;
  if (collection.modes[0].name !== payload.mode) {
    collection.renameMode(modeId, payload.mode);
  }

  // Index existing vars by name within this collection.
  const allVars = figma.variables.getLocalVariables();
  const byName = new Map<string, Variable>();
  for (const v of allVars) {
    if (v.variableCollectionId === collection.id) {
      byName.set(v.name, v);
    }
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  // Pass 1: ensure variables exist with correct type.
  for (const def of payload.variables) {
    const existing = byName.get(def.name);
    if (!existing) {
      const v = figma.variables.createVariable(
        def.name,
        collection,
        def.type,
      );
      byName.set(def.name, v);
      created++;
    } else if (existing.resolvedType !== def.type) {
      figma.ui.postMessage({
        type: "log",
        message:
          `  ⚠ Skipped "${def.name}": type ${existing.resolvedType} ≠ ${def.type}`,
      });
      skipped++;
    } else {
      updated++;
    }
  }

  // Pass 2: set values, resolving aliases.
  for (const def of payload.variables) {
    const v = byName.get(def.name);
    if (!v || v.resolvedType !== def.type) continue;

    try {
      if (def.value.alias !== undefined) {
        const target = byName.get(def.value.alias);
        if (!target) {
          figma.ui.postMessage({
            type: "log",
            message: `  ⚠ Alias missing: ${def.name} → ${def.value.alias}`,
          });
          continue;
        }
        if (target.resolvedType !== v.resolvedType) continue;
        v.setValueForMode(modeId, figma.variables.createVariableAlias(target));
      } else if (def.value.color !== undefined) {
        v.setValueForMode(modeId, def.value.color);
      } else if (def.value.number !== undefined) {
        v.setValueForMode(modeId, def.value.number);
      } else if (def.value.string !== undefined) {
        v.setValueForMode(modeId, def.value.string);
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      figma.ui.postMessage({
        type: "log",
        message: `  ⚠ Failed "${def.name}": ${m}`,
      });
    }
  }

  return { created, updated, skipped };
}
