/**
 * 五百五十四批 轨2（工蚁B2）四页重造 IndexHub + Adhoc + Xmigrate —— 十刀（源码锁）。
 * ① IndexHub 失败态 RawIo 常驻：RT 内 Terminal 钮只随成功态渲染（docsRan / v-else-if="qryResp"），
 *    检索/查询失败（docsErr/qryErr）时全页无取数入口——docs 检索行与 query 工具行各补常驻 Terminal 钮
 *    （openRawIo 双特征回退既有单源零触，track2Wave552 ②⑤ 锁保全）。
 * ② Adhoc 四编辑框高度档：步① 手动 rows=8 / 步② 审编 rows=14 写死且 fill 态下 rows 纯装饰
 *    （height:100% 接管），是四页唯一高度锁死页——useTierCycle 统一件（adhoc.pasteH/xm.cfgRows 同件）
 *    键 adhoc.edH 档值 8/16/28/44 驱动 JsonArea rows（height=rows*19+16 纯内容函数确定解，红线禁 rAF
 *    零触）；四框摘 fill 改 rows 驱动，554-P0 ar-fill-wl 定高档随之退役（fill 链撤=塌陷成因整体消失，
 *    pane 高度交内容自撑复归 547 裁决）；档钮形态抄本页 paste 档钮（手动 hd + 审编卡头双入口同一键）。
 * ③ IndexHub 编辑器拖柄：.ih-dsl-wrap 下加横向 SplitHandle 落盘 ih.qryH（dq.mainH 同款自定态：
 *    >0 覆写档位、档位钮全灭、点档位钮清零）。553 裁决应用=边界随指针：本柄在编辑区下方（受控区
 *    上侧），向下拖=编辑区底缘下移=高度增大，与 dq.main 同向自然（553 反向锚只适用于柄在受控区
 *    上方的结果柄形态）；ih-h-full 满档语义保形（自定态下 min-height 档不叠加）。
 * ④ IndexHub 历史面板 actions 加 'curl'（QueryHistoryPanel 552 内建行级钮）：宿主按 row.query/index
 *    组 curl 写剪贴板（DevToolsView histCurl 先例；本页行恒 mode='dsl' 查询体，POST {index}/_search）。
 * ⑤ Adhoc 六 .card 退壳（Xmigrate 551 先例）：五个步卡与「最近作业」卡全局 .card 壳（border+bg+radius）
 *    退役 → border-top 分节（本地 .ar-sec 落位类，padding 承接卡留白）；card-t 行首横排标题保留；
 *    语义边框（危险操作描边）豁免保留。
 * ⑥ 区块标题升档：Adhoc .ar-diff/.report 的 .ed-label 升 .sec-t 行首横排（选择器限两区，
 *    .ed-col pane 标题走既有升档规则不波及）；Xmigrate .xm-cfg-t 升 .sec-t（.xm-g-hd 先例同款）。
 * ⑦ 执行进度条：Adhoc 页顶 ind-bar（on=preparing‖validating‖starting）+ Xmigrate 页顶 ind-bar
 *    （on=checking‖starting），DevTools dt-progress 同款 absolute 零高度占位（纯 CSS 动画）。
 * ⑧ ETA 进度可见：Adhoc 观测行增「预计剩余」=(total−created−updated)/rate（TookBadge 承载；
 *    速率缺失/非正数不渲染，不冒充）；Xmigrate progressMeta 尾随并入 ETA（MetaStrip value+label
 *    tone=info），同不冒充原则（rateOf 既有差分件、total 未知/余量非正不出）。
 * ⑨ IndexHub 手写胶囊改用 StatusPill：ih-op-risk safe/warn/crit（tone 备案：safe→g/success、
 *    warn→y/warning、crit→r/danger）与 ih-sh-node-cnt 计数 chip（中性 tone=n）——锚类名外挂
 *    pill 根（552 sg-badge 先例）以免 spec DOM 锁破，本地色值规则退役归 .pill 单源。
 * ⑩ --sp 微收口：.ar-input-tabs gap/padding 2px → var(--sp-0) 两值全收；.tbl th padding
 *    5px 8px → 5px var(--sp-2)（5px 非档位奇数刻意值保字面）——四锁同步更新改锚
 *    （adhocWave544/rebuildFlat534/spSweep540/w10ReduceSteps525，契约行退役改新形）。
 *
 * 同步更新锁清单（改锚不删例）：adhocEditorsWorkbench411 / adhocManualWorkbench426 /
 * adhocFillViewport547（554-P0 ar-fill-wl 未同步更新的既有红，一并修锚）、adhocStepPersist
 * （.card→.ar-sec）、adhocJobsQrt529 + adhocJobsTable524（jobs 卡定位选择器）、adhocWave544 +
 * rebuildFlat534 + spSweep540 + w10ReduceSteps525（⑩契约行）、indexHubQueryTab（④ actions 字面）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const ih = read('../views/IndexHubView.vue');
const adhoc = read('../views/AdhocRebuildView.vue');
const xm = read('../views/XmigrateView.vue');

/* ═══ ① IndexHub 失败态 RawIo 常驻（docs 检索行 + query 工具行各一常驻钮） ═══ */
describe('554 ①：IndexHub 失败态 RawIo 常驻（工具行 Terminal 钮）', () => {
  const docsBar = ih.slice(ih.indexOf('class="ih-docs-bar"'), ih.indexOf('</template>', ih.indexOf('class="ih-docs-bar"')));
  const qryBar = ih.slice(ih.indexOf('class="ih-docs-bar" style="margin-top:var(--sp-2)"'), ih.indexOf('</div>', ih.indexOf('class="ih-docs-bar" style="margin-top:var(--sp-2)"')));

  it('docs 检索行常驻 Terminal 钮（失败态有取数入口）', () => {
    expect(docsBar, 'docs 检索行常驻钮').toContain('aria-label="查看原始 IO（检索行）"');
    /* 五百六十批同步更新（击穿者：560 轨2 刀⑤——scope 分流，docs/query 四钮显式传 'query'） */
    expect(docsBar, "@click=\"openRawIo('query')\" 接线").toContain("@click=\"openRawIo('query')\"");
  });
  it('query 工具行常驻 Terminal 钮（查询失败态有取数入口）', () => {
    expect(qryBar, 'query 工具行常驻钮').toContain('aria-label="查看原始 IO（查询行）"');
    expect(qryBar, "@click=\"openRawIo('query')\" 接线（560 同步更新同上）").toContain("@click=\"openRawIo('query')\"");
  });
  it('RT 内既有两钮零触 + openRawIo 取数特征（560 同步更新：query 档单源，ops 档双参回退保 552 由来）', () => {
    /* 1357：两个 tab 的 RT 行内「原始 IO」钮退役（与工具行「更多 ⋯」菜单项同一动作，
       重复平铺违反「never duplicate an action」）。本条意图是「两个 tab 都仍能取到原始 IO」，
       随入口迁移到菜单项：判据从 aria-label 改为两条菜单 key。 */
    expect(ih).toContain("key: 'ih-raw-io-docs'");
    expect(ih).toContain("key: 'ih-raw-io-query'");
    expect(ih).toContain("ioRecorder.last('/cluster/raw') ?? ioRecorder.last('/cluster/query')");
  });
});

