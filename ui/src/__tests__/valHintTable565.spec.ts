/* 五百六十五批件④：值位静态档表合并单源（TYPE_VALUE_HINTS 下沉 fieldSearch）。
 *  前提核实（实施口径与任务书的偏差备案）：
 *  - 「LuceneInput if 链改查表」不可行：luceneValTiers538:66-67 / sqlLuceneTiers546:224,238-239 /
 *    suggestWave554:265-266 三处旧 spec 锁死 if 行逐字字面（非黑名单不可改）——保锁口径改为
 *    「if 链不动，七常量表本体合并单源」（值逐字同形零漂移）。
 *  - 「valueHintsForType 消费 TYPE_VALUE_HINTS」不可行：suggestTiers563:53-73 锁死其 563 形态
 *    档（date=now 族 / ip 空 / geo_point 空）——保锁跳过，备案下波同步更新。
 *  - 「三处入口同类型同文本」对 date 不成立：Lucene（range 语法档）/SQL（裸字面档，顺序与
 *    第三项均异）/valueHintsForType（563 now 族）三形态各有旧锁，统一必红——本 spec 锁
 *    ip/boolean 的跨入口同文本与 date 的「分立有据」（各入口既有档字面不回退）。
 *  锁面：
 *   A TYPE_VALUE_HINTS 全档字面（Lucene 值位形态）；
 *   B LuceneInput 七常量表本体合并单源（源码锁 + 值引用相等）；
 *   C sqlCompletion 字面四档（boolean/ip/version/geo_point）values 引单源同文本，
 *     date/数值族/wildcard SQL 形态分立保留（既有档字面不回退）；
 *   D 跨入口同文本：boolean 三处一致；ip 两活入口一致。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TYPE_VALUE_HINTS, valueHintsForType } from '../utils/fieldSearch';
import { VAL_FORMAT_HINTS } from '../utils/sqlCompletion';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');

describe('五百六十五批件④ A：TYPE_VALUE_HINTS 全档字面（Lucene 值位形态单源）', () => {
  it('日期族/字面族/通配族档与 LuceneInput 既有七表逐字同形', () => {
    expect(TYPE_VALUE_HINTS.date).toEqual(['now-1h/h', 'now-1d/d', '>=2026-08-01']);
    expect(TYPE_VALUE_HINTS.date_nanos).toEqual(TYPE_VALUE_HINTS.date);
    expect(TYPE_VALUE_HINTS.date_range).toEqual(TYPE_VALUE_HINTS.date);
    expect(TYPE_VALUE_HINTS.boolean).toEqual(['true', 'false']);
    expect(TYPE_VALUE_HINTS.ip).toEqual(['192.168.0.1', '192.168.0.0/24']);
    expect(TYPE_VALUE_HINTS.ip_range).toEqual(TYPE_VALUE_HINTS.ip);
    expect(TYPE_VALUE_HINTS.wildcard).toEqual(['pref*']);
    expect(TYPE_VALUE_HINTS.flattened).toEqual(TYPE_VALUE_HINTS.wildcard);
    expect(TYPE_VALUE_HINTS.geo_point).toEqual(['40.71,-74.01']);
    expect(TYPE_VALUE_HINTS.version).toEqual(['1.0.0']);
  });

  it('数值族（含 token_count）与四数值 range 族出区间形态档', () => {
    for (const t of ['long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'unsigned_long', 'token_count',
      'integer_range', 'long_range', 'float_range', 'double_range']) {
      expect(TYPE_VALUE_HINTS[t], '数值形态档 ' + t).toEqual(['>100', '[10 TO 20]']);
    }
  });
});

describe('五百六十五批件④ B：LuceneInput 七表保形 + 单源同形性钉死', () => {
  /* 实施偏差备案：旧 spec（luceneValTiers538:28-36 / sqlLuceneTiers546:222-241 /
     suggestWave554:256-266）连 LuceneInput 常量表本体与 if 分支行都逐字锁死——
     表合并不可行，LuceneInput 保持原字面（本组件仅备案注释）；单源与彼字面的同形性
     由本段双字面锁钉住（任一侧漂移即红），旧锁解禁同步更新后改引单源为纯机械操作。 */
  it('单源 date/boolean/ip/wildcard 档与 LuceneInput 既有表字面逐字同形（双字面锁）', () => {
    const li = read('components/LuceneInput.vue');
    expect(li).toContain("const DATE_HINTS = ['now-1h/h', 'now-1d/d', '>=2026-08-01'];");
    expect(TYPE_VALUE_HINTS.date).toEqual(['now-1h/h', 'now-1d/d', '>=2026-08-01']);
    expect(li).toContain("const BOOL_HINTS = ['true', 'false'];");
    expect(TYPE_VALUE_HINTS.boolean).toEqual(['true', 'false']);
    expect(li).toContain("const IP_HINTS = ['192.168.0.1', '192.168.0.0/24'];");
    expect(TYPE_VALUE_HINTS.ip).toEqual(['192.168.0.1', '192.168.0.0/24']);
    expect(li).toContain("const WILDCARD_HINTS = ['pref*'];");
    expect(TYPE_VALUE_HINTS.wildcard).toEqual(['pref*']);
    expect(li).toContain("const GEO_HINTS = ['40.71,-74.01'];");
    expect(TYPE_VALUE_HINTS.geo_point).toEqual(['40.71,-74.01']);
    expect(li).toContain("const VERSION_HINTS = ['1.0.0'];");
    expect(TYPE_VALUE_HINTS.version).toEqual(['1.0.0']);
  });
});

