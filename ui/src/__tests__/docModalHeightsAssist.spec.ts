/**
 * 文档弹窗高度弹性 + 文档编辑字段补全（源码锁）：
 * ① DslQueryView 文档编辑（420px）/新建文档（360px）Monaco 定高 → height="min(60vh, 原值兜底)"——
 *    矮屏不再顶出视口两层滚动，高屏保留原上限不无限拉伸；
 * ② IndexHubView 文档编辑态 JsonArea 补 dsl-assist：fields 源透传同页查询口（ihDslAssist.fields，
 *    同一 useIndexFields 出口），bodyKind 'doc'——五百二十四批 doc 档在档前的过渡是显式 'none'
 *    （五百三十批，彼时缺省 ?? 'search' 冒充查询体），现升 'doc'：键位零候选、field 值位白名单出字段候选。
 *    五百二十五批同步更新：编辑态 rows=14 定高退役 → fill + 外包 min(60vh,420px) 定高 flex 容器
 *    （同弹窗查看态同口径），dsl-assist 透传契约不变。
 *    六百七十四批同步更新：561 批高度机制 usePref('dq.popH') → useTierCycle('dq.docH'/'dq.docHNew')
 *    档位制（首档=原值兜底语义不变）、669 批弹窗 :font-size 同页同键——字面锁同步刷新；
 *    561 升档时本 spec 尚在冻结名单（658 接管后解冻），恒红至今复诊销账。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

describe('DslQueryView 文档弹窗高度弹性（原值兜底）', () => {
  it('编辑弹窗 min(60vh,420px)，新建/克隆弹窗 min(60vh,360px)', () => {
    /* 六百七十四批同步更新（674-C1 复诊）：561 批 usePref('dq.popH') 单值 → useTierCycle('dq.docH'/'dq.docHNew')
       三档循环（档钮 title 实时回显），首档=原值兜底语义由 TIERS[0] 取值锁承接（629-C2 同步更新补取值锁）；
       669 批 :font-size="dqFont" 同页同键契约并入字面锁 */
    expect(dq).toContain('<MonacoEditor v-if="docEditMode" v-model="docEditText" :height="docH" :font-size="dqFont" />');
    expect(dq).toContain("const DOC_H_TIERS: string[] = ['min(60vh,420px)', 'min(70vh,560px)', 'min(80vh,700px)'];");
    expect(dq).toContain("useTierCycle('dq.docH', DOC_H_TIERS)");
    expect(dq).toContain('<MonacoEditor v-model="newDocText" :height="docHNew" :font-size="dqFont" />');
    expect(dq).toContain("const DOC_NEW_H_TIERS: string[] = ['min(60vh,360px)', 'min(70vh,480px)', 'min(80vh,600px)'];");
    expect(dq).toContain("useTierCycle('dq.docHNew', DOC_NEW_H_TIERS)");
  });

  it('裸定高形态不回潮（弹窗两处）', () => {
    expect(dq).not.toContain('height="420px"');
    expect(dq).not.toContain('height="360px"');
  });
});

describe('IndexHubView 文档编辑态字段补全', () => {
  it('编辑态 JsonArea 透传查询口 fields 源，bodyKind doc 档（不冒充 search body）', () => {
    /* 五百二十五批：fill + 外包定高 flex 容器承接视口档（rows 定高退役），assist 透传不变 */
    expect(ih).toContain('<JsonArea v-model="docEditText" fill :dsl-assist="{ fields: ihDslAssist.fields, bodyKind: () => \'doc\' }" />');
    expect(ih).toContain('style="height:min(60vh,420px);display:flex"');
    expect(ih, 'rows=14 定高不得回潮（fill 视口档接管）').not.toContain(':rows="14"');
    /* bodyKind='doc' 是语义边界：文档体≠search body，缺省回退 search 的冒充行为不得回潮 */
    const m = ih.match(/<JsonArea v-model="docEditText"[^>]*:dsl-assist="([^"]+)"/);
    expect(m, '文档编辑 assist 内联对象存在').toBeTruthy();
    expect(m![1]).toContain("bodyKind: () => 'doc'");
  });
});
