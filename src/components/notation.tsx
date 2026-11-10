/*
  Music notation drawn as SVG, in the style of the Earshot designs: tilted oval
  noteheads, thin stems, curved flags. Every glyph's origin is the centre of its
  (first) notehead, so placing a glyph on a staff line is just its x/y.
*/

export const INK = "#1e1e1e";
export const NOTE_COLORS = ["#1f50b0", "#b13535", "#d9a62e"] as const;

export type GlyphType = "quarter" | "eighth" | "sixteenth" | "half" | "whole" | "dotted" | "pair" | "three" | "rest8" | "sharp" | "flat";

function Head({ x = 0, y = 0, fill, hollow }: { x?: number; y?: number; fill: string; hollow?: boolean }) {
  return hollow ? (
    <ellipse cx={x} cy={y} rx={7.6} ry={5.3} transform={`rotate(-22 ${x} ${y})`} fill="none" stroke={fill} strokeWidth={2.6} />
  ) : (
    <ellipse cx={x} cy={y} rx={8.5} ry={6.2} transform={`rotate(-22 ${x} ${y})`} fill={fill} />
  );
}
const Stem = ({ x = 0, y = 0, fill, len = 31 }: { x?: number; y?: number; fill: string; len?: number }) => <rect x={x + 6.6} y={y - len} width={2.2} height={len} fill={fill} />;
const Flag = ({ x = 0, y = 0, fill, len = 31, off = 0 }: { x?: number; y?: number; fill: string; len?: number; off?: number }) => {
  const t = y - len + off;
  return <path d={`M${x + 8.8} ${t} C ${x + 10.6} ${t + 8}, ${x + 18.6} ${t + 10}, ${x + 16.6} ${t + 22} C ${x + 15.6} ${t + 16}, ${x + 12.6} ${t + 13}, ${x + 8.8} ${t + 12} Z`} fill={fill} />;
};

function GlyphShape({ type, fill }: { type: GlyphType; fill: string }) {
  switch (type) {
    case "quarter":
      return (<><Head fill={fill} /><Stem fill={fill} /></>);
    case "eighth":
      return (<><Head fill={fill} /><Stem fill={fill} /><Flag fill={fill} /></>);
    case "sixteenth":
      return (<><Head fill={fill} /><Stem fill={fill} len={34} /><Flag fill={fill} len={34} /><Flag fill={fill} len={34} off={8} /></>);
    case "half":
      return (<><Head fill={fill} hollow /><Stem fill={fill} /></>);
    case "whole":
      return <ellipse cx={0} cy={0} rx={10} ry={6.6} transform="rotate(-12 0 0)" fill="none" stroke={fill} strokeWidth={3.4} />;
    case "dotted":
      return (<><Head fill={fill} /><Stem fill={fill} /><circle cx={14} cy={-1} r={2.4} fill={fill} /></>);
    case "pair":
      return (
        <>
          <Head fill={fill} />
          <Head x={26} y={-8} fill={fill} />
          <rect x={6.6} y={-31} width={2.2} height={31} fill={fill} />
          <rect x={32.6} y={-39} width={2.2} height={31} fill={fill} />
          <path d="M6.6 -31 L34.8 -39 L34.8 -33.5 L6.6 -25.5 Z" fill={fill} />
        </>
      );
    case "three":
      return (
        <>
          {[0, 18, 36].map((x) => (
            <g key={x}>
              <Head x={x} fill={fill} />
              <rect x={x + 6.6} y={-31} width={2.2} height={31} fill={fill} />
            </g>
          ))}
          <rect x={6.6} y={-31} width={32.2} height={5.5} fill={fill} />
        </>
      );
    case "rest8":
      return (
        <>
          <circle cx={-3} cy={-6} r={3.6} fill={fill} />
          <path d="M-3 -3 C 1 -3, 4 -5, 6 -9 L-2 14" stroke={fill} strokeWidth={2.2} fill="none" strokeLinecap="round" />
        </>
      );
    case "sharp":
      return (
        <>
          <path d="M-3 -15 V13 M3 -17 V11" stroke={fill} strokeWidth={1.8} />
          <path d="M-7.5 -3 L7.5 -7 L7.5 -3.5 L-7.5 0.5 Z M-7.5 6 L7.5 2 L7.5 5.5 L-7.5 9.5 Z" fill={fill} />
        </>
      );
    case "flat":
      return (
        <>
          <path d="M-4 -24 V6" stroke={fill} strokeWidth={2} />
          <path d="M-4 6 C 7 0, 8 -9, -4 -4 L-4 -1 C 3 -4, 3 1, -4 4 Z" fill={fill} />
        </>
      );
  }
}

