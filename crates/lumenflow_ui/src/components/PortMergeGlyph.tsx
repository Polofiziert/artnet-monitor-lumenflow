import type { Component } from "solid-js";

export interface PortMergeGlyphProps {
  /** Output merge path (stack → lone) vs input path (lone → stack). */
  variant: "output" | "input";
  /** Output: stacked squares filled count (0–2). Ignored when `variant` is `input`. */
  filledStackCount: number;
  /** Input: lone square filled when node reports input data (PollReply). */
  loneSquareFilled: boolean;
  class?: string;
  "data-testid"?: string;
}

/** Arrow head polygon for polylines (ArtPollReply merge glyph geometry). */
function arrowHeadPolygon(
  x2: number,
  y2: number,
  fromX: number,
  fromY: number
): string {
  const S = 2.1;
  const a = Math.atan2(y2 - fromY, x2 - fromX);
  const w = 0.65;
  const p1x = x2 + S * Math.cos(a + Math.PI - w);
  const p1y = y2 + S * Math.sin(a + Math.PI - w);
  const p2x = x2 + S * Math.cos(a + Math.PI + w);
  const p2y = y2 + S * Math.sin(a + Math.PI + w);
  return `${x2},${y2} ${p1x.toFixed(1)},${p1y.toFixed(1)} ${p2x.toFixed(1)},${p2y.toFixed(1)}`;
}

/**
 * PollReply-derived merge topology: two stacked squares + one lone square;
 * arrows and fills follow `PortWireSummary` (core decoder).
 */
export const PortMergeGlyph: Component<PortMergeGlyphProps> = (props) => {
  const sq = 6;
  const gap = 3;
  const lx = 0.5;
  const tly = 0.5;
  const bly = tly + sq + gap;
  const rx = lx + sq + 8;
  const ry = (tly + bly) / 2;
  const vw = rx + sq + 0.5;
  const vh = bly + sq + 0.5;
  const tlCy = tly + sq / 2;
  const blCy = bly + sq / 2;
  const rCy = ry + sq / 2;
  const bendX = lx + sq + 4;

  const isOut = () => props.variant === "output";
  const outN = () => Math.min(2, Math.max(0, props.filledStackCount));
  const stackTopFill = () => isOut() && outN() >= 1;
  const stackBottomFill = () => isOut() && outN() >= 2;
  const loneFill = () => !isOut() && props.loneSquareFilled;

  return (
    <svg
      width={Math.ceil(vw)}
      height={Math.ceil(vh)}
      viewBox={`0 0 ${vw} ${vh}`}
      class={`shrink-0 text-muted ${props.class ?? ""}`}
      aria-hidden="true"
      data-testid={props["data-testid"] ?? "port-merge-glyph"}
    >
      <rect
        x={lx}
        y={tly}
        width={sq}
        height={sq}
        rx="1"
        stroke="currentColor"
        stroke-width="0.9"
        fill={stackTopFill() ? "rgb(45 212 191)" : "none"}
      />
      <rect
        x={lx}
        y={bly}
        width={sq}
        height={sq}
        rx="1"
        stroke="currentColor"
        stroke-width="0.9"
        fill={stackBottomFill() ? "rgb(45 212 191)" : "none"}
      />
      <rect
        x={rx}
        y={ry}
        width={sq}
        height={sq}
        rx="1"
        stroke="currentColor"
        stroke-width="0.9"
        fill={loneFill() ? "rgb(245 158 11)" : "none"}
      />
      {isOut() ? (
        <>
          {outN() >= 1 && (
            <>
              <polyline
                points={`${lx + sq},${tlCy} ${bendX},${tlCy} ${bendX},${rCy} ${rx - 0.5},${rCy}`}
                fill="none"
                stroke="currentColor"
                stroke-width="0.8"
                stroke-linejoin="round"
              />
              <polygon
                points={arrowHeadPolygon(rx - 0.5, rCy, bendX, rCy)}
                fill="currentColor"
              />
            </>
          )}
          {outN() >= 2 && (
            <polyline
              points={`${lx + sq},${blCy} ${bendX},${blCy} ${bendX},${rCy} ${rx - 0.5},${rCy}`}
              fill="none"
              stroke="currentColor"
              stroke-width="0.8"
              stroke-linejoin="round"
            />
          )}
        </>
      ) : (
        props.loneSquareFilled && (
          <>
            <polyline
              points={`${rx + sq},${rCy} ${bendX + 2},${rCy} ${bendX + 2},${tlCy} ${lx + sq + 0.5},${tlCy}`}
              fill="none"
              stroke="currentColor"
              stroke-width="0.8"
              stroke-linejoin="round"
            />
            <polygon
              points={arrowHeadPolygon(lx + sq + 0.5, tlCy, bendX + 2, tlCy)}
              fill="currentColor"
            />
          </>
        )
      )}
    </svg>
  );
};
