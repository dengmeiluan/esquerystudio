/**
 * 五百三十八批·轨4（工蚁 W4）：全站扁平化扫荡第二波（八视图残面）· 契约备案。
 *
 * 仿 devtoolsFlatten534 三件套范式（静态源码断言，happy-dom 不挂载）：
 * ① 壳退役负锁字典：PitScroll pt-card / UBQ uq-card（+uq-card-bd 框中框内衬）模板类清零；
 *    Optimizer io-idx-sel/io-cur/io-recs/io-seg、ConfigValidator cv-import/cv-report、
 *    BulkEditor be-result-b/be-fail-item、LiveDashboard ld-alerts-tt 底色块：类名保留作模板锚
 *    （ld-alerts 535 W6 先例），chrome 规则（bg/通栏 border/radius）禁回流；
 *    RestView/SystemView 全局 .card 消费清零（退役入册）。
 * ② 正锁：各页行首横排卡头 / fs-head 分界在场（pt-card-hd / uq-card-hd / io-seg accent /
 *    cv-rp-hd / ld-alerts-tt），PainlessLab 535 批「分界归 fs-head border-bottom」约定承接。
 * ③ 恒高字面冻结：纯视觉降层未动任何高度链——pt-logs 200 / pt-num fs-num-l /
 *    uq-qcard 280 / io-preview-code 240 / cv-grid 42vh 定行 / rt-resp-scroll calc 链 /
 *    system QRT calc 链 / be-result-row 间距载体 逐字锁现状防回潮。
 * ④ StatusPill 改用锁：cv-rp-badge 手写 ok/err 徽标全形态清零 + StatusPill 消费在场 +
 *    cv-iss-sev 既有锚不动（componentUnify530 口径），呼吸图标随统一件化退役。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* ═══════════ ① 壳退役负锁字典 ═══════════ */

/* 模板壳类清零（class 属性首类即壳，534 轨4 lc-card 同款禁列；`[" ]` 边界防误伤 pt-card-hd 等） */
const SHELL_CLASS_GONE: Record<string, RegExp[]> = {
  PitScrollView: [/class="pt-card[" ]/],
  UpdateByQueryView: [/class="uq-card[" ]/],
  RestView: [/class="card[" ]/],
  SystemView: [/class="card[" ]/],
};

