/**
 *  轨2（工蚁B）IndexHub 深化——六刀（源码锁）。
 *
 * ① JsonArea getEditor 转发：defineExpose 增 getEditor（MonacoEditor :931 已 expose，
 *    组件零触）——父面拿内层 Monaco 实例的统一出口，全站多宿主（AR/IH/Doc）共用，纯增量；
 * ② IndexHub query tab Ctrl+I 唤起补全：DevToolsView 557 先例逐字平移（watch(ref)+
 *    nextTick 后置取 + happy-dom stub 守卫），键经 JsonArea getEditor 转发通道；
 * ③ docs/query 两 tab cURL 快速复制：docs 档包 buildDocsDslWithSort()（源码锁钉
 *    buildDocsDsl 调用字面，原函数不改）、query 档用编辑器 DSL 原文，histCurl 手法组串，
 *    copyText 管线 + notify 反馈；
 * ④ settings/mapping 高度三档：useTierCycle('ih.settingsH'/'ih.mapH')，SettingsGrid/
 *    MappingFieldTree 均收 max-height prop（宿主侧换值零组件改动），基线档=既有写死值
 *    （52vh/50vh）零视觉迁移；档位钮落 ih-tabs 刷新钮旁（⇕ 图标，按 tab 显隐）；
 * ⑤ RawIo 取数特征跨 tab 串台修：openRawIo 加 scope 参——'query'（docs/query 四钮）只取
 *    /cluster/query，'ops'（运维行尾钮）先 /cluster/raw 后 query 双回退（552 双参由来保留）；
 *    判空 notify 文案随 scope 分档。
 * ⑥ alt 体 max-height 局部变量化（--ih-alt-cap 单点，值零变）+ query/doc 两处 JsonArea
 *    :deep 退壳（557 ST/559 先例：视图侧独立规则，组件本体零触）。
 *
 * 源码锁口径（assistLintWave533 同理由）：happy-dom 不参与 scoped <style>/Monaco 内核
 * 计算，接线形态契约落源文本最稳。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

const ja = read('../components/JsonArea.vue');
const ih = read('../views/IndexHubView.vue');

/* ═══ ① JsonArea getEditor 转发（expose 纯增量） ═══ */
describe('560 ①：JsonArea getEditor 转发', () => {
  it('转发函数双可选链（stub 静默）+ defineExpose 三出口', () => {
    expect(ja, 'getEditor 转发在场（双可选链静默形态）')
      .toContain('function getEditor() { return meRef.value?.getEditor?.(); }');
    expect(ja, 'expose 增量：focus/setMarkers 既有出口不动 + getEditor 新增')
      .toContain('defineExpose({ focus, setMarkers, getEditor })');
  });
  it('组件其余契约零触（模板/props/emits 不回流）', () => {
    expect(ja).toContain("(e: 'submit'): void;");
    expect(ja).toContain("ref=\"meRef\"");
  });
});

