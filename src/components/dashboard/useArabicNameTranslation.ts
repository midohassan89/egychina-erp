"use client";

import { useCallback, useState } from "react";

export function useArabicNameTranslation(
  nameEn: string,
  nameZh: string,
  setNameEn: (value: string) => void,
  setNameZh: (value: string) => void,
) {
  const [translating, setTranslating] = useState(false);

  const onArabicNameBlur = useCallback(
    async (name: string) => {
      const text = name.trim();
      const needsEn = !nameEn.trim();
      const needsZh = !nameZh.trim();
      if (!text || (!needsEn && !needsZh) || translating) return;

      setTranslating(true);
      try {
        const res = await fetch("/api/admin/translate-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const body = (await res.json()) as {
          en?: string;
          zh?: string;
          error?: string;
        };
        if (!res.ok) return;
        if (needsEn && body.en) setNameEn(body.en);
        if (needsZh && body.zh) setNameZh(body.zh);
      } catch {
        // Leave the fields editable if translation is unavailable.
      } finally {
        setTranslating(false);
      }
    },
    [nameEn, nameZh, setNameEn, setNameZh, translating],
  );

  return { translating, onArabicNameBlur };
}
