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

function Bars({ value, tall }: { value: string; tall?: boolean }) {
  return (
    <div className={tall ? "label-bars label-bars--single" : "label-bars"}>
      <Barcode
        value={value}
        format="CODE128"
        width={tall ? 1.6 : 1.4}
        height={tall ? 28 : 18}
        margin={0}
        displayValue={false}
        background="#ffffff"
        lineColor="#000000"
      />
    </div>
  );
}

function SingleFace({ data }: { data: LabelFaceData }) {
  return (
    <div className="label-single">
      <p className="label-single-name">{data.name}</p>
      {data.nameZh?.trim() ? (
        <p className="label-single-zh" lang="zh-CN" dir="ltr">
          {data.nameZh.trim()}
        </p>
      ) : null}
      <p className="label-single-price">
        <span>{formatLabelPrice(data.price)}</span>
      </p>
      <Bars value={data.barcode} tall />
      <p className="label-single-code">{data.barcode}</p>
    </div>
  );
}

function SplitHalf({ data }: { data: LabelFaceData }) {
  const title = data.nameZh?.trim() || data.name;
  return (
    <div className="label-half">
      <div className="label-half-row">
        <span
          className="label-half-name"
          lang={data.nameZh?.trim() ? "zh-CN" : undefined}
          dir="ltr"
        >
          {title}
        </span>
        <span className="label-half-price">{formatLabelPrice(data.price)}</span>
      </div>
      <Bars value={data.barcode} />
      <p className="label-half-code">{data.barcode}</p>
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
  return (
    <div
      key={stickerKey}
      className={
        template.layout === "single"
          ? "thermal-label-preview"
          : template.layout === "stack"
            ? "thermal-label-preview thermal-label-preview--stack"
            : "thermal-label-preview thermal-label-preview--side"
      }
      data-template={template.id}
      dir="rtl"
    >
      {template.layout === "single" ? (
        <SingleFace data={data} />
      ) : (
        <>
          <SplitHalf data={data} />
          <div className="label-split-gap" />
          <SplitHalf data={data} />
        </>
      )}
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
    <ThermalLabelSticker data={data} template={template} stickerKey="preview" />
  );
}