/* ═══ ② Adhoc 四编辑框高度档（useTierCycle adhoc.edH 驱动 rows） ═══ */
describe('554 ②：Adhoc 四编辑框高度档（adhoc.edH）', () => {
  it('useTierCycle 三件套：档值 8/16/28/44、默认 16、落盘键 adhoc.edH', () => {
    expect(adhoc).toContain("useTierCycle('adhoc.edH', ED_ROWS_TIERS, 16)");
    expect(adhoc).toContain('const ED_ROWS_TIERS = [8, 16, 28, 44];');
  });
  it('四编辑框 :rows="edRows" 循环、fill 摘除（rows 换算接管高度）', () => {
    expect(adhoc.match(/:rows="edRows"/g)?.length, '四框全接档').toBe(4);
    expect(adhoc, '写死 rows=8 不回流').not.toContain(':rows="8"');
    expect(adhoc, '写死 rows=14 不回流').not.toContain(':rows="14"');
    const tagOf = (ref: string) => {
      const i = adhoc.indexOf(`ref="${ref}"`);
      expect(i, `${ref} 在场`).toBeGreaterThanOrEqual(0);
      return adhoc.slice(adhoc.lastIndexOf('<JsonArea', i), adhoc.indexOf('/>', i));
    };
    for (const r of ['manualSetJaRef', 'manualMapJaRef', 'setJaRef', 'mapJaRef']) {
      expect(tagOf(r), `${r} 摘 fill 改 rows 驱动`).not.toMatch(/\sfill[ \(=>]/);
    }
  });
  it('档钮双入口（手动 hd + 审编卡头），形态抄 paste 档钮', () => {
    expect(adhoc.match(/data-ar-ed-h/g)?.length, '双入口').toBe(2);
    expect(adhoc.match(/@click="cycleEdRows"/g)?.length, '双入口同键').toBe(2);
  });
  it('554-P0 ar-fill-wl 定高档退役（fill 链撤=塌陷成因消失，547 内容自撑复归）', () => {
    expect(adhoc).not.toMatch(/\.ar-fill-wl \{ height:/);
  });
});

/* ═══ ③ IndexHub 编辑器拖柄（SplitHandle ih.qryH） ═══ */
describe('554 ③：IndexHub 编辑器高度拖柄（ih.qryH 自定态）', () => {
  it('SplitHandle 接线：横向柄 + resize 双事件落盘 usePref ih.qryH', () => {
    expect(ih).toContain("import SplitHandle from '../components/SplitHandle.vue';");
    expect(ih).toContain('<SplitHandle');
    expect(ih).toContain("usePref<number>('ih.qryH', 0)");
    expect(ih, 'resize 双事件').toContain('@resize="onQryHResize"');
    expect(ih, 'resize-end 快照落点同函数').toContain('@resize-end="onQryHResize"');
  });
  it('自定态覆写档位：qryH>0 定高、档位钮全灭、点档位钮清零回档', () => {
    expect(ih).toContain(':class="{ \'ih-h-full\': editorH === \'full\' && qryH <= 0 }"');
    expect(ih).toContain('@click="editorH = eh.k; qryH = 0"');
    expect(ih).toMatch(/:class="\{ on: editorH === eh\.k && qryH <= 0 \}"/);
  });
});

/* ═══ ④ IndexHub 历史面板 curl（宿主组装写剪贴板） ═══ */
describe('554 ④：IndexHub 历史面板 curl', () => {
  it("actions 加 'curl' + @curl 宿主接线", () => {
    /* 562 同步更新：actions 再加 'newtab'（kibanaWave562 K4，宿主 ihHistNewTab 带 DevTools 新 Tab） */
    expect(ih).toContain(":items=\"histRows\" :actions=\"['play', 'fill', 'copy', 'fav', 'curl', 'newtab', 'del']\"");
    expect(ih).toContain('@curl="histCurl"');
  });
  it('histCurl 组装：POST {index}/_search + body 单引号转义（DevTools histCurl 手法）', () => {
    expect(ih).toMatch(/function histCurl\(h: \{ query: string; index\?: string \}\)/);
    expect(ih).toContain("const path = (h.index ? '/' + h.index : '') + '/_search';");
    expect(ih).toContain("h.query.replace(/'/g, \"'\\\\''\")");
  });
});

/* ═══ ⑤ Adhoc 六 .card 退壳（border-top 分节） ═══ */
describe('554 ⑤：Adhoc 六 .card 退壳（ar-sec 分节）', () => {
  it('五步卡 + 最近作业卡换 ar-sec、card 类零残留', () => {
    expect(adhoc).toContain('<div v-if="step === 0" class="ar-sec">');
    expect(adhoc).toContain('<div v-if="step === 1" class="ar-sec">');
    expect(adhoc).toContain('<div v-if="step === 2" class="ar-sec">');
    expect(adhoc).toContain('<div v-if="step === 3" class="ar-sec">');
    expect(adhoc).toContain('<div v-if="step === 4" class="ar-sec">');
    expect(adhoc).toContain('<div class="ar-sec" v-if="allJobs.length">');
    expect(adhoc, '全局 .card 壳不回流').not.toMatch(/class="card"/);
  });
  it('.ar-sec 落位规则：border-top 分节 + padding 承接卡留白', () => {
    expect(adhoc).toMatch(/\.ar-sec \{ border-top: 1px solid var\(--border\); padding: var\(--sp-3\) var\(--sp-4\); \}/);
  });
});

/* ═══ ⑥ 区块标题升档（.sec-t） ═══ */
describe('554 ⑥：区块标题升 sec-t 档', () => {
  it('Adhoc .ar-diff/.report 标题挂 sec-t（选择器限两区）', () => {
    expect(adhoc.match(/class="ed-label sec-t"/g)?.length).toBe(2);
    expect(adhoc).toMatch(/\.ed-label \{ margin-bottom: var\(--sp-1\); \}/);
  });
  it('Xmigrate .xm-cfg-t 升 sec-t（形态归全局，本地留落位）', () => {
    expect(xm.match(/class="xm-cfg-t sec-t"/g)?.length).toBe(2);
    expect(xm).toMatch(/\.xm-cfg-t \{ margin-bottom: var\(--sp-1\); \}/);
  });
});

/* ═══ ⑦ 执行进度条（Adhoc/Xmigrate 页顶 ind-bar） ═══ */
describe('554 ⑦：页顶执行进度条（ind-bar 全站范式）', () => {
  it('Adhoc：on=preparing‖validating‖starting + relative 锚', () => {
    expect(adhoc).toContain('<div class="ar-progress ind-bar" :class="{ on: preparing || validating || starting }"></div>');
    const root = adhoc.match(/\.ahr \{[^}]*\}/)?.[0] ?? '';
    expect(root).toContain('position: relative');
    expect(adhoc).toMatch(/\.ar-progress \{ position: absolute; top: 0; left: 0; right: 0; color: var\(--ac\); \}/);
  });
  it('Xmigrate：on=checking‖starting + relative 锚', () => {
    expect(xm).toContain('<div class="xm-progress ind-bar" :class="{ on: checking || starting }"></div>');
    const root = xm.match(/\.xm \{[^}]*\}/)?.[0] ?? '';
    expect(root).toContain('position: relative');
    expect(xm).toMatch(/\.xm-progress \{ position: absolute; top: 0; left: 0; right: 0; color: var\(--ac\); \}/);
  });
});

