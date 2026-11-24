/**
 * 五百二十五批 W6 六文件小改动群（源码契约看守，metaStripAdoption 同款范式）：
 *   任务一 dsl-assist 白得通道——四处 Monaco 面此前未传 dsl-assist，per-language provider 与
 *     字段 hover 全不注册；只读面补全天然无扰，hover「type · path」白得：
 *     BulkEditor(ndjson, none 档) / SqlBridge DSL 面(json, doc 档静音语义) /
 *     IndexHub 只读文档预览(doc 档) / DevTools 响应面(视 respLang doc/none)；
 *   任务二 MetaStrip 手写 sep 合并——IndexHub ih-meta-sep / Plugins pl-strip-sep 视图侧退役，
 *     TasksView kinds join 串拆 text 项进 items（ksep/join 全删归组件节奏）；
 *   任务三 filterable——TasksView 节点过滤 + XmigrateView 两处连接档案下拉（大集合无过滤不可用）；
 *   任务四 IndexHubView 文档编辑弹窗——Ctrl/Cmd+S=saveDoc 键盘路径 + JsonArea rows=14 定高
 *     退役改 fill+外包 min(60vh,420px)（与查看态同口径）；
 *   任务五 SqlBridgeView 结果条删线保底色（err 分支同基类治）；
 *   任务六 DevToolsView curl 导入 NInput rows=6 定高 → autosize 6~14 行视口自适应。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

describe('525 任务一：dsl-assist 白得通道（四处 Monaco 面）', () => {
  it('BulkEditorView：ndjson body 挂 beDslAssist（none 档补全静音 + hover 白得），fields 源接 useIndexFields', () => {
    const be = read('views/BulkEditorView.vue');
    /* 五百七十三批字面同步更新：height 静态 "100%" 已合并弹性档位绑定（EDITOR_HEIGHTS[editorH]
       持久化范式），dsl-assist/execute 挂载语义不变 */
    expect(be, 'ndjson body 面必须挂 dsl-assist').toContain('<MonacoEditor v-model="body" language="ndjson" :height="EDITOR_HEIGHTS[editorH]" :dsl-assist="beDslAssist" @execute="doSubmit" />');
    expect(be, '_bulk 体语义：none 档（补全静音，DevTools _bulk 端点同档）').toContain("bodyKind: () => 'none' as const");
    expect(be, 'fields 源必须走 useIndexFields 统一管线').toContain("useIndexFields(() => index.value || store.pickedIdx || '')");
    expect(be, 'ensure 预热必须随索引变化（DevToolsView W6 同范式）').toMatch(/watch\(\[index, \(\) => store\.pickedIdx\], \(\) => \{ void beFieldsCtx\.ensure\(\); \}, \{ immediate: true \}\)/);
  });

  it('SqlBridgeView：DSL 只读面挂 brDslAssist（doc 档键位零候选最静音），fields 复用 SQL 补全同一出口', () => {
    const br = read('views/SqlBridgeView.vue');
    expect(br, 'DSL 面必须挂 dsl-assist').toContain('<MonacoEditor :model-value="dsl || \'// 点击一键转换后自动生成\'" language="json" :readonly="true" height="100%" :dsl-assist="brDslAssist" />');
    expect(br, '机器生成产物面：doc 档静音语义').toContain("bodyKind: () => 'doc' as const");
    expect(br, 'fields 复用 curFieldsCtx（模块级缓存共享）').toContain('fields: () => curFieldsCtx.fields.value');
    expect(br, '挂载 ensure 预热（幂等+缓存，空索引早退零请求）').toContain('void curFieldsCtx.ensure();');
  });

  it('IndexHubView：只读文档预览挂同构 assist（doc 档），fields 复用同页查询口 ihDslAssist', () => {
    const ih = read('views/IndexHubView.vue');
    /* 六百六十九批同步更新（击穿者：件B 弹窗字号档——尾追 :font-size="ihFont"，assist 契约
       锁意图零触；edFontModal669.spec E1 同锚） */
    expect(ih).toMatch(/<MonacoEditor :model-value="docEditText" language="json" :readonly="true" height="min\(60vh,420px\)"\s*:dsl-assist="\{ fields: ihDslAssist\.fields, bodyKind: \(\) => 'doc' \}" :font-size="ihFont" \/>/);
  });

  it('DevToolsView：响应只读面挂 dtRespAssist，bodyKind 视 respLang（json→doc / plaintext→none）', () => {
    const dt = read('views/DevToolsView.vue');
    expect(dt, '响应面必须挂 dsl-assist').toContain(':dsl-assist="dtRespAssist"');
    expect(dt).toContain("const dtRespAssist = { fields: () => dtFields.value, bodyKind: () => (respLang.value === 'json' ? 'doc' as const : 'none' as const) };");
  });
});

