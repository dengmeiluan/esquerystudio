/**
 * 五百五十批 轨2（工蚁）：七件小刀 —— 源码锁（dqHeightUnify549 风格 readFileSync 字面断言）。
 * ① RT refreshable 三处点亮：IndexHub docs/query 两表 + DslQueryView 结果表
 *    （@refresh 已在 547 批接线；refreshable 为 547 批 RT 内建 prop，缺省 false 零增量）。
 * ② DevTools histOpen 落盘：ref(true) → usePref('dt.histOpen', true)（444 批折叠态跨会话记忆，
 *    默认仍开=既有行为零变化；devtoolsFlatten534/histCollapse444 的折叠交互锚不受影响）。
 * ③ DslQueryView openRawIo 判空：无记录 notify 引导不开空弹窗（Adhoc 546 口径同步更新，
 *    rawIoPave546 十五视图同款文案）。
 * ④ IndexHub query tab 错误人话化：qryErr 走 friendlyEsError（docs tab 534 同款口径）。
 * ⑤ Xmigrate checkpoint 观测段：sliceStatus 聚合「已完成 x/y 片」；有 FAILED/ABORTED 切片
 *    附「中断于 slice N（共 M 片）」——并入既有 progressMeta 输出链（MetaStrip 消费），
 *    不新增独立行容器；后端零改（sliceStatus Map 既有数据），旧 JSON 静默降级。
 * ⑥ Xmigrate errMeta 三处：checkErr/startErr/loadErr err-bar 双参改用
 *    （errMetaPave547 TaskTreeView 口径：xxxErrRaw 原始对象旁路 + 成功/开跑清 raw + 文案不回退）。
 * ⑦ IndexHub query tab fav 闭环：面板 actions 加 'fav' + @fav=favHistRow 直写 es_query_saved
 *    （QueryHubView 546 favHistRow 复制适配——共享件与 QueryHubView 零改；IH 行 mode 恒 'dsl'
 *    （histRows 过滤），面板行级门 `!it.mode || it.mode === 'dsl'` 天然放行）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const dt = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');
const xm = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');

describe('550 轨2 ①：RT refreshable 三处点亮（@refresh 既有归宿主不变）', () => {
  it('IndexHub docs 表 refreshable + @refresh="runDocs"', () => {
    const s = ih.indexOf('<ResultTable ref="docsTbl"');
    const rt = ih.slice(s, ih.indexOf('</ResultTable>', s));
    expect(rt, 'docs RT 内建刷新钮点亮').toMatch(/\brefreshable\b/);
    expect(rt).toContain('@refresh="runDocs"');
  });
  it('IndexHub query 表 refreshable + @refresh="runDsl"', () => {
    const s = ih.indexOf('<ResultTable ref="qryTbl"');
    const rt = ih.slice(s, ih.indexOf('</ResultTable>', s));
    expect(rt, 'query RT 内建刷新钮点亮').toMatch(/\brefreshable\b/);
    expect(rt).toContain('@refresh="runDsl"');
  });
  it('DslQueryView 结果表 refreshable + @refresh="runQuery"', () => {
    const s = dq.indexOf('<ResultTable ref="resultTbl"');
    const rt = dq.slice(s, dq.indexOf('</ResultTable>', s));
    expect(rt, 'DQ RT 内建刷新钮点亮').toMatch(/\brefreshable\b/);
    expect(rt).toContain('@refresh="runQuery"');
  });
});

describe('550 轨2 ②：DevTools histOpen 落盘（usePref dt.histOpen，默认开）', () => {
  it('ref(true) 退役 → usePref；urlState import 在场', () => {
    expect(dt).toContain("const histOpen = usePref('dt.histOpen', true);");
    expect(dt, '会话内 ref 初值形态退役').not.toContain('const histOpen = ref(true);');
    expect(dt).toContain("import { usePref } from '../composables/urlState';");
  });
});

describe('550 轨2 ③：DslQueryView openRawIo 判空（Adhoc 546 口径同步更新）', () => {
  it('无记录 notify 引导并返回，不再以空 rec 开弹窗', () => {
    /* 五百五十一批同步更新（击穿者：551 轨2 刀⑦c——Profile 态双特征回退）：
       单特征取数改 last('/cluster/query') ?? last('/cluster/profile')，判空文案零触。
       五百六十五批同步更新（击穿者：565 件①——二段特征链扩容五写路径动作）：
       全函数体正则退役（五段链逐字面不再适配单函数形状），改锚三段语义等价面：
       首段 551 双特征行（551 黑名单 toContain 锁同面）+ 判空文案（550 原面）+
       rec2 承接首段空档的链首（rawIoReach565 行为锁同域） */
    expect(dq).toContain("const rec = ioRecorder.last('/cluster/query') ?? ioRecorder.last('/cluster/profile');");
    expect(dq).toContain('暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看');
    expect(dq).toMatch(/const rec2 = rec\s*\?\? ioRecorder\.last\('\/cluster\/update-document'\)/);
  });
});

describe('550 轨2 ④：IndexHub query tab 错误人话化（friendlyEsError）', () => {
  it('qryErr 走 friendly（docs tab 534 同款口径），裸 e.message 压串退役', () => {
    expect(ih).toMatch(/qryErr\.value = '查询失败：' \+ friendlyEsError\(String\(e\?\.message \?\? e\)\);/);
    expect(ih).not.toContain('qryErr.value = e?.message || String(e);');
    /* friendlyEsError import 既有在场（docs tab 早已复用）——防误删 */
    expect(ih).toContain("import { friendlyEsError } from '../utils/esError';");
  });
});

