/* SQL 执行选项摘要（纯函数）——历史行/结果区可读地说明「这组结果是在什么上下文里跑出来的」。
   只展示与默认值不同的项，避免每行都写 fetch 200 / UTC 造成噪音。
   默认值必须与 SqlConsoleView 的 usePref 初值一致：fetchSize 200、无时区、无页超时、
   列式关、宽容开。 */
export const SQL_OPT_DEFAULTS = { fetchSize: 200, timeZone: '', pageTimeout: '', columnar: false, lenient: true } as const;

export function describeSqlOpts(opts?: Record<string, unknown> | null): string {
  if (!opts || typeof opts !== 'object') return '';
  const out: string[] = [];
  if (typeof opts.timeZone === 'string' && opts.timeZone) out.push(opts.timeZone);
  const fs = Number(opts.fetchSize);
  if (Number.isFinite(fs) && fs > 0 && fs !== SQL_OPT_DEFAULTS.fetchSize) out.push('fetch ' + fs);
  if (typeof opts.pageTimeout === 'string' && opts.pageTimeout) out.push('timeout ' + opts.pageTimeout);
  if (opts.columnar === true) out.push('列式');
  if (opts.lenient === false) out.push('非宽容');
  return out.join(' · ');
}
