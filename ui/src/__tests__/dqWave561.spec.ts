/**
 * 五百六十一批：查询工作台 DQ 波七件源码锚（readFileSync 形态同族 dqFix552）。
 * ① Ctrl+I 编辑器补全（getEditor expose + monaco 动态 import 斩断测试导入链 + HotkeyPanel 登记）；
 * ② dq-params-tg 收起态摘要（条件数+顶层参数推导，展开态不显示）；
 * ③ 卡片视图/terms 桶行 kw 快滤（宿主侧过滤，Esc 清空）；
 * ④ 工具行 DSL→Lucene 钮（dslToLucene 直连 + CmdPalette r30 既有 lucene.q 出口）；
 * ⑤ deleteByQuery 异步化（wait_for_completion=false + taskId 引导 + api.progress 三态中文）；
 * ⑥ 文档弹窗两处 Monaco 定高接 useTierCycle（dq.docH/dq.docHNew，首档=原值零漂移）；
 * ⑦ .dq-lint-fallback 改用 theme.css .lint-bar 单源。
 * 附：LuceneInput syntaxIssues 双档升级源码锚（硬伤 error 红/软提示 warn 黄，渲染拼接口径不变）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf-8');
const dq = src('views/DslQueryView.vue');
const hotkey = src('components/HotkeyPanel.vue');
const li = src('components/LuceneInput.vue');
const theme = src('theme.css');

describe('① Ctrl+I 编辑器补全（DevTools 557 同键第三落点）', () => {
  it('getEditor expose 接线 addCommand + triggerSuggest（happy-dom stub 守卫跳过）', () => {
    expect(dq).toMatch(/watch\(monacoRef, \(mc\) => \{/);
    expect(dq).toMatch(/mc\.getEditor\?\.\(\)/);
    expect(dq).toMatch(/typeof ed\.addCommand !== 'function'\) return;/);
    expect(dq).toContain("ed.trigger('', 'editor.action.triggerSuggest', null);");
    expect(dq).toMatch(/KeyMod\.CtrlCmd \| m\.KeyCode\.KeyI/);
  });

  it('monaco 包走回调内动态 import（静态 import 会拉真 monaco 进 vi.mock 测试链——IndexHubView 先例）', () => {
    expect(dq).toContain("import('monaco-editor/esm/vs/editor/editor.api')");
    expect(dq).not.toMatch(/import \* as monaco from 'monaco-editor/);
  });

  it('HotkeyPanel「查询与编辑」组登记', () => {
    expect(hotkey).toContain("desc: '查询工作台编辑器补全'");
  });
});

describe('② dq-params-tg 收起态摘要', () => {
  it('摘要串 computed 在场（展开态返回空串=不显示；从条件数+顶层参数推导）', () => {
    expect(dq).toMatch(/const paramsSummary = computed\(\(\) => \{/);
    expect(dq).toMatch(/if \(paramsOpen\.value\) return '';/);
    expect(dq).toMatch(/paramsSummary\.value|\bparts\.push\(`条件 \$\{queryCondCount\.value\} 个`\)/);
  });

  it('模板渲染在「检索参数」钮内（收起态摘要 span，弱化档不抢主文案）', () => {
    expect(dq).toMatch(/<span v-if="paramsSummary" class="dq-params-sum mono">\{\{ paramsSummary \}\}<\/span>/);
    expect(dq).toMatch(/\.dq-params-sum \{ font-weight: 400;/);
  });
});

describe('③ 卡片视图/terms 桶行 kw 快滤（宿主侧过滤）', () => {
  it('cardsKw 过滤卡片集（_id/_source 值含子串；kw 空即全量），卡片 v-for 换 cardHits', () => {
    expect(dq).toMatch(/const cardHits = computed\(\(\) => \{/);
    /* 五百六十五批同步更新（击穿者：565 件③ alt 体改用 AltHitsViews 统一件）——卡片 v-for
       迁组件内（h in hits），宿主侧消费锚等价迁到共享件 cards 档绑定（过滤集仍 cardHits，
       「原始 resp.hits 不回流」锁意不变）；935 续加 editable 双击编辑直达（渲染数据直达矩阵），
       971 手势仲裁批退役 cards 编辑直达（双击=选词原生手势，编辑=导航条钮+抽屉显式通道） */
    expect(dq).toMatch(/<AltHitsViews view="cards" :hits="cardHits" @open-doc="openDoc" \/>/);
    expect(dq).not.toMatch(/v-for="h in resp\.hits"/);
  });

  it('cards kw 输入胞在 bar-prepend 仅卡片档在场（650 批改用 SearchFilterBar：Esc 清空内建；561 负锁翻正）', () => {
    expect(dq).toMatch(/<div v-if="view === 'cards'" class="dq-cards-kw">/);
    /* 六百五十批同步更新：SFB 改用落位（sfbUnify650 锁）——561 批「统一件归其他批次改造」预告兑现，
       「不引 SearchFilterBar」负锁翻正为在场正锁；外胞 div+计数 span 结构锁意不变 */
    expect(dq).toMatch(/<SearchFilterBar v-model="cardsKw" class="dq-cards-kw-sfb mono" input-class="dq-cards-kw-i" placeholder="过滤卡片（_id \/ 字段值）…" \/>/);
    expect(dq).toContain('SearchFilterBar');
  });

  it('terms 桶行走 termsAggsView 过滤（全空聚合节隐去），kw 输入胞 Esc 清空（650 批改用 SFB 内建）', () => {
    expect(dq).toMatch(/const termsAggsView = computed\(\(\) => \{/);
    expect(dq).toMatch(/v-for="a in termsAggsView"/);
    expect(dq).toMatch(/<SearchFilterBar v-model="aggKw" class="dq-agg-kw mono" placeholder="过滤聚合桶…" \/>/);
  });
});