/* ═══ ② query tab Ctrl+I 唤起补全（DevToolsView 557 先例平移） ═══ */
describe('560 ②：IndexHub Ctrl+I 补全接线', () => {
  it('monaco 包动态 import（测试面斩链兼容）+ watch(dslJaRef)+nextTick 后置取', () => {
    /* 动态而非静态：track2Wave558 等 vi.mock MonacoEditor「斩断 monaco 导入链」的
       行为锁测试面，静态 import 会把真 monaco 拉进模块图（558 实证 5s 挂死） */
    expect(ih).toMatch(/import\('monaco-editor\/esm\/vs\/editor\/editor\.api'\)\.then\(\(m\) => \{/);
    expect(ih, '不得回潮静态 import（挂死根因）').not.toMatch(/import \* as monaco from 'monaco-editor/);
    expect(ih).toMatch(/watch\(dslJaRef, \(ja\) => \{/);
    expect(ih).toContain('const ed = ja.getEditor?.();');
  });
  it('addCommand 键位 CtrlCmd|KeyI + stub 守卫 + triggerSuggest（先例平移）', () => {
    expect(ih).toMatch(/if \(!ed \|\| typeof ed\.addCommand !== 'function'\) return;/);
    expect(ih).toContain('ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyI, () => {');
    expect(ih).toContain("ed.trigger('', 'editor.action.triggerSuggest', null);");
  });
});

/* ═══ ③ cURL 快速复制（docs/query 两 tab 工具行各一钮） ═══ */
describe('560 ③：cURL 快速复制', () => {
  it('双钮在场：Terminal 图标 + aria=复制 cURL', () => {
    expect(ih.match(/aria-label="复制 cURL"/g)?.length, 'docs/query 各一钮').toBe(2);
    expect(ih.match(/@click="copyDocsCurl"/g)?.length).toBe(1);
    expect(ih.match(/@click="copyQryCurl"/g)?.length).toBe(1);
  });
  it('docs 档组串包 buildDocsDslWithSort()（原函数不改），query 档用 DSL 原文', () => {
    expect(ih).toMatch(/function copyDocsCurl\(\) \{[^]*?buildDocsDslWithSort\(\)[^]*?copyText\(c\)/);
    expect(ih).toMatch(/function copyQryCurl\(\) \{[^]*?dsl\.value[^]*?copyText\(c\)/);
    expect(ih, '单源不动：buildDocsDslWithSort 函数体仍调 buildDocsDsl')
      .toMatch(/function buildDocsDslWithSort\(\): string \{[^]*?buildDocsDsl\(docsQ\.value/);
  });
  it('copyText 管线 + notify 反馈（histCurl 同款句式）', () => {
    expect(ih.match(/'curl 已复制'/g)?.length, 'histCurl + 两新钮共三处').toBeGreaterThanOrEqual(3);
  });
});

/* ═══ ④ settings/mapping 高度三档（useTierCycle 宿主侧换值） ═══ */
describe('560 ④：settingsH/mapH 高度档位', () => {
  it('useTierCycle 双键：基线档=既有写死值零迁移', () => {
    expect(ih).toContain("useTierCycle('ih.settingsH', ['52vh', '70vh', '86vh'], '52vh')");
    expect(ih).toContain("useTierCycle('ih.mapH', ['50vh', '70vh', '86vh'], '50vh')");
  });
  it('max-height 换绑 ref（写死值不回流）', () => {
    expect(ih).toContain(':max-height="settingsH"');
    expect(ih).toContain(':max-height="mapH"');
    expect(ih, '写死 52vh 不回流').not.toContain('max-height="52vh"');
    expect(ih, '写死 50vh 不回流').not.toContain('max-height="50vh"');
  });
  it('档位钮落 ih-tabs（⇕ 图标双钮，按 tab 显隐，cycle 接线）', () => {
    expect(ih.match(/<ArrowUpDown/g)?.length, '双钮各一枚 ⇕').toBe(2);
    expect(ih).toContain('@click="cycleSettingsH"');
    expect(ih).toContain('@click="cycleMapH"');
    expect(ih.match(/aria-label="Settings 高度档位"/g)?.length).toBe(1);
    expect(ih.match(/aria-label="Mapping 高度档位"/g)?.length).toBe(1);
  });
});

/* ═══ ⑤ RawIo 取数特征 scope 分流 ═══ */
describe('560 ⑤：openRawIo scope 分流', () => {
  it('签名加参 + ops 双回退（552 双参由来）+ query 四特征链（669 同步更新）', () => {
    /* 同步更新（击穿者：件A 特征链扩容—— DQ 侧五写路径扩容时 IH 被冻结
       备案，解冻后 query 档补齐 query→profile→update-document→delete-by-id 四特征回退；
       ops 双参/签名/调用点分流/判空分档零触；本体锚 rawIoChain669.spec A1。
       ⚠同步更新漏扫自省：669 家族快验未含本 spec（650-C3 全目录 grep 纪律执行不到位），
       全量第 5 红抓出后同步更新——同步更新扫描必须全目录 openRawIo 裸词三族锁清点） */
    expect(ih).toMatch(/function openRawIo\(scope: 'query' \| 'ops' = 'query'\) \{/);
    expect(ih).toMatch(/scope === 'ops'\s*\? \(ioRecorder\.last\('\/cluster\/raw'\) \?\? ioRecorder\.last\('\/cluster\/query'\)\)\s*: \(ioRecorder\.last\('\/cluster\/query'\)\s*\?\? ioRecorder\.last\('\/cluster\/profile'\)\s*\?\? ioRecorder\.last\('\/cluster\/update-document'\)\s*\?\? ioRecorder\.last\('\/cluster\/delete-by-id'\)\)/);
  });
  it('调用点分流：docs/query 失败行两钮传 query、ops 行钮传 ops', () => {
    /* 1357：两个 tab 的 RT 行内钮退役（与「更多 ⋯」菜单项重复）→ query 档调用点 4 → 2，
       剩下的正是**失败态常驻**两颗（检索行 / 查询行）——那才是 resp=null 时唯一的取数入口，
       本条的意图（失败态有取数入口、ops 与 query 分流）不变。 */
    expect(ih.match(/@click="openRawIo\('query'\)"/g)?.length, 'docs 检索行+query 执行行两失败态钮').toBe(2);
    expect(ih.match(/@click="openRawIo\('ops'\)"/g)?.length, 'ops 行尾钮').toBe(1);
  });
  it('判空 notify 文案随 scope 分档（不开空弹窗语义保留）', () => {
    expect(ih).toMatch(/if \(!rec\) \{ store\.notify\('info', scope === 'ops' \? '[^']+' : '[^']+'\); return; \}/);
    expect(ih).toContain('rawIoRec.value = rec;');
    expect(ih).toContain('rawIoShow.value = true;');
  });
});

/* ═══ ⑥ alt 体 cap 变量化 + 两处 :deep 退壳 ═══ */
describe('560 ⑥：--ih-alt-cap 变量化与 JsonArea :deep 退壳', () => {
  it('ih-json-wrap/ih-tree-view max-height 变量化（值零变零视觉）', () => {
    expect(ih).toContain('.ih-json-wrap { max-height: var(--ih-alt-cap, 56vh); }');
    expect(ih).toContain('.ih-tree-view { max-height: var(--ih-alt-cap, 56vh); padding: var(--sp-2); }');
    expect(ih, '注释口径保留').toMatch(/ vh 统一族/);
  });
  it('query tab fill 与 doc 编辑弹窗 fill 两处视图侧退壳（组件本体零触）', () => {
    expect(ih).toContain('.ih-dsl-wrap :deep(.ja)');
    expect(ih).toContain('.ih-doc-edit-ja :deep(.ja)');
    expect(ih).toContain('class="ih-doc-edit-ja"');
    expect(ja, 'JsonArea 组件 .ja 壳规则零触').toContain('.ja { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: var(--r-s); overflow: hidden; background: var(--bg0); }');
  });
  it('doc 弹窗高度字面零触（docModalHeightsAssist 主题不动）', () => {
    expect(ih).toContain('style="height:min(60vh,420px);display:flex"');
  });
});