describe('550 轨2 ⑤：Xmigrate checkpoint 观测段（sliceStatus 聚合，并入 progressMeta 输出链）', () => {
  it('聚合帮手在场：已完成 x/y 片；FAILED/ABORTED 附「中断于 slice N（共 M 片）」', () => {
    expect(xm).toContain('function sliceCheckpointMeta');
    expect(xm).toMatch(/已完成 \$\{done\}\/\$\{total\} 片/);
    expect(xm).toMatch(/中断于 slice \$\{[^}]+\}（共 \$\{total\} 片）/);
    expect(xm, '失败档含 ABORTED（与任务口径一致，后端当前只发 FAILED）').toMatch(/v === 'FAILED' \|\| v === 'ABORTED'/);
  });
  it('progressMeta 两分支（总量未知/常规）都并链消费，不新增独立行容器', () => {
    const pm = xm.slice(xm.indexOf('function progressMeta'), xm.indexOf('async function loadJobs'));
    expect(pm, 'progressMeta 内消费 checkpoint 段').toContain('sliceCheckpointMeta');
    expect(xm).toMatch(/const cp = sliceCheckpointMeta\(j\)/);
  });
  it('旧 JSON 静默降级：无 sliceStatus/空 Map 不出段（529 观测行同口径）', () => {
    const fn = xm.slice(xm.indexOf('function sliceCheckpointMeta'), xm.indexOf('function progressMeta'));
    expect(fn).toMatch(/if \(!ss \|\| typeof ss !== 'object'\) return null;/);
    expect(fn).toMatch(/if \(!entries\.length\) return null;/);
  });
});

describe('550 轨2 ⑥：Xmigrate errMeta 三处双参改用（errMetaPave547 TaskTreeView 口径）', () => {
  it('import 在场 + 三条 err-bar v-html 双参', () => {
    expect(xm).toContain("import { errPreHtml, errMeta } from '../utils/errPre';");
    expect(xm).toMatch(/v-html="errPreHtml\(checkErr, errMeta\(checkErrRaw\)\)"/);
    expect(xm).toMatch(/v-html="errPreHtml\(startErr, errMeta\(startErrRaw\)\)"/);
    expect(xm).toMatch(/v-html="errPreHtml\(loadErr, errMeta\(loadErrRaw\)\)"/);
  });
  it('xxxErrRaw 原始对象旁路：声明 + catch 透传 + 成功/开跑清 raw + friendly 文案不回退', () => {
    expect(xm).toContain('const checkErrRaw = ref<unknown>(null);');
    expect(xm).toContain('const startErrRaw = ref<unknown>(null);');
    expect(xm).toContain('const loadErrRaw = ref<unknown>(null);');
    expect(xm).toMatch(/checkErrRaw\.value = e;/);
    expect(xm).toMatch(/startErrRaw\.value = e;/);
    expect(xm).toMatch(/loadErrRaw\.value = e;/);
    expect(xm).toMatch(/checkErr\.value = '';\s*\n\s*checkErrRaw\.value = null;/);
    expect(xm).toMatch(/startErr\.value = '';\s*\n\s*startErrRaw\.value = null;/);
    expect(xm).toMatch(/loadErr\.value = '';\s*\n\s*loadErrRaw\.value = null;/);
    /* friendlyApiError 通道不回退（errMetaPave547 ①；571 同步更新：550 原锁 friendlyEsError 口径，571 三消费面接线升级 code 优先单源） */
    expect(xm).toContain("checkErr.value = '连接失败：' + friendlyApiError(e)");
    expect(xm).toContain("startErr.value = '启动失败：' + friendlyApiError(e)");
    expect(xm).toContain("loadErr.value = '加载迁移作业失败：' + friendlyApiError(e)");
  });
});

describe('550 轨2 ⑦：IndexHub query tab fav 闭环（QueryHub 546 favHistRow 复制适配）', () => {
  it('面板 actions 加 fav + @fav 接线', () => {
    /* 554 同步更新：actions 再加 'curl'（track2Wave554 ④，宿主 histCurl 组装）——fav/curl 皆面板内建行级钮
       562 同步更新：actions 再加 'newtab'（kibanaWave562 K4，宿主 ihHistNewTab 带 DevTools 新 Tab） */
    expect(ih).toContain(":items=\"histRows\" :actions=\"['play', 'fill', 'copy', 'fav', 'curl', 'newtab', 'del']\"");
    expect(ih).toContain('@fav="favHistRow"');
  });
  it('favHistRow 直写 es_query_saved：同名去重 + notify 反馈 + 非 dsl 行门控', () => {
    expect(ih).toContain('function favHistRow');
    expect(ih).toContain("localStorage.getItem('es_query_saved')");
    expect(ih).toContain("writeStoredRaw(localStorage, 'es_query_saved', JSON.stringify(saved))");
    expect(ih).toContain('同名收藏已存在，未重复写入');
    expect(ih).toContain('已转收藏（保存的搜索）——到查询工作台 DSL 页「保存的搜索」查看');
    expect(ih).toContain('收藏写入失败（本地存储空间不足）');
    /* 行级门与 QueryHistoryPanel 面板门同构：非 dsl 行不写（IH 行 mode 恒 dsl，双保险） */
    expect(ih).toMatch(/it\.mode && it\.mode !== 'dsl'/);
  });
  it('共享件零改：QueryHistoryPanel fav 行级门与 QueryHubView favHistRow 原样（复制适配不回改）', () => {
    const qhp = readFileSync(join(__dirname, '../components/QueryHistoryPanel.vue'), 'utf-8');
    const qh = readFileSync(join(__dirname, '../views/QueryHubView.vue'), 'utf-8');
    expect(qhp).toContain("actions.includes('fav') && (!it.mode || it.mode === 'dsl')");
    expect(qh).toContain('function favHistRow');
  });
});
