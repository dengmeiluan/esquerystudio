/**
 * 五百五十一批 轨2（工蚁 W2）：四大重点页深度重造 · 八刀 —— 源码锁（track2Wave550 风格
 * readFileSync 字面断言）。
 * ① XmigrateView 新建迁移 .card 壳退役 → border-top 分节（作业列表 547 先例同语言）；
 *   顺带 .xm-drop-item.act fallback 硬编码 rgba(20,184,166,.08) → var(--hl-soft) 纯 token 等值。
 * ②③④ openRawIo 判空三处补齐（DslQueryView 550 口径逐字平移——无记录 notify 引导不开空弹窗）：
 *   XmigrateView(/xmigrate/)、DevToolsView(/cluster/raw)、IndexHubView(/cluster/query)。
 * ⑤ DevToolsView 历史行 actions 加 'fav'——一键转收藏走 store.addFavorite 既有体系
 *   （同 kind+title 覆盖=幂等切换，零新存储键）。
 * ⑥ IndexHubView 三刀：ih-card-flush 大卡壳退役（.ih-hd/.ih-tabs 两条 border-bottom+表格
 *   自带边框承接）；.ih-kv settings 摘要三格 → MetaStrip items 消费；SettingsGrid 中文释义
 *   走视图侧 SETTINGS_CATALOG 旁列（共享件禁改，零契约变更）。
 * ⑦ DslQueryView 三小刀：.dq-alt-body 四边框壳 → border-top 分节（dt-hist 534 同语言）；
 *   .dq-params-tg 节头钮 border+bg2 → .dq-sec-tg 无框档（两节头双语言归一）；openRawIo
 *   Profile 态双特征回退（/cluster/query 未命中再 /cluster/profile）。
 * ⑧ AdhocRebuildView：.dsl 与 .ar-risk-fix pre 代码盒降柔底（uq-result 540 内容面豁免先例，
 *   去 border+radius 保 bg2）；doStart/doValidateConfig 接 useQueryRun（IndexHub 三链 P0-A
 *   同范式：signal 传递+读秒+begin 竞态作废；api.ts 禁改批 signal 经 post 第 4 参 init 通道）；
 *   轮次表 metric 表头中文（总计/已建/已更新，528 sevZh 先例）。
 *
 * ⚠高度链冻结面（dqHeightUnify549/dt-body 定高/dt-lint max88/qhp-list max(240px,42vh)）
 *   零触：全部为纯视觉降层与判空/收藏/读秒接线，高度结构语义零变动。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const xm = read('../views/XmigrateView.vue');
const dt = read('../views/DevToolsView.vue');
const ih = read('../views/IndexHubView.vue');
const dq = read('../views/DslQueryView.vue');
const ar = read('../views/AdhocRebuildView.vue');

describe('551 ①：XmigrateView 新建迁移 .card 壳退役 → border-top 分节（547 .xm-res 先例同语言）', () => {
  it('card 壳退役，xm-new 分节形逐字在场', () => {
    expect(xm, '新建迁移 .card 壳退役').not.toContain('<div class="card">');
    expect(xm, '分节容器 xm-new 在场').toContain('<div class="xm-new">');
    expect(xm, '卡头挂落位类（.xm-res-t 同语言）').toContain('<div class="card-t xm-new-t">');
    expect(xm, '.xm-new 分节形逐字在场').toContain('.xm-new { border-top: 1px solid var(--border); }');
    expect(xm, '.xm-new-t 落位 padding（.xm-res-t 同款）').toContain('.xm-new-t { padding: var(--sp-3) var(--sp-4) 0; }');
  });
  it('壳 padding 退役由落位 margin 承接（form/cfg/actions 三块，盒模型尺寸等值）', () => {
    expect(xm, '旧 .xm-form margin-top 单值形退役').not.toMatch(/\.xm-form \{[^}]*margin-top: var\(--sp-4\); \}/);
    expect(xm, '.xm-form 左右落位 margin 在场').toMatch(/\.xm-form \{ display: grid; grid-template-columns: 1fr 1fr; gap: var\(--sp-3\) var\(--sp-4\); margin: var\(--sp-4\) var\(--sp-4\) 0; \}/);
    expect(xm, '.xm-cfg 左右落位 margin 在场').toContain('.xm-cfg { margin: var(--sp-3) var(--sp-4) 0; }');
    expect(xm, '.xm-actions 四向落位 margin 在场').toContain('.xm-actions { margin: var(--sp-4) var(--sp-4) var(--sp-3);');
  });
  it('.xm-drop-item.act fallback 硬编码退役 → var(--hl-soft) 纯 token 等值', () => {
    expect(xm, 'rgba fallback 硬编码退役').not.toContain('var(--hl-soft, rgba(20,184,166,.08))');
    expect(xm, 'var(--hl-soft) 裸 token 在场').toContain('background: var(--hl-soft); color: var(--ac);');
  });
});

describe('551 ②③：openRawIo 判空三处补齐（DslQueryView 550 口径逐字平移）', () => {
  const EMPTY_MSG = '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看';
  const openRawIoShape = (feature: string) =>
    new RegExp(`function openRawIo\\(\\) \\{\\s*const rec = ioRecorder\\.last\\('${feature}'\\);\\s*if \\(!rec\\) \\{ store\\.notify\\('info', '${EMPTY_MSG}'\\); return; \\}\\s*rawIoRec\\.value = rec;\\s*rawIoShow\\.value = true;\\s*\\}`);
  it('XmigrateView：/xmigrate/ 未命中 notify 引导不开空弹窗', () => {
    expect(xm).toMatch(openRawIoShape('/xmigrate/'));
  });
  it('DevToolsView：/cluster/devtools/execute 未命中 notify 引导不开空弹窗', () => {
    expect(dt).toMatch(/function openRawIo\(\) \{\s*const rec = ioRecorder\.last\('\/cluster\/devtools\/execute'\) \|\| ioRecorder\.last\('\/cluster\/raw'\);/);
    expect(dt).toContain('暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看');
    expect(dt).toContain('rawIoRec.value = rec;');
    expect(dt).toContain('rawIoShow.value = true;');
  });
  it('IndexHubView：/cluster/query 未命中 notify 引导不开空弹窗', () => {
    /* 五百五十二批同步更新（击穿者：552 轨2 刀②——ops raw 通道补口，特征串扩双参）：
       单特征取数改 last('/cluster/query') ?? last('/cluster/raw')（551 ⑦c DslQueryView
       双特征回退同形），判空文案零触；ops 分节行尾 Terminal 钮同批在检（track2Wave552）
       五百六十批同步更新（击穿者：560 轨2 刀⑤——跨 tab 串台修加 scope 参）：query 档单源
       只取 /cluster/query（判空文案零触），ops 档保留双参回退（先 /cluster/raw 后 query），
       判空 notify 随 scope 分档（ops 档运维专属引导）
       六百六十九批同步更新（击穿者：件A 特征链扩容——565 批 DQ 侧五写路径扩容时本页被本锁
       冻结备案，解冻后 query 档补齐四特征回退 query→profile→update-document→delete-by-id；
       判空文案/ops 双参零触；本体锚迁移至 rawIoChain669.spec A 段） */
    expect(ih).toMatch(/function openRawIo\(scope: 'query' \| 'ops' = 'query'\) \{\s*const rec = scope === 'ops'\s*\? \(ioRecorder\.last\('\/cluster\/raw'\) \?\? ioRecorder\.last\('\/cluster\/query'\)\)\s*: \(ioRecorder\.last\('\/cluster\/query'\)\s*\?\? ioRecorder\.last\('\/cluster\/profile'\)\s*\?\? ioRecorder\.last\('\/cluster\/update-document'\)\s*\?\? ioRecorder\.last\('\/cluster\/delete-by-id'\)\);/);
    expect(ih).toContain(EMPTY_MSG);
  });
});

