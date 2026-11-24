/* 审编步校验报告「一键移除」交互看守。
 *
 * issue.fix = {action: REMOVE_SETTING, key}（服务端 UNKNOWN_SETTING_KEY 与 dry-run
 * unknown setting 两产生点）→ 报告行渲染「一键移除」钮 → askConfirm 确认门 →
 * removeSettingKey 落到审编框 settings → 提示重新校验。取消确认则原文不动。
 * 行为走真挂载（adhocProgressUi565 同款基建）。 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  adhocJobs: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      keys: async () => [],
      clustersList: async () => [],
      clusterIndices: async () => [],
      overview: async () => ({}),
      clusterHealth: async () => ({}),
      adhoc: { ...orig.api.adhoc, jobs: mocks.adhocJobs },
    },
  };
});

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useAppStore } from '../stores/app';
import { resolveConfirm } from '../composables/confirm';
import AdhocRebuildView from '../views/AdhocRebuildView.vue';

const settle = async (n = 12) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const K = (f: string) => 'esquerystudio.draft2:adhoc:host:-:-:' + f;

const REPORT_WITH_FIX = {
  report: {
    valid: false, dryRunExecuted: true, dryRunPassed: false,
    errorCount: 1, warnCount: 0, infoCount: 0, elapsedMs: 49,
    issues: [{
      layer: 'DRYRUN', severity: 'ERROR', code: 'ILLEGAL_ARGUMENT_EXCEPTION', path: '',
      message: 'ES 服务端拒绝：unknown setting [index.replication.type] please check',
      suggestion: '检查 settings 键拼写；自定义配置不能放在 settings 里',
      fix: { action: 'REMOVE_SETTING', key: 'replication.type' },
    }],
  },
};

async function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp({ render: () => h(AdhocRebuildView) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, store: useAppStore(pinia) };
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem(K('step'), '1');
  mocks.adhocJobs.mockReset();
  mocks.adhocJobs.mockResolvedValue([]);
});

describe('审编步报告「一键移除」', () => {
  it('确认通过 → settings 中该键被移除，其余保留', async () => {
    sessionStorage.setItem(K('settings'), '{"index":{"replication":{"type":"segment"},"number_of_shards":"5"}}');
    sessionStorage.setItem(K('val-report'), JSON.stringify(REPORT_WITH_FIX));
    const { app, host } = await mountView();

    const btn = host.querySelector('[data-test="ar-fix-remove"]') as HTMLButtonElement;
    expect(btn, '带 fix 的 issue 行必须渲染一键移除钮').toBeTruthy();
    btn.click();
    await settle(2);
    resolveConfirm(true); /* 确认门：用户点「确认移除」 */
    await settle();

    const stored = sessionStorage.getItem(K('settings')) || '';
    expect(stored, 'replication 子树应被移除').not.toContain('replication');
    expect(stored, '其余键保留').toContain('number_of_shards');
    app.unmount();
  });

  it('确认取消 → 原文一字不动', async () => {
    const orig = '{"index":{"replication":{"type":"segment"},"number_of_shards":"5"}}';
    sessionStorage.setItem(K('settings'), orig);
    sessionStorage.setItem(K('val-report'), JSON.stringify(REPORT_WITH_FIX));
    const { app, host } = await mountView();

    (host.querySelector('[data-test="ar-fix-remove"]') as HTMLButtonElement).click();
    await settle(2);
    resolveConfirm(false);
    await settle();
    expect(sessionStorage.getItem(K('settings'))).toBe(orig);
    app.unmount();
  });

  it('无 fix 的 issue 行不渲染该钮', async () => {
    sessionStorage.setItem(K('settings'), '{"index":{"number_of_shards":"5"}}');
    sessionStorage.setItem(K('val-report'), JSON.stringify({
      report: { valid: true, dryRunExecuted: true, dryRunPassed: true, errorCount: 0, warnCount: 1, infoCount: 0, elapsedMs: 3,
        issues: [{ layer: 'ADVISOR', severity: 'WARN', code: 'SHARDS_MANY', path: 'settings.number_of_shards', message: '分片数 5' }] },
    }));
    const { app, host } = await mountView();
    expect(host.querySelector('[data-test="ar-fix-remove"]')).toBeNull();
    app.unmount();
  });
});