describe('④ 工具行 DSL→Lucene 钮（CmdPalette r30 既有出口同线）', () => {
  it('dslToLucene 纯函数直连 + esquerystudio.lucene.q/index 会话键 + 跳 Lucene 通道', () => {
    /* 1230：出口改用 dslToLuceneDetailed（能拿到 lossy 子句名并提示用户），
       仍是同一个纯函数内核——锁「引了内核」而不是锁具体某个导出名 */
    expect(dq).toMatch(/import \{ dslToLucene(Detailed)?[, ][^}]*\} from '\.\.\/utils\/dslToLucene';/);
    expect(dq).toMatch(/function openInLucene\(\)/);
    expect(dq).toContain("writeStoredRaw(sessionStorage, 'esquerystudio.lucene.q', lucene)");
    expect(dq).toContain("writeStoredRaw(sessionStorage, 'esquerystudio.lucene.index', store.pickedIdx)");
    expect(dq).toContain("router.push({ path: '/search', query: { mode: 'lucene' } })");
    expect(dq).toMatch(/DSL 不是合法 JSON（已剥离注释后校验），无法翻译/);
    /* 1230：无法翻译的子句必须告知用户，不能静默丢条件 */
    expect(dq).toContain('无法用 query_string 表达');
  });

  it('工具行入口在场（1369 起在「更多」二级菜单里，文案 DSL → Lucene + title 出口说明）', () => {
    /* 能力零删除：钮搬进 .dq-more-pop，文案与 title 逐字保留 */
    expect(dq).toMatch(/DSL\s*(→|->)\s*Lucene/);
    expect(dq).toContain('把当前 DSL 翻译为 Lucene query_string（跳转 Lucene 通道查看/执行）');
    expect(dq, '必须在「更多」弹出层内').toContain('class="dq-more-pop"');
  });
});

