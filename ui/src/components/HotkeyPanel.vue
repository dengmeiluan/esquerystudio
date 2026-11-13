<template>
  <teleport to="body">
    <transition name="hk-fade">
      <div v-if="show" class="hk-mask" role="presentation" @click.self="emit('close')" @keydown.esc="emit('close')" tabindex="-1">
        <div ref="panelRef" class="hk-panel" role="dialog" aria-modal="true" aria-label="键盘快捷键速查">
          <div class="hk-head">
            <Keyboard :size="14" />
            <span>键盘快捷键</span>
            <span class="hk-hint">按 <kbd class="kbd">?</kbd> 随时开关</span>
            <button class="hk-x" aria-label="关闭" @click="emit('close')"><X :size="13" /></button>
          </div>
          <div class="hk-body scroll-y">
            <!-- 面板内过滤——Ctrl+F 已被 Monaco/表格查找接管，本面板是键位清单唯一检索入口。
 按 desc/keys includes 过滤 + MarkText 高亮；组内全灭则整组隐藏，全灭出独立空态。
 Esc 层级契约：焦点在过滤框内先清词（.stop 不冒泡 window Esc 关面板），再按才关面板 -->
            <!-- 轨4：裸 input（.ipt 手写皮）合并 SearchFilterBar 第 18 胞。
 ⚠Esc 层级契约保形：原元素级 @keydown.esc.stop 的 .stop 不可丢——薄板内建只
 .prevent 不 .stop，改用后在组件根补 @keydown.esc.stop（冒泡到根时拦断），
 否则 Esc 会继续冒泡到 .hk-mask 元素级 handler 与 window onKey → 清词同时误关面板 -->
            <SearchFilterBar v-model="hkKw" class="hk-filter" input-class="hk-filter-inp"
              placeholder="过滤快捷键（描述 / 键名，Esc 清空）" @keydown.esc.stop />
            <div v-if="!filteredGroups.length" class="hk-empty">无匹配快捷键</div>
            <div v-for="g in filteredGroups" :key="g.title" class="hk-group">
              <div class="hk-gt">{{ g.title }}</div>
              <div v-for="row in g.rows" :key="row.desc" class="hk-row">
                <span class="hk-keys">
                  <template v-for="(k, i) in row.keys" :key="i">
                    <span v-if="i > 0" class="hk-sep">{{ row.sep ?? '+' }}</span>
                    <kbd class="kbd"><MarkText :text="k" :kw="hkKw" /></kbd>
                  </template>
                </span>
                <span class="hk-desc"><MarkText :text="row.desc" :kw="hkKw" /></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue';
import { Keyboard, X } from 'lucide-vue-next';
import { trapTabKey } from '../utils/focusTrap';
import { GOTO_TARGETS } from '../utils/hotkeys';
import { useUiConfigStore } from '../stores/uiConfig';
import MarkText from './MarkText.vue';
import SearchFilterBar from './SearchFilterBar.vue'; /* 轨4：过滤框统一件（第 18 胞） */
import pagesContract from '@contract';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const panelRef = ref<HTMLElement | null>(null);
const ui = useUiConfigStore();

/* -D3：快捷键登记表——全站快捷键唯一权威清单。
 * -13：goto 那几行不再硬编码文案，改为从 utils/hotkeys.ts 的 GOTO_TARGETS 渲染。
 * 原先面板文案是与 App.vue 的 GOTO_MAP 并存的第二份数据， 删 p/h 时漏同步，
 * 面板因此宣传两个不存在的绑定；且 f/i/j/k/w/y/z 七个真实绑定从未被宣传。
 * 现在两者同源，漂移在结构上不可能发生；hotkeys.spec.ts 另做双向断言兜底。
 * 非 goto 的行（Ctrl+K / 数字键 / ? 等）仍手写，它们不在 GOTO_TARGETS 管辖内。 */
/* pageKeys：该行描述的页面；全部停用时该行隐藏（静态文案也要跟随功能包裁剪，
   否则停用「查询工作台」后速查里仍会宣传它的快捷键）。缺省=跨页/全局，恒显示。 */
type HkRow = { keys: string[]; desc: string; sep?: string; pageKeys?: string[] };

/* g+字母：按登记顺序切成每行 9 项，避免单行过长。
 条目分隔用「·」而非空格——「REST 直连」「Watcher 告警」等 label 自身含空格，
 用空格分隔会让人和机器都断不准词（hotkeys.spec.ts 的解析同样依赖这个分隔符）。 */
