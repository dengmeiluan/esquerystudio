/**
 * 五百五十四批·四页重造轨 B1（DslQuery + DevTools）· 契约备案。
 *
 * ① (P1) DQ RawIo 常驻入口——此前钮在 RT #bar-extra 仅 resp 在场渲染，查询失败
 *    （queryErr、resp=null）全页无取数入口；工具行右段 .dq-tb-r 常驻 Terminal 钮
 *    （打开同一 RawIoModal，openRawIo 取数逻辑零触；RT 结果行钮保留成功态就地快查）。
 * ② (P2) DQ 错误面板降层——私造 .dq-err 四边框壳+独立标题行退役，合并全局 .err-bar
 *    范式（theme.css :553）+ errPreHtml/errMeta 双参（XmigrateView :60 先例）；
 *    重试钮与 pre max(240px,42vh) 钳制保留（531 口径冻结面，queryFlat534 字面锁同步更新）。
 * ③ (P2) DQ 历史/保存面板 actions 加 'curl'——QueryHistoryPanel 行级 emit（552 先例），
 *    命令组装归宿主：行自持 query/index 组 POST /{idx}/_search -d 写剪贴板
 *    （DevToolsView histCurl 先例手法平移；savedRows 映射同步更新补 index）。
 * ④ (P2) DevTools 请求域工具迁位——插入骨架/格式化/压缩/收藏/清空五钮自响应 pane
 *    #actions 迁回请求 pane #actions（域归属归位）；响应头只留响应观测族
 *    （标题/RawIo/MetaStrip/响应搜索）；dtLint/err-bar 落位不动。
 *    （后续同步更新：失败重试唯一入口落 err-bar，工具行失败态重试钮退役防回潮锁同处。）
 * ⑤ (P2 微) .dq-split-seg button padding 10px → var(--sp-2h)（token 同值 10px，零视觉变化）；
 *    3px 刻意值保字面。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const dt = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

/* 工具行右段切片（dq-tb-r 起、dq-main 注释前=工具行闭合，slice 覆盖整段） */
const tbR = dq.slice(dq.indexOf('class="dq-tb-r'), dq.indexOf('dq-main'));

describe('554 ①：DQ RawIo 常驻入口（工具行右段）', () => {
  it('.dq-tb-r 常驻 Terminal 钮（同一 openRawIo，RT 结果行钮并存）', () => {
    expect(tbR, '工具行右段常驻原始 IO 钮（查询失败无 resp 时也有取数入口）').toContain('@click="openRawIo"');
    expect(tbR).toContain('aria-label="查看原始 IO（DSL 查询）"');
    expect(tbR).toContain('<Terminal :size="13" />');
  });
  it('openRawIo 取数逻辑零触（550/551 锁同源复核）+ RawIoModal 挂载不变', () => {
    expect(dq).toContain("const rec = ioRecorder.last('/cluster/query') ?? ioRecorder.last('/cluster/profile');");
    expect(dq).toContain('暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看');
    expect(dq).toContain('<RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />');
  });
});

describe('554 ②：DQ 错误面板合并全局 .err-bar 范式', () => {
  it('err-bar 形在场（role=alert 377 守卫），私造壳标题行退役', () => {
    expect(dq).toContain('<div v-if="queryErr" role="alert" class="err-bar dq-err">');
    expect(dq, '独立标题行退役').not.toContain('查询失败（详情）');
    expect(dq, '标题行样式退役').not.toContain('.dq-err-t');
  });
  it('errPreHtml/errMeta 双参 + 原始错误对象旁路接线', () => {
    expect(dq).toContain('errPreHtml(queryErr, errMeta(queryErrRaw))');
    expect(dq).toContain("import { errPreHtml, errMeta } from '../utils/errPre';");
    expect(dq, 'catch 旁路原始对象（errMeta 读 code/endpoint）').toContain('queryErrRaw.value = e;');
    expect(dq, '错误清空同步清旁路').toContain('queryErrRaw.value = null;');
  });
  it('重试钮与 pre max(240px,42vh) 钳制保留；壳框归全局不再自持', () => {
    expect(dq).toMatch(/:disabled="running" @click="runQuery">重试</);
    expect(dq, '531 口径冻结面（queryFlat534 同步更新保形）').toMatch(/\.dq-err pre \{[^}]*max-height: max\(240px, 42vh\);/);
    const rule = dq.slice(dq.indexOf('.dq-err {'), dq.indexOf('}', dq.indexOf('.dq-err {')));
    expect(rule, '壳描边不回流（err-line 归全局 .err-bar 承担）').not.toContain('border');
    expect(rule, '壳内衬不回流').not.toContain('padding');
    expect(rule, 'err-bar 兜底 margin-bottom 归零（落位节奏不变）').toContain('margin-bottom: 0');
    expect(rule, '长文顶对齐（uq-err 先例）').toContain('align-items: flex-start');
  });
});

