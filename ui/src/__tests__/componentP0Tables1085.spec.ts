/* 1085：P0 render 函数残留清零 + 全站裸 table 改用（零廉价原生控件铁律的收尾面）。
 * 面一：GeoValueEditor 的 h() 内联子件——geo_point lat/lon 输入由 h(TextInput) 承载
 *   （inputClass 落真实 input，.gve-n 选择器零漂移）、悬浮说明由 h(Tip)（NTooltip 薄封装）
 *   承载；h() 区原生 title 属性清零（1120 门禁只扫模板区，script 区 render 函数此前漏网）。
 *   行为锁（挂载级）：lat/lon 编辑写回 AST、越界黄点警示在场。
 * 面二：六文件裸 table → MiniTable 统一件——列声明化承载表头（label/width 逐值同原 th），
 *   行级交互（右键/键盘导航/富单元格/空态行）经 #rows 行自治槽自带；
 *   DOM 锚（宿主皮肤类经 tableClass 透传）与 zebra 档不丢。
 * 面三：DevToolsView/McpPanel 裸 input → TextInput 统一件——v-model/placeholder/aria
 *   经 attrs 透传真实 input，keydown.enter/esc 修饰符透传（AdhocRebuildView 先例同款）；
 *   密码型（type 固定 text 的 TextInput 表达不了）升档 naive NInput password 档。
 * 边界登记（1087 批更新）：DocDiffModal 差异表的豁免已退役——1085 时不改用因
 *   「表头是富结构（th-tag 胶囊 + th-id 短 id + v-tip 悬浮全文，基准/目标列动态），
 *   MiniTable 的 th 仅渲染纯文本 label 无表头插槽」；1087 批 MiniTable 补
 *   head-cell-<key> 表头槽后差异表已收编（富表头经槽承载，行为锁见
 *   miniTableHead1087.spec）；McpPanel 审计表不在改动范围。 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, ref, type App } from 'vue';
import ClauseNode from '../components/builder/ClauseNode.vue';
import { type LeafNode } from '../utils/queryAst';

const srcOf = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');

/* ── GeoValueEditor 挂载设施（builder1012 同款：ClauseNode 挂 GeoValueEditor） ── */
const mk = (op: string, value: unknown, params: Record<string, unknown> = {}): LeafNode => ({
  id: 'g1', type: 'leaf', op, field: 'location', value, params, raw: null,
});
const apps: App[] = [];
function mount(node: LeafNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref(node);
  const app = createApp({
    render: () => h(ClauseNode, {
      node: cur.value, fields: ['location'], types: { location: 'geo_point' },
      'onUpdate:node': (n: LeafNode) => { cur.value = n; },
    }),
  });
  apps.push(app);
  app.mount(host);
  return { host, cur };
}
const tick = () => new Promise(r => setTimeout(r));
beforeEach(() => { document.body.innerHTML = ''; });

