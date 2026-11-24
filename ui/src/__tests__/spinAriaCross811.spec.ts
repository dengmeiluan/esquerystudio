/**
 * 八百一十一批：803 池横切小刀批——半合规页在途可感知 + seg/选中卡 aria 升格。
 * 件1（G161「disabled 既有=半合规」族升格，713 G51 同图标 spinning 化+文案切换；
 *      .spinning 全局类 theme.css 428 批统一，零 CSS 新增）：
 *  - PitScroll：开/关 PIT 双钮（busy 单源）零反馈 → spinning+「开启中…/关闭中…」；
 *  - SearchSandbox：run 主钮文案切换在场（803 池「文案通道 NONE」系静态扫描误报，实地核真
 *    修正备案）补 Play spinning；重试钮（纯文本，G81 文案通道）补「重试中…」；
 *  - LuceneQuery：主执行钮文案切换在场补 Play spinning；字段体检钮双通道；重试钮文案通道。
 * 件2（G158/G192 seg 范式=QueryXray 753（容器 role=group+aria-label+钮 :aria-pressed）
 *      + 选中卡 aria-current=ConfigDrift 757（`|| undefined` 形态））：
 *  - LuceneQuery 展示形态 seg / Templates 模板类型 seg / SearchSandbox 结果视图 seg（随批裁）；
 *  - Ilm 策略卡 .ilm-p / Templates 模板行 .tv2-row 选中卡 :aria-current。
 * 撤旗备案（803-C1 三步定谳复演）：IndexSettings aria 面（保存钮守卫+刷新钮 spinning+
 *  aria-label 全在场）与 PitScroll aria 面（无 seg/选中卡形态）实地零实锚=宽匹配误报。
 * 静态守卫范式（同 luceneQueryView521）：Monaco/QueryResultTable 挂载链 happy-dom 不可行，
 * 源码契约锁定。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rd = (p: string) => readFileSync(join(__dirname, '../views', p), 'utf-8');
const pit = rd('PitScrollView.vue');
const ss = rd('SearchSandboxView.vue');
const lq = rd('LuceneQueryView.vue');
const ilm = rd('IlmView.vue');
const tp = rd('TemplatesView.vue');

describe('811 件1：半合规页在途可感知（G161 族·同图标 spinning 化+文案切换）', () => {
  it('PitScroll 开/关 PIT 双钮（busy 单源）三通道齐备', () => {
    expect(pit).toContain(`<PlayCircle :size="12" :class="{ spinning: busy }" /> {{ busy ? '开启中…' : '开 PIT' }}`);
    expect(pit).toContain(`<XCircle :size="12" :class="{ spinning: busy }" /> {{ busy ? '关闭中…' : '关 PIT' }}`);
  });

  it('SearchSandbox run 主钮补 spinning（文案切换既有）+重试钮 G81 文案通道', () => {
    expect(ss).toContain(`<Play :size="12" :class="{ spinning: running }" />`);
    expect(ss).toContain(`{{ running ? '重试中…' : '重试' }}`);
  });

  it('LuceneQuery 主钮补 spinning+字段体检钮双通道+重试钮文案通道（在途示能各随其链）', () => {
    expect(lq).toContain(`<Play :size="12" :class="{ spinning: qr.running.value }" />`);
    expect(lq).toContain(`<ShieldAlert :size="12" :class="{ spinning: schemaBusy }" /> {{ schemaBusy ? '体检中…' : '字段体检' }}`);
    expect(lq).toContain(`{{ busy ? '重试中…' : '重试' }}`);
  });

  it('守卫结构零迁移：disabled 绑定原样（disWide 链不动）', () => {
    expect(pit).toContain(`@click="doOpen" :disabled="!index || busy"`);
    expect(pit).toContain(`@click="doClose" :disabled="busy"`);
    expect(ss).toContain(`@click="run" :disabled="running">`);
    expect(lq).toContain(`@click="doRun" :disabled="!index || !qs.trim() || busy"`);
  });
});

describe('811 件2：seg 容器 aria+钮 aria-pressed（G192 范式）+选中卡 aria-current（ConfigDrift 范式）', () => {
  it('LuceneQuery 展示形态 seg（表格/文档 JSON）', () => {
    expect(lq).toContain(`<div class="seg" role="group" aria-label="展示形态">`);
    expect(lq).toContain(`:class="{ on: viewMode === 'table' }" :aria-pressed="viewMode === 'table'"`);
    expect(lq).toContain(`:class="{ on: viewMode === 'json' }" :aria-pressed="viewMode === 'json'"`);
  });

  it('Templates 模板类型 seg（index/component 双钮）', () => {
    expect(tp).toContain(`<div class="seg" role="group" aria-label="模板类型">`);
    expect(tp).toContain(`:class="{ on: tab === 'index' }" :aria-pressed="tab === 'index'"`);
    expect(tp).toContain(`:class="{ on: tab === 'component' }" :aria-pressed="tab === 'component'"`);
  });

  it('Ilm/Templates 选中卡 aria-current（|| undefined 形态=false 不输出属性）', () => {
    expect(ilm).toContain(`:aria-current="selected?.name === p.name || undefined"`);
    expect(tp).toContain(`:aria-current="selected?.name === t.name || undefined"`);
  });

  it('SearchSandbox 结果视图 seg 五钮（随批裁，803 池外同页同族）', () => {
    expect(ss).toContain(`class="seg" role="group" aria-label="结果视图"`);
    expect(ss.match(/:aria-pressed="view === '/g)?.length).toBe(5);
  });
});

describe('811 撤旗备案（803 池② IndexSettings/PitScroll aria 面=宽匹配误报定谳）', () => {
  it('IndexSettings 面向钮已全合规在场（spinning+aria-label 既有）——不动', () => {
    const isv = rd('IndexSettingsView.vue');
    expect(isv).toContain(`:class="{ spinning: loading }"`);
    expect(isv).toContain(`aria-label="刷新设置"`);
    expect(isv).not.toContain('role="group"');
  });
});