describe('551 ⑤：DevToolsView 历史行一键转收藏（store.addFavorite 既有体系，零新存储键）', () => {
  it('actions 窄集加 fav + @fav 接线在场', () => {
    /* 五百五十二批同步更新（击穿者：552 轨2 刀④——actions 窄集加 'curl' 一键复制 curl，
       面板行级仅 emit、组装归宿主 histCurl）——五动作形随字面迁为六动作形，
       锁意图=动作集齐备不丢（fav/curl 均 QueryHistoryPanel 既有/新增 action 消费）。
       五百六十一批同步更新（击穿者：561 B2 刀①——actions 窄集加 'newtab' 回放到新 Tab，
       面板行级仅 emit、mkTab+激活跳转归宿主 histNewTab）：六动作形随字面迁为七动作形 */
    expect(dt, "历史行 actions 含 'fav'").toContain(":actions=\"['play', 'fill', 'copy', 'fav', 'curl', 'newtab', 'del']\"");
    expect(dt, '@fav 事件接线在场').toContain('@fav="histFav"');
  });
  it('histFav 消费 addFavorite rest 形态（与 saveFav 同结构，幂等覆盖）', () => {
    expect(dt).toMatch(/function histFav\(h: any\) \{\s*store\.addFavorite\(\{ kind: 'rest', title: h\.method \+ ' ' \+ h\.path,/);
  });
});

describe('551 ⑥a：IndexHubView ih-card-flush 大卡壳退役（.ih-hd/.ih-tabs border-bottom 承接）', () => {
  it('card 壳退役，ih-ws 分节容器在场', () => {
    expect(ih, 'card ih-card-flush 双类壳退役').not.toContain('class="card ih-card-flush"');
    expect(ih, 'ih-ws 分节容器在场').toMatch(/<div class="ih-ws"(?:\s+:class="|>)/);
    expect(ih, '.ih-card-flush 样式行退役').not.toContain('.ih-card-flush { padding: 0; }');
  });
  it('.ih-hd/.ih-tabs 两条 border-bottom 分节线零触（承接面在场）', () => {
    expect(ih, '.ih-hd 分节线在场').toContain('border-bottom: 1px solid var(--line); }');
    expect(ih).toMatch(/\.ih-tabs \{ border-bottom: 1px solid var\(--line\); border-radius: 0;/);
  });
});

describe('551 ⑥b：IndexHubView settings 摘要三格 .ih-kv → MetaStrip items 消费', () => {
  it('ih-kv 小卡格退役，MetaStrip :items="settingsKvMeta" 在场', () => {
    expect(ih, 'ih-kv-item 小卡格退役').not.toContain('ih-kv-item');
    expect(ih, 'MetaStrip 消费接线在场').toContain(':items="settingsKvMeta"');
    expect(ih, 'settingsKvMeta computed 在场').toContain('const settingsKvMeta = computed<MetaStripItem[]>(() => [');
  });
  it('三段键值语义零丢失（refresh_interval/写阻塞/max_result_window）', () => {
    const s = ih.indexOf('const settingsKvMeta');
    const block = ih.slice(s, s + 900);
    expect(block).toContain("label: 'refresh_interval'");
    expect(block).toContain("label: '写阻塞'");
    expect(block).toContain("label: 'max_result_window'");
    expect(block, '写阻塞 err 档语义保留').toMatch(/tone: blocked\.value \? 'err' : undefined/);
  });
});

describe('551 ⑥c：SettingsGrid 中文释义视图侧旁列（共享件禁改，SETTINGS_CATALOG 消费）', () => {
  it('SETTINGS_CATALOG 接线 + catalogHints computed + MetaStrip 旁列在场', () => {
    expect(ih, '目录 import 在场').toContain("from '../utils/indexSettingsCatalog'");
    expect(ih, 'catalogHints computed 在场').toContain('const catalogHints = computed<MetaStripItem[]>(() => {');
    expect(ih, '释义旁列 MetaStrip 在场').toContain(':items="catalogHints"');
  });
});

describe('551 ⑦a：DslQueryView .dq-alt-body 四边框壳 → border-top 分节（dt-hist 534 同语言）', () => {
  it('旧四边框形退役，border-top 分节形逐字在场', () => {
    expect(dq, '四边框+radius+bg1 旧形退役').not.toMatch(/\.dq-alt-body \{ border: 1px solid var\(--line\); border-radius: var\(--r-m\); background: var\(--bg1\); \}/);
    expect(dq, 'border-top 分节形逐字在场（dt-hist :951 语言）')
      .toContain('.dq-alt-body { border-top: 1px solid var(--line); margin-top: var(--sp-2); padding-top: var(--sp-1h); }');
  });
  it('三视图容器类名锚零触（tableBarUnify541 消费面）', () => {
    expect(dq).toContain('dq-json-wrap dq-alt-body');
    expect(dq).toContain('dq-tree-view dq-alt-body');
    expect(dq).toContain('dq-cards scroll-y dq-alt-body');
  });
});

describe('551 ⑦b：.dq-params-tg 形制（553 批同步更新修订：无框档被用户终审「太廉价」推翻→细描边胶囊）', () => {
  it('细描边胶囊形在场（bg1 实底+1px 线+圆角+激活柔底；track2Wave551 无框形退役备案）', () => {
    expect(dq, '细描边胶囊').toMatch(/^\.dq-params-tg \{ display: inline-flex; align-items: center; gap: var\(--sp-1\); font-size: var\(--fs-xs\); font-weight: 600; padding: 0 var\(--sp-2\); border: 1px solid var\(--line\); border-radius: var\(--r-s\); background: var\(--bg1\); color: var\(--tx1\); cursor: pointer; transition: background var\(--tr\), color var\(--tr\), border-color var\(--tr\); \}/m);
    expect(dq, 'hover 色变+描边 accent').toContain('.dq-params-tg:hover { color: var(--ac); border-color: var(--ac-line); }');
    expect(dq, '激活态柔底胶囊').toContain('.dq-params-tg.on { background: var(--ac-soft); border-color: var(--ac-line); color: var(--ac); }');
  });
  it('执行行高度链零触（.dq-run-row .dq-params-tg 定高锁同步更新不动）', () => {
    expect(dq).toContain('.dq-run-row .dq-params-tg { height: var(--ctl-h); }');
  });
});

describe('551 ⑦c：DslQueryView openRawIo Profile 态双特征回退', () => {
  it("last('/cluster/query') 未命中再 last('/cluster/profile')", () => {
    expect(dq).toContain("const rec = ioRecorder.last('/cluster/query') ?? ioRecorder.last('/cluster/profile');");
  });
});

describe('551 ⑧a：AdhocRebuildView .dsl / .ar-risk-fix pre 代码盒降柔底（uq-result 540 内容面豁免先例）', () => {
  it('.dsl 去 border+radius 保 bg2 柔底', () => {
    expect(ar, '.dsl 旧 bg0+border+radius 盒退役').not.toContain('.dsl { margin: var(--sp-2) 0 0; padding: var(--sp-2h) var(--sp-3); background: var(--bg0); border: 1px solid var(--line); border-radius: 7px; font-size: var(--fs-xs); white-space: pre-wrap; }');
    expect(ar, '.dsl 柔底形逐字在场（五百五十八批同步更新：超长回补 DSL 追加 max-height 钳）').toContain('.dsl { margin: var(--sp-2) 0 0; padding: var(--sp-2h) var(--sp-3); background: var(--bg2); border: 0; font-size: var(--fs-xs); white-space: pre-wrap; max-height: max(240px, 42vh); overflow: auto; }');
  });
  it('.ar-risk-fix 去 border+radius 保 bg2 柔底（可选中语义零触）', () => {
    expect(ar, '.ar-risk-fix 旧 bg0+border 盒退役').not.toMatch(/\.ar-risk-fix \{[^}]*border: 1px solid var\(--line\); border-radius: var\(--r-s\);/);
    expect(ar, '.ar-risk-fix 柔底+user-select:text 在场').toMatch(/\.ar-risk-fix \{[^}]*background: var\(--bg2\);\s*border: 0;[^}]*user-select: text;/);
  });
});

describe('551 ⑧b：Adhoc doStart/doValidateConfig 接 useQueryRun（IndexHub 三链 P0-A 同范式）', () => {
  it('统一件 import + 双链声明在场', () => {
    expect(ar).toContain("import { useQueryRun } from '../composables/useQueryRun';");
    expect(ar).toContain('const valQr = useQueryRun();');
    expect(ar).toContain('const startQr = useQueryRun();');
  });
  it('doValidateConfig：signal 竞态丢弃消费 + begin/finish 消费（api 层调用零触）', () => {
    /* 963：执行体首行补 canValidate 权限早退（按钮 v-if 之外的 Enter/程序化通道）——闸后仍 validating→begin 原序 */
    expect(ar).toMatch(/async function doValidateConfig\(advance: boolean\) \{\s*(?:\/\*[^]*?\*\/\s*)?if \(!canValidate\.value\)[^\n]*\n\s*validating\.value = true;\s*const signal = valQr\.begin\(\);/);
    expect(ar, 'api.configLab.validate 调用保留（mock 面不破）').toContain('await api.configLab.validate(');
    expect(ar, '旧轮竞态丢弃（queryRunRace382 等价语义）').toMatch(/if \(signal\.aborted\) return;/);
    expect(ar).toMatch(/valQr\.finish\(\);/);
  });
  it('doStart：signal 竞态丢弃消费 + begin/finish 消费（api 层调用零触）', () => {
    expect(ar).toMatch(/async function doStart\(\) \{[^]*?const signal = startQr\.begin\(\);/);
    expect(ar, 'api.adhoc.start 调用保留（mock 面不破）').toContain('await api.adhoc.start({');
    expect(ar, '写操作竞态丢弃引导以作业列表为准（控制面语义诚实）').toMatch(/if \(signal\.aborted\) \{ store\.notify\('warning'/);
    expect(ar).toMatch(/startQr\.finish\(\);/);
  });
  it('按钮读秒接线（valSecs/startSecs computed 消费）', () => {
    expect(ar).toContain('const valSecs = computed(() => (valQr.elapsedMs.value / 1000).toFixed(1));');
    expect(ar).toContain('const startSecs = computed(() => (startQr.elapsedMs.value / 1000).toFixed(1));');
    expect(ar, '校验主钮读秒文案').toMatch(/validating \? '校验中 ' \+ valSecs \+ 's'/);
    expect(ar, '启动主钮读秒文案').toMatch(/starting \? '启动中 ' \+ startSecs \+ 's'/);
  });
});

describe('551 ⑧c：Adhoc 轮次表 metric 表头中文（528 sevZh 先例）', () => {
  it('total/created/updated → 总计/已建/已更新', () => {
    expect(ar, '英文 metric 表头退役').not.toContain('<th>total</th><th>created</th><th>updated</th>');
    expect(ar, '中文表头逐字在场').toContain('<th>总计</th><th>已建</th><th>已更新</th>');
  });
});
