import { ImageResponse } from "next/og";
import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Glyph, NOTE_COLORS, INK, type GlyphType } from "@/components/notation";
import { challengeText, readChallenge } from "@/lib/og";

/** Link previews (Open Graph): the home card, or a challenge ("Beat 2,410 · 5 songs"). */

const W = 1200;
const H = 630;
const PAPER = "#e9e6dd";
const RED = "#b13535";
const BLUE = "#1f50b0";

let font: Promise<Buffer> | null = null;
const petaluma = () => (font ??= readFile(path.join(process.cwd(), "src/app/fonts/PetalumaScript.otf")));

/** A point on a cubic curve. */
function bez(p: number[][], t: number) {
  const u = 1 - t;
  return [0, 1].map((i) => u * u * u * p[0][i] + 3 * u * u * t * p[1][i] + 3 * u * t * t * p[2][i] + t * t * t * p[3][i]);
}

/** The preview renderer only draws plain SVG shapes inside <svg>: unwrap components into what they draw. */
function plain(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return Children.map(node, plain);
  if (!isValidElement(node)) return node;
  const el = node as React.ReactElement<{ children?: ReactNode }>;
  if (typeof el.type === "function") return plain((el.type as (p: unknown) => ReactNode)(el.props));
  return el.props.children === undefined ? el : cloneElement(el, undefined, plain(el.props.children));
}

function stavesImage(props: { cx: number; cy: number; faded?: boolean }) {
  return plain(Staves(props));
}

/** The home art: a staff running into the play button, four staves fanning out of it, notes riding on them. */
function Staves({ cx, cy, faded }: { cx: number; cy: number; faded?: boolean }) {
  const ends = [cy - 300, cy - 110, cy + 90, cy + 290];
  const colors = [INK, BLUE, RED, "#d9a62e"];
  const types: GlyphType[] = ["eighth", "three", "half", "eighth", "quarter", "pair"];
  const staves = ends.map((yEnd, s) => {
    const lines = [0, 1, 2, 3, 4].map((k) => {
      const d0 = (k - 2) * 2.5;
      const d1 = (k - 2) * 11;
      const p = [[cx + 60, cy + d0], [cx + 260, cy + d0 + (yEnd - cy) * 0.1], [cx + 420, yEnd + d1 - (yEnd - cy) * 0.15], [W + 40, yEnd + d1]];
      return { d: `M${p[0]} C${p[1]} ${p[2]} ${p[3]}`.replace(/,/g, " "), p };
    });
    const mid = lines[2].p;
    const notes = [0.42, 0.62, 0.8, 0.95].map((t, i) => {
      const [x, y] = bez(mid, t);
      return { x, y: y - 6 - (i % 2) * 14, type: types[(s + i) % types.length] };
    });
    return { lines, notes, color: colors[s] };
  });
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0, opacity: faded ? 0.6 : 1 }}>
      {!faded &&
        [0, 1, 2, 3, 4].map((k) => <path key={k} d={`M-20 ${cy + (k - 2) * 11} L${cx - 70} ${cy + (k - 2) * 11}`} stroke={INK} strokeWidth={2} fill="none" />)}
      {staves.map((st, s) => (
        <g key={s}>
          {st.lines.map((l, k) => (
            <path key={k} d={l.d} stroke={st.color} strokeWidth={2} fill="none" opacity={0.85} />
          ))}
          {st.notes.map((n, i) => (
            <Glyph key={i} type={n.type} x={n.x} y={n.y} scale={1.25} rotate={(i % 2 ? 1 : -1) * 8} fill={s === 0 ? INK : NOTE_COLORS[(s - 1) % 3]} />
          ))}
        </g>
      ))}
      <circle cx={cx} cy={cy} r={74} fill={RED} />
      <path d={`M${cx - 20} ${cy - 34} L${cx + 34} ${cy} L${cx - 20} ${cy + 34} Z`} fill={PAPER} />
    </svg>
  );
}

export async function GET(req: Request) {
  const c = readChallenge(new URL(req.url).searchParams.get("c"));
  const fonts = [{ name: "Petaluma", data: await petaluma(), style: "normal" as const, weight: 400 as const }];
  const text = c ? challengeText(c) : null;

  const body = c ? (
    <div style={{ display: "flex", width: W, height: H, background: PAPER, fontFamily: "Petaluma", position: "relative" }}>
      {stavesImage({ cx: 915, cy: 315, faded: true })}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 80px", color: INK }}>
        <div style={{ fontSize: 64 }}>Earshot</div>
        <div style={{ fontSize: c.score != null ? 168 : 120, color: BLUE, lineHeight: 1, marginTop: 10 }}>{text!.title}</div>
        <div style={{ fontSize: 48, color: "#4a463f", marginTop: 22 }}>{text!.line}</div>
      </div>
    </div>
  ) : (
    <div style={{ display: "flex", width: W, height: H, background: PAPER, fontFamily: "Petaluma", position: "relative" }}>
      {stavesImage({ cx: 600, cy: 360 })}
      <div style={{ position: "absolute", left: 80, top: 70, fontSize: 150, color: INK }}>Earshot</div>
    </div>
  );
  return new ImageResponse(body, { width: W, height: H, fonts, headers: { "cache-control": "public, max-age=3600" } });
}