describe('525 任务二：MetaStrip 手写 sep 合并（视图侧退役，归组件自动 .ms-sep）', () => {
  it('IndexHubView：ih-meta-sep 模板与 CSS 全退役（别名段插槽保留）', () => {
    const ih = read('views/IndexHubView.vue');
    expect(ih, '手写 sep 必须退役').not.toMatch(/class="ih-meta-sep"/);
    expect(ih, 'sep 私样式声明必须退役').not.toMatch(/\.ih-meta-sep \{/);
    expect(ih, '别名段插槽必须保留').toContain('class="ih-meta-alias"');
  });

  it('PluginsView：pl-strip-sep 退役，✅/❌ 图例段插槽保留', () => {
    const pl = read('views/PluginsView.vue');
    expect(pl, '手写 sep 必须退役').not.toMatch(/class="pl-strip-sep"/);
    expect(pl, 'sep 私样式声明必须退役').not.toMatch(/\.pl-strip-sep \{/);
    expect(pl, '图例段必须保留在默认插槽').toContain('<span class="pl-hint">✅ = 已装 · ❌ = 未装</span>');
  });

  it('TasksView：同一条 MetaStrip 三种 · 来源混串合并——kinds 拆 text 项进 items，ksep/join 插槽全删', () => {
    const tv = read('views/TasksView.vue');
    expect(tv, 'kinds 必须拆 text 项进 items').toContain('...actionKinds.value.slice(0, 3).map((k: string) => ({ text: k })),');
    expect(tv, '手写 ksep 必须退役').not.toMatch(/class="tv-meta-ksep"/);
    expect(tv, 'ksep 私样式声明必须退役').not.toMatch(/\.tv-meta-ksep \{/);
    expect(tv, '插槽 join 串必须退役').not.toMatch(/class="tv-meta-kinds"/);
    expect(tv, 'kinds 私样式声明必须退役').not.toMatch(/\.tv-meta-kinds \{/);
    expect(tv, '全量语义 :title 兜底必须保留').toMatch(/actionKinds\.join\(' · '\)/);
  });

  it('DevToolsView：本无手写 sep（statusMeta 纯 items），不回潮即可', () => {
    const dt = read('views/DevToolsView.vue');
    expect(dt).not.toMatch(/<span[^>]*class="[^"]*sep[^"]*"[^>]*>·<\/span>/);
  });
});

describe('525 任务三：filterable 三处（大集群节点/连接档案 >20 无过滤不可用）', () => {
  it('TasksView：节点过滤 n-select 补 filterable', () => {
    const tv = read('views/TasksView.vue');
    expect(tv, '节点过滤下拉必须可搜索').toMatch(/<n-select[^>]*v-model:value="nodeFilter"[^>]*filterable[^>]*\/>/);
  });

  it('XmigrateView：两处连接档案下拉（源集群/续跑）都补 filterable', () => {
    const xm = read('views/XmigrateView.vue');
    const connTags = xm.match(/<n-select[^>]*:options="(?:connOpts|resumeOpts)"[^>]*\/>/g) || [];
    expect(connTags.length, '连接档案下拉恰两处（源/续跑）').toBe(2);
    for (const t of connTags) expect(t, '每处都必须可搜索').toContain('filterable');
  });
});

describe('525 任务四：IndexHubView 文档编辑弹窗两件', () => {
  it('① Ctrl/Cmd+S=saveDoc 键盘路径——编辑态守卫 + preventDefault + 随弹窗态挂摘', () => {
    const ih = read('views/IndexHubView.vue');
    expect(ih, 'Ctrl+S 处理器必须存在').toContain('function onDocSaveKey(e: KeyboardEvent)');
    expect(ih, '必须认 Ctrl/Cmd+S').toMatch(/\(e\.ctrlKey \|\| e\.metaKey\) && e\.key\.toLowerCase\(\) !== 's'|!\(e\.ctrlKey \|\| e\.metaKey\) \|\| e\.key\.toLowerCase\(\) !== 's'/);
    expect(ih, '必须只在编辑弹窗开着时响应（不拦浏览器保存默认）').toContain('if (!docOpen.value || !docEditMode.value) return;');
    expect(ih, 'preventDefault 掐掉浏览器「保存网页」').toMatch(/onDocSaveKey[\s\S]*?e\.preventDefault\(\);[\s\S]*?saveDoc\(\);/);
    expect(ih, '监听随弹窗态/KeepAlive 激活态挂摘').toContain('function syncDocSaveListener()');
    expect(ih).toMatch(/watch\(\[docOpen, docEditMode, hubActive\], syncDocSaveListener\);/);
    expect(ih, '离页必须摘掉隐藏写键').toContain('onDeactivated(() => { hubActive.value = false; });');
    expect(ih, '卸载兜底清理').toMatch(/onBeforeUnmount\(\(\) => window\.removeEventListener\('keydown', onDocSaveKey\)\);/);
  });

  it('② 编辑态 JsonArea rows=14 定高退役 → fill + 外包 min(60vh,420px)（与查看态同口径）', () => {
    const ih = read('views/IndexHubView.vue');
    expect(ih, '外包定高 flex 容器必须存在').toContain('style="height:min(60vh,420px);display:flex"');
    expect(ih).toContain('<JsonArea v-model="docEditText" fill :dsl-assist="{ fields: ihDslAssist.fields, bodyKind: () => \'doc\' }" />');
    expect(ih, 'rows=14 定高不得回潮').not.toContain(':rows="14"');
  });
});

describe('525 任务五 + 任务六', () => {
  it('SqlBridgeView：结果条删线保底色（.br-result 无 border-top，ok/err 背景差保留）', () => {
    const br = read('views/SqlBridgeView.vue');
    expect(br, '.br-result 基类必须无 border-top').not.toMatch(/\.br-result \{[^}]*border-top/);
    /* 五百二十七批同步更新：padding 收 --sp 半档（6px 12px → --sp-1h --sp-3），ok 底色/字号语义不变 */
    expect(br, 'ok 色块底保留').toMatch(/\.br-result \{ padding: var\(--sp-1h\) var\(--sp-3\); font-size: var\(--fs-xs\); background: var\(--ok-soft\); color: var\(--ok\); \}/);
    expect(br, 'err 分支背景差保留（同基类治，无自有线）').toContain('.br-result.err { background: var(--err-soft); color: var(--err); }');
  });

  it('DevToolsView：curl 导入 NInput rows=6 定高退役 → autosize 6~14 行视口自适应', () => {
    const dt = read('views/DevToolsView.vue');
    expect(dt, 'autosize 必须在位').toContain(':autosize="{ minRows: 6, maxRows: 14 }"');
    expect(dt, 'rows=6 定高不得回潮').not.toContain(':rows="6"');
  });
});
