/* （P1a-1）：实时走势卡「几何 + 点位」纯函数单源下沉。
 * 原 `LiveDashboardView.vue` 本地 `const LD_H/SPARK_H/CMP_W/CMP_H/PCT_GRID` + 三个点位函数
 * `sparklinePoints / sparklinePointsPct / sparkArea`（五卡 + 对比卡 + 迷你 spark 复用），
 * 抽成独立 util——为 P1a-2（`LiveChartCard` 组件单源化）与 （曲线平滑，新增 `smoothPoints`）打地基。
 * 零运行时依赖（纯函数 + 纯常量）。
 *
 * ⚠几何纪律（先例 ）：CSS 高度字面（`.ld-svg height:88px` 等）与这些常量**必须同值**，
 * 由 `chartGeometry629.spec.ts` 反锁「CSS 字面 == 常量值」——改此处必红，改前先想清影响面。 */

/** 主卡图高（622 比例规范表；64→88 系 升档：88px 才「看出走势形状」） */
export const LD_H = 88;
/** 主卡窄档渲染高（ G'1，台账 ）：≤900px 单列满宽下 88px 纵横比过扁
 * （ 重盘 G'1 候选），随档位微升至 110（<120=CMP_H 对比卡，视觉主图层级不倒挂）。
 * ⚠这是**渲染档位**而非数据坐标系：viewBox/悬浮命中仍走 LD_H（ 放大态同范式，
 * preserveAspectRatio=none 拉伸 + 悬浮层全百分比定位，任意渲染高几何自洽）；
 * CSS 窄档字面须与本常量同值，由 chartNarrowTier649.spec 反锁漂移。 */
export const LD_H_NARROW = 110;
/** 迷你 spark 图高 */
const SPARK_H = 24;
/** 对比卡几何宽/高 */
export const CMP_W = 720;
export const CMP_H = 120;
/** 百分比语义卡的参考网格档（25/50/75）——绝对值卡不画等分网格（622 诚实原则） */
export const PCT_GRID = [25, 50, 75];

/** 绝对值语义折线点串：max(...data,1) 地板缩放（零值不除零）。空数据返回空串。
 * 件1：可选 scaleMax——多折线同坐标系时传全局 max（Top 索引曲线网格/刻度
 * 底座才有意义；缺省维持各序列自身 max 归一=对比卡既有语义零破坏）。 */
export function sparklinePoints(data: number[], W: number, H: number, scaleMax?: number): string {
  if (!data.length) return '';
  const mx = scaleMax && scaleMax > 0 ? scaleMax : Math.max(...data, 1);
  const step = data.length > 1 ? W / (data.length - 1) : 0;
  return data.map((v, i) => `${(i * step).toFixed(1)},${(H - v / mx * H).toFixed(1)}`).join(' ');
}

/** 百分比语义折线点串：固定 0-100 刻度（越界钳到 [0,100]），与阈值线同坐标系。 */
export function sparklinePointsPct(data: number[], W: number, H: number): string {
  if (!data.length) return '';
  const step = data.length > 1 ? W / (data.length - 1) : 0;
  return data.map((v, i) => `${(i * step).toFixed(1)},${(H - Math.min(100, Math.max(0, v)) / 100 * H).toFixed(1)}`).join(' ');
}

/** 渐变面积点串（折线点 + 左下/右下两角闭合）——HistoryChart 渐变面积同语汇。
 * pct 卡面积基底 = 图底（0 线），abs 卡 = max 地板同折线坐标系。 */
function sparkArea(data: number[], W: number, H: number, mode: 'pct' | 'abs' = 'abs'): string {
  const line = mode === 'pct' ? sparklinePointsPct(data, W, H) : sparklinePoints(data, W, H);
  return `0,${H} ${line} ${W},${H}`;
}

/* ── （622 -D4）：Catmull-Rom 曲线平滑（t=0.5 张力，立方贝塞尔近似） ──
 * 消费面=LiveChartCard 主卡折线+渐变面积（path.ld-line / path.ld-area）；对比卡/迷你
 * spark/HistoryChart 保持 polyline（591/615 逐字锁面 + 小尺寸无收益）。投影与折线
 * 同公式同精度（toFixed(1)），控制点逐轴钳位 [0,W]×[0,H]——曲线永不出图体（稿 D4 风险兜底）。 */

export interface Pt { x: number; y: number; }

