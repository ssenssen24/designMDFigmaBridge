// figma-plugin/code.ts
//
// DESIGN.md Importer — fetches a figma-payload.json published by CI and
// creates/updates Figma Variables in a single collection.
//
// Idempotent: re-running on the same payload updates values without
// creating duplicates. Variables that were removed from DESIGN.md are
// NOT auto-deleted (left for manual review to avoid accidental loss).

interface PayloadValue {
  color?: { r: number; g: number; b: number; a: number };
  number?: number;
  string?: string;
  alias?: string; // target variable name (slash-delimited)
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

const STORAGE_KEY = "design-md-import-url";

figma.showUI(__html__, { width: 380, height: 320, themeColors: true });

// Restore last-used URL on open.
(async () => {
  const savedUrl = (await figma.clientStorage.getAsync(STORAGE_KEY)) || "";
  figma.ui.postMessage({ type: "init", url: savedUrl });
})();

figma.ui.onmessage = async (msg) => {
  if (msg.type === "import") {
    try {
      await figma.clientStorage.setAsync(STORAGE_KEY, msg.url);
      log("📥 Fetching payload…");

      const res = await fetch(msg.url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} — check the URL`);
      const payload = (await res.json()) as Payload;

      if (!Array.isArray(payload.variables)) {
        throw new Error("Invalid payload: missing 'variables' array");
      }

      log(`📦 Loaded ${payload.variables.length} tokens. Importing…`);
      const result = importPayload(payload);

      log(
        `✅ Done. Created ${result.created}, updated ${result.updated}, ` +
          `skipped ${result.skipped}.`,
      );
      figma.notify(
        `✅ Imported ${result.created + result.updated} variables`,
      );
      figma.ui.postMessage({ type: "done" });
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      log(`❌ ${m}`);
      figma.notify(`❌ Import failed: ${m}`, { error: true });
      figma.ui.postMessage({ type: "done" });
    }
  } else if (msg.type === "close") {
    figma.closePlugin();
  }
};

function log(message: string) {
  figma.ui.postMessage({ type: "log", message });
}

function importPayload(payload: Payload) {
  // 1. Find or create the target collection.
  const collections = figma.variables.getLocalVariableCollections();
  let collection = collections.find((c) => c.name === payload.collection);
  if (!collection) {
    collection = figma.variables.createVariableCollection(payload.collection);
    log(`+ Created collection "${payload.collection}"`);
  }

  // Use the first mode (Default) — multi-mode is out of scope for v1.
  const modeId = collection.modes[0].modeId;
  if (collection.modes[0].name !== payload.mode) {
    collection.renameMode(modeId, payload.mode);
  }

  // 2. Index existing variables in this collection by name.
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

  // 3. Pass 1 — ensure every variable exists with the correct type.
  //    (Aliases need their targets to exist before we can resolve them.)
  for (const def of payload.variables) {
    const existing = byName.get(def.name);
    if (!existing) {
      const v = figma.variables.createVariable(def.name, collection, def.type);
      byName.set(def.name, v);
      created++;
    } else if (existing.resolvedType !== def.type) {
      // Type mismatch — Figma can't change a variable's type after creation.
      // Skip and warn so the user can resolve manually.
      log(
        `⚠ Skipped "${def.name}": existing type ${existing.resolvedType} ` +
          `≠ payload type ${def.type}. Delete the variable in Figma to retype.`,
      );
      skipped++;
    } else {
      updated++;
    }
  }

  // 4. Pass 2 — set values, resolving aliases by name lookup.
  for (const def of payload.variables) {
    const v = byName.get(def.name);
    if (!v || v.resolvedType !== def.type) continue;

    try {
      if (def.value.alias !== undefined) {
        const target = byName.get(def.value.alias);
        if (!target) {
          log(`⚠ Alias target missing: ${def.name} → ${def.value.alias}`);
          continue;
        }
        if (target.resolvedType !== v.resolvedType) {
          log(
            `⚠ Alias type mismatch: ${def.name} (${v.resolvedType}) → ` +
              `${def.value.alias} (${target.resolvedType})`,
          );
          continue;
        }
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
      log(`⚠ Failed to set "${def.name}": ${m}`);
    }
  }

  return { created, updated, skipped };
}
