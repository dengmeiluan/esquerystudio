import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportRequests, parseRequests, requestTitle, nextRequestLine, prevRequestLine } from '../utils/devtoolsFileIO';

/* DevTools 请求文件导出/导入（对标 Kibana Console「Export / Import requests」）。
   核心是**往返一致**：导出 → 导入必须还原出同样的请求，且注释与载荷不能丢；
   认不出的段必须报告而不是猜成一个请求。 */

describe('exportRequests 导出', () => {
  it('单请求：方法行 + 请求体', () => {
    expect(exportRequests([{ method: 'GET', path: '/_cluster/health' }]))
      .toBe('GET /_cluster/health\n');
  });

  it('多请求以空行分隔', () => {
    const out = exportRequests([
      { method: 'GET', path: '/_cat/indices' },
      { method: 'POST', path: '/orders/_search', body: '{"query":{"match_all":{}}}' },
    ]);
    expect(out).toBe('GET /_cat/indices\n\nPOST /orders/_search\n{"query":{"match_all":{}}}\n');
  });

  it('小写方法归一化、空路径回落 /', () => {
    expect(exportRequests([{ method: 'post', path: '  ' }])).toBe('POST /\n');
  });

  it('请求体尾部空白被裁掉（不留悬空空行）', () => {
    expect(exportRequests([{ method: 'PUT', path: '/a', body: '{"x":1}\n\n' }]))
      .toBe('PUT /a\n{"x":1}\n');
  });

  it('空 tab 列表产出空内容（不产出半行）', () => {
    expect(exportRequests([])).toBe('\n');
  });
});

describe('parseRequests 导入', () => {
  it('解析单请求', () => {
    const r = parseRequests('GET /_cluster/health\n');
    expect(r.requests).toEqual([{ method: 'GET', path: '/_cluster/health', body: '', comment: undefined }]);
    expect(r.skipped).toEqual([]);
  });

  it('解析多请求与请求体', () => {
    const r = parseRequests('GET /_cat/indices\n\nPOST /orders/_search\n{"query":{"match_all":{}}}\n');
    expect(r.requests).toHaveLength(2);
    expect(r.requests[1]).toMatchObject({ method: 'POST', path: '/orders/_search', body: '{"query":{"match_all":{}}}' });
  });

  it('保留段首注释并作为标题来源', () => {
    const r = parseRequests('// 看看集群健康\nGET /_cluster/health\n');
    expect(r.requests[0].comment).toContain('看看集群健康');
    expect(requestTitle(r.requests[0])).toBe('看看集群健康');
  });

  it('# 注释同样识别', () => {
    const r = parseRequests('# 注释\nGET /a\n');
    expect(r.requests[0].comment).toContain('注释');
  });

  it('请求体内的 // 行不被当作段首注释（只认段首连续注释）', () => {
    const r = parseRequests('POST /a\n{"x":1}\n// 这里在体内\nGET /b\n');
    expect(r.requests[0].body).toContain('// 这里在体内');
    expect(r.requests[0].body).toContain('GET /b');
  });

  it('非请求首行记入 skipped，不猜成请求', () => {
    const r = parseRequests('随便一段文字\n不是请求\n');
    expect(r.requests).toEqual([]);
    expect(r.skipped.length).toBe(1);
  });

  it('未知方法名记入 skipped', () => {
    const r = parseRequests('FOO /bar\n');
    expect(r.requests).toEqual([]);
    expect(r.skipped[0]).toContain('FOO');
  });

  it('纯注释块不产生请求也不报错', () => {
    const r = parseRequests('// 只有注释\n\n');
    expect(r.requests).toEqual([]);
    expect(r.skipped).toEqual([]);
  });

  it('空文件安全返回', () => {
    expect(parseRequests('   \n\n')).toEqual({ requests: [], skipped: [] });
  });

  it('CRLF 文件与 LF 等价', () => {
    const r = parseRequests('GET /a\r\n\r\nGET /b\r\n');
    expect(r.requests.map(x => x.path)).toEqual(['/a', '/b']);
  });
});