/** 折线同公式投影成点列（sparklinePoints(Pct) 的结构化版，供平滑路径消费）。
 * 可选 scaleMax 与 sparklinePoints 同款：abs 档多折线同坐标系时传全局 max
 * （各线横向可比且与 Y 刻度同源；缺省按本序列自身 max 归一，单序列消费方形态不变）；
 * pct 档固定 0-100 刻度天然共享，scaleMax 不参与换算。 */
export function sparkPts(data: number[], W: number, H: number, mode: 'pct' | 'abs', scaleMax?: number): Pt[] {
  if (!data.length) return [];
  const mx = mode === 'abs' && scaleMax != null && scaleMax > 0 ? scaleMax : Math.max(...data, 1);
  const step = data.length > 1 ? W / (data.length - 1) : 0;
  return data.map((v, i) => ({
    x: i * step,
    y: mode === 'pct'
      ? H - Math.min(100, Math.max(0, v)) / 100 * H
      : H - v / mx * H,
  }));
}

const f1 = (n: number) => n.toFixed(1);
/** 控制点钳位：曲线（含贝塞尔控制臂）恒在图体内。 */
const clampPt = (p: Pt, W: number, H: number): Pt => ({
  x: Math.min(W, Math.max(0, p.x)),
  y: Math.min(H, Math.max(0, p.y)),
});

/** Catmull-Rom → 立方贝塞尔路径：M 首点 + 每段一条 C（n-1 段）；n<1 空串、n=1 直钉。
 * 控制点 y 默认钳进本段两端锚点的 y 区间——曲线永不画出高于数据峰/低于数据谷的
 * 过冲弧（视觉极值=数据极值，悬浮圆点沿曲线必达最高/最低点）。`opts.overshoot`
 * 豁免钳位：多序列叠图（节点对比）丝滑优先——陡变段保持全张力圆弧不退化成直角，
 * 命中读数由贴线插值承担，极值语义交给图例峰值直读。 */
export function catmullRomPath(pts: Pt[], W: number, H: number, opts?: { overshoot?: boolean }): string {
  const n = pts.length;
  if (!n) return '';
  if (n === 1) return `M ${f1(pts[0].x)},${f1(pts[0].y)}`;
  let d = `M ${f1(pts[0].x)},${f1(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const pA = i > 0 ? pts[i - 1] : pts[0];
    const pB = pts[i];
    const pC = pts[i + 1];
    const pD = i + 2 <= n - 1 ? pts[i + 2] : pC;
    const c1 = clampPt({ x: pB.x + (pC.x - pA.x) / 6, y: pB.y + (pC.y - pA.y) / 6 }, W, H);
    const c2 = clampPt({ x: pC.x - (pD.x - pB.x) / 6, y: pC.y - (pD.y - pB.y) / 6 }, W, H);
    if (!opts?.overshoot) {
      const yLo = Math.min(pB.y, pC.y);
      const yHi = Math.max(pB.y, pC.y);
      c1.y = Math.min(yHi, Math.max(yLo, c1.y));
      c2.y = Math.min(yHi, Math.max(yLo, c2.y));
    }
    d += ` C ${f1(c1.x)},${f1(c1.y)} ${f1(c2.x)},${f1(c2.y)} ${f1(pC.x)},${f1(pC.y)}`;
  }
  return d;
}

/** 平滑面积路径：同曲线 + 闭到图底两角（右下→左下，sparkArea 同语汇）。 */
export function catmullRomAreaPath(pts: Pt[], W: number, H: number): string {
  const line = catmullRomPath(pts, W, H);
  if (!line) return '';
  return `${line} L ${f1(W)},${f1(H)} L 0.0,${f1(H)} Z`;
}

/** 序列滑动平均（窗口 win，尾部不足取可得样本）——绘制前降噪。
 *  5s 采样的 GC 锯齿在多节点叠图里呈毛刺感，50s 窗（win=10）滑动平均把悬崖磨成
 *  圆缓的波峰波谷，观感与分钟级历史卡一致；曲线仍准实时推进（滞后≤一个窗口）。 */
export function movingAverage(data: number[], win = 10): number[] {
  return data.map((_, i) => {
    const s = Math.max(0, i - win + 1);
    let sum = 0;
    for (let j = s; j <= i; j++) {
      sum += data[j];
    }
    return sum / (i - s + 1);
  });
}
