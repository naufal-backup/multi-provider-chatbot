export type CavemanLevel = "lite" | "full" | "ultra";

export function getCavemanPrompt(level: CavemanLevel): string {
  const base =
    "Preserve user's language exactly. Never switch language. Keep technical terms, code, API names, error strings verbatim.";
  switch (level) {
    case "lite":
      return `Respond concisely. No filler, hedging, pleasantries. Keep articles and full sentences. Professional but tight. ${base}`;
    case "ultra":
      return `Respond ultra-terse. Strip conjunctions when unambiguous. One word when enough. No filler. Never drop not/never/no/only/except. Keep technical terms, code, API names exact. Never add words to sound caveman. If plain shorter, use plain. ${base}`;
    case "full":
    default:
      return `Respond terse like smart caveman. Drop articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course), hedging. Fragments OK. Short synonyms. Never drop not/never/no/only/except. Never invent abbreviations. Never add words to fake grammar. Keep technical terms, code, API names, error strings exact. If caveman phrasing not shorter than plain, use plain. ${base}`;
  }
}