/** One glyph placed in SVG user space. */
export function Glyph({ type, x, y, fill = INK, rotate = 0, scale = 1, className, style }: { type: GlyphType; x: number; y: number; fill?: string; rotate?: number; scale?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rotate.toFixed(1)}) scale(${scale.toFixed(3)})`}>
      <g className={className} style={style}>
        <GlyphShape type={type} fill={fill} />
      </g>
    </g>
  );
}

/** The treble clef outline (Noto Music, SIL OFL), 61 x 173 units at its natural size. */
export const TREBLE_CLEF = { d: "M26.40 53.30L26.40 53.30Q25 48 24.10 42.80Q23.20 37.60 23.20 32.20L23.20 32.20Q23.20 27.50 23.85 23.35Q24.50 19.20 25.70 15.70L25.70 15.70Q27 11.70 29.10 8.15Q31.20 4.60 33.55 2.30Q35.90 0 37.70 0L37.70 0Q40.10 0 44.30 8.50L44.30 8.50Q46.40 12.80 47.40 17.80Q48.40 22.80 48.40 28.50L48.40 28.50Q48.40 35.60 46.50 42.65Q44.60 49.70 40.95 55.90Q37.30 62.10 32.20 66.80L32.20 66.80L35.70 83.60Q37.20 83.40 38.20 83.30Q39.20 83.20 39.70 83.20L39.70 83.20Q45.80 83.20 50.60 86.65Q55.40 90.10 58.25 95.70Q61.10 101.30 61.10 108L61.10 108Q61.10 115.70 57.15 121.85Q53.20 128 45.30 130.90L45.30 130.90Q45.80 132.60 48.20 145.10L48.20 145.10Q48.80 148.10 49.10 149.85Q49.40 151.60 49.50 152.90Q49.60 154.20 49.60 155.90L49.60 155.90Q49.60 160.90 47.15 164.85Q44.70 168.80 40.55 171Q36.40 173.20 31.30 173.20L31.30 173.20Q26.10 173.20 22.10 171.25Q18.10 169.30 15.80 165.85Q13.50 162.40 13.50 157.90L13.50 157.90Q13.50 153.10 16.15 149.90Q18.80 146.70 23.70 146.70L23.70 146.70Q27.90 146.70 30.55 149.75Q33.20 152.80 33.20 157L33.20 157Q33.20 160.60 30.70 163.30Q28.20 166 24.20 166L24.20 166L23.20 166Q25.80 169.90 31.40 169.90L31.40 169.90Q38.30 169.90 42.20 165.40Q46.10 160.90 46.10 153.90L46.10 153.90Q46.10 152.20 45.70 149.35Q45.30 146.50 44.30 142.50Q43.30 138.50 42.75 135.90Q42.20 133.30 42 132.20L42 132.20Q38.60 133.20 34 133.20L34 133.20Q25.40 133.20 17.20 128.20L17.20 128.20Q9.20 123.20 4.60 115Q0 106.80 0 97.30L0 97.30Q0 88.30 4.10 80.40Q8.20 72.50 14.25 65.90Q20.30 59.30 26.40 53.30ZM29.10 50.80L29.10 50.80Q31.40 49.60 34 46.35Q36.60 43.10 39 38.90Q41.40 34.70 42.90 30.45Q44.40 26.20 44.40 22.80L44.40 22.80Q44.40 19.20 43.30 17.10Q42.20 15 39.50 15L39.50 15Q37.10 15 34.85 17.20Q32.60 19.40 30.85 23.05Q29.10 26.70 28.10 31.20Q27.10 35.70 27.10 40.40L27.10 40.40Q27.10 43.60 27.75 46.20Q28.40 48.80 29.10 50.80ZM37.90 95.10L44.50 127.90Q54.30 123.70 54.30 110.70L54.30 110.70Q54.30 106.40 52.10 102.85Q49.90 99.30 46.20 97.20Q42.50 95.10 37.90 95.10L37.90 95.10ZM41.40 128.90L34.80 95.50Q32.10 96.10 29.70 98.05Q27.30 100 25.85 102.75Q24.40 105.50 24.40 108.60L24.40 108.60Q24.40 111.10 25.70 113.75Q27 116.40 28.90 118L28.90 118Q30.20 119.20 31.50 119.80L31.50 119.80Q33 120.50 33 121.10L33 121.10Q33 121.40 32 121.70L32 121.70Q28.20 120.80 25.15 118.30Q22.10 115.80 20.35 112.25Q18.60 108.70 18.60 104.70L18.60 104.70Q18.60 100.40 20.35 96.40Q22.10 92.40 25.25 89.20Q28.40 86 32.40 84.40L32.40 84.40L29.50 69.30Q17.90 78.70 12.45 87.75Q7 96.80 7 105.70L7 105.70Q7 112.20 10.40 117.80Q13.80 123.40 19.70 126.85Q25.60 130.30 33 130.30L33 130.30Q35 130.30 37.05 129.90Q39.10 129.50 41.40 128.90L41.40 128.90Z", width: 61.1, height: 173.2 } as const;

/** A treble clef whose box is `height` tall; its curl sits on the G line about 64% of the way down. */
export function TrebleClef({ x, y, height, fill = INK }: { x: number; y: number; height: number; fill?: string }) {
  const s = height / TREBLE_CLEF.height;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d={TREBLE_CLEF.d} fill={fill} />
    </g>
  );
}
