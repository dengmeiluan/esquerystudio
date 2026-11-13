/**
 * 五百六十一批（轨1 提示高亮工蚁A）：hintWave561 —— 红先行锁面。
 *
 *  A sqlCompletion 值位④零预载根治：冷缓存（curFields 空）走 ensureCurFields 再分派
 *    （551 批 ③分支 A3 同款 Promise 归一 + token 取消口），keyword/静态/text 三支收口
 *    dispatchValue 单函数；暖缓存维持同步快返（sqlValPos535「同步快返零请求」既有契约保形）。
 *  B ⚠范围备案（本 spec 不锁）：任务 3「date 值位补绝对日期字面」两面均因非同步更新锁回退——
 *    a) VAL_FORMAT_HINTS.date values 追加 '2026-08-01'：三处非同步更新锁击穿
 *       （sqlDateNanosTier547:109 toEqual 表锁 / sqlValPos535:153 与 hintWave557:323
 *       候选 toEqual），任何「date 值位多出一档」的变体都破其中至少一处；
 *    b) BETWEEN 特化扩 date/date_nanos 族：suggestWave551:338「非数值族 BETWEEN 不变形：
 *       date 列仍 date-math」为非同步更新语义锁，与扩档直接互斥。
 *    按 560 批 ConfigDrift 先例「不新增红灯」两面延后，解禁同步更新四锁后再约定。
 *  C LuceneInput 值位 keyword terms 精确前缀置顶（sqlCompletion 558 先例同款稳定排序；
 *    suggestWave554:252 非同步更新锁留档保绿，luceneValTiers538:63 同步更新新字面）。
 *  D role=alert 三处补齐：QueryXray tvErr 错误条 / AnalyzerLab al-err 与 al-fld-err。
 *  E jsonc.highlightDslJson：DSL 语义键 j-clause 档（键源 dslCompletionContext 既有导出
 *    只读 import，单源不重复造表）+ theme.css .j-clause 色档 + BoostTuner/SearchSandbox
 *    两消费面改用（span 包裹不改 textContent，boostMgmt525:112 / sandboxHlSafe500 兼容）。
 *  F LuceneQueryView 架构分析/执行两钮动态 title（479 禁用原因契约保留在 else 支）。
 *  G ensureCurFields 去 void 包装直返 Promise（SqlConsole/SqlBridge）+ toast 裸串并轨
 *    friendlyEsError + errPreHtml 双参改用（xm-err 549 范式）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setActivePinia, createPinia } from 'pinia';
import { ensureSqlCompletion, type SqlCompletionCtx } from '../utils/sqlCompletion';
import { api } from '../api';

const SRC = join(__dirname, '..');
const read = (f: string) => readFileSync(join(SRC, f), 'utf-8');

/* ═══ provider 最小 fake（sqlValPos535/hintWave560 同范式，零挂载） ═══ */
type Provider = { provideCompletionItems: (model: any, position: any, context?: any, token?: any) => any };

function makeMonaco() {
  const providers: Record<string, Provider[]> = {};
  return {
    providers,
    api: {
      languages: {
        registerCompletionItemProvider: (_lang: string, p: Provider) => {
          (providers[_lang] ||= []).push(p);
          return { dispose: () => {} };
        },
        CompletionItemKind: { Field: 'Field', Property: 'Property', Value: 'Value' },
      },
    },
  };
}
const FIELDS = [
  { path: 'name', type: 'keyword' },
  { path: 'created', type: 'date' },
  { path: 'ts', type: 'date_nanos' },
  { path: 'amount', type: 'double' },
];
function fakeModel(text: string) {
  return {
    getValue: () => text,
    getOffsetAt: () => text.length,
    getWordUntilPosition: () => ({ startColumn: 1, endColumn: 1, word: '' }),
  };
}
function sqlProvider(m: ReturnType<typeof makeMonaco>): Provider {
  const arr = m.providers.sql;
  expect(arr, 'sql 语言 provider 必须已注册').toBeTruthy();
  return arr![arr!.length - 1];
}
const labelsOf = (r: any) => (r.suggestions as any[]).map((s: any) => s.label);