const GOTO_PER_ROW = 9;
const GOTO_SEP = ' · ';
const gotoRows = computed<HkRow[]>(() => {
  const entries = Object.entries(GOTO_TARGETS)
    .filter(([k, t]) => k !== 'g' && ui.routeEnabled(t.path));
  const rows: HkRow[] = [];
  for (let i = 0; i < entries.length; i += GOTO_PER_ROW) {
    const chunk = entries.slice(i, i + GOTO_PER_ROW);
    rows.push({
      keys: ['g', '字母'],
      desc: (i === 0 ? 'Vim 风 goto：' : '续表：') + chunk.map(([k, t]) => k + t.label).join(GOTO_SEP),
      sep: ' ',
    });
  }
  return rows;
});

/* 字母单键投影——pages 合约 hotkey 字段（与 router 的 NAV_ITEMS 同源）。
 真机烟测发现 24 个字母单键（b 收藏夹 / m Bulk / v 一键体检…）从未进速查面板，
 「有功能没人知道」（-13 同款问题迁移到了单键层）；与 g+字母 goto 层是两层
 独立键位空间（g,b=数据浏览器 而 b=收藏夹，均为设计内）。数字单键也是 NAV hotkey，
 已有「1~0」行；此处只投影字母键（len 1 且非数字），gg chord 已在 gotoRows 尾部。 */
const ALPHA_PER_ROW = 8;
const alphaRows = computed<HkRow[]>(() => {
  const raw: any[] = Array.isArray(pagesContract) ? pagesContract : (pagesContract as any).pages ?? [];
  const items = raw
    .filter((p: any) => typeof p.hotkey === 'string' && p.hotkey.length === 1 && !/^\d$/.test(p.hotkey))
    .filter((p: any) => ui.pageEnabled(p.key))
    .map((p: any) => p.hotkey + ' ' + p.name)
    .sort();
  const rows: HkRow[] = [];
  for (let i = 0; i < items.length; i += ALPHA_PER_ROW) {
    rows.push({
      keys: ['字母'],
      desc: (i === 0 ? '字母单键：' : '续表：') + items.slice(i, i + ALPHA_PER_ROW).join(GOTO_SEP),
      sep: ' ',
    });
  }
  return rows;
});

