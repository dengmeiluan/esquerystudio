import { describe, it, expect } from 'vitest';
import { fmtNum, fmtNumCompact, fmtSize, fmtDur, fmtWindow, statusColor, trunc, relTime, dayLabel, fmtTime, fmtTimeTz, stdTimeToEpochMs } from '../format';

/* R57：格式化纯函数抽测——60 个视图共用的显示层地基，边界值锁死。 */

describe('fmtNum', () => {
  it('千分位', () => expect(fmtNum(1234567)).toBe('1,234,567'));
  it('null → -', () => expect(fmtNum(null)).toBe('-'));
  it('非数值原样', () => expect(fmtNum('abc')).toBe('abc'));
});

describe('fmtNumCompact', () => {
  /* R66：KPI 卡在 866px iframe 内的防截断主力，量级边界必须锁死 */
  it('亿级', () => expect(fmtNumCompact(336466995)).toBe('3.36亿'));
  it('万级', () => expect(fmtNumCompact(33646)).toBe('3.4万'));
  it('万亿级', () => expect(fmtNumCompact(1.5e12)).toBe('1.50万亿'));
  it('万以下走千分位', () => expect(fmtNumCompact(9999)).toBe('9,999'));
  it('负值保号', () => expect(fmtNumCompact(-336466995)).toBe('-3.36亿'));
  it('null → -', () => expect(fmtNumCompact(null)).toBe('-'));
});

describe('fmtSize', () => {
  it('字节数换算', () => expect(fmtSize(1536)).toBe('1.5kb'));
  it('已带单位原样', () => expect(fmtSize('2.3gb')).toBe('2.3gb'));
  it('空 → -', () => expect(fmtSize('')).toBe('-'));
});

describe('fmtDur', () => {
  it('毫秒', () => expect(fmtDur(500)).toBe('500ms'));
  it('秒', () => expect(fmtDur(1500)).toBe('1.5s'));
  it('分秒', () => expect(fmtDur(65000)).toBe('1m5s'));
  it('时分', () => expect(fmtDur(3660000)).toBe('1h1m'));
  it('负值 → -', () => expect(fmtDur(-1)).toBe('-'));
  // R: LiveDashboard 曾有局部 fmtDur 把 900ms 截断成 '0s'，实时大屏上看着像「没耗时」。
  // 局部实现已删除统一走本函数，这里钉住亚秒不得退化为 0s。
  it('亚秒不塌成 0s', () => {
    expect(fmtDur(900)).toBe('900ms');
    expect(fmtDur(900)).not.toBe('0s');
  });
  // 999/1000 交界：ms 段与 s 段必须严丝合缝，不漏值不重叠
  it('ms/s 分段边界', () => {
    expect(fmtDur(999)).toBe('999ms');
    expect(fmtDur(1000)).toBe('1.0s');
  });
});

describe('fmtWindow', () => {
  /* LiveDashboardView 图表标题「近 X」的窗口档位标签。
   * 与 fmtDur 是**不同语义**：窗口尺寸标签不带冗余次级单位。
   * 历史：曾误用 fmtDur 渲染，产出「近 1m0s」「近 5m0s」「近 1h0m」。
   * 取值来源 liveMonitor.windowMs = 首末采样时刻差，任意值（非固定档），
   * 实际范围 5s（2 点 @5s）～ 15min（MAX_POINTS=60 @15s 背景档），拉长间隔可到小时级。 */
  it('整分钟不带零秒尾巴', () => {
    expect(fmtWindow(60000)).toBe('1 分钟');
    expect(fmtWindow(300000)).toBe('5 分钟');
    expect(fmtWindow(900000)).toBe('15 分钟');
  });
  // 回归钉子：这三个值经 fmtDur 会退化成 1m0s / 5m0s / 15m0s
  it('不退化为 fmtDur 形态', () => {
    expect(fmtWindow(60000)).not.toBe('1m0s');
    expect(fmtWindow(300000)).not.toBe('5m0s');
    expect(fmtWindow(3600000)).not.toBe('1h0m');
  });
  it('亚分钟走秒档', () => {
    expect(fmtWindow(5000)).toBe('5 秒');
    expect(fmtWindow(45000)).toBe('45 秒');
  });
  // 分钟档四舍五入：90s 不该显示成「1 分钟 30 秒」，窗口标签只要一个量级
  it('分钟档取整到单一量级', () => {
    expect(fmtWindow(90000)).toBe('2 分钟');
    expect(fmtWindow(100000)).toBe('2 分钟');
  });
  it('小时档有余数才带分钟', () => {
    expect(fmtWindow(3600000)).toBe('1 小时');
    expect(fmtWindow(5400000)).toBe('1 小时 30 分钟');
  });
  // 60s 边界：秒档与分钟档严丝合缝
  it('秒/分钟分段边界', () => {
    expect(fmtWindow(59000)).toBe('59 秒');
    expect(fmtWindow(60000)).toBe('1 分钟');
  });
  /* 空串而非 '-'：windowMs=0 表示还没攒够两个采样点，
   * 模板 v-if="windowLabel" 靠空串整体不渲染这个标注（给 '-' 会画出「近 -」）。 */
  it('无数据 → 空串（模板据此不渲染）', () => {
    expect(fmtWindow(0)).toBe('');
    expect(fmtWindow(-1)).toBe('');
    expect(fmtWindow(NaN)).toBe('');
    expect(fmtWindow(null)).toBe('');
  });
});

