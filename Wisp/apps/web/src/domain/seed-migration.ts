import type { Material } from "./model";

/** Preference key used to make the legacy seed migration one-time per database. */
export const ENGLISH_SEED_MIGRATION_KEY = "seed-migration:english-v2";

function decodeLegacy(value: string): string {
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export const LEGACY_SEED_CONTENT: Readonly<Record<"proposal" | "venue", { title: string; text: string }>> = {
  proposal: {
    title: decodeLegacy("5Lmm5bqX5rS75Yqo5o+Q5qGI"),
    text: decodeLegacy("5ZGo5pyr77yM55WZ5LiA54K55YWJ57uZ6Ieq5bexCgowMSAvIOa0u+WKqOaEj+Wbvgrnu5nlv5nnooznmoTkurrkuIDngrnnlZnlnKjkuablupfnmoTml7bpl7TjgILmtLvliqjorqHliJLkuo4gMTEg5pyIIDgg5pel5byA5pS+77yM6aKE566X5Li6IDgsMDAwIOWFg+OAggoKMDIgLyDkuI3otbbml7bpl7TnmoTkvZPpqowK5ou/5LiA5byg56m655m95Lmm562+77yM5YaZ5LiL5LiA5Lu25oOz5pS+5LiL55qE5LqL44CC6YCJ5LiA5pys5Lmm77yM5Zyo56qX6L655Z2Q5LiA5Lya5YS/44CCCgowMyAvIOW+heehruiupOS6i+mhuQrmtbfmiqXorqHliJLkuo4gMTEg5pyIIDEwIOaXpeWumueov++8jOmaj+WQjuW8gOaUvuaKpeWQjeOAguWcuuWcsOOAgeWNsOWIt+S4jueJqeaWmeaKpeS7t+WQiOiuoSA2LDUwMCDlhYPjgIIKCui/meaYr+WPr+e8lui+keeahOekuuS+i+adkOaWme+8jOS4jeaYr+ecn+WunueglOeptuaVsOaNruOAgg=="),
  },
  venue: {
    title: decodeLegacy("5Zy65Zyw6K+05piO"),
    text: decodeLegacy("5aSc6I665Lmm5bqXIMK3IOWcuuWcsOivtOaYjgoK5byA5pS+5pe26Ze0CjExIOaciCA4IOaXpe+8jDE0OjAw4oCTMjA6MDDjgIIKCuepuumXtOS4juWuuemHjwrlu7rorq7mnIDlpJogNDAg5Lq677yM5L+d55WZ56qX6L656ZiF6K+75bqn5L2N44CC5a6k5YaF56aB5q2i5piO54Gr44CCCgrlh4blpIfkuovpobkK5rS75Yqo5YmN5LiA5aSp56Gu6K6k5Lq65ZGY5YiG5bel5LiO5Yqo57q/44CC6K+35bCG5rW35oql44CB5oql5ZCN5a6J5o6S5LiO5omn6KGM5pe26Ze05YaN5qyh5qC45a+544CCCgrov5nmmK/lj6/nvJbovpHnmoTnpLrkvovmnZDmlpnjgII="),
  },
};

/**
 * Return the English v2 replacement only for an untouched legacy seed.
 * Missing, edited, imported, and user-created materials are deliberately left alone.
 */
export function migrateLegacySeed(
  material: Material | undefined,
  englishSeed: Material,
  updatedAt: string,
): Material | undefined {
  if (!material || (material.id !== "proposal" && material.id !== "venue"))
    return undefined;
  const legacy = LEGACY_SEED_CONTENT[material.id];
  if (
    material.kind !== "text" ||
    material.source !== "virtual_document" ||
    material.version !== 1 ||
    Object.prototype.hasOwnProperty.call(material, "origin") ||
    Object.prototype.hasOwnProperty.call(material, "createdAt") ||
    material.title !== legacy.title ||
    material.text !== legacy.text
  )
    return undefined;
  return {
    ...material,
    title: englishSeed.title,
    text: englishSeed.text,
    version: 2,
    updatedAt,
  };
}