/* 分组在每次读取时构建：功能包配置到达后，导航行即时收敛（不在 setup 时定格）。 */
function buildGroups(): { title: string; rows: HkRow[] }[] {
  return [
  {
    title: '全局导航',
    rows: [
      { keys: ['Ctrl', 'K'], desc: '命令面板（跳转 / 动作 / 切索引）' },
      /* 侧栏三档（展开/图标条/隐藏全屏）——dbx Mod+B Toggle sidebar 对位 */
      { keys: ['Ctrl', 'B'], desc: '隐藏 / 恢复侧栏（查询与索引控制台全屏体验）' },
      /* 交互修复：登记「/ 聚焦侧栏功能搜索」——SideNav onSlashKey 早已实现（图标态不可用），
 此前从未进速查面板，「有功能没人知道」防重演。注：/ 不是 goto 键，不入 utils/hotkeys.ts */
      { keys: ['/'], desc: '聚焦侧栏功能搜索（输入即过滤导航项；侧栏图标态时不可用）' },
      { keys: ['1', '0'], desc: '数字单键切页（对应侧边栏顺序）', sep: '~' },
      ...alphaRows.value,
      ...gotoRows.value,
      { keys: ['g', 'g'], desc: GOTO_TARGETS.g.label + '（vim 风 chord）', sep: ' ' },
      { keys: ['?'], desc: '打开 / 关闭本速查面板' },
    ],
  },
  {
    title: '查询与编辑',
    rows: [
      { keys: ['Ctrl', 'Enter'], desc: '执行查询（DSL / SQL / Lucene / REST / DevTools）', pageKeys: ['search', 'devtools', 'rest'] },
      /* DevTools Ctrl+I = 格式化请求体（对齐 Kibana Console 键位表：Ctrl+I=Auto-indent；
 补全由 Monaco 默认 Ctrl+Space / Enter / Tab 承担，不再抢占 Ctrl+I） */
      { keys: ['Ctrl', 'I'], desc: '格式化当前请求体（DevTools；草稿同步，等价手改）', pageKeys: ['devtools'] },
      /* DevTools 全局执行（视图级 window keydown，任意焦点可达——输入控件/编辑器内让路）
 与索引工作区 query 编辑器补全（Ctrl+I 第二落点）登记（「有功能没人知道」防重演） */
      { keys: ['Ctrl', 'Enter'], desc: 'DevTools 全局执行请求（任意焦点；输入控件 / 编辑器内让路）', pageKeys: ['devtools'] },
      /* Kibana Console 键位表另外两条（1132 补齐后登记）：Ctrl+↑/↓ 在我们这里落在
         「相邻请求起始行」（每个 Tab 即一条请求）；Ctrl+L 由 Monaco 原生提供跳转行。 */
      { keys: ['Ctrl', '↑'], desc: '跳到上一条请求起始行（DevTools 编辑器内）', pageKeys: ['devtools'] },
      { keys: ['Ctrl', '↓'], desc: '跳到下一条请求起始行（DevTools 编辑器内）', pageKeys: ['devtools'] },
      { keys: ['Ctrl', 'L'], desc: '跳到指定行号（DevTools 编辑器内，Monaco 原生）', pageKeys: ['devtools'] },
      { keys: ['Ctrl', 'I'], desc: '索引工作区 query 编辑器补全', pageKeys: ['indices'] },
      /* 查询工作台 DSL 编辑器 Ctrl+I 补全登记（与 DevTools 历史同键第三落点；
 「有功能没人知道」防重演） */
      { keys: ['Ctrl', 'I'], desc: '查询工作台编辑器补全', pageKeys: ['search'] },
      { keys: ['Ctrl', 'S'], desc: '保存当前查询（DSL 页）/ 保存模板（模板页）', pageKeys: ['search', 'templates'] },
      { keys: ['Enter'], desc: '单行输入提交（JQ 过滤 / 连接串解析 / 检索词）' },
      /* +登记（「有功能没人知道」防重演）：
 分页器 ←/→ 翻页、聚焦面 Esc 层级退出（输入控件内先收内嵌查找） */
      { keys: ['←', '→'], desc: '分页器内翻页（焦点在分页器任一控件时，跳页输入框内为移动光标）', sep: '/' },
      { keys: ['Esc'], desc: '退出结果区聚焦全屏（Lucene/PIT/模板/DSL/DevTools；Monaco 查找栏内先收查找）', pageKeys: ['search', 'devtools', 'templates'] },
      /* 右键菜单键盘入口（模式条/候选列表）——INTERACTION.md 要求新增键盘交互同步登记 */
      { keys: ['菜单键'], desc: '查询工作台：模式条 / 字段与值候选 / 当前索引 chip 开右键菜单（↑/↓ 选择，Home/End 首末，Shift+F10 同效）', pageKeys: ['search'] },
      { keys: ['菜单键'], desc: 'Boost 调参字段行：复制 / 启停 / 删除右键菜单（Shift+F10 同效）', pageKeys: ['boost-tuner'] },
      { keys: ['菜单键'], desc: '工作台配置行：显隐 / 列宽 / 排序右键菜单（Shift+F10 同效）', pageKeys: ['workspace'] },
      { keys: ['菜单键'], desc: '配置漂移对象行：检测 / 复制 indexKey / 深链右键菜单（Shift+F10 同效）', pageKeys: ['config-drift'] },
      { keys: ['菜单键'], desc: '集群切换器连接行：切换 / 复制连接信息右键菜单（Shift+F10 同效）' },
      { keys: ['菜单键'], desc: '概览索引 / 健康 / 作业行：打开 / 复制右键菜单（Shift+F10 同效）', pageKeys: ['overview'] },
      { keys: ['菜单键'], desc: '监控屏节点卡 / 活动告警：诊断 / 定位 / 复制右键菜单（Shift+F10 同效）', pageKeys: ['live'] },
      { keys: ['菜单键'], desc: '结果卡片（alt 视图）：打开文档 / 复制 _id/JSON 右键菜单（Shift+F10 同效）' },
      { keys: ['菜单键'], desc: 'DSL 聚合桶行：下钻 / 排除 / 复制桶键右键菜单（Shift+F10 同效）', pageKeys: ['search'] },
      { keys: ['菜单键'], desc: '列表/卡片行（任务/快照/别名/索引/体检/告警/策略/模板/校验/差分行/火焰图/查询记录/设置/mapping/explain/文档差异/构建器/DevTools/检索/沙盒/打分/X 光/失败样例/诊断待办/任务树/分词 token）：打开与右键相同的行菜单（Shift+F10 同效）' },
      { keys: ['↑', '↓'], desc: '自定义列表/卡片行：聚焦行内 ↑/↓ 移动焦点，Home/End 跳首末（行内输入控件与菜单内让路）', sep: '/' },
      { keys: ['方向键'], desc: '拓扑：节点名 ↑/↓ 切换（Home/End 首末）、Enter 打开节点诊断、菜单键开节点菜单；分片格 ←/→/↑/↓ 矩阵内移动（Enter 定位）', pageKeys: ['topology'] },
      { keys: ['方向键'], desc: 'JSON 树 / Mapping 字段树 / 评分解释树：Tab 进树后 ↑/↓ 游走行，Home/End 首末，←/→ 或 Enter 收起/展开，菜单键开行菜单' },
    ],
  },
  {
    /* 组标题与行合并全站数据表格——RT/QRT 行导航（四十八/）此前从未进
 全局速查面板。desc 只写各表真实具备的语义，不做虚假宣传。
 Enter 打开文档（RT）/ Ctrl+C 复制行 JSON（RT/QRT）接入内核回调。 */
    title: '数据表格（ResultTable / QRT / 迁移作业表，先点击或 Tab 聚焦）',
    rows: [
      { keys: ['↑', '↓'], desc: '行导航（高亮行随之移动）', sep: '/' },
      { keys: ['Home', 'End'], desc: '跳到首行 / 末行', sep: '/' },
      /* Esc 补「清框选」（框选 Esc 连带清除此前未进速查面板） */
      { keys: ['Esc'], desc: '退出导航态（清勾选 / 清框选 / 收起展开 / 失焦，按表能力）' },
      { keys: ['Enter'], desc: 'RT：打开高亮行文档；迁移作业表：展开 / 收起' },
      /* F2 键盘进编辑 + Tab 跨行循环登记（此前面板无行内编辑入口） */
      { keys: ['F2'], desc: 'RT：编辑高亮行首列（双击单元格同效）' },
      { keys: ['Tab'], desc: 'RT：编辑中提交并跳下一格（行尾跨到下一行首列，Shift+Tab 反向）' },
      { keys: ['Ctrl', 'C'], desc: 'RT / QRT：复制高亮行 JSON；迁移作业表：复制作业 ID' },
      /* P0-1：结果内查找登记（此前表格本体无查找，「有功能没人知道」防重演） */
      { keys: ['Ctrl', 'F'], desc: 'RT：结果内查找（命中高亮，Enter / Shift+Enter 上下命中，Esc 关闭）' },
      /* 实现为 Delete/Backspace 双键，面板只宣传了 Del */
      { keys: ['Del', 'Backspace'], desc: 'RT：删除勾选行（仍走确认弹窗）', sep: '/' },
      /* 拖拽框选（dbx 灵魂操作）从未进速查面板——「有功能没人知道」防重演 */
      { keys: ['拖拽'], desc: 'RT：从单元格拖出框选区域 → 浮动条复制 TSV / JSON' },
      /* 双击列缘自适应（ P2-10）与行高三档钮（登记补全 */
      { keys: ['双击', '列缘'], desc: 'RT / QRT：此列适应内容（列宽自适应采样前 200 行）', sep: ' ' },
      { keys: ['双击', 'rs 柄'], desc: 'RT / QRT：重置此列宽（或列头右键/「列宽」钮批量重置）', sep: ' ' },
      /* 已实现未登记补全（ Ctrl+Z 撤销 / 列头排序语义只在 title 里） */
      { keys: ['Ctrl', 'Z'], desc: 'RT：撤销上一条待提交编辑（栈式回退，输入框内不接管）' },
      { keys: ['Shift', '点击列头'], desc: 'RT / QRT：追加/翻转次键排序（多列组合排序）' },
      /* 列头键盘菜单（colMenuKeyboard 能力）——此前未进速查面板 */
      { keys: ['菜单键'], desc: 'RT / QRT：列头打开列管理菜单（Shift+F10 同效）' },
      { keys: ['菜单键'], desc: '结果表工具行（聚焦工具条本身）：导出 / 行高 / 快照 / 列管理聚合菜单（Shift+F10 同效）' },
      { keys: ['菜单键'], desc: 'QRT 结果表：焦点行打开单元格菜单（含「用户操作…」等宿主组，Shift+F10 同效）' },
      { keys: ['菜单键'], desc: 'RT 结果表：焦点行打开单元格菜单（Shift+F10 同效）' },
    ],
  },
  {
    /* 双中心键盘导航闭环——「有功能没人知道」防重演（173 同口径登记） */
    title: '索引 / 查询双中心（先点击或 Tab 聚焦）',
    rows: [
      { keys: ['↑', '↓'], desc: '索引工作区·索引列表：浏览高亮，Enter 选中；搜索框内 ↓ 直入列表', sep: '/', pageKeys: ['indices'] },
      { keys: ['←', '→'], desc: '查询工作台·模式条：六通道间移动焦点（Enter/Space 切换）', sep: '/', pageKeys: ['search'] },
    ],
  },
  {
    title: '弹窗与面板',
    rows: [
      { keys: ['Esc'], desc: '关闭弹窗 / 取消确认 / 关闭本面板' },
      { keys: ['Tab', 'Shift+Tab'], desc: '焦点循环（不逃出弹窗）', sep: '/' },
    ],
  },
  ];
}

