/**
 * 五百三十一批 W-B：表格内核波浪第二浪 + 六表换壳（契约记录）。
 * 锁定：
 * 1) QRT rowDrawer 行详情侧拉——缺省关（右键无「行详情」项、无侧拉 DOM，零增量）；
 *    开启后右键出「行详情」→ n-drawer 侧拉整行键值对+逐格复制+「复制整行 JSON」；
 * 2) RT 内核三件补齐（QRT 530 批同款平移）——quickFilter/selectable/exportRowFilter
 *    全缺省零增量：缺省无过滤/无事件/全量导出；传参生效=调用方白得；
 * 3) 六表换壳锚（qrtRowsSwap529 先例：中文列键+fieldTypes+sortable+storageKey+exportName）：
 *    SecurityView 用户表 / ClusterSettingsView 设置表 / ConfigDriftView 差异表 /
 *    QueryXrayView term 统计表 / BoostTunerView 排名对比表 / ProfileFlameView hotops 小表；
 *    另：QueryXray/BoostTuner 裸 sessionStorage 收发换 useLinkCarry（键与 payload 逐字保持）、
 *    ClusterSettings 头部 pill 换 StatusPill + 设置值 useInputLint（.il-hint 提示条）、
 *    三视图补 900 @media 档（档内禁 ≥300px 裸 width、全文禁 min-width:901px）。
 * 挂载样板照抄 qrtKernel530（裸 createApp + pinia；CellContextMenu 自绘可挂载断言）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';
import ResultTable from '../components/ResultTable.vue';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const readView = (name: string) => readFileSync(join(__dirname, '../views', name), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

const COLS = ['name', 'n'];
const ROWS = [
  ['apple', 1],
  ['banana', 2],
] as any;

const HITS = [
  { _id: 'a', _source: { name: 'apple' } },
  { _id: 'b', _source: { name: 'banana' } },
] as any;

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountTbl(comp: any, props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(comp as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  await tick();
}

const dataRows = () => [...host.querySelectorAll('tbody tr')].filter(tr => !tr.classList.contains('qrt-nomatch') && !tr.classList.contains('qrt-trunc-row'));
const dataHitRows = () => [...host.querySelectorAll('tbody tr')].filter(tr => tr.querySelector('td.rt-cell'));
const ctxMenuBtn = (label: string) =>
  [...document.querySelectorAll('.ccm-mask .ccm-it')].find(b => b.textContent?.includes(label)) as HTMLButtonElement | undefined;
const cellMenu = async (td: HTMLElement, x = 10, y = 10) => {
  td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  await tick(4);
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.querySelectorAll('.cfp, .ccm-mask, .n-drawer, .n-drawer-container').forEach(e => e.remove());
});

/* ═══════════ 一、QRT rowDrawer 行详情侧拉 ═══════════ */
describe('QRT rowDrawer 行详情侧拉（531 批）', () => {
  it('缺省关（零增量）：右键无「行详情」项、无侧拉 DOM', async () => {
    await mountTbl(QueryResultTable, { cols: COLS, rows: ROWS, sortable: true });
    await cellMenu(dataRows()[0].querySelectorAll('td.qrt-cell')[0] as HTMLElement);
    expect(ctxMenuBtn('行详情'), '缺省无行详情菜单项').toBeUndefined();
    expect(document.querySelector('.n-drawer'), '缺省无侧拉 DOM').toBeNull();
  });

  it('源码锁：可选 prop ? 形态 + withDefaults 缺省 false + 菜单项 props.rowDrawer 门控', () => {
    expect(qrt).toMatch(/rowDrawer\?: boolean;/);
    expect(qrt).toMatch(/rowDrawer: false,/);
    expect(qrt).toMatch(/\.\.\.\(props\.rowDrawer \? \[\{ key: 'row-drawer', label: '行详情'/);
    expect(qrt).toMatch(/<n-drawer v-model:show="rdwOpen" :width="rdwW" placement="right">/);
  });
});

/* ═══════════ 二、RT 内核三件补齐（全缺省零增量） ═══════════ */
describe('RT quickFilter/selectable/exportRowFilter（531 批，QRT 530 同款平移）', () => {
  it('缺省零增量：无过滤全量渲染、勾选不 emit selection-change', async () => {
    const got: unknown[][] = [];
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'w531def', onSelectionChange: (r: unknown[]) => got.push(r) });
    expect(dataHitRows().length).toBe(2);
    expect(host.querySelector('.empty-state')).toBeNull();
    (host.querySelector('tbody .rt-chk input[type="checkbox"]') as HTMLInputElement).click();
    await tick(4);
    expect(got.length, '缺省 selectable 事件静默').toBe(0);
  });
  it('quickFilter 传参生效：contains 过滤；0 行并入空态链（文案走既有 emptyText）', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'w531qf', quickFilter: 'an' });
    expect(dataHitRows().length).toBe(1);
    expect(dataHitRows()[0].textContent).toContain('banana');
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'w531qf0', quickFilter: 'zzz', emptyText: '没有文档' });
    expect(host.querySelector('.empty-state .es-text')!.textContent).toBe('没有文档');
  });
  it('selectable 传参生效：勾选 emit 原始 hit 数组', async () => {
    const got: unknown[][] = [];
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'w531sel', selectable: true, onSelectionChange: (r: unknown[]) => got.push(r) });
    (host.querySelector('tbody .rt-chk input[type="checkbox"]') as HTMLInputElement).click();
    await tick(4);
    expect(got[got.length - 1]).toEqual([HITS[0]]);
  });
  it('exportRowFilter 源码锁：可选声明+矩阵三格式收口（JSON 文档导出恒 raw）', () => {
    expect(rt).toMatch(/exportRowFilter\?: \(row: unknown\) => boolean;/);
    expect(rt).toMatch(/const rows = fmt !== 'json' && props\.exportRowFilter\s*\n\s*\? rows0\.filter\(r => props\.exportRowFilter!\(r\)\)\s*\n\s*: rows0;/);
    expect(rt).toMatch(/if \(!props\.selectable\) return;/);
  });
});