describe('1085 面一：GeoValueEditor render 函数区统一件承载', () => {
  const src = srcOf('components/builder/GeoValueEditor.vue');

  it('h() 区原生 title 清零（render 函数是 1120 门禁扫描面之外的漏网位）', () => {
    const script = src.slice(src.indexOf('<script'), src.indexOf('</script>'));
    /* h() 内 title 属性须迁 Tip 组件承载 */
    expect(script).not.toMatch(/\btitle\s*:/);
  });

  it('lat/lon 双输入经 h(TextInput) 承载（.gve-n 类透传真实 input）', () => {
    const script = src.slice(src.indexOf('<script'), src.indexOf('</script>'));
    expect((script.match(/h\(TextInput, \{/g) || []).length, 'lat/lon 两处输入').toBe(2);
    expect(script).toContain("inputClass: 'inp mono gve-n'");
    expect(script).toContain("'onUpdate:modelValue'");
  });

  it('悬浮说明经 h(Tip) 承载（输入说明×2 + 越界警示长文本×2）', () => {
    const script = src.slice(src.indexOf('<script'), src.indexOf('</script>'));
    expect((script.match(/h\(Tip, \{/g) || []).length).toBe(4);
    expect(script).toContain('{ long: true, text:');
  });

  it('挂载级行为锁：lat 编辑写回整树 + 越界黄点在场（aria 语义不变）', async () => {
    const { host, cur } = mount(mk('geo_distance', { lat: 40, lon: -70 }, { distance: '12km' }));
    const lat = host.querySelector<HTMLInputElement>('.gve-n')!;
    expect(lat.value).toBe('40');
    lat.value = '41.5';
    lat.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.value).toEqual({ lat: 41.5, lon: -70 });
    expect(host.querySelector('.gve .cn-rwarn')).toBeNull();
    const { host: h2 } = mount(mk('geo_distance', { lat: 120, lon: -70 }, { distance: '1km' }));
    expect(h2.querySelector('.gve .cn-rwarn[aria-label="纬度超出 -90~90"]'), '越界黄点不随改用消失').not.toBeNull();
  });
});

describe('1085 面二：裸 table 改用 MiniTable（列声明化 + 宿主锚不丢）', () => {
  it('DevToolsView 响应表两态：行序表 # 序号列+数据列并集；对象键值两列；裸 table 清零', () => {
    const src = srcOf('views/DevToolsView.vue');
    expect(src).toContain(`{ key: '__ix', label: '#' }`);
    expect(src).toContain(`...(respTbl.value?.isArr ? respTbl.value.cols : []).map(c => ({ key: c, label: c }))`);
    expect(src).toContain(`{ key: 'k', label: '键' }`);
    expect(src).toContain(`{ key: 'v', label: '值' }`);
    expect(src).toMatch(/<MiniTable v-else table-class="dt-resp-tbl-t" :columns="RESP_KV_COLS">/);
    /* 响应表格化预览两态均改用统一件 */
    expect(src).not.toContain('<table');
  });

  it('LiveDashboardView 四表：统计表/Top 索引/慢请求/告警历史列头逐值在场；zebra 档保留', () => {
    const src = srcOf('views/LiveDashboardView.vue');
    for (const label of ["{ key: 'name', label: '索引' }", "{ key: 'cluster', label: '集群' }",
      "{ key: 'min', label: '最小' }", "{ key: 'cur', label: '当前' }"]) expect(src).toContain(label);
    expect(src).toContain(`{ key: 'idxRate', label: '写入速率(doc/秒)' }`);
    expect(src).toContain(`{ key: 'uri', label: 'URI' }`);
    expect(src).toContain(`{ key: 'costMs', label: '耗时(ms)' }`);
    expect(src).toContain(`{ key: 'state', label: '状态' }`);
    expect(src).toContain(`{ key: 'message', label: '文案' }`);
    /* 784 的 DOM 锚 table.tbl.zebra.ld-hist-hist-t 由 MiniTable tableClass+zebra prop 等价承载 */
    /* 四表改用后无裸 table */ expect(src).not.toContain('<table');
  });

  it('LuceneQueryView JSON 结果表：_id/_score 定宽列声明逐值同原 th style', () => {
    const src = srcOf('views/LuceneQueryView.vue');
    expect(src).toContain(`{ key: '_id', label: '_id', width: '220px' }`);
    expect(src).toContain(`{ key: '_score', label: '_score', width: '60px' }`);
    expect(src).toContain(`{ key: '_source', label: '_source' }`);
    /* JSON 结果表改用后无裸 table */ expect(src).not.toContain('<table');
  });

  it('SqlBridgeView 对比表：四列声明 + sr-only caption 经 MiniTable caption prop 承载', () => {
    const src = srcOf('views/SqlBridgeView.vue');
    expect(src).toContain(`{ key: 'f', label: '能力' }`);
    expect(src).toContain(`{ key: 'lc', label: 'Lucene query_string' }`);
    expect(src).toMatch(/<MiniTable table-class="br-cmp" caption="三者能力对比：SQL \/ DSL \/ Lucene query_string 通道选择"/);
    /* 可见 mt-cap 形态覆写为视觉隐藏（G239 语义/视觉双不变） */
    expect(src).toMatch(/:deep\(\.br-cmp caption\) \{[^}]*clip: rect\(0, 0, 0, 0\)/);
    /* 对比表改用后无裸 table */ expect(src).not.toContain('<table');
  });

  it('McpPanel 接入面对比表：五列声明；宿主皮肤 tableClass 透传', () => {
    const src = srcOf('components/McpPanel.vue');
    for (const label of ["label: '接入面'", "label: '入口'", "label: '身份 / 权限'", "label: '调用留档'", "label: '适用与边界'"]) {
      expect(src).toContain(label);
    }
    expect(src).toMatch(/<MiniTable table-class="mcp-mode-table" :columns="MCP_MODE_COLS">/);
  });

  it('行自治槽承载行级交互：四类行动作字面在各宿主 #rows 槽内保留', () => {
    expect(srcOf('views/DevToolsView.vue')).toContain(`@contextmenu.prevent="openRespRowMenu($event, r, ri)"`);
    expect(srcOf('views/LiveDashboardView.vue')).toContain(`@contextmenu.prevent="openLdRowMenu($event, 'alert', a)"`);
    expect(srcOf('views/LuceneQueryView.vue')).toContain(`@contextmenu.prevent="openHitMenu($event, h)"`);
    expect(srcOf('components/McpPanel.vue')).toContain('<td data-label="入口"><code>POST {{ mcpMountPath() }}</code>');
  });
});

describe('1085 面三：裸 input 改用 TextInput（attrs/事件零漂移）', () => {
  it('DevToolsView：重命名/搜响应/过滤/变量 6 输入 TextInput 承载；file 选择器豁免', () => {
    const src = srcOf('views/DevToolsView.vue');
    expect(src).toMatch(/<TextInput v-if="renamingIdx === i" v-model="renameVal" input-class="dt-tab-ren mono"/);
    expect(src).toMatch(/<TextInput :model-value="respFind\.kw\.value" input-class="inp mono" placeholder="搜响应…"/);
    expect(src).toContain(`@update:model-value="v => { respFind.kw.value = v; respFind.run(); }"`);
    expect(src).toMatch(/<TextInput v-model="respFilter\.expr" input-class="inp mono dt-flt-inp"/);
    expect(src).toContain(`aria-label="过滤响应表达式"`);
    expect(src).toMatch(/<TextInput v-model="newVarK" input-class="inp mono" placeholder="变量名" style="width:150px" \/>/);
    expect(src).toMatch(/<TextInput v-model="newVarV" input-class="inp mono" placeholder="值（JSON 或字符串）" @enter="addVar" \/>/);
    /* 变量名输入定宽落输入件根容器（标签上的 style/class 只落内层 input，落不到根）；
       不用 :last-of-type——变量表为空时新增行后还跟着空态提示 div，该选择器命不中新增行 */
    expect(src).toMatch(/\.dt-vars-row > :deep\(\.ti:first-child\) \{ flex: 0 1 150px; \}/);
    /* 同行其余输入件 basis 归 0：根容器自带 width:100%，basis 取 auto 时新增行两个输入件都按整行宽
       起算再收缩，上面这条 150px 定宽会被挤掉（浏览器实测只剩约 103px） */
    expect(src).toContain('.dt-vars-row :deep(.ti) { flex: 1 1 0%; min-width: 0; }');
    /* type=file 的 sr-only 文件选择器无 TextInput 表达（type 固定 text），豁免保留原生 */
    const bare = (src.match(/<input/g) || []).length;
    expect(bare, '唯一残留=文件导入选择器（sr-only，无视觉/文本语义）').toBe(1);
    expect(src).toContain('type="file"');
  });

  it('McpPanel：九处文本输入 TextInput 承载（v-model/placeholder/aria 透传），裸文本 input 清零', () => {
    const src = srcOf('components/McpPanel.vue');
    expect((src.match(/<TextInput v-model=/g) || []).length, '文本输入统一件数量').toBe(9);
    for (const anchor of [
      'v-model="toolQuery" input-class="mcp-filter" placeholder="搜索工具名 / 说明"',
      'v-model="clientQuery" input-class="mcp-filter" placeholder="搜索客户端 / CLI / 配置方式"',
      'v-model="auditQuery" input-class="mcp-filter" placeholder="搜索工具 / method / IP / requestId"',
      'v-model="keyQuery" input-class="mcp-filter" placeholder="搜索名称 / 前缀 / 归属"',
      'v-model="aiSetupEndpoint" input-class="mcp-filter"',
      'v-model="toolPickQuery" input-class="mcp-filter" placeholder="筛选工具"',
      'v-model="form.owner" input-class="mcp-filter" placeholder="留空=自己" role="combobox"',
    ]) expect(src).toContain(anchor);
    /* 裸文本 input 清零 */ expect(src).not.toContain('<input');
  });

  it('McpPanel：密码凭证升档 NInput password 档（TextInput type 固定 text 表达不了）；name/autocomplete 经 input-props 落真实 input', () => {
    const src = srcOf('components/McpPanel.vue');
    expect(src).toMatch(/<n-input v-model:value="serverToken" type="password" show-password-on="click"/);
    /* NInput 根是包裹 div：这些属性必须经 input-props 下传到真实 input。直接写在标签上只会落到根 div
       （autocomplete 到不了 input，浏览器仍会把登录密码自动填进来）；真实 input 侧的断言见 tokenInputProps1124 */
    expect(src).toMatch(/:input-props="\{ name: 'esq-mcp-service-token', autocomplete: 'new-password', spellcheck: false, 'aria-label': '服务端 MCP 凭证' \}"/);
    expect(src).not.toMatch(/<n-input[^>]*\sautocomplete="new-password"/);
  });

  it('App.vue 全局 toast 动作钮：h(\'button\') 残留清零，NButton 承载（类锚不丢）', () => {
    const src = srcOf('App.vue');
    expect(src).toContain(`h(NButton, {`);
    expect(src).toContain(`size: 'tiny',`);
    expect(src).toContain(`text: true,`);
    expect(src).toContain(`class: 'toast-undo',`);
    /* render 函数区原生 button 清零 */ expect(src).not.toMatch(/h\('button'/);
  });
});