/* ══ ：面板内过滤 ══
 kw 按 desc/keys includes 大小写不敏感过滤（SnapshotsView filtered 同口径）；
 kw 空 = 原样全量（既有挂载渲染 spec 的 textContent 断言不受影响——MarkText 只包不改文） */
const hkKw = ref('');
const filteredGroups = computed(() => {
  const GROUPS = buildGroups();
  const k = hkKw.value.trim().toLowerCase();
  const pageVisible = (r: HkRow) => !r.pageKeys || r.pageKeys.some(key => ui.pageEnabled(key));
  return GROUPS
    .map(g => ({
      title: g.title,
      rows: g.rows.filter(r => pageVisible(r) && (!k ||
        r.desc.toLowerCase().includes(k) ||
        r.keys.some(x => x.toLowerCase().includes(k)))),
    }))
    .filter(g => g.rows.length);
});

/* 键盘契约（-A3 同款范式）：Escape 关 + Tab 焦点陷阱 */
function onKey(e: KeyboardEvent) {
  if (!props.show) return;
  if (e.key === 'Escape') { emit('close'); e.stopPropagation(); return; }
  if (panelRef.value) trapTabKey(panelRef.value, e);
}
window.addEventListener('keydown', onKey);
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<style scoped>
.hk-mask {
  position: fixed; inset: 0; z-index: var(--z-popover); background: var(--mask);
  display: flex; align-items: flex-start; justify-content: center; padding-top: 9vh;
}
.hk-panel {
  width: 560px; max-width: 94vw; max-height: 78vh; display: flex; flex-direction: column;
  background: var(--bg1); border: 1px solid var(--line-strong); border-radius: var(--r-l);
  box-shadow: var(--shadow-pop); overflow: hidden;
}
.hk-head {
  display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4);
  font-size: var(--fs-md); font-weight: 650; color: var(--tx0); border-bottom: 1px solid var(--line);
}
.hk-hint { margin-left: auto; font-size: var(--fs-xs); font-weight: 400; color: var(--tx2); }
.hk-x {
  display: flex; align-items: center; padding: var(--sp-1); margin-right: -6px;
  background: none; border: none; border-radius: var(--r-s); color: var(--tx2); cursor: pointer;
}
.hk-x:hover { color: var(--tx0); background: var(--bg3); }
.hk-body { padding: var(--sp-1h) var(--sp-4) 14px; overflow-y: auto; }
/* 过滤输入框（贴 body 顶部；.ipt 全局类打底，此处只补间距）；
 改用 SearchFilterBar —— 胶囊壳三件套与内建 Search 图标归组件单源，
 本类只留落位与字号（.sfb-i { font: inherit } 故字号自根透传），.ipt 手写皮随改用退役 */
