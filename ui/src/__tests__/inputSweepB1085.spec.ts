/**
 * views 层裸 input 清零（B1085）：文本类输入统一收敛 TextInput。
 * 两层锁面：
 *  A. 渲染级——mount TextInput 验证 attrs 透传契约（锚类/placeholder/aria 落真实
 *     input，v-model 回写与 @input/@keydown/@keyup/@blur 透传不漂移）；
 *  B. 视图级——每个改动视图至少 1 例形态锁：TextInput + input-class 保原锚类 +
 *     placeholder/事件字面保留，且无裸 <input 残留（type=file 功能通道豁免）。
 * FavoritesView 两处 file input（导入收藏/导入偏好）是 a11y 隐藏功能通道，保留不动。
 */
import { describe, it, expect } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import TextInput from '../components/TextInput.vue';

const view = (f: string) => readFileSync(join(__dirname, '../views', f), 'utf-8');

async function settle(n = 4) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

function nativeSet(el: HTMLInputElement, tx: string) {
  const st = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  st.call(el, tx);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('B1085 · TextInput 透传契约（渲染级）', () => {
  it('锚类/placeholder/aria 落真实 input；v-model 回写与原生事件透传不漂移', async () => {
    const log: string[] = [];
    let kw = 'ab';
    const app = createApp({
      setup: () => () => h(TextInput, {
        modelValue: kw,
        'onUpdate:modelValue': (v: string) => { kw = v; log.push('update:' + v); },
        inputClass: 'inp mono rt-search',
        placeholder: '搜索响应…',
        'aria-label': '搜索响应',
        onInput: () => log.push('native-input'),
        onKeydown: (e: KeyboardEvent) => { if (e.key === 'Escape') { kw = ''; log.push('esc-clear'); } },
        onKeyup: (e: KeyboardEvent) => { if (e.key === 'Enter') log.push('keyup-enter'); },
        onBlur: () => log.push('blur'),
      }),
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    await settle();

    const inp = host.querySelector<HTMLInputElement>('input.inp.mono.rt-search')!;
    expect(inp, '皮肤锚类随 input-class 落真实 input（选择器零漂移）').toBeTruthy();
    expect(inp.placeholder).toBe('搜索响应…');
    expect(inp.getAttribute('aria-label')).toBe('搜索响应');
    expect(inp.getAttribute('spellcheck')).toBe('false');
    expect(inp.getAttribute('autocomplete')).toBe('off');

    nativeSet(inp, 'xyz');
    await settle();
    expect(kw, 'v-model 经 update:modelValue 回写').toBe('xyz');
    expect(log).toContain('update:xyz');
    expect(log, '@input 原生事件透传（与组件内建监听合并触发）').toContain('native-input');

    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(kw, '@keydown 透传宿主 Esc 清空').toBe('');
    expect(log).toContain('esc-clear');

    inp.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    inp.dispatchEvent(new FocusEvent('blur'));
    await settle();
    expect(log, '@keyup.enter / @blur 透传').toContain('keyup-enter');
    expect(log).toContain('blur');

    app.unmount();
    host.remove();
  });
});

/* 各视图形态锁：锚类不丢、placeholder/事件字面保留、无裸 input 残留（file 豁免） */
const NO_BARE_INPUT = /<input(?![^>]*type="file")[\s>]/;

describe('B1085 · 各视图收敛形态锁', () => {
  it('SearchTemplatesView：模板 ID/参数值两处收敛，锚类与事件保留', () => {
    const s = view('SearchTemplatesView.vue');
    expect(s).toMatch(/<TextInput :model-value="curId" input-class="st-id-inp"/);
    expect(s).toMatch(/@input="onIdInput" @focus="idOpenPanel" @keydown="idOnKey"/);
    expect(s).toMatch(/input-class="st-param-in"/);
    expect(s).toMatch(/:placeholder="'值（数字\/true\/JSON 自动识别）'"[^>]*@keyup\.enter="run"/);
    expect(s).not.toMatch(NO_BARE_INPUT);
  });

  it('ClusterSettingsView：Persistent/Transient 两处收敛，受控值与回写通道保留', () => {
    const s = view('ClusterSettingsView.vue');
    expect(s).toMatch(/<TextInput input-class="cs-in mono" :model-value="editP\[row\[1\]\] \?\? ''"/);
    expect(s).toMatch(/:model-value="editT\[row\[1\]\] \?\? ''"/);
    expect(s.match(/input-class="cs-in mono"/g)!, '两处设置值输入均收敛').toHaveLength(2);
    expect(s).not.toMatch(NO_BARE_INPUT);
  });

  it('HealthReportView：基准/对照两处收敛，placeholder 与 combobox 事件保留', () => {
    const s = view('HealthReportView.vue');
    expect(s).toMatch(/<TextInput input-class="hr-sel mono" :model-value="baseKw \|\| baseLabel" placeholder="选择基准报告"/);
    expect(s).toMatch(/:model-value="cmpKw \|\| cmpLabel" placeholder="选择对照报告"/);
    expect(s).toMatch(/@input="onBaseInput" @focus="openBasePanel" @keydown="baseOnKey"/);
    expect(s).not.toMatch(NO_BARE_INPUT);
  });

  it('LifecycleView：current/next step 两处收敛', () => {
    const s = view('LifecycleView.vue');
    expect(s).toMatch(/<TextInput v-model="curStep" placeholder="step 名" input-class="lc-inp-sm"/);
    expect(s).toMatch(/<TextInput v-model="nextStep" placeholder="step 名" input-class="lc-inp-sm"/);
    expect(s).not.toMatch(NO_BARE_INPUT);
  });

  it('RestView：响应搜索/JQ 两处收敛，Esc/Enter/blur 事件字面保留', () => {
    const s = view('RestView.vue');
    /* 定宽不再靠标签 class：统一件 inheritAttrs:false，标签 class 只落内层 input、落不到根容器
       （根 .ti 恒 100% 占满整行，scoped 定宽规则全部失配）——皮肤锚类仍随 input-class 留在真实 input */
    expect(s).toMatch(/<TextInput v-model="searchExpr" input-class="inp mono rt-search" placeholder="搜索响应…"/);
    expect(s).not.toMatch(/<TextInput v-model="searchExpr" class="/);
    expect(s).toMatch(/@keydown\.enter\.prevent="searchExpr\.trim\(\) && \(\$event\.shiftKey \? hitPrev\(\) : hitNext\(\)\)"/);
    expect(s).toMatch(/@keydown\.esc\.prevent="searchExpr = ''"/);
    expect(s).toMatch(/<TextInput v-model="jqExpr" input-class="inp mono rt-jq" placeholder="JQ 过滤响应（回车应用）"/);
    expect(s).not.toMatch(/<TextInput v-model="jqExpr" class="/);
    expect(s).toMatch(/@keydown\.enter="applyJq" @blur="jqCheck\(jqExpr\)" @keydown\.esc\.prevent="jqExpr = ''"/);
    expect(s).not.toMatch(NO_BARE_INPUT);
  });

  it('RestView：定宽规则落位——宽度打在输入件根容器（:has 下探锚类），高度/字号打在真实 input', () => {
    const s = view('RestView.vue');
    /* 根容器定宽：搜索框 130px；JQ 框 flex-basis 260px 可收缩到 180px（原裸 input 的两条规则等值迁移） */
    expect(s).toMatch(/\.rt-resp-bar > \.ti:has\(\.rt-search\) \{ width: 130px; \}/);
    expect(s).toMatch(/\.rt-resp-bar > \.ti:has\(\.rt-jq\) \{ flex: 0 1 260px; min-width: 180px; \}/);
    /* 内层 input：26px 高 + xs 字号，经 :deep 穿透命中（scoped 直选命不中统一件内部 input） */
    expect(s).toMatch(/\.rt-resp-bar :deep\(\.rt-search\), \.rt-resp-bar :deep\(\.rt-jq\) \{ height: 26px; font-size: var\(--fs-xs\); \}/);
    /* 旧的裸类定宽规则退役（标签 class 已去除后它们命不中任何元素） */
    expect(s).not.toMatch(/\n\.rt-(search|jq) \{/);
  });

  it('BoostTunerView：搜索词收敛，combobox aria 与 keyup 通道保留', () => {
    const s = view('BoostTunerView.vue');
    expect(s).toMatch(/<TextInput v-model="keyword" input-class="bt-kw" placeholder="输入要搜索的关键词"/);
    expect(s).toMatch(/@focus="kwOpenPanel" @input="onKwInput" @keydown="kwOnKey" @keydown\.esc\.prevent="onKwEsc"/);
    expect(s).toMatch(/@keyup\.enter="run\(true\)"/);
    expect(s).not.toMatch(NO_BARE_INPUT);
  });

  it('DiffEditorView：文档 ID 收敛，keyup.enter 通道保留', () => {
    const s = view('DiffEditorView.vue');
    expect(s).toMatch(/<TextInput v-model="id" input-class="inp" placeholder="文档 ID" @keyup\.enter="onIdEnter"/);
    expect(s).not.toMatch(NO_BARE_INPUT);
  });

  it('IlmView：策略名收敛，disabled 门控保留', () => {
    const s = view('IlmView.vue');
    expect(s).toMatch(/<TextInput v-model="policyName" input-class="inp mono" placeholder="my-ilm-policy" :disabled="!!editingName"/);
    expect(s).not.toMatch(NO_BARE_INPUT);
  });

  it('IndexHubView：抽屉索引搜索收敛，Enter/Down/Esc 三键与内衬保留', () => {
    const s = view('IndexHubView.vue');
    expect(s).toMatch(/<TextInput v-model="kwInput" input-class="inp" placeholder="搜索索引…（↓ 直入列表）" style="padding-left:26px"/);
    expect(s).toMatch(/@keydown\.enter\.prevent="onHitKey" @keydown\.down\.prevent="focusList" @keydown\.esc\.prevent="onKwEsc"/);
    expect(s).not.toMatch(NO_BARE_INPUT);
  });

  it('PitScrollView：keepAlive 为时长格式文本（5m/1h，失焦校验），收敛 TextInput 保字符串语义', () => {
    const s = view('PitScrollView.vue');
    expect(s).toMatch(/<TextInput v-model="keepAlive" input-class="pt-ii" placeholder="5m \/ 1h" @blur="keepAliveCheck\(keepAlive\)"/);
    expect(s).not.toMatch(NO_BARE_INPUT);
  });

  it('SqlConsoleView：params 参数条收敛，Esc 清空字面保留', () => {
    const s = view('SqlConsoleView.vue');
    expect(s).toMatch(/<TextInput v-model="paramsText" input-class="inp sq-param-i mono"/);
    expect(s).toMatch(/placeholder='\["宁德时代", "2026-01-01", 10\]'/);
    expect(s).toMatch(/aria-label="SQL 参数（JSON 数组，按 \? 出现顺序）"/);
    expect(s).toMatch(/@keydown\.esc\.prevent="paramsText = ''"/);
    expect(s).not.toMatch(NO_BARE_INPUT);
  });

  it('TemplatesView：新建模板名收敛，combobox 事件保留', () => {
    const s = view('TemplatesView.vue');
    expect(s).toMatch(/<TextInput :model-value="newName" placeholder="模板名（如 logs-order-\*）" input-class="tv2-input"/);
    expect(s).toMatch(/@focus="nmOpenPanel" @input="onNmInput" @keydown="nmOnKey"/);
    expect(s).not.toMatch(NO_BARE_INPUT);
  });

  it('WorkspaceView：一行 SQL 直查收敛', () => {
    const s = view('WorkspaceView.vue');
    expect(s).toMatch(/<TextInput v-model="quickSql" input-class="ws-inp"/);
    expect(s).toMatch(/@keydown\.enter="runQuickSql"/);
    expect(s).not.toMatch(NO_BARE_INPUT);
  });

  it('FavoritesView：两处 file input 为隐藏功能通道（sr-only），保留不迁移', () => {
    const s = view('FavoritesView.vue');
    const files = s.match(/<input[^>]*type="file"[^>]*>/g) ?? [];
    expect(files, '导入收藏/导入偏好两条 file 通道在场').toHaveLength(2);
    for (const f of files) expect(f).toMatch(/class="sr-only"/);
  });
});