describe('⑤ deleteByQuery 异步化（wait_for_completion=false + 进度三态）', () => {
  it('api.deleteByQuery 带 waitForCompletion=false；同步回落零降级', () => {
    expect(dq).toMatch(/api\.deleteByQuery\(store\.pickedIdx, cleaned, \{ waitForCompletion: 'false' \}\)/);
    expect(dq).toMatch(/`已删除 \$\{fmtNum\(r\?\.deleted\)\} 条`/);
  });

  it('taskId 引导条（data-test 查进度钮 + 一次性拉取不挂轮询 + 关闭钮）', () => {
    expect(dq).toMatch(/<div v-if="dbqTaskId" class="dq-dbq mono" role="status">/);
    expect(dq).toContain('data-test="dq-dbq-progress"');
    expect(dq).toMatch(/async function queryDbqProgress\(\)/);
    expect(dq).toMatch(/await api\.progress\(dbqTaskId\.value\)/);
    expect(dq).toMatch(/@click="dbqTaskId = ''"/);
  });

  it('三态中文（进行中 x/y / 已完成 / 查不到降级；ReindexAdvanced 557 先例同口径）', () => {
    expect(dq).toMatch(/const dbqProgText = computed\(\(\) => \{/);
    expect(dq).toContain("'查不到进度（任务可能已过期或 taskId 无效）'");
    expect(dq).toMatch(/'已完成' \+ counts/);
    expect(dq).toMatch(/'进行中' \+ counts/);
  });

  it('obsWave560 锁面保形：count 预估失败与删除失败两 catch 臂 friendlyEsError 口径不变', () => {
    expect(dq).toContain("'count 预估失败: ' + friendlyEsError(String(e?.message ?? e))");
    expect(dq).toContain("'删除失败：' + friendlyEsError(String(e?.message ?? e))");
  });
});

describe('⑥ 文档弹窗两处 Monaco 定高接 useTierCycle（dq.docH/dq.docHNew）', () => {
  it('双键落盘、首档=原值零漂移（编辑 min(60vh,420px) / 新建 min(60vh,360px)）', () => {
    expect(dq).toMatch(/useTierCycle\('dq\.docH', DOC_H_TIERS\)/);
    expect(dq).toMatch(/useTierCycle\('dq\.docHNew', DOC_NEW_H_TIERS\)/);
    expect(dq).toMatch(/const DOC_H_TIERS: string\[\] = \['min\(60vh,420px\)'/);
    expect(dq).toMatch(/const DOC_NEW_H_TIERS: string\[\] = \['min\(60vh,360px\)'/);
  });

  it('两处编辑器绑档值 + 档钮在场（title 实时回显当前档）', () => {
    /* 六百六十九批同步更新（击穿者：件B 弹窗字号档——同页同键 :font-size 复用 dqFont/dt.font
       560 约定先例，高度档值锁意图零触；本体锚 edFontModal669.spec D 段） */
    expect(dq).toContain('<MonacoEditor v-if="docEditMode" v-model="docEditText" :height="docH" :font-size="dqFont" />');
    expect(dq).toContain('<MonacoEditor v-model="newDocText" :height="docHNew" :font-size="dqFont" />');
    expect(dq).toMatch(/:title="'编辑器高度档：' \+ docH \+ '（点击循环）'"/);
    expect(dq).toMatch(/:title="'编辑器高度档：' \+ docHNew \+ '（点击循环）'"/);
  });

  it('裸定高形态不回潮（docModalHeightsAssist 负锚延续）', () => {
    expect(dq).not.toContain('height="420px"');
    expect(dq).not.toContain('height="360px"');
  });
});

describe('⑦ .dq-lint-fallback 改用 theme.css .lint-bar 单源', () => {
  it('视图侧私造壳退役，类换 lint-bar lint-bar-warn（内层 dq-lint-item 文案形态不动）', () => {
    expect(dq).toContain('class="lint-bar lint-bar-warn"');
    expect(dq).not.toContain('dq-lint-fallback');
    expect(dq).toContain('class="dq-lint-item"');
    expect(theme).toMatch(/\.lint-bar \{ display: flex; flex-direction: column;/);
    expect(theme).toMatch(/\.lint-bar-warn \{ background: var\(--warn-soft\); color: var\(--warn\); \}/);
  });
});

describe('附：LuceneInput syntaxIssues 双档升级（硬伤 error 红/软提示 warn 黄）', () => {
  it('条目形态 {msg, level}[]：括号系硬伤=error，缺查询值/未知字段=软提示 warn', () => {
    expect(li).toMatch(/type SyntaxIssue = \{ msg: string; level: 'error' \| 'warn' \}/);
    expect(li).toMatch(/const syntaxIssues = computed<SyntaxIssue\[\]>\(\(\) => \{/);
    expect(li).toMatch(/\{ msg: '括号不匹配（\(\)\[\]\{\} 配对错乱）', level: 'error' \}/);
    expect(li).toMatch(/level: 'warn' \}\);/);
  });

  it('渲染拼接口径不变（join("；") + 语法检查前缀），档色取最重档（err 类线于模板）', () => {
    expect(li).toMatch(/语法检查：\{\{ syntaxIssues\.map\(i => i\.msg\)\.join\('；'\) \}\}/);
    expect(li).toMatch(/:class="\{ err: syntaxIssues\.some\(i => i\.level === 'error'\) \}"/);
    expect(li).toMatch(/\.li-syntax\.err \{ color: var\(--err\); background: var\(--err-soft\); border-color: var\(--err-line\); \}/);
  });
});
