/* 1121：SQL 结果窗口（from+size ≤ index.max_result_window，默认 10000）超限自救。
 ES SQL 的 LIMIT/OFFSET 会被翻译成 from/size，超过窗口直接 400；控制台的 cursor
 分页没有这个上限。这里只做「把语句改到能跑」的最小改写，是否采用由用户点击决定：
 - 有 OFFSET：去掉 OFFSET（保留 LIMIT，超窗则压到 10000），改用 cursor 下一页深入；
 - 无 OFFSET 但 LIMIT > 10000：压到 10000，更多行用 cursor。
 纯函数、零依赖；字符串/注释里恰好出现 OFFSET 的极端情况由用户在编辑器里复核（改写可见）。 */
export interface SqlWindowFix {
  reason: 'offset' | 'limit';
  sql: string;
  note: string;
}

const WINDOW_MAX = 10000;

export function fixSqlResultWindow(sql: string): SqlWindowFix | null {
  const src = String(sql || '');
  if (!src.trim()) return null;
  const limitRe = /\bLIMIT\s+(\d+)/i;
  if (/\bOFFSET\s+\d+/i.test(src)) {
    let out = src.replace(/\s+OFFSET\s+\d+/gi, '');
    const m = limitRe.exec(out);
    if (m && Number(m[1]) > WINDOW_MAX) out = out.replace(limitRe, `LIMIT ${WINDOW_MAX}`);
    return {
      reason: 'offset',
      sql: out,
      note: '已去掉 OFFSET；从首行开始用「下一页」cursor 深入（SQL 结果窗口上限 10000）',
    };
  }
  const m = limitRe.exec(src);
  if (m && Number(m[1]) > WINDOW_MAX) {
    return {
      reason: 'limit',
      sql: src.replace(limitRe, `LIMIT ${WINDOW_MAX}`),
      note: '已把 LIMIT 降到窗口上限 10000；更多行请用「下一页」cursor',
    };
  }
  return null;
}