describe('statusColor', () => {
  it('DONE → g', () => expect(statusColor('DONE')).toBe('g'));
  it('failed 大小写不敏感 → r', () => expect(statusColor('failed')).toBe('r'));
  it('RUNNING → y', () => expect(statusColor('RUNNING')).toBe('y'));
  it('未知 → n', () => expect(statusColor('WHATEVER')).toBe('n'));
});

describe('trunc', () => {
  it('超长截断加省略号', () => expect(trunc('x'.repeat(100), 10)).toBe('x'.repeat(10) + '…'));
  it('对象转 JSON', () => expect(trunc({ a: 1 })).toBe('{"a":1}'));
  it('null → 空串', () => expect(trunc(null)).toBe(''));
});

/* R86：相对时间契约——now 参数化是全站心跳自更新的地基；
   超 7 天相对值失去意义直接给日期（跨年带年份），时间线不再靠「400d 前」心算 */
describe('relTime（R86）', () => {
  const NOW = Date.parse('2026-07-29T12:00:00');
  it('秒/分/时/天档位', () => {
    expect(relTime(NOW - 5000, NOW)).toBe('5s 前');
    expect(relTime(NOW - 3 * 60000, NOW)).toBe('3m 前');
    expect(relTime(NOW - 5 * 3600000, NOW)).toBe('5h 前');
    expect(relTime(NOW - 2 * 86400000, NOW)).toBe('2d 前');
  });
  it('超 7 天同年给 MM-DD，跨年带年份', () => {
    expect(relTime(Date.parse('2026-07-01T08:00:00'), NOW)).toBe('07-01');
    expect(relTime(Date.parse('2025-12-31T08:00:00'), NOW)).toBe('2025-12-31');
  });
  it('未来时间回落「刚刚」，非法值 → -', () => {
    expect(relTime(NOW + 60000, NOW)).toBe('刚刚');
    expect(relTime('oops', NOW)).toBe('-');
  });
});

describe('dayLabel 日期分组（R86）', () => {
  const NOW = Date.parse('2026-07-29T12:00:00');
  it('今天/昨天语义化，同年 MM-DD，跨年全日期', () => {
    expect(dayLabel(Date.parse('2026-07-29T00:30:00'), NOW)).toBe('今天');
    expect(dayLabel(Date.parse('2026-07-28T23:59:00'), NOW)).toBe('昨天');
    expect(dayLabel(Date.parse('2026-07-01T08:00:00'), NOW)).toBe('07-01');
    expect(dayLabel(Date.parse('2025-12-31T08:00:00'), NOW)).toBe('2025-12-31');
  });
  it('非法值 → -', () => expect(dayLabel(NaN, NOW)).toBe('-'));
});

describe('fmtTime / fmtTimeTz 钉死 Asia/Shanghai', () => {
  /* 1785811977130 = 2026-08-04T02:52:57Z = 上海 10:52:57 */
  const TS = 1785811977130;

  it('绝对时间按上海时区', () => expect(fmtTime(TS)).toBe('2026-08-04 10:52:57'));
  it('带时区后缀', () => expect(fmtTimeTz(TS)).toBe('2026-08-04 10:52:57 (UTC+8)'));

  /* 反向对照：没有这条，「钉死上海」在恰好位于 +08:00 的机器上永远绿——那个绿毫无意义。
     直接构造一个 UTC formatter 比对，证明结果确实随 timeZone 变化。 */
  it('与 UTC 渲染结果不同（证明 timeZone 真生效）', () => {
    const utc = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date(TS));
    expect(fmtTime(TS)).not.toBe(utc);
    expect(utc).toBe('2026-08-04 02:52:57');
  });

  it('null → -', () => expect(fmtTime(null)).toBe('-'));
  it('不可解析原样返回', () => expect(fmtTime('bad')).toBe('bad'));
  it('fmtTimeTz 对 null 也是 -', () => expect(fmtTimeTz(null)).toBe('-'));
});

describe('stdTimeToEpochMs', () => {
  /* ⏰ 条件值转换按钮的地基：时间戳整型存储字段用标准时间匹配 */
  it('10 位秒级时间戳 → 毫秒', () => expect(stdTimeToEpochMs('1785811977')).toBe(1785811977130 - 130));
  it('13 位毫秒直通', () => expect(stdTimeToEpochMs('1785811977130')).toBe(1785811977130));
  it('YYYY-MM-DD HH:mm:ss 本地时区解析', () => {
    const d = new Date(2026, 8, 3, 12, 0, 0);
    expect(stdTimeToEpochMs('2026-09-03 12:00:00')).toBe(d.getTime());
  });
  it('斜杠日期与无秒形态兼容', () => {
    const d = new Date(2026, 8, 3, 12, 0);
    expect(stdTimeToEpochMs('2026/09/03 12:00')).toBe(d.getTime());
    expect(stdTimeToEpochMs('2026-09-03')).toBe(new Date(2026, 8, 3).getTime());
  });
  it('空串/垃圾 → null', () => {
    expect(stdTimeToEpochMs('')).toBeNull();
    expect(stdTimeToEpochMs('  ')).toBeNull();
    expect(stdTimeToEpochMs('not-a-time')).toBeNull();
  });
});
