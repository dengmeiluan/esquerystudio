/**
 * 五百四十二批：分栏档位显性化+执行钮右置+直方图开关进表格头。
 * 用户产线实报：①「左右两侧互相覆盖，回不去了」——编辑器独占态还原入口只在 11px 柄上，
 * 不可发现=功能性丢失；②「执行按钮应该整体靠右，符合执行习惯」；③「直方图是否展示，
 * 应该也在表格头」——展示形式类控制（表格/JSON/Tree/卡片/直方图）全部归表格头，
 * 执行行只留执行参数（Profile/自动刷新/高度档/JQ）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const wl = readFileSync(join(__dirname, '../components/WorkbenchLayout.vue'), 'utf-8');
const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

describe('分栏档位显性化（542 批）', () => {
  it('WorkbenchLayout expose 独占状态机（宿主可读可设）', () => {
    expect(wl).toMatch(/defineExpose\(\{[\s\S]*maximizedId[\s\S]*setMaximize[\s\S]*\}\)/);
    expect(wl).toContain('function setMaximize(');
  });
  it('DslQueryView：分栏档位 seg 在工具行右段（对半/条件树/编辑器 三档点选，当前档高亮）', () => {
    expect(dq).toContain('dq-split-seg');
    for (const label of ['对半', '条件树', '编辑器']) {
      expect(dq, `档位 ${label} 在场`).toContain(label);
    }
    expect(dq).toMatch(/:class="\{ on: splitTier ===/);
    expect(dq).toContain('wlRef');
  });
});

describe('顶部三行合一（542 批第二刀，用户截图裁决「这三个应该在一行」）', () => {
  it('dq-build-hd 独立行退役：构建节头并入 dq-toolbar 单行（553 批对调同步更新：构建节头先行，场景下拉随后）', () => {
    expect(dq).not.toContain('class="dq-build-hd"');
    expect(dq).not.toMatch(/\.dq-build-hd \{/);
    /* 553 批对调后顺序：构建节头钮 → toolbar-prepend（场景条注入口）→ 模板钮，全在 dq-toolbar 内
       （用户实报「日常场景应该跟查询构建器位置换一下」，542 原序 prep→build 修订备案） */
    const tbAt = dq.indexOf('class="dq-toolbar lr-bar freeze"');
    const prepAt = dq.indexOf('<slot name="toolbar-prepend" />');
    const buildAt = dq.indexOf('dq-build-tg');
    const tplAt = dq.indexOf('> 模板</button>');
    expect(tbAt).toBeGreaterThan(-1);
    expect(buildAt).toBeGreaterThan(tbAt);
    expect(prepAt).toBeGreaterThan(buildAt);
    expect(tplAt).toBeGreaterThan(prepAt);
  });
  it('QueryHub：场景条经 #toolbar-prepend slot 注入 DSL 工具行（不再独立占行）', () => {
    const qh = readFileSync(join(__dirname, '../views/QueryHubView.vue'), 'utf-8');
    expect(qh).toMatch(/<template #toolbar-prepend>[\s\S]*qh-tasks/);
    /* 场景条原独立 strip 位置退役：qh-tasks 不再在 component 之前独立出现 */
    const slotAt = qh.indexOf('<template #toolbar-prepend>');
    const stripAt = qh.indexOf('class="qh-tasks');
    expect(stripAt).toBeGreaterThan(slotAt);
  });
  it('二刀：日常场景为 popover 下拉（点开弹任务列表，不再 inline 平铺）', () => {
    const qh = readFileSync(join(__dirname, '../views/QueryHubView.vue'), 'utf-8');
    expect(qh).toContain('qh-tasks-pop');
    expect(qh).toMatch(/<n-popover trigger="click" placement="bottom-start"[\s\S]*日常场景/);
    /* inline 展开态（v-show tasksExpanded）退役 */
    expect(qh).not.toContain('v-show="tasksExpanded"');
    expect(qh).not.toContain("tasksExpanded'");
  });
});

describe('执行钮右置（542 批）', () => {
  it('执行/取消按钮位于执行行末段（右置动线），左段为参数开关组', () => {
    const rowAt = dq.indexOf('<div class="dq-run-row">');
    const execAt = dq.indexOf('btn-run-lock');
    const cancelAt = dq.indexOf('cancelQuery');
    const jqAt = dq.indexOf('class="dq-jq"');
    expect(rowAt).toBeGreaterThan(-1);
    /* 执行/取消在行内后段（JQ 过滤之前或其后，但必须晚于左段开关组 Profile/autoHist） */
    expect(execAt).toBeGreaterThan(dq.indexOf('v-model="profileOn"'));
    /* run-end 容器右置锚 */
    expect(dq).toContain('dq-run-end');
  });
  it('二刀：执行钮是 run-end 最后一个元素（检索参数开关在执行左侧，绝对最右）', () => {
    const endAt = dq.indexOf('<div class="dq-run-end">');
    /* 五百六十一批同步更新：检索参数钮内新增收起态摘要 span（dq-params-sum）使执行钮右移
       ~100 字符，切片窗口 4000→4800（序语义不变：paramsTg < jq < runBtn 仍在 run-end 内）。
       1063 请求选项弹层插在 run-end 前部，窗口再扩到 8000（相对顺序断言不变）。 */
    const endSlice = dq.slice(endAt, endAt + 8000);
    const paramsTg = endSlice.indexOf('dq-params-tg');
    const runBtn = endSlice.indexOf('btn-run-lock');
    const jqAt = endSlice.indexOf('class="dq-jq"');
    expect(paramsTg).toBeGreaterThan(-1);
    expect(runBtn).toBeGreaterThan(jqAt); /* 执行在 JQ/应用之后 */
    expect(runBtn).toBeGreaterThan(paramsTg); /* 执行在检索参数开关之后=绝对最右 */
    /* 展开区独立于执行行（params-standalone），不再有 params-sec 外壳包钮 */
    expect(dq).toContain('dq-params-standalone');
    expect(dq).not.toContain('class="dq-params-sec"');
  });
  it('执行行 run-row 前缀段不承载直方图开关（553 四迁同步更新：开关在 run-end 段内 Profile 旁）', () => {
    const rowSlice = dq.slice(dq.indexOf('<div class="dq-run-row">'), dq.indexOf('dq-run-end'));
    expect(rowSlice).not.toContain('v-model="autoHist"');
  });
});

describe('直方图开关归宿（542 批→549 三迁→553 四迁同步更新；558 五迁同步更新：节本体改用 HistogramSection，标题锁随组件承接）', () => {
  it('553 批：开关归执行行右组 Profile 旁（用户终审「直方图按钮应该跟 Profile 按钮样式一样，位置一块」；主契约 dqHistHead549.spec）', () => {
    const runRowAt = dq.indexOf('<div class="dq-run-row">');
    const runRow = dq.slice(runRowAt, dq.indexOf('dq-params-standalone'));
    expect(runRow).toContain('v-model="autoHist"');
    expect(dq, '直方图节本体在场（558 改用统一件承接，标题在组件源）').toContain('<HistogramSection');
  });
  it('直方图分布折叠节保留在表格区（渲染区跟随开关语义不变）', () => {
    expect(dq).toContain('<HistogramSection');
    expect(dq).toContain('v-model="autoHist"');
  });
});