.hk-filter { margin: var(--sp-1h) 0 var(--sp-0); font-size: var(--fs-xs); }
/* 过滤全灭独立空态（SearchTemplates「无匹配模板」同款分档防误导） */
.hk-empty { padding: 18px 0; text-align: center; font-size: var(--fs-xs); color: var(--tx2); }
.hk-group { margin-top: var(--sp-2h); }
.hk-gt { font-size: var(--fs-xs); font-weight: 650; color: var(--tx2); text-transform: uppercase; letter-spacing: .04em; padding: var(--sp-1) 0; }
.hk-row {
  display: flex; align-items: baseline; gap: 14px; padding: var(--sp-1h) 0;
  font-size: var(--fs-sm); border-bottom: 1px dashed var(--line);
}
.hk-row:last-child { border-bottom: none; }
.hk-keys { flex-shrink: 0; min-width: 132px; display: inline-flex; align-items: center; gap: 3px; flex-wrap: wrap; }
.hk-sep { color: var(--tx2); font-size: var(--fs-xs); }
.hk-desc { color: var(--tx1); line-height: 1.5; }
.kbd {
  font-family: var(--mono); font-size: var(--fs-xs); padding: 1px 5px;
  border: 1px solid var(--line-strong); border-bottom-width: 2px; border-radius: var(--r-xs);
  background: var(--bg2); color: var(--tx1); white-space: nowrap;
}
.hk-fade-enter-active, .hk-fade-leave-active { transition: opacity var(--tr); }
.hk-fade-enter-from, .hk-fade-leave-to { opacity: 0; }
</style>
