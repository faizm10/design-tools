import type { FurnitureType } from "@/lib/types";

interface Props {
  type: FurnitureType;
  w: number;
  d: number;
  color: string;
  /** Size of one screen pixel in plan units, keeps strokes crisp at any zoom. */
  px: number;
}

const INK = "#3f3a34";

/** Top-down symbol for a furniture item, drawn centred on the origin, front facing +y. */
export function PlanSymbol({ type, w, d, color, px }: Props) {
  const sw = 1.2 * px;
  const hw = w / 2;
  const hd = d / 2;
  const line = { stroke: INK, strokeWidth: sw, fill: "none" } as const;
  const body = { stroke: INK, strokeWidth: sw, fill: color } as const;

  switch (type) {
    case "bed": {
      const head = Math.min(10, d * 0.06);
      const pillowH = Math.min(30, d * 0.15);
      const pillows = w > 130 ? 2 : 1;
      const pw = (w - 2 * head - (pillows + 1) * 6) / pillows;
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} rx={3} {...body} />
          <rect x={-hw + 4} y={-hd + head} width={w - 8} height={d - head - 4} rx={4} fill="#f7f5f1" stroke={INK} strokeWidth={sw * 0.8} />
          {Array.from({ length: pillows }, (_, i) => (
            <rect key={i} x={-hw + head + 6 + i * (pw + 6)} y={-hd + head + 6} width={pw} height={pillowH} rx={6} fill="#ffffff" stroke={INK} strokeWidth={sw * 0.7} />
          ))}
          <rect x={-hw + 4} y={-hd + head + pillowH + 18} width={w - 8} height={d - head - pillowH - 22} rx={3} fill={color} fillOpacity={0.45} stroke={INK} strokeWidth={sw * 0.7} />
          <line x1={-hw + 4} x2={hw - 4} y1={-hd + head + pillowH + 32} y2={-hd + head + pillowH + 32} {...line} strokeWidth={sw * 0.6} />
        </g>
      );
    }
    case "wardrobe": {
      const doors = Math.max(1, Math.round(w / 50));
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} rx={1.5} {...body} />
          {Array.from({ length: doors - 1 }, (_, i) => {
            const x = -hw + ((i + 1) * w) / doors;
            return <line key={i} x1={x} x2={x} y1={-hd} y2={hd} {...line} />;
          })}
          <line x1={-hw + 4} x2={hw - 4} y1={-hd + d * 0.45} y2={-hd + d * 0.45} {...line} strokeDasharray={`${4 * px} ${3 * px}`} />
          <line x1={-hw} x2={hw} y1={hd - 3} y2={hd - 3} {...line} strokeWidth={sw * 0.7} />
        </g>
      );
    }
    case "dresser":
    case "nightstand": {
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} rx={2} {...body} />
          <rect x={-hw + 3} y={-hd + 3} width={w - 6} height={d - 6} rx={1.5} {...line} strokeWidth={sw * 0.6} />
          <line x1={-Math.min(8, w * 0.15)} x2={Math.min(8, w * 0.15)} y1={hd - 1} y2={hd - 1} stroke={INK} strokeWidth={sw * 2.2} strokeLinecap="round" />
        </g>
      );
    }
    case "bookcase": {
      const n = Math.max(1, Math.round(w / 40));
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} {...body} />
          {Array.from({ length: n - 1 }, (_, i) => {
            const x = -hw + ((i + 1) * w) / n;
            return <line key={i} x1={x} x2={x} y1={-hd} y2={hd} {...line} />;
          })}
          <rect x={-hw + 2.5} y={-hd + 2.5} width={w - 5} height={d - 5} {...line} strokeWidth={sw * 0.6} />
        </g>
      );
    }
    case "desk": {
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} rx={2} {...body} />
          <rect x={-hw * 0.35} y={-hd + d * 0.12} width={w * 0.35} height={d * 0.28} rx={1.5} fill="#2b2b2b" fillOpacity={0.75} />
          <rect x={hw * 0.25} y={-hd + d * 0.5} width={w * 0.14} height={d * 0.22} rx={1} fill="#fff" fillOpacity={0.8} stroke={INK} strokeWidth={sw * 0.5} />
        </g>
      );
    }
    case "chair": {
      return (
        <g>
          <rect x={-hw + 2} y={-hd + d * 0.18} width={w - 4} height={d * 0.8} rx={6} {...body} />
          <rect x={-hw} y={-hd} width={w} height={d * 0.2} rx={4} {...body} />
        </g>
      );
    }
    case "armchair": {
      const arm = w * 0.16;
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} rx={10} {...body} />
          <rect x={-hw + arm} y={-hd + d * 0.24} width={w - 2 * arm} height={d * 0.72} rx={6} fill="#ffffff" fillOpacity={0.35} stroke={INK} strokeWidth={sw * 0.7} />
        </g>
      );
    }
    case "rug": {
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} rx={1} fill={color} stroke={INK} strokeOpacity={0.35} strokeWidth={sw} />
          <rect x={-hw + Math.min(10, w * 0.08)} y={-hd + Math.min(10, d * 0.08)} width={w - 2 * Math.min(10, w * 0.08)} height={d - 2 * Math.min(10, d * 0.08)} fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={sw * 1.2} strokeDasharray={`${6 * px} ${4 * px}`} />
        </g>
      );
    }
    case "rug-round": {
      return (
        <g>
          <ellipse rx={hw} ry={hd} fill={color} stroke={INK} strokeOpacity={0.35} strokeWidth={sw} />
          <ellipse rx={hw * 0.85} ry={hd * 0.85} fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={sw * 1.2} strokeDasharray={`${6 * px} ${4 * px}`} />
        </g>
      );
    }
    case "floor-lamp":
    case "table-lamp": {
      const r = Math.min(hw, hd);
      return (
        <g>
          <circle r={r} fill={color} stroke={INK} strokeWidth={sw} />
          <circle r={r * 0.28} fill="#fff6d8" stroke={INK} strokeWidth={sw * 0.7} />
          <line x1={-r * 0.6} x2={r * 0.6} y1={0} y2={0} {...line} strokeWidth={sw * 0.6} />
          <line y1={-r * 0.6} y2={r * 0.6} x1={0} x2={0} {...line} strokeWidth={sw * 0.6} />
        </g>
      );
    }
    case "tv": {
      // Thin screen across the back of the footprint, pedestal in front.
      const screenD = Math.min(6, d * 0.3);
      return (
        <g>
          <rect x={-hw * 0.32} y={-hd + screenD} width={w * 0.32} height={d - screenD} rx={2} fill={color} fillOpacity={0.35} stroke={INK} strokeWidth={sw * 0.7} />
          <rect x={-hw} y={-hd} width={w} height={screenD} rx={1} fill={color} stroke={INK} strokeWidth={sw} />
          <line x1={-hw + 3} x2={hw - 3} y1={-hd + screenD} y2={-hd + screenD} stroke="#7fa7d6" strokeWidth={sw * 1.4} />
        </g>
      );
    }
    case "tv-stand": {
      const third = w / 3;
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} rx={2} {...body} />
          <line x1={-hw + third} x2={-hw + third} y1={-hd} y2={hd} {...line} />
          <line x1={hw - third} x2={hw - third} y1={-hd} y2={hd} {...line} />
          <rect x={-hw + third + 3} y={-hd + 3} width={third - 6} height={d - 6} fill="#000" fillOpacity={0.12} />
        </g>
      );
    }
    case "plant": {
      const r = Math.min(hw, hd);
      const leaves = 7;
      return (
        <g>
          <circle r={r * 0.6} fill={color} stroke={INK} strokeWidth={sw} />
          {Array.from({ length: leaves }, (_, i) => {
            const a = (i / leaves) * Math.PI * 2;
            return (
              <ellipse
                key={i}
                cx={Math.cos(a) * r * 0.5}
                cy={Math.sin(a) * r * 0.5}
                rx={r * 0.42}
                ry={r * 0.22}
                transform={`rotate(${(a * 180) / Math.PI} ${Math.cos(a) * r * 0.5} ${Math.sin(a) * r * 0.5})`}
                fill="#6f8f5e"
                stroke="#3e5634"
                strokeWidth={sw * 0.6}
              />
            );
          })}
        </g>
      );
    }
  }
}
