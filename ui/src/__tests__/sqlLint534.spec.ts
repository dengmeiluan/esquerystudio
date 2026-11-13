/**
 * 五百三十四批 P0-3：SQL 静态 lint 契约看守（utils/sqlLint.ts 纯函数 + SqlConsoleView /
 * SqlBridgeView 双通道接线）。
 *
 * 三段：
 *  A 五规则穷举行为（引号未闭合 / 括号不平衡 / FROM 缺表名 / 保留字拼写编辑距离 ≤2 /
 *    行尾悬空 AND/OR）——输出 { line, message, suggestion } 行号形态；
 *  B 合法语句零误报（SqlConsole 六模板 + SqlBridge 示例 + 大小写/转义/子查询形态）；
 *  C 两页接线源锚：setLineMarkers(owner='es-sql-lint') + 页内 banner 双通道在場，
 *    useDebounceFn 250ms 防抖统一件；SqlConsole .sq-grid 高度链确定解不被触碰。
 *
 * 行为断言直接 import 纯函数驱动（零 Monaco 依赖是本件第一契约）；接线断言落源文本
 * （assistLintWave533 同理由：happy-dom 不参与 Monaco 划线计算，接线形态契约源文本最稳）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintSql } from '../utils/sqlLint';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');
const consoleView = read('views/SqlConsoleView.vue');
const bridgeView = read('views/SqlBridgeView.vue');

describe('A sqlLint 五规则穷举', () => {
  it('纯函数零依赖出口：{line,message,suggestion} 行号形态，空输入零误报', () => {
    expect(lintSql('')).toEqual([]);
    expect(lintSql('   \n  ')).toEqual([]);
    for (const f of lintSql('SELCT * FROM t')) {
      expect(Number.isInteger(f.line)).toBe(true);
      expect(f.line).toBeGreaterThanOrEqual(1);
      expect(typeof f.message).toBe('string');
      expect(typeof f.suggestion).toBe('string');
    }
  });

  it('① 引号未闭合：报开引号所在行，且只报此一条（其余规则整体跳过防噪音）', () => {
    const r1 = lintSql("SELECT * FROM \"my-index WHERE x = 1");
    expect(r1.length).toBe(1);
    expect(r1[0]!.line).toBe(1);
    expect(r1[0]!.message).toContain('引号未闭合');
    const r2 = lintSql("SELECT a\nFROM 'b");
    expect(r2.length).toBe(1);
    expect(r2[0]!.line).toBe(2);
    /* 双写转义是合法形态：不报 */
    expect(lintSql("SELECT * FROM t WHERE a = 'it''s ok'")).toEqual([]);
  });

  it('② 括号不平衡：配对错乱报错位行；未闭合报首个未开括号行', () => {
    const mix = lintSql('SELECT * FROM t WHERE (a ] = 1');
    expect(mix.some(f => f.message.includes('配对错乱'))).toBe(true);
    const open = lintSql('SELECT\nCOUNT(*) FROM t WHERE (a = 1');
    const openHit = open.find(f => f.message.includes('未闭合'));
    expect(openHit, '( 未闭合被点名').toBeTruthy();
    expect(openHit!.message).toContain('(');
    expect(lintSql('SELECT COUNT(*) FROM t WHERE (a = 1 OR b = 2)')).toEqual([]);
  });

  it('③ FROM 缺表名：EOF/保留字/标点跟随均报；引号壳与 ( 子查询豁免', () => {
    expect(lintSql('SELECT * FROM').map(f => f.message)).toEqual(expect.arrayContaining([expect.stringContaining('FROM 缺少表名')]));
    expect(lintSql('SELECT * FROM WHERE x = 1').some(f => f.message.includes('FROM 缺少表名'))).toBe(true);
    expect(lintSql('SELECT * FROM "my-index"')).toEqual([]);
    expect(lintSql('SELECT * FROM (SELECT 1)')).toEqual([]);
  });

  it('④ 保留字拼写：SELCT/FORM/WHREE/GROP/ORDR 各形态点名 + 行号正确 + 列名同形词豁免', () => {
    const s1 = lintSql('SELCT * FROM t');
    expect(s1.some(f => f.message.includes('SELCT') && f.message.includes('最接近：SELECT'))).toBe(true);

    const s2 = lintSql('SELECT a, b\nFORM t WHERE x = 1');
    const form = s2.find(f => f.message.includes('FORM'));
    expect(form, 'FORM 拼写被点名').toBeTruthy();
    expect(form!.line).toBe(2);
    expect(form!.message).toContain('最接近：FROM');

    expect(lintSql('SELECT a FROM t WHREE x = 1').some(f => f.message.includes('WHREE'))).toBe(true);
    expect(lintSql('SELECT a FROM t GROP BY x').some(f => f.message.includes('GROP'))).toBe(true);
    expect(lintSql('SELECT a FROM t ORDR BY x').some(f => f.message.includes('ORDR'))).toBe(true);

    /* 列名同形词零误报（词位证据守卫）：form/wheres 作为列名/函数名/限定名不报 */
    expect(lintSql('SELECT form, wheres FROM t')).toEqual([]);
    expect(lintSql('SELECT form FROM t WHERE form = 1')).toEqual([]);
    expect(lintSql('SELECT COUNT(form) FROM t')).toEqual([]);
  });

  it('⑤ 行尾悬空 AND/OR：逐行点名大小写不敏感；词内命中（RANDOM/FOR）不误报', () => {
    const r1 = lintSql('SELECT a FROM t WHERE x = 1 AND');
    expect(r1.some(f => f.message.includes('悬空 AND'))).toBe(true);
    const r2 = lintSql('SELECT a FROM t WHERE x = 1\nOR');
    const or = r2.find(f => f.message.includes('悬空 OR'));
    expect(or, '第二行悬空 OR 被点名').toBeTruthy();
    expect(or!.line).toBe(2);
    expect(lintSql('SELECT RANDOM, FOR FROM t')).toEqual([]);
    expect(lintSql("SELECT a FROM t WHERE b = 'x AND y'")).toEqual([]);
  });
});

