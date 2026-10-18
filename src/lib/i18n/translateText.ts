import { translate } from "google-translate-api-x";

export type LangCode = "ar" | "en" | "zh";

export interface TranslatedText {
  originalLang: LangCode;
  textAr: string;
  textEn: string;
  textZh: string;
}

function googleLang(lang: LangCode): "ar" | "en" | "zh-CN" {
  return lang === "zh" ? "zh-CN" : lang;
}

async function translateTo(text: string, from: LangCode, to: LangCode): Promise<string> {
  if (from === to) return text;
  const result = await translate(text, {
    from: googleLang(from),
    to: googleLang(to),
  });
  return result.text?.trim() || text;
}

/** Translate one piece of text into Arabic, English, and Chinese. */
export async function translateTrio(
  text: string,
  source: LangCode = "ar",
): Promise<TranslatedText> {
  const original = text.trim();
  if (!original) {
    return { originalLang: source, textAr: "", textEn: "", textZh: "" };
  }
  try {
    const [textAr, textEn, textZh] = await Promise.all([
      translateTo(original, source, "ar"),
      translateTo(original, source, "en"),
      translateTo(original, source, "zh"),
    ]);
    return { originalLang: source, textAr, textEn, textZh };
  } catch (error) {
    console.error("[translateTrio]", error);
    return {
      originalLang: source,
      textAr: original,
      textEn: original,
      textZh: original,
    };
  }
}
