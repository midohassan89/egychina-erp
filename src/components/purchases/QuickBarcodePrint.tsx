"use client";

import { useState } from "react";
import { LabelPreviewCard } from "@/components/labels/BarcodeLabel";
import { printIsolatedLabels } from "@/lib/labels/printIsolatedLabels";
import {
  getLabelTemplate,
  LABEL_TEMPLATES,
  parseLabelCopies,
  type LabelTemplateId,
} from "@/lib/labels/templates";

export function QuickBarcodePrint({
  name,
  nameZh,
  barcode,
  price,
  defaultCopies,
  onClose,
}: {
  name: string;
  nameZh?: string | null;
  barcode: string;
  price: number;
  defaultCopies: number;
  onClose: () => void;
}) {
  const initial = parseLabelCopies(defaultCopies, 1);
  const [copies, setCopies] = useState(String(initial));
  const [templateId, setTemplateId] = useState<LabelTemplateId>("standard-38x25");
  const template = getLabelTemplate(templateId);
  const count = parseLabelCopies(copies, 1);
  const data = { name, nameZh: nameZh ?? null, barcode, price };

  function printLabels() {
    if (!barcode || count < 1) return;
    printIsolatedLabels(
      Array.from({ length: count }, () => data),
      template,
    );
  }

  return (
    <>
    <div className="dashboard-print-hide fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-800">
        <h2 className="text-lg font-bold text-slate-900 dark:text-gray-100">طباعة باركود</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-gray-300">{name}</p>
        {nameZh ? (
          <p className="text-xs text-slate-500 dark:text-gray-400" lang="zh-CN" dir="ltr">
            {nameZh}
          </p>
        ) : null}
        {!barcode ? (
          <p className="mt-4 text-sm text-red-600">لا يوجد باركود لهذا الصنف</p>
        ) : (
          <>
            <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-gray-200">
              قالب الملصق
              <select
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value as LabelTemplateId)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
              >
                {LABEL_TEMPLATES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700 dark:text-gray-200">
              عدد الاستيكرات (سيطبع {count} بالضبط
              {template.facesPerSticker > 1
                ? ` = ${count * template.facesPerSticker} وجه`
                : ""}
              )
              <input
                type="number"
                min={1}
                max={200}
                step={1}
                value={copies}
                onChange={(event) => setCopies(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
              />
            </label>
            <div className="mt-4 flex justify-center">
              <LabelPreviewCard data={data} template={template} />
            </div>
          </>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-sm text-slate-600 dark:text-gray-300"
          >
            إغلاق
          </button>
          <button
            type="button"
            disabled={!barcode || count < 1}
            onClick={printLabels}
            className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            طباعة {count} استيكر
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