beforeEach(() => { setActivePinia(createPinia()); });

/* ═══ A：值位④冷缓存零预载根治 ═══ */
describe('561 A：sqlCompletion 值位④冷缓存 ensure 分派', () => {
  it('冷缓存（curFields 空）首轮即出候选：ensureCurFields 被调、await 后 date 静态档在手', async () => {
    const m = makeMonaco();
    let loaded = false;
    let ensureCalls = 0;
    const h = ensureSqlCompletion(m.api as any, () => ({
      indices: () => [{ index: 'orders' }],
      pickedIdx: () => 'orders',
      curFields: () => (loaded ? FIELDS : []),
      ensureCurFields: () => { ensureCalls++; loaded = true; },
    }));
    try {
      const before = "SELECT * FROM orders WHERE created >= '";
      const r = await sqlProvider(m).provideCompletionItems(fakeModel(before), { lineNumber: 1 });
      expect(ensureCalls, '冷缓存必须触发预载（④零预载病灶根治）').toBeGreaterThan(0);
      expect(labelsOf(r), 'ensure 到位后同轮回填（551 ③A3 同款首轮即出）').toEqual(['now-1d/d', 'now-1h/h']);
    } finally { h.dispose(); }
  });

  it('冷缓存 + ensureCurFields 返回 Promise（任务②新契约）：await 真异步到位后分派', async () => {
    const m = makeMonaco();
    let loaded = false;
    const h = ensureSqlCompletion(m.api as any, () => ({
      indices: () => [{ index: 'orders' }],
      pickedIdx: () => 'orders',
      curFields: () => (loaded ? FIELDS : []),
      ensureCurFields: () => new Promise<void>(res => { setTimeout(() => { loaded = true; res(); }, 5); }),
    }));
    try {
      const before = "SELECT * FROM orders WHERE created >= '";
      const p = sqlProvider(m).provideCompletionItems(fakeModel(before), { lineNumber: 1 });
      expect(p, '冷缓存路径返回 Promise').toBeInstanceOf(Promise);
      const r = await p;
      expect(labelsOf(r)).toEqual(['now-1d/d', 'now-1h/h']);
    } finally { h.dispose(); }
  });

  it('冷缓存 + token 取消：弃迟到回填（对齐 ③分支 551 A3 同款取消口）', async () => {
    const m = makeMonaco();
    let loaded = false;
    const h = ensureSqlCompletion(m.api as any, () => ({
      indices: () => [{ index: 'orders' }],
      pickedIdx: () => 'orders',
      curFields: () => (loaded ? FIELDS : []),
      ensureCurFields: () => { loaded = true; },
    }));
    try {
      const before = "SELECT * FROM orders WHERE created >= '";
      const r = await sqlProvider(m).provideCompletionItems(
        fakeModel(before), { lineNumber: 1 }, undefined, { isCancellationRequested: true });
      expect(r.suggestions, '取消后不得回填').toEqual([]);
    } finally { h.dispose(); }
  });

  it('暖缓存同步快返保形：不走 Promise、不重复触发 ensure（sqlValPos535 同步断言兼容锚）', () => {
    const m = makeMonaco();
    let ensureCalls = 0;
    const h = ensureSqlCompletion(m.api as any, () => ({
      indices: () => [{ index: 'orders' }],
      pickedIdx: () => 'orders',
      curFields: () => FIELDS,
      ensureCurFields: () => { ensureCalls++; },
    }));
    try {
      const before = "SELECT * FROM orders WHERE created >= '";
      const r: any = sqlProvider(m).provideCompletionItems(fakeModel(before), { lineNumber: 1 });
      expect(r.suggestions, '暖缓存同步快返（静态档既有契约）').toBeTruthy();
      expect(labelsOf(r)).toEqual(['now-1d/d', 'now-1h/h']);
      expect(ensureCalls, '暖缓存不再触发 ensure').toBe(0);
    } finally { h.dispose(); }
  });
});