describe('五百三十八批①：模板壳类清零（§6v 约定①防回潮）', () => {
  it('pt-card / uq-card / 全局 .card 模板消费清零（wide 网格占位随 pt-sec/uq-sec 同步更新）', () => {
    for (const [view, regexes] of Object.entries(SHELL_CLASS_GONE)) {
      const s = read(`../views/${view}.vue`);
      for (const re of regexes) {
        expect(s, `${view} 壳类必须退役（border-top 分节承接）`).not.toMatch(re);
      }
    }
    const pt = read('../views/PitScrollView.vue');
    const uq = read('../views/UpdateByQueryView.vue');
    expect(pt, 'pt-sec 分节类在场（wide 同步更新）').toMatch(/class="pt-sec wide pt-logs"/);
    expect(pt).toMatch(/\.pt-sec \{ border-top: 1px solid var\(--border\); padding-top: var\(--sp-1h\); \}/);
    expect(pt).toMatch(/\.pt-sec\.wide \{ grid-column: 1 \/ -1; \}/);
    expect(uq, 'uq-sec 分节类在场（wide/qcard 同步更新）').toMatch(/class="uq-sec wide uq-qcard"/);
    expect(uq).toMatch(/\.uq-sec \{ border-top: 1px solid var\(--border\); display: flex; flex-direction: column; gap: var\(--sp-2\); \}/);
    expect(uq).toMatch(/\.uq-sec\.wide \{ grid-column: 1 \/ -1; \}/);
  });

  it('uq-card-bd 框中框内衬全形态清零（模板解包 + CSS 规则退役）', () => {
    const uq = read('../views/UpdateByQueryView.vue');
    expect(uq, '内衬 div 不再现').not.toContain('uq-card-bd');
    expect(uq, '本地壳规则不回流（.uq-card 裸类/.uq-card.wide）').not.toMatch(/\.uq-card(?![\w-])/);
    expect(pt_rules_gone(read('../views/PitScrollView.vue'))).toBe(true);
  });

  it('io-* 四块大容器框 chrome 退役（类名保留作锚；io-seg border-left accent 语义豁免）', () => {
    const io = read('../views/IndexOptimizerView.vue');
    for (const cls of ['io-idx-sel', 'io-cur', 'io-recs', 'io-seg']) {
      expect(io, `.${cls} 底色块不回流`).not.toMatch(new RegExp(String.raw`\.${cls} \{[^}]*background`));
      expect(io, `.${cls} 圆角壳不回流`).not.toMatch(new RegExp(String.raw`\.${cls} \{[^}]*border-radius`));
    }
    expect(io, 'io-idx-sel 通栏 border 不回流').not.toMatch(/\.io-idx-sel \{[^}]*border/);
    expect(io).toMatch(/\.io-cur \{ border-top: 1px solid var\(--line\); padding-top: var\(--sp-2\); \}/);
    expect(io).toMatch(/\.io-recs \{ border-top: 1px solid var\(--line\); padding-top: var\(--sp-2\); \}/);
    /* io-seg：全框退役但 border-left accent 语义保留（warn/ok 双态） */
    expect(io).toMatch(/\.io-seg \{ border-top: 1px solid var\(--line\); padding-top: var\(--sp-2\); border-left: 3px solid var\(--warn\); \}/);
    expect(io).toMatch(/\.io-seg\.io-seg-ok \{ border-left-color: var\(--ok\); \}/);
  });

  it('cv-import 横幅框 / cv-report 报告框 chrome 退役；cv-tpl 可点击交互卡豁免保留', () => {
    const cv = read('../views/ConfigValidatorView.vue');
    expect(cv).toMatch(/\.cv-import \{ display: flex; align-items: center; gap: var\(--sp-2\); margin-bottom: var\(--sp-3\); \}/);
    expect(cv, 'cv-import 底色/描边/圆角不回流').not.toMatch(/\.cv-import \{[^}]*(background|border-radius)/);
    expect(cv).toMatch(/\.cv-report \{ border-top: 1px solid var\(--border\); padding-top: var\(--sp-2\); \}/);
    expect(cv, 'cv-report 通栏 border/圆角不回流').not.toMatch(/\.cv-report \{[^}]*border-radius/);
    expect(cv, 'cv-tpl 模板小卡=可点击交互卡豁免保留（约定③）').toMatch(
      /\.cv-tpl \{ padding: var\(--sp-3\); background: var\(--card-bg\); border: 1px solid var\(--border\); border-radius: var\(--r-m\); cursor: pointer;/);
  });

  it('be-result-b / be-fail-item 项级小框降层（be-card-hd 逐字锚不在面）', () => {
    const be = read('../views/BulkEditorView.vue');
    expect(be).toMatch(/\.be-result-b \{ flex: 1; text-align: center; padding: var\(--sp-2\) 0; font-size: var\(--fs-xs\); color: var\(--muted\); \}/);
    expect(be, 'be-result-b 描边/圆角不回流').not.toMatch(/\.be-result-b \{[^}]*border/);
    expect(be).toMatch(/\.be-fail-item \{ padding: var\(--sp-2\) 0; border-bottom: 1px solid var\(--border\); font-size: var\(--fs-xs\); \}/);
    expect(be, 'be-fail-item 圆角壳不回流').not.toMatch(/\.be-fail-item \{[^}]*border-radius/);
  });

  it('ld-alerts-tt 头条本体漏面补刀：panel-2 底块退役（535 W6 只退了外框）', () => {
    const ld = read('../views/LiveDashboardView.vue');
    /* 八百一十七批件1 同步更新：区块标题升 sec-t 约定档 fs-xs→fs-sm（四区同档；用户令「统一设计语言」） */
    expect(ld).toMatch(/\.ld-alerts-tt \{ padding: var\(--sp-2\) var\(--sp-3\); font-size: var\(--fs-sm\); font-weight: 600; border-bottom: 1px solid var\(--border\);/);
    expect(ld, 'panel-2 头条底色不回流').not.toMatch(/\.ld-alerts-tt \{[^}]*background/);
  });
});

/* .pt-card 裸类规则是否已清零（.pt-card-hd 等连字类不受影响） */
function pt_rules_gone(s: string): boolean {
  return !/\.pt-card(?![\w-])/.test(s);
}

/* ═══════════ ② 行首横排卡头 / fs-head 分界正锁 ═══════════ */

describe('五百三十八批②：卡头行首横排档在场（刀②语义承接）', () => {
  it('PitScrollView：pt-card-hd 四头条在场（527 批已并轨 650 档，只退壳不动头）', () => {
    const pt = read('../views/PitScrollView.vue');
    expect((pt.match(/class="pt-card-hd"/g) || []).length, '四张分节各一头条').toBe(4);
    /* 五百五十批同步更新：卡头并 fs-head 行首横排档（uq-card-hd 同语言先例，flattenWave550②），
       旧 fs-sm 卡头档字面同步更新为新档逐字；四头条数与分节结构零变动 */
    expect(pt).toMatch(/\.pt-card-hd \{ display: flex; align-items: center; justify-content: space-between; gap: var\(--sp-2\); padding: 5px var\(--sp-2\); border-bottom: 1px solid var\(--border\); font-size: var\(--fs-xs\); font-weight: 650; color: var\(--tx1\); letter-spacing: \.02em; \}/);
  });

  it('UpdateByQueryView：uq-card-hd 四头条在场且转 fs-head 行首档（card-t 并轨摘除）', () => {
    const uq = read('../views/UpdateByQueryView.vue');
    expect((uq.match(/class="uq-card-hd"/g) || []).length, '四张分节各一头条').toBe(4);
    expect(uq, 'card-t 全局卡头档随壳退役摘除').not.toMatch(/card-t uq-card-hd/);
    expect(uq).toMatch(/\.uq-card-hd \{ display: flex; align-items: center; justify-content: space-between; gap: var\(--sp-2\); padding: 5px var\(--sp-2\); border-bottom: 1px solid var\(--border\); font-size: var\(--fs-xs\); font-weight: 650; color: var\(--tx1\); letter-spacing: \.02em; \}/);
  });

  it('IndexOptimizerView：sec-t 分节头与 io-seg 头条在场（降层不消义）', () => {
    const io = read('../views/IndexOptimizerView.vue');
    expect(io).toMatch(/class="io-cur-hd sec-t"/);
    expect(io).toMatch(/class="io-recs-hd"/);
    expect(io).toMatch(/class="io-seg-tt"/);
  });

  it('ConfigValidatorView：cv-rp-hd 工具条 border-bottom 分界保留', () => {
    const cv = read('../views/ConfigValidatorView.vue');
    expect(cv).toMatch(/\.cv-rp-hd \{ display: flex; align-items: center; gap: var\(--sp-3\); padding: var\(--sp-3\) var\(--sp-4\); border-bottom: 1px solid var\(--border\); flex-wrap: wrap; \}/);
  });
});

/* ═══════════ ③ 恒高字面冻结（零高度改动，锁现状防回潮） ═══════════ */

describe('五百三十八批③：恒高字面冻结（2.9.115/119 事故面口径）', () => {
  it('PitScroll：日志滚动钳制 / 28px 大数字档 / QRT 聚焦 calc 链逐字在场', () => {
    const pt = read('../views/PitScrollView.vue');
    expect(pt).toContain('.pt-logs { max-height: 200px; overflow: auto; }');
    expect(pt).toMatch(/\.pt-num \{ font-size: var\(--fs-num-l\); font-weight: 650;/);
    expect(pt).toContain(`'calc(100vh - var(--vh-offset) + 80px)' : '40vh'`);
  });

  it('UBQ：qcard min-height 280 定高字面 / 错误全文 120px 限高逐字在场', () => {
    const uq = read('../views/UpdateByQueryView.vue');
    expect(uq).toContain('.uq-qcard { min-height: 280px; }');
    expect(uq).toContain('.uq-err-msg { max-height: 120px; overflow: auto; white-space: pre-wrap; }');
  });

  it('Optimizer/ConfigValidator：io-preview-code 240 / cv-grid 42vh 定行 / monaco-host 260px 兜底', () => {
    const io = read('../views/IndexOptimizerView.vue');
    const cv = read('../views/ConfigValidatorView.vue');
    expect(io).toMatch(/\.io-preview-code \{[^}]*max-height: 240px; overflow-y: auto;/);
    expect(cv).toContain('.cv-grid { grid-template-rows: minmax(300px, 42vh); }');
    expect(cv, 'selectorUnify532 P0 锚随批冻结').toMatch(/\.cv-card > :deep\(\.monaco-host\) \{ flex: 1 1 0; min-height: 260px; \}/);
  });

  it('Rest/System：响应滚动 calc 链 / body 编辑器 42vh 兜底 / QRT calc 链逐字在场', () => {
    const rt = read('../views/RestView.vue');
    const sy = read('../views/SystemView.vue');
    expect(rt).toContain('.rt-resp-scroll { max-height: calc(100vh - var(--vh-offset) + 120px); }');
    expect(rt, 'selectorUnify532 锚随批冻结').toContain('.rt-body-wrap > .rt-body-ed { min-height: max(180px, 42vh); }');
    expect(sy).toContain('max-height="calc(100vh - var(--vh-offset) + 150px)"');
  });

  it('BulkEditor：be-result-row 间距载体原样（三格降层后唯一间距源）', () => {
    const be = read('../views/BulkEditorView.vue');
    expect(be).toContain('.be-result-row { display: flex; gap: var(--sp-3); padding: var(--sp-3); }');
    expect(be, 'be-card-hd><span>参数</span> 逐字锚（flattenWave534:88/bulkEditorWorkbench409 双锁同源）')
      .toContain('<div class="be-card-hd"><span>参数</span></div>');
  });
});

/* ═══════════ ④ StatusPill 改用锁（cv-rp-badge → 统一件） ═══════════ */

describe('五百三十八批④：cv-rp-badge 改用 StatusPill 统一件', () => {
  it('手写 ok/err 徽标全形态清零（模板锚类 + 三条 CSS 规则 + 呼吸图标 import）', () => {
    const cv = read('../views/ConfigValidatorView.vue');
    expect(cv, 'cv-rp-badge 锚类不再现').not.toContain('cv-rp-badge');
    expect(cv, '呼吸图标随统一件化退役（StatusPill 无图标位）').not.toMatch(/CheckCircle2|XCircle/);
  });

  it('StatusPill 消费在场（tone valid→g / 未过→r，文案逐字）且 cv-iss-sev 既有锚不动', () => {
    const cv = read('../views/ConfigValidatorView.vue');
    expect(cv).toContain(`import StatusPill from '../components/StatusPill.vue';`);
    expect(cv).toMatch(/<StatusPill :tone="report\.valid \? 'g' : 'r'" :label="report\.valid \? '校验通过' : '校验未通过'" \/>/);
    expect(cv, 'cv-iss-sev 五档先例锚勿动（componentUnify530 口径）')
      .toMatch(/<StatusPill class="cv-iss-sev" :tone="cvSevPill\(iss\.severity\)" :label="cvSevZh\(iss\.severity\)" \/>/);
  });
});