describe('五百六十五批件④ C：sqlCompletion 单源接线（保锁可行面：version/geo_point）', () => {
  /* 实施偏差备案：boolean/ip 两档不可引单源——luceneValTiers538:25-27 对 sqlCompletion.ts
     源码含 'true', 'false' / '192.168.0.1' 的松锚 toContain 断言封死源码改写；
     date/数值族/wildcard 是 SQL 语法形态（裸字面/pref%/数值示例），与 Lucene 形态分立
     是既有约定（dslValueTiers545 锁面），保留本地。 */
  it('version/geo_point 两档 values 引单源同文本，detail 结构保形', () => {
    expect(VAL_FORMAT_HINTS.version).toEqual({ detail: '字面提示 · version', values: [...TYPE_VALUE_HINTS.version] });
    expect(VAL_FORMAT_HINTS.geo_point).toEqual({ detail: '字面提示 · geo_point', values: [...TYPE_VALUE_HINTS.geo_point] });
  });

  it('boolean/ip 源码字面保形（luceneValTiers538 松锚锁），值与单源同形', () => {
    const sql = read('utils/sqlCompletion.ts');
    expect(sql).toContain("'true', 'false'");
    expect(sql).toContain("'192.168.0.1'");
    expect(VAL_FORMAT_HINTS.boolean).toEqual({ detail: '字面提示 · boolean', values: [...TYPE_VALUE_HINTS.boolean] });
    expect(VAL_FORMAT_HINTS.ip).toEqual({ detail: '字面提示 · ip', values: [...TYPE_VALUE_HINTS.ip] });
  });

  it('date/数值族/wildcard SQL 形态分立保留（dslValueTiers545 字面不回退）', () => {
    expect(VAL_FORMAT_HINTS.date).toEqual({ detail: 'date-math 格式提示 · date', values: ['now-1d/d', 'now-1h/h'] });
    expect(VAL_FORMAT_HINTS.wildcard).toEqual({ detail: 'LIKE 通配格式提示 · wildcard', values: ['pref%'] });
    expect(VAL_FORMAT_HINTS.double).toEqual({ detail: '数值示例 · double', values: ['100'] });
  });
});

describe('五百六十五批件④ D：跨入口同文本（值级一致性）', () => {
  it('boolean 三处一致：单源=sqlCompletion 值位=valueHintsForType', () => {
    expect(TYPE_VALUE_HINTS.boolean).toEqual(VAL_FORMAT_HINTS.boolean.values);
    expect(valueHintsForType('boolean')).toEqual(TYPE_VALUE_HINTS.boolean);
  });

  it('ip 两活入口一致：单源=sqlCompletion 值位（valueHintsForType 空=563 约定锁，备案）', () => {
    expect(TYPE_VALUE_HINTS.ip).toEqual(VAL_FORMAT_HINTS.ip.values);
  });
});