describe('554 ③：DQ 历史/保存面板行级 curl', () => {
  it('历史面板 actions 加 curl + @curl 接线', () => {
    /* 562 同步更新（击穿者：kibanaWave562 K4——历史行带到 DevTools 新 Tab）：actions 加 'newtab'，
       面板行级仅 emit、_prefill 组装归宿主 histNewTab（openInDevTools 通道） */
    expect(dq).toMatch(/:actions="\['play', 'fill', 'copy', 'fav', 'curl', 'newtab', 'del'\]"/);
    expect(dq).toContain('@curl="histCurl"');
  });
  it('保存面板 actions 加 curl（行自持 index：savedRows 映射同步更新补 index）', () => {
    expect(dq).toMatch(/:actions="\['play', 'copy', 'rename', 'curl', 'del'\]"/);
    expect(dq).toContain('const savedRows = computed(() => savedQueries.value.map(sq => ({ name: sq.name, query: sq.dsl, index: sq.idx, ts: sq.ts })));');
  });
  it('宿主组装 POST /{idx}/_search -d 写剪贴板（DevTools histCurl 手法平移）', () => {
    expect(dq).toMatch(/function histCurl\(h: any\) \{/);
    expect(dq).toContain("'/' + h.index + '/_search' : '/_search'");
    expect(dq).toContain("curl -X POST '${window.location.origin}${idxPath}'");
    expect(dq).toContain("-H 'Content-Type: application/json' -d '${");
    expect(dq).toContain("h.query.replace(/'/g");
  });
});

describe('554 ④：DevTools 请求域工具迁位', () => {
  const reqPane = dt.slice(dt.indexOf('#pane-devtools-search-request'), dt.indexOf('#pane-devtools-search-response'));
  const respPane = dt.slice(dt.indexOf('#pane-devtools-search-response'), dt.indexOf('</WorkbenchLayout>'));
  it('五钮居请求 pane（格式化常驻 + 低频四钮收「⋯」菜单，577 批同步更新 563 合并形态）', () => {
    expect(reqPane).toContain('dt-pane-tt">请求体</span>');
    /* 五百七十七批同步更新：563 批低频动作收 ⋯ 菜单（铁律 C 多按钮合一），菜单项 @click 自带
       moreOpen = false 关层语义——闭合引号后移，旧子串锚 @click="insertBody" 失配（572-C2 字面同步更新） */
    expect(reqPane).toContain('@click="insertBody(); moreOpen = false"');
    expect(reqPane).toContain('@click="format"');
    expect(reqPane).toContain('@click="minify(); moreOpen = false"');
    expect(reqPane).toContain('@click="saveFav(); moreOpen = false"');
    expect(reqPane).toContain("@click=\"cur.body = ''; cur.result = null; moreOpen = false\"");
    expect(reqPane.indexOf('请求体</span>'), '标题行首').toBeLessThan(reqPane.indexOf('@click="format"'));
  });
  it('响应 pane #actions 只留观测族（标题/RawIo/MetaStrip/响应搜索），失败重试唯一入口落 err-bar', () => {
    expect(respPane).toContain('dt-pane-tt">响应</span>');
    expect(respPane).toContain('@click="openRawIo"');
    expect(respPane).toContain('<MetaStrip');
    expect(respPane).toContain('dt-resp-search');
    /* 同步更新（失败重试入口收敛）：入口断言改锁 err-bar 域；工具行旧形态防回潮 */
    expect(dt.slice(dt.indexOf('class="err-bar dt-err"'), dt.indexOf('class="dt-out"')))
      .toMatch(/:disabled="cur\.busy" @click="run"/);
    expect(respPane).not.toMatch(/v-if="cur\.result && !cur\.ok"[^>]*@click="run"/);
    for (const gone of ['@click="format"', '@click="minify"', '@click="saveFav"', '@click="insertBody"', "@click=\"cur.body = ''; cur.result = null\""]) {
      expect(respPane, `请求域钮撤离响应头：${gone}`).not.toContain(gone);
    }
  });
  it('dtLint 降级条与 err-bar dt-err 落位不动', () => {
    /* 五百六十一批同步更新：lint 形态壳改用 theme.css .lint-bar 单源（.dt-lint 只留高度链钉） */
    expect(reqPane).toContain('lint-bar-err');
    expect(dt).toContain('class="err-bar dt-err"');
  });
});

describe('554 ⑤：.dq-split-seg padding token 化（零视觉变化）', () => {
  it('3px 刻意值保字面，10px → var(--sp-2h)（token 同值 10px）', () => {
    expect(dq).toContain('.dq-split-seg button { padding: 3px var(--sp-2h);');
    expect(dq, '裸 10px 不回流').not.toContain('padding: 3px 10px');
  });
});
