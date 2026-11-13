/* 1012：geo 坐标形态判定纯函数（GeoValueEditor 消费的直通投影——AST 零改动，
   值/params 仍在 leaf 直通往返；与 intervalsRule 同语言）。
   ES 官方形态面：geo_distance 值 = {lat,lon}（串/geohash/数组 [lon,lat] 均合法但
   不进编辑位——保真优先，退化通用键值表）；geo_bounding_box 值两形态：
   corners（top_left/bottom_right 各 {lat,lon}）与 edges 平铺四数值（top/right/bottom/left）。
   编辑位判定从宽入窄：空对象归 corners（新骨架常用向）；混合键/非数值/串值一律 null 退化。 */

export interface GeoPointView { lat?: number; lon?: number }
export interface BboxCornersView { tl: GeoPointView; br: GeoPointView }
export interface BboxEdgesView { top?: number; right?: number; bottom?: number; left?: number }

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const numOrUndef = (v: unknown): number | undefined => typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** 子对象逐键剥数值：键 ⊆ {lat,lon} 且出现的值全为有限数值 → 视图（半成品允许键缺席）；
    出现非数值 lat/lon 值（串/geohash/空串中间态）→ null（整值退化，不猜语义——
    编辑位写回空串=删键，正常流程不会产出非数值键） */
export function geoPointView(v: unknown): GeoPointView | null {
  if (!isObj(v)) return null;
  const out: GeoPointView = {};
  for (const [k, val] of Object.entries(v)) {
    if (k !== 'lat' && k !== 'lon') return null;
    const n = numOrUndef(val);
    if (n === undefined) return null;
    out[k] = n;
  }
  return out;
}

/** bbox 值形态分派：corners（含空对象骨架）| edges（≥1 个边键且纯数值）| null（混合/串值/非对象） */
export function bboxView(v: unknown): { mode: 'corners'; corners: BboxCornersView } | { mode: 'edges'; edges: BboxEdgesView } | null {
  if (!isObj(v)) return null;
  const keys = Object.keys(v);
  const hasCorner = keys.includes('top_left') || keys.includes('bottom_right');
  const hasEdge = keys.some(k => k === 'top' || k === 'right' || k === 'bottom' || k === 'left');
  if (hasCorner && hasEdge) return null;   // 混合形态不猜，整体退化
  if (hasEdge) {
    const out: BboxEdgesView = {};
    for (const k of keys) {
      const n = numOrUndef(v[k]);
      if (n === undefined) return null;
      out[k as keyof BboxEdgesView] = n;
    }
    return { mode: 'edges', edges: out };
  }
  /* corners（含空对象）：角值缺席=半成品可编辑；出现即须是可编辑 geo_point 视图 */
  const tl = 'top_left' in v ? geoPointView(v.top_left) : {};
  const br = 'bottom_right' in v ? geoPointView(v.bottom_right) : {};
  if (tl === null || br === null) return null;
  return { mode: 'corners', corners: { tl, br } };
}

/** lat/lon 数值合法域（编辑位轻警示用，不拦截输入） */
export function latOutOfRange(n: number): boolean { return n < -90 || n > 90; }
export function lonOutOfRange(n: number): boolean { return n < -180 || n > 180; }