describe('审编步报告「一键补充」（ADD_SETTING）', () => {
  const REPORT_NGRAM = {
    report: {
      valid: false, dryRunExecuted: true, dryRunPassed: false,
      errorCount: 1, warnCount: 0, infoCount: 0, elapsedMs: 149,
      issues: [{
        layer: 'DRYRUN', severity: 'ERROR', code: 'ILLEGAL_ARGUMENT_EXCEPTION', path: '',
        message: 'ES 服务端拒绝：The difference between max_gram and min_gram in NGram Tokenizer must be less than or equal to: [1] but was [39]. This limit can be set by changing the [index.max_ngram_diff] index level setting.',
        suggestion: '源索引带着这个限制键建成，粘贴/手写的 settings 把它丢了——点「一键补充」加回，或人工核对键值',
        fix: { action: 'ADD_SETTING', key: 'max_ngram_diff', value: '39' },
      }],
    },
  };

  it('确认通过 → settings 补充该键（值取错误文本的实际差值），其余保留', async () => {
    sessionStorage.setItem(K('settings'), '{"index":{"number_of_shards":5,"analysis":{"analyzer":{}}}}');
    sessionStorage.setItem(K('val-report'), JSON.stringify(REPORT_NGRAM));
    const { app, host, store } = await mountView();

    const btn = host.querySelector('[data-test="ar-fix-add"]') as HTMLButtonElement;
    expect(btn, 'ngram 限制错误行必须渲染一键补充钮').toBeTruthy();
    btn.click();
    await settle(2);
    resolveConfirm(true);
    await settle();

    const stored = JSON.parse(sessionStorage.getItem(K('settings')) || '{}');
    expect(stored.index.max_ngram_diff, '补充键+建议值').toBe(39);
    expect(stored.index.number_of_shards, '其余键保留').toBe(5);
    expect(store.notifyLog.some((n: any) => String(n.msg).includes('已补充'))).toBe(true);
    app.unmount();
  });

  it('确认取消 → 原文一字不动', async () => {
    const orig = '{"index":{"number_of_shards":5}}';
    sessionStorage.setItem(K('settings'), orig);
    sessionStorage.setItem(K('val-report'), JSON.stringify(REPORT_NGRAM));
    const { app, host } = await mountView();

    (host.querySelector('[data-test="ar-fix-add"]') as HTMLButtonElement).click();
    await settle(2);
    resolveConfirm(false);
    await settle();
    expect(sessionStorage.getItem(K('settings'))).toBe(orig);
    app.unmount();
  });

  it('fix 缺 value → 不改写 settings，提示人工确认键值', async () => {
    sessionStorage.setItem(K('settings'), '{"index":{}}');
    const noValue = JSON.parse(JSON.stringify(REPORT_NGRAM));
    delete noValue.report.issues[0].fix.value;
    sessionStorage.setItem(K('val-report'), JSON.stringify(noValue));
    const { app, host, store } = await mountView();

    (host.querySelector('[data-test="ar-fix-add"]') as HTMLButtonElement).click();
    await settle();
    expect(sessionStorage.getItem(K('settings'))).toBe('{"index":{}}');
    expect(store.notifyLog.some((n: any) => String(n.msg).includes('人工确认'))).toBe(true);
    app.unmount();
  });
});

describe('报告区去廉价化：报告头 pill 化 + issue 行 code chip + fix 键 chip 上屏', () => {
  /* ADD_SETTING 样例（上方「一键补充」describe 同款，本地作用域复制） */
  const NGRAM_REPORT = {
    report: {
      valid: false, dryRunExecuted: true, dryRunPassed: false,
      errorCount: 1, warnCount: 0, infoCount: 0, elapsedMs: 149,
      issues: [{
        layer: 'DRYRUN', severity: 'ERROR', code: 'ILLEGAL_ARGUMENT_EXCEPTION', path: '',
        message: 'ES 服务端拒绝：ngram diff 超限',
        fix: { action: 'ADD_SETTING', key: 'max_ngram_diff', value: '39' },
      }],
    },
  };

  it('报告头三件套：主徽章 StatusPill（失败=r「配置存在问题」）+ 计数小 pill（0 值档不渲染）+ TookBadge', async () => {
    sessionStorage.setItem(K('settings'), '{"index":{"replication":{"type":"segment"}}}');
    sessionStorage.setItem(K('val-report'), JSON.stringify(REPORT_WITH_FIX));
    const { app, host } = await mountView();

    const hd = host.querySelector('.val-hd')!;
    expect(hd, '报告头在场').toBeTruthy();
    const rPills = [...hd.querySelectorAll('.pill.r')];
    expect(rPills.length, '失败主徽章+错误计数各一枚 r 档 pill').toBe(2);
    expect(rPills[0]!.textContent, '主徽章文案').toContain('配置存在问题');
    expect(rPills[1]!.textContent, '计数 pill「1 错误」在场').toContain('1 错误');
    expect(hd.querySelector('.pill.y'), 'warnCount=0 档不渲染').toBeNull();
    expect(hd.querySelector('.pill.b'), 'infoCount=0 档不渲染').toBeNull();
    expect(hd.querySelector('.took-badge'), '耗时徽章（TookBadge）在场').toBeTruthy();
    expect(hd.textContent).toContain('Dry-run 实测于：');
    app.unmount();
  });

  it('issue 行错误码/路径为 <code> chip（吃全局 code 档），fix 键 chip 紧贴修复钮前可见', async () => {
    sessionStorage.setItem(K('settings'), '{"index":{}}');
    sessionStorage.setItem(K('val-report'), JSON.stringify(NGRAM_REPORT));
    const { app, host } = await mountView();

    const iss = host.querySelector('.val-iss')!;
    expect(iss, 'issue 行在场').toBeTruthy();
    const code = iss.querySelector('code.val-code');
    expect(code, '错误码为 code 元素（chip 皮吃全局档）').toBeTruthy();
    expect(code!.textContent).toContain('ILLEGAL_ARGUMENT_EXCEPTION');
    const btn = iss.querySelector('[data-test="ar-fix-add"]') as HTMLButtonElement;
    expect(btn, '一键补充钮在场').toBeTruthy();
    /* 修复目标键从 title-only 升为按钮旁 code chip：key=value 一并上屏 */
    const fixChip = btn!.previousElementSibling;
    expect(fixChip?.tagName).toBe('CODE');
    expect(fixChip!.textContent).toContain('max_ngram_diff=39');
    app.unmount();
  });

  it('REMOVE 档 fix 键 chip 只显键名（不带 =value）', async () => {
    sessionStorage.setItem(K('settings'), '{"index":{"replication":{"type":"segment"}}}');
    sessionStorage.setItem(K('val-report'), JSON.stringify(REPORT_WITH_FIX));
    const { app, host } = await mountView();

    const btn = host.querySelector('[data-test="ar-fix-remove"]') as HTMLButtonElement;
    const fixChip = btn!.previousElementSibling;
    expect(fixChip?.tagName).toBe('CODE');
    expect(fixChip!.textContent).toContain('replication.type');
    expect(fixChip!.textContent).not.toContain('=');
    app.unmount();
  });
});