/* ═══════════ 三、六表换壳锚（源码锁） ═══════════ */
describe('六表换壳（531 批，qrtRowsSwap529 先例范式）', () => {
  it('SecurityView 用户表：QRT rows 接线+selectable+#row-actions 删除+useTableSort 退役', () => {
    const v = readView('SecurityView.vue');
    expect(v).toMatch(/<QueryResultTable\s*\n\s+v-if="users\.length"\s*\n\s+:cols="US_COLS" :rows="usMatrix" sortable/);
    expect(v).toContain('storage-key="security:users"');
    expect(v).toContain('export-name="security-users"');
    expect(v).toContain('selectable');
    expect(v).toContain('@selection-change="usSel = $event"');
    expect(v).toContain('<template #row-actions="{ row }">');
    expect(v).toContain('@click="doDelete(row[0])"');
    expect(v).toContain('const US_COLS = [\'用户名\', \'角色\', \'更新\'];');
    expect(v).not.toContain("from '../composables/tableSort'");
  });

  it('ClusterSettingsView 设置表：QRT rows 接线+分组列+编辑槽保真+useInputLint+StatusPill 头部', () => {
    const v = readView('ClusterSettingsView.vue');
    expect(v).toMatch(/<QueryResultTable\s*\n\s+v-if="groups\.length"\s*\n\s+:cols="csCols" :rows="csRows" sortable/);
    expect(v).toContain('storage-key="cluster-settings"');
    expect(v).toContain(':row-class="csRowClass"');
    /* 编辑输入走 #cell- 槽（onE/revert 写路径零改） */
    expect(v).toContain('@input="onE(\'P\', row[1], ($event.target as HTMLInputElement).value)"');
    expect(v).toContain('@input="onE(\'T\', row[1], ($event.target as HTMLInputElement).value)"');
    expect(v).toContain('@click="revert(value)"');
    /* useInputLint 现成内核（TIME_RE/patternRule）出 .il-hint 提示条（warn 级不阻断） */
    expect(v).toContain("import { useInputLint, patternRule, TIME_RE, type LintRule } from '../composables/useInputLint';");
    expect(v).toMatch(/csWarnRule\(TIME_RE,/);
    expect(v).toMatch(/class="il-hint" :class="csLint\('P', row\[1\]\)!\.level === 'err' \? 'il-err' : 'il-warn'"/);
    /* 头部待下发 pill 换 StatusPill（tone 语义档不变；.cs-bar .pill.g 锚由组件内 .pill 承接） */
    expect(v).toContain(`<StatusPill :tone="countDirty === 0 ? 'g' : 'y'" :label="countDirty + ' 项待下发'" />`);
    /* 分组行退役换「分组」列 chip（sweep524 .cs-grp td 锚同步更新 .cs-grp-chip；
       五百五十一批同步更新：650 字面锁随私造规则退役失效，改锚 StatusPill b 改用形态） */
    expect(v).toContain('<StatusPill class="cs-grp-chip" tone="b" :label="String(value)" />');
    expect(v).not.toMatch(/\.cs-tbl/);
  });

  it('ConfigDriftView 差异表：QRT rows 接线+#row-actions 复制差异+900 档（五百六十批 cd-verdict 改用同步更新）', () => {
    const v = readView('ConfigDriftView.vue');
    expect(v).toMatch(/:cols="SD_COLS" :rows="sdRows" sortable/);
    expect(v).toContain('storage-key="config-drift:settings"');
    expect(v).toContain('export-name="settings-drift"');
    expect(v).toContain('<template #row-actions="{ row }">');
    expect(v).toContain(`:aria-label="'复制差异：' + row[0]"`);
    expect(v).toMatch(/const SD_COLS = \['键', '代码值', '线上值'\];/);
    /* 五百六十批锚同步更新：cd-verdict 清单角标改用 StatusPill（原 525 逐字锁豁免面随锁解禁退役，
       558b 回滚件重做兑现）；530 StatusPill 徽标（cd-badge）两族并存口径不变 */
    expect(v).toContain('<StatusPill v-if="verdicts[k.indexKey]" class="cd-verdict" :tone="cdVerdictPill(verdicts[k.indexKey])"');
    expect(v).toContain(`<StatusPill class="cd-badge" :tone="drift.settingsDiff.clean ? 'g' : 'r'"`);
    /* 900 @media 档：档内禁 ≥300px 裸 width、全文禁 min-width:901px */
    expect(v).toMatch(/@media \(max-width: 900px\)/);
    expect(v, '全文禁 min-width:901px 倒挂档').not.toMatch(/min-width:\s*901px/);
  });

  it('QueryXrayView term 统计表：QRT rows 接线+useLinkCarry 收发（键与 payload 逐字保持）', () => {
    const v = readView('QueryXrayView.vue');
    expect(v).toMatch(/:rows="tvQRows\(fname\)" sortable/);
    expect(v).toContain('storage-key="xray:tv"');
    expect(v).toContain(":field-types=\"{ tf: 'long', doc_freq: 'long', ttf: 'long' }\"");
    expect(v).toContain('empty-text="无匹配 term"');
    /* gotoAnalyzer 换 useLinkCarry('analyzer').send；接收侧换 useLinkCarry('xray').receive */
    expect(v).toContain("useLinkCarry<{ index: string; text: string }>('analyzer')");
    expect(v).toContain("useLinkCarry<{ index?: string; id?: string }>('xray')");
    expect(v).toContain('analyzerCarry.send({ index: index.value, text: term })');
    expect(v).toContain('const p = xrayCarry.receive();');
    expect(v).toMatch(/@media \(max-width: 900px\)/);
    expect(v, '全文禁 min-width:901px 倒挂档').not.toMatch(/min-width:\s*901px/);
  });

  it('BoostTunerView 排名对比表：QRT rows 接线+useLinkCarry boost+rowClass 色档+缩进归位', () => {
    const v = readView('BoostTunerView.vue');
    expect(v).toMatch(/:cols="RANK_COLS" :rows="rankRows" sortable/);
    expect(v).toContain('storage-key="boost:rank"');
    expect(v).toContain(":field-types=\"{ 得分: 'double' }\"");
    expect(v).toContain(':row-class="btRowClass"');
    expect(v).toContain("useLinkCarry<{ index?: string; keyword?: string }>('boost')");
    expect(v).toContain('const p = boostCarry.receive();');
    expect(v).toMatch(/@media \(max-width: 900px\)/);
    expect(v, '全文禁 min-width:901px 倒挂档').not.toMatch(/min-width:\s*901px/);
    /* 缩进错位归位：送入沙盒/导出 DSL 两钮与兄弟钮同缩进（无 20 空格异常档） */
    expect(v).not.toMatch(/\n {20}<button class="btn ghost sm" @click="exportDsl"/);
  });

  it('ProfileFlameView hotops 小表：补 sortable+storageKey(flame)+fieldTypes percent 标注', () => {
    const v = readView('ProfileFlameView.vue');
    expect(v).toMatch(/:cols="hotCols" :rows="hotRows" sortable/);   /* qrtPagerExportTranspose525 原锚保持 */
    expect(v).toContain('storage-key="flame"');
    expect(v).toMatch(/:field-types="\{ '耗时\(ms\)': 'percent' \}"/);
    /* 五百三十二批锚同步更新：export-name 更名 profile-hotops → profile-flame（页域一致） */
    expect(v).toContain('export-name="profile-flame"');
  });

  it('900 档纪律：三视图 media 块内禁 ≥300px 裸 width（仓规）', () => {
    for (const f of ['ConfigDriftView.vue', 'QueryXrayView.vue', 'BoostTunerView.vue']) {
      const v = readView(f);
      const blocks = [...v.matchAll(/@media \(max-width: 900px\) \{([\s\S]*?)\n\}/g)].map(m => m[1]);
      expect(blocks.length, `${f} 应有 900 档`).toBeGreaterThanOrEqual(1);
      for (const blk of blocks) {
        expect(blk, `${f} 900 档内出现 ≥300px 裸 width`).not.toMatch(/width:\s*[3-9]\d{2,}px/);
      }
    }
  });
});
