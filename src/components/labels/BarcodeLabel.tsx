"use client";

import dynamic from "next/dynamic";
import {
  formatLabelPrice,
  type LabelTemplate,
} from "@/lib/labels/templates";

const Barcode = dynamic(() => import("react-barcode"), { ssr: false });

export type LabelFaceData = {
  name: string;
  nameZh?: string | null;
  barcode: string;
  price: number;
};

function FaceContent({
  data,
  compact,
}: {
  data: LabelFaceData;
  compact?: boolean;
}) {
  const barcodeHeight = compact ? 22 : 28;
  const barcodeWidth = compact ? 1.5 : 1.5;
  return (
    <div className="label-face" dir="rtl">
      <p className="label-name">{data.name}</p>
      {data.nameZh ? (
        <p className="label-name-zh" lang="zh-CN" dir="ltr">
          {data.nameZh}
        </p>
      ) : null}
      <p className="label-price">
        <span className="label-price-badge">{formatLabelPrice(data.price)}</span>
      </p>
      <div className="label-barcode">
        <Barcode
          value={data.barcode}
          format="CODE128"
          width={barcodeWidth}
          height={barcodeHeight}
          fontSize={compact ? 8 : 9}
          margin={0}
          displayValue
          background="#ffffff"
          lineColor="#000000"
        />
      </div>
    </div>
  );
}

/** One physical sticker — may contain 1 or 2 pharmacy faces. */
export function ThermalLabelSticker({
  data,
  template,
  stickerKey,
}: {
  data: LabelFaceData;
  template: LabelTemplate;
  stickerKey: string;
}) {
  if (template.layout === "single") {
    return (
      <div
        key={stickerKey}
        className="thermal-label thermal-label--single"
        data-template={template.id}
        dir="rtl"
      >
        <FaceContent data={data} />
      </div>
    );
  }

  const faces = [0, 1];
  return (
    <div
      key={stickerKey}
      className={
        template.layout === "stack"
          ? "thermal-label thermal-label--stack"
          : "thermal-label thermal-label--side"
      }
      data-template={template.id}
      dir="rtl"
    >
      {faces.map((index) => (
        <div key={`${stickerKey}-face-${index}`} className="thermal-label-half">
          <FaceContent data={data} compact />
        </div>
      ))}
    </div>
  );
}

export function LabelPreviewCard({
  data,
  template,
}: {
  data: LabelFaceData;
  template: LabelTemplate;
}) {
  return (
    <div
      className={
        template.layout === "side"
          ? "thermal-label-preview thermal-label-preview--side"
          : template.layout === "stack"
            ? "thermal-label-preview thermal-label-preview--stack"
            : "thermal-label-preview"
      }
      style={{ width: `${template.widthMm}mm`, minHeight: `${template.heightMm}mm` }}
      dir="rtl"
    >
      {template.layout === "single" ? (
        <FaceContent data={data} />
      ) : (
        <>
          <div className="thermal-label-half">
            <FaceContent data={data} compact />
          </div>
          <div className="thermal-label-half">
            <FaceContent data={data} compact />
          </div>
        </>
      )}
    </div>
  );
}