describe('往返一致（导出 → 导入）', () => {
  const src = [
    { method: 'GET', path: '/_cat/indices' },
    { method: 'POST', path: '/orders/_search', body: '{"query":{"match_all":{}},"size":3}' },
    { method: 'DELETE', path: '/tmp_idx' },
  ];

  it('方法/路径/请求体逐字还原', () => {
    const back = parseRequests(exportRequests(src));
    expect(back.skipped).toEqual([]);
    expect(back.requests.map(r => ({ method: r.method, path: r.path, body: r.body })))
      .toEqual(src.map(s => ({ method: s.method, path: s.path, body: s.body || '' })));
  });

  it('再导出一次文本完全一致（幂等）', () => {
    const once = exportRequests(src);
    const twice = exportRequests(parseRequests(once).requests);
    expect(twice).toBe(once);
  });

  it('带注释的文件往返后注释保留在标题里', () => {
    const text = '// 集群健康\nGET /_cluster/health\n\n// 查订单\nPOST /orders/_search\n{}\n';
    const back = parseRequests(text);
    expect(back.requests.map(requestTitle)).toEqual(['集群健康', '查订单']);
  });
});

describe('requestTitle 标题', () => {
  it('无注释时用 METHOD + 路径', () => {
    expect(requestTitle({ method: 'GET', path: '/a/_search', body: '' })).toBe('GET /a/_search');
  });
  it('超长路径截断', () => {
    const t = requestTitle({ method: 'GET', path: '/' + 'x'.repeat(40), body: '' });
    expect(t.length).toBeLessThanOrEqual(30);
    expect(t).toContain('…');
  });
});

/* ═══ DevTools 接线：导出/导入按钮与实现（1128） ═══ */
describe('DevTools 导出/导入接线（1128）', () => {
  const view = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

  it('工具栏有导出与导入，且导入走隐藏 file input', () => {
    expect(view).toContain('@click="exportToFile"');
    expect(view).toContain('@click="importFileEl?.click()"');
    expect(view).toContain('ref="importFileEl" type="file"');
    expect(view).toContain('@change="importFromFile"');
  });

  it('导出内容来自全部 Tab（方法/路径/请求体）', () => {
    const at = view.indexOf('function exportToFile()');
    expect(at).toBeGreaterThan(-1);
    const seg = view.slice(at, at + 700);
    expect(seg).toContain('exportRequests(tabs.value.map');
    expect(seg).toContain('method: t.method');
    expect(seg).toContain('path: t.path');
    expect(seg).toContain('body: t.body');
  });

  it('导入先确认再整份替换（不静默覆盖用户现有 Tab）', () => {
    const at = view.indexOf('async function importFromFile(');
    expect(at).toBeGreaterThan(-1);
    const seg = view.slice(at, at + 1600);
    expect(seg).toContain('await askConfirm(');
    expect(seg).toContain('替换导入');
    /* 必须放在 tabs 赋值之前 */
    expect(seg.indexOf('askConfirm(')).toBeLessThan(seg.indexOf('tabs.value = requests.map'));
  });

  it('导入不识别的内容要报告（不静默丢弃）', () => {
    const at = view.indexOf('async function importFromFile(');
    const seg = view.slice(at, at + 1600);
    expect(seg).toContain('skipped.length');
    expect(seg).toMatch(/忽略|无法识别/);
  });

  it('导入的 Tab 使用文件里的标题提示', () => {
    const at = view.indexOf('async function importFromFile(');
    const seg = view.slice(at, at + 1600);
    expect(seg).toContain('requestTitle(r)');
  });
});

/* 1132：Kibana 的 Ctrl+↑/↓ = previous/next request end。
   我们在 DevTools 里每个 Tab 就是一条请求，编辑器是单请求体，
   所以对齐的是「请求边界」概念：给定光标所在行，找上/下一条请求的起始行。 */
describe('1132 请求边界跳转', () => {
  const text = [
    'GET /_cat/health',          // 1
    '',                           // 2
    'POST /orders/_search',       // 3
    '{',                          // 4
    '  "query": {"match_all": {}}', // 5
    '}',                          // 6
    '',                           // 7
    '// 删除测试索引',              // 8
    'DELETE /tmp-index',          // 9
  ].join('\n');

  it('从中间往后找不到下一条请求起点', () => {
    expect(nextRequestLine(text, 4)).toBe(9);
  });

  it('从末尾往前找上一条请求起点', () => {
    expect(prevRequestLine(text, 9)).toBe(3);
  });

  it('注释行不算独立请求（跳过纯注释块）', () => {
    expect(prevRequestLine(text, 9)).toBe(3);
    expect(nextRequestLine(text, 3)).toBe(9);
  });

  it('已在最后一条时返回 -1（调用方不再移动光标）', () => {
    expect(nextRequestLine(text, 9)).toBe(-1);
  });

  it('已在第一条时返回 -1', () => {
    expect(prevRequestLine(text, 1)).toBe(-1);
  });

  it('空编辑内容返回 -1', () => {
    expect(nextRequestLine('', 1)).toBe(-1);
    expect(prevRequestLine('', 1)).toBe(-1);
  });
});