describe('B 合法语句零误报（模板级样例）', () => {
  /* SqlConsoleView TEMPLATES 逐字（1058 起按角色绑定真实字段；此处用生产形态样例验 lint） */
  const TEMPLATES = [
    'SELECT * FROM "my-index" LIMIT 100',
    'SELECT * FROM "my-index" WHERE publish_time >= NOW() - INTERVAL 7 DAY ORDER BY publish_time DESC LIMIT 100',
    'SELECT HISTOGRAM(publish_time, INTERVAL 1 DAY) AS day, COUNT(*) AS cnt FROM "my-index" GROUP BY day ORDER BY day ASC LIMIT 60',
    'SELECT company_name AS name, COUNT(*) AS cnt FROM "my-index" GROUP BY company_name ORDER BY cnt DESC LIMIT 20',
    'SELECT bond_rating AS bucket, COUNT(*) AS cnt FROM "my-index" GROUP BY bond_rating ORDER BY cnt DESC LIMIT 20',
    "SELECT * FROM \"my-index\" WHERE announcement_title LIKE '%error%' LIMIT 50",
    'SELECT * FROM "my-index" WHERE bond_rating IS NULL LIMIT 100',
  ];
  /* SqlBridgeView loadSample 示例逐字 */
  const BRIDGE_SAMPLE = `SELECT id, name, status, score
FROM "my-index"
WHERE status = 'ACTIVE' AND score >= 60
ORDER BY score DESC
LIMIT 100`;

  it('SqlConsole 七模板零误报', () => {
    for (const t of TEMPLATES) expect(lintSql(t), t).toEqual([]);
  });

  it('SqlBridge 示例与大小写/常量形态零误报', () => {
    expect(lintSql(BRIDGE_SAMPLE)).toEqual([]);
    expect(lintSql('select * from t where a = 1 order by b limit 10')).toEqual([]);
    expect(lintSql('SELECT 1')).toEqual([]);
  });
});

describe('C 两页接线源锚（划线 + banner 双通道）', () => {
  it('SqlConsoleView：setLineMarkers owner=es-sql-lint + sq-sql-lint banner + 250ms 防抖', () => {
    expect(consoleView).toContain("import { lintSql } from '../utils/sqlLint';");
    expect(consoleView).toContain('ref="sqlMonaco"');
    expect(consoleView).toContain(".setLineMarkers?.(");
    expect(consoleView).toContain("'es-sql-lint'");
    expect(consoleView).toContain('sqlLintFindings.value.map(f => ({ line: f.line, message: f.message');
    expect(consoleView, '页内 banner 双通道在場（562 批同步更新：lint-bar 单源改用，锚并存）').toContain('class="lint-bar sq-sql-lint lint-bar-warn" role="status"');
    expect(consoleView).toContain('watch(sql, () => { queueSqlLintMarkers(); }, { immediate: true });');
    expect(consoleView).toMatch(/useDebounceFn\(\(\) => \{[\s\S]*?\}, 250\)/);
  });

  it('SqlBridgeView：同款双通道；br-card 壳布局结构不动（wave2 边界遵守）', () => {
    expect(bridgeView).toContain("import { lintSql } from '../utils/sqlLint';");
    expect(bridgeView).toContain('ref="brSqlMonaco"');
    expect(bridgeView).toContain("'es-sql-lint'");
    expect(bridgeView, '页内 banner 双通道在場（562 批同步更新：lint-bar 单源改用，锚并存）').toContain('class="lint-bar br-sql-lint lint-bar-warn" role="status"');
    expect(bridgeView).toContain('watch(sql, () => { queueBrSqlLintMarkers(); }, { immediate: true });');
    /* br pane 弹性骨架逐字不动：编辑器仍 flex:1 1 0 + min-height:260px（原值）。
       五百三十五批同步更新（锚随改用迁移先例）：三 pane 卡壳退役（四刀③④），承重根
       .br-card→.br-pane 改用（height:100%+flex column 字面等效同步更新），monaco-host 直挂原 flex 字面 */
    expect(bridgeView).toContain('.br-pane > :deep(.monaco-host) { flex: 1 1 0; min-height: 260px; }');
  });

  it('SqlConsole 高度链确定解不被触碰（minmax(150px,34vh) + flex:1 min-height:0 逐字；1136 结果优先档）', () => {
    expect(consoleView).toContain('.sq-grid { grid-template-rows: minmax(150px, 34vh); }');
    expect(consoleView).toContain('.sq-editor { display: flex; flex-direction: column; min-height: 0; }');
    expect(consoleView).toContain('.sq-editor > :deep(.monaco-host) { flex: 1 1 0; min-height: 0; }');
  });
});