/* ═══ C：LuceneInput 值位精确前缀置顶（源锚：554 锁行同步更新后新字面） ═══ */
describe('561 C：LuceneInput keyword 值位精确前缀置顶', () => {
  it('filter 后接稳定排序（sqlCompletion 558 先例同款字面）在場', () => {
    const li = read('components/LuceneInput.vue');
    expect(li).toContain('if (AGG_KEYWORD_TYPES.includes(t)) return suggestions.value.filter(v => !p || v.toLowerCase().startsWith(p)).sort((a, b) => Number(b.toLowerCase() === p) - Number(a.toLowerCase() === p)).map(withSegs);');
  });
});

/* ═══ D：role=alert 三处补齐 ═══ */
describe('561 D：role=alert 补齐（QueryXray tvErr / AnalyzerLab 两处）', () => {
  it('QueryXrayView tvErr 错误条挂 role=alert', () => {
    const qx = read('views/QueryXrayView.vue');
    expect(qx).toContain('<div v-if="tvErr" role="alert" class="qx-verdict bad">');
  });

  it('AnalyzerLabView al-err 与 al-fld-err 各挂 role=alert（类名/CSS 零触，flattenWave546 锚保形）', () => {
    const al = read('views/AnalyzerLabView.vue');
    expect(al).toContain('<div v-if="l.err" role="alert" class="al-err">');
    expect(al).toContain('<div v-else-if="fieldsError" role="alert" class="al-fld-err">');
    expect(al, 'al-fld-err 类字面与 CSS 串零触（flattenWave546:73-78）')
      .toContain('class="al-fld-err"');
  });
});

/* ═══ E：highlightDslJson + j-clause ═══ */
describe('561 E：jsonc.highlightDslJson（DSL 语义键 j-clause 档）', () => {
  it('DSL 语义键出 j-clause、普通键维持 j-key、j-str/j-num 基档保留、转义安全', async () => {
    const { highlightDslJson, highlightJson } = await import('../utils/jsonc');
    const html = highlightDslJson('{"query": {"bool": {"must": [{"term": {"status": "ACTIVE"}}]}}, "size": 10, "custom_key": "v"}');
    expect(html).toContain('<span class="j-clause">"query":</span>');
    expect(html).toContain('<span class="j-clause">"bool":</span>');
    expect(html).toContain('<span class="j-clause">"must":</span>');
    expect(html).toContain('<span class="j-clause">"term":</span>');
    expect(html).toContain('<span class="j-clause">"size":</span>');
    expect(html, '词表外键维持 j-key').toContain('<span class="j-key">"custom_key":</span>');
    expect(html, 'j-str 基档保留').toContain('<span class="j-str">"ACTIVE"</span>');
    expect(html, 'j-num 基档保留').toContain('<span class="j-num">10</span>');
    /* 对照：语法遍 highlightJson 无 j-clause（语义遍是 highlightDslJson 增量） */
    expect(highlightJson('{"query": 1}')).not.toContain('j-clause');
    expect(highlightDslJson('<script>')).not.toContain('<script>');
  });

  it('键源单源：jsonc 只读 import dslCompletionContext 既有导出，不硬编重复表', () => {
    const jsonc = read('utils/jsonc.ts');
    expect(jsonc).toMatch(/from '\.\/dslCompletionContext'/);
  });

  it('theme.css .j-clause 色档在场（与 j-key 区分度，semanticTiers500 只增不删兼容）', () => {
    const theme = read('theme.css');
    expect(theme).toContain('.j-clause');
    expect(theme).toContain('.j-key { color: #93c5fd; }');
    expect(theme).toContain('.j-str { color: #86efac; }');
    expect(theme).toContain('.j-num { color: #fbbf24; }');
    expect(theme).toContain('.j-bool { color: #f472b6; }');
  });

  it('两消费面改用：BoostTuner bt-dsl 与 SearchSandbox raw 面走 highlightDslJson', () => {
    const bt = read('views/BoostTunerView.vue');
    const sb = read('views/SearchSandboxView.vue');
    expect(bt).toContain("import { highlightDslJson } from '../utils/jsonc';");
    expect(bt).toContain('highlightDslJson(JSON.stringify(builtQuery.value, null, 2))');
    expect(sb).toContain("import { highlightDslJson } from '../utils/jsonc';");
    expect(sb).toContain('highlightDslJson(JSON.stringify(response.value, null, 2))');
  });
});

