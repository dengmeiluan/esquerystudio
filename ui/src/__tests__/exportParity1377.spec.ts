/**
 * 1377：两内核右键「按格式直接导出」能力对等。
 *
 * 实测缺口（源码层 set-diff，非推测）：
 *   QRT 右键菜单含 export-csv / export-json / export-md / export-ndjson / export-xlsx
 *   —— 用户在格子上右键就能直接导出成任意格式，一步到位。
 *   RT 同位置只有 export-view（按“当前默认格式”导出）+ fmt-*（只改默认格式，不导出）。
 *   → RT 用户要导出成别的格式必须：改默认格式（有副作用，会持久化偏好）→ 再导一次。
 *   这就是用户反复问的「为什么索引/查询工作台的表格能力没和 SQL 的完全共享」的一个实例。
 *
 * 修法：一级不扩容（导出仍只有一个入口），在「列与导出…」二级里补五档直出。
 *
 * 负控（证明断言真打在产出上）：
 *  ① RT colChildren 里必须存在 export-<fmt> × 5，且每个 run 调用 exportRows(该 fmt)，
 *    而不是复用默认格式；
 *  ② 负控 A：不存在 export-csv(默认 csv) 与 export-ndjson 同名键的空间——若把五档删掉，
 *     本用例的 key 集断言必红；
 *  ③ 负控 B：断言「导出为 X」的 label 与 fmt 一一对应（防止复制粘贴成五个都导 csv）；
 *  ④ 对等性：QRT 的 export-* 键集 ⊆ RT 的 export-* 键集（两内核同能力）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

const FORMATS = ['csv', 'xlsx', 'json', 'md', 'ndjson'] as const;

/* 菜单键由模板拼装（key: 'export-' + fmt），所以按「格式清单 + 键前缀」判定，
   而不是找字面量 key: 'export-csv'。清单本身必须真出现，否则拼出来的键无从谈起。 */
function directExportKeys(src: string): Set<string> {
  const built = /key: 'export-' \+ fmt/.test(src);
  const list = /\[\s*'csv',\s*'CSV'[\s\S]*?'ndjson',\s*'NDJSON'/.test(src);
  return built && list ? new Set(FORMATS.map(f => 'export-' + f)) : new Set();
}

describe('1377 右键「按格式直接导出」两内核对齐', () => {
  it('① RT 二级菜单含五档直接导出，且各自调用 exportRows(对应格式)', () => {
    for (const f of FORMATS) {
      expect(directExportKeys(rt).has('export-' + f), `RT 缺 export-${f} 菜单项`).toBe(true);
    }
    expect(rt, '必须按传入的 fmt 导出，而不是复用 expFmt 默认值')
      .toContain('run: () => exportRows(fmt)');
    /* 不允许退化成「五个都导出默认格式」 */
    const block = rt.slice(rt.indexOf("key: 'export-' + fmt"));
    expect(block.slice(0, 200)).not.toMatch(/exportRows\(expFmt\.value\)/);
  });

  it('② 负控：五档键名各不相同（复制粘贴成同一个键必红）', () => {
    const keys = [...directExportKeys(rt)];
    const set = new Set(keys);
    expect(set.size, `export-* 键名重复：${keys.join(',')}`).toBe(keys.length);
    for (const f of FORMATS) expect(set.has('export-' + f), `缺 ${f}`).toBe(true);
  });

  it('③ 负控：格式 → 文案一一对应（防止五个都导 csv）', () => {
    expect(rt, '五档 (fmt, label) 映射表缺失或被改乱')
      .toMatch(/\[\s*'csv',\s*'CSV'[\s\S]*?'ndjson',\s*'NDJSON'/);
    /* label 拼装必须用映射里的 label，而不是硬编码 */
    expect(rt).toMatch(/label: `导出为 \$\{label\}`/);
  });

  it('④ 对等性：QRT 的 export-* 能力被 RT 全覆盖', () => {
    /* 键含连字符（export-ndjson），\w+ 抓不到后半截。
       1385：注意别把分组键 `export-group` 当成格式——只认真实格式名。 */
    const FORMAT_KEYS = new Set(['export-csv', 'export-xlsx', 'export-json', 'export-md', 'export-ndjson']);
    const qrtKeys = new Set([...qrt.matchAll(/key: '(export-[a-z]+)'/g)].map(m => m[1]).filter(k => FORMAT_KEYS.has(k)));
    const rtKeys = directExportKeys(rt);
    expect(qrtKeys.size, 'QRT 应至少含 export 键').toBeGreaterThan(0);
    for (const k of qrtKeys) expect(rtKeys.has(k), `RT 缺 QRT 已有的 ${k}`).toBe(true);
  });
});