/* ═══ ⑧ ETA 进度可见（不冒充原则） ═══ */
describe('554 ⑧：ETA 进度可见（速率缺失/非正不渲染）', () => {
  it('Adhoc 预计剩余=(total−created−updated)/rate，TookBadge 承载', () => {
    expect(adhoc).toMatch(/const reindexEtaMs = computed<number \| null>/);
    expect(adhoc).toContain('预计剩余');
    expect(adhoc).toMatch(/<TookBadge :ms="reindexEtaMs"/);
  });
  it('Xmigrate progressMeta 尾随并入 ETA（MetaStrip tone=info）', () => {
    expect(xm).toMatch(/function etaMeta\(j: any\): MetaStripItem \| null/);
    expect(xm, 'progressMeta 消费点').toContain('const eta = etaMeta(j);');
    expect(xm.match(/eta \? \[eta\] : \[\]/g)?.length, '双分支尾随并入').toBe(2);
    expect(xm).toContain("label: '预计剩余',");
    expect(xm).toContain("tone: 'info',");
  });
});

/* ═══ ⑨ IndexHub 手写胶囊改用 StatusPill ═══ */
describe('554 ⑨：IndexHub 胶囊改用 StatusPill（锚类外挂）', () => {
  it('风险徽标四处改用（safe→g/warn→y/crit→r tone 备案），锚类 ih-op-risk 外挂 pill 根', () => {
    expect(ih.match(/<StatusPill class="ih-op-risk" tone="g" label="安全" \/>/g)?.length).toBe(1);
    expect(ih.match(/<StatusPill class="ih-op-risk" tone="y"/g)?.length).toBe(2);
    expect(ih.match(/<StatusPill class="ih-op-risk" tone="r" label="不可逆" \/>/g)?.length).toBe(1);
    expect(ih, '手写胶囊形态不回流').not.toContain('ih-op-risk safe');
  });
  it('分片计数 chip 改用中性 tone，锚类保留', () => {
    expect(ih).toContain('<StatusPill class="ih-sh-node-cnt" tone="n" :label="String(grp.shards.length)" />');
    expect(ih).not.toMatch(/\.ih-op-risk \{ font-size/);
    expect(ih).not.toMatch(/\.ih-sh-node-cnt \{ font-size/);
  });
});

/* ═══ ⑩ --sp 微收口 ═══ */
describe('554 ⑩：--sp 微收口（契约行退役改新形）', () => {
  it('.ar-input-tabs gap/padding 归 var(--sp-0)', () => {
    expect(adhoc).toMatch(/\.ar-input-tabs \{ display: inline-flex; gap: var\(--sp-0\); padding: var\(--sp-0\); background: var\(--bg2\); border-radius: var\(--r-m\); margin-bottom: var\(--sp-3\); \}/);
  });
  it('.tbl th padding 5px var(--sp-2)（5px 奇数保字面）', () => {
    expect(adhoc).toMatch(/\.tbl th \{ text-align: left; padding: 5px var\(--sp-2\); color: var\(--tx2\); border-bottom: 1px solid var\(--line\); \}/);
  });
});