/* ═══ F：LuceneQueryView 两钮动态 title ═══ */
describe('561 F：LuceneQueryView 架构分析/执行钮动态 title（479 禁用原因在 else 支）', () => {
  it('字段体检钮：index 在場出功能描述、缺索引保留「请先选择索引」', () => {
    const v = read('views/LuceneQueryView.vue');
    expect(v).toContain('<button class="btn ghost sm" :title="index ? \'探测当前索引字段，提前提醒 SQL 失能字段（在 Lucene 里不受影响）\' : \'请先选择索引\'" @click="doSchema"');
  });

  it('执行钮：双条件（索引+查询词）齐出功能描述，否则保留 479 禁用原因原文', () => {
    const v = read('views/LuceneQueryView.vue');
    expect(v).toContain('<button class="btn primary sm" :title="index && qs.trim() ? \'执行 Lucene 查询\' : \'请先选择索引并输入查询语句\'" @click="doRun"');
  });
});

/* ═══ G：ensureCurFields 去 void + toast 并轨 + errPreHtml 双参 ═══ */
describe('561 G：契约与错误通道收口', () => {
  it('ensureCurFields 直返 Promise（契约 void|Promise<void> 的 Promise 半边）', () => {
    const sq = read('views/SqlConsoleView.vue');
    const br = read('views/SqlBridgeView.vue');
    expect(sq).toContain('ensureCurFields: () => sqlFieldsCtx.ensure(),');
    expect(br).toContain('ensureCurFields: () => curFieldsCtx.ensure(),');
    expect(sq).not.toContain('ensureCurFields: () => { void');
    expect(br).not.toContain('ensureCurFields: () => { void');
  });

  it('SqlConsole 五处 toast + SqlBridge 一处并轨 friendlyEsError（obsWave560 FFE 范式）', () => {
    const sq = read('views/SqlConsoleView.vue');
    const br = read('views/SqlBridgeView.vue');
    for (const head of ['SQL 执行失败：', '字段体检失败：', '分页失败：', '关闭失败：', 'translate 失败：']) {
      expect(sq).toContain(`'${head}' + friendlyEsError(String(e?.message ?? e))`);
    }
    expect(br).toContain(`'转换失败：' + friendlyEsError(String(e?.message ?? e))`);
  });

  it('errPreHtml 双参改用：SqlBridge convErrRaw 旁路 + QueryXray ex.error 双参（xm-err 549 范式）', () => {
    const br = read('views/SqlBridgeView.vue');
    const qx = read('views/QueryXrayView.vue');
    expect(br).toMatch(/v-html="errPreHtml\(convErr, errMeta\(convErrRaw\)\)"/);
    expect(br).toContain('const convErrRaw = ref<unknown>(null);');
    expect(br).toMatch(/convErrRaw\.value = e;/);
    expect(qx).toMatch(/v-html="errPreHtml\(ex\.error \|\| '-', errMeta\(ex\)\)"/);
  });

  /* 561 批备案:SearchSandboxView .ss-err 合并 err-bar 系并行 lane 在途件, HOLD,解禁后随 class="err-bar ss-err" 断言回补（ss-err-pre 锚在 layoutOcclusionGuard501 既有锁面,无同步更新需要） */
});
