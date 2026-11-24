/* 存储通道写入防御看守（852 批·851 读侧 readStoredJson 约定的写侧对称件）。
 *
 * 病灶家族：共享内核层 localStorage/sessionStorage 的 setItem/removeItem 裸写——
 * 隐私模式/配额满（QuotaExceededError）即抛，高频交互链当场断链：选索引
 * （app.pick）、切集群（app.setTarget / api.setTargetId）、登录 token（api.setToken）、
 * 主题与设置保存（app.setTheme/saveSettings）、表格内核调节（useTablePrefs 13 位点）、
 * 收藏回放跳转（favReplay 14 位点）、chunk 自愈标记（router）。852 实勘 55 位点/
 * 9 文件，统一走 utils/safeJson writeStoredRaw/removeStoredRaw 单源（try+吞异常+
 * 回执布尔——存储不可用 ≠ 功能不可用，内存态照常可用）。
 *
 * ── 断言口径 ─────────────────────────────────────────────────
 * W 组：行为锁——配额抛写环境下内核写路径零抛、内存态照常推进（七链抽针：
 *       单源单元 + app/useTablePrefs/usePagerSize/vars/api/favReplay）。
 * G 组：全站看守——kernel 层（composables/stores/utils + api.ts + router.ts）
 *       裸写文件集合恒零（原 11 文件正面清单已随 854 批合并清零、豁免面
 *       退役）；九矿文件裸写恒零 + 单源接线在场；新 kernel 文件不得引入。
 *       视图/组件层 89 位点/32 文件已随 853 批合并单源，看守由
 *       viewStorageGuard853 G3（views/components 裸写恒零）承接；
 *       kernel 残量 11 文件 18 位点已随 854 批合并，看守由
 *       kernelStorageGuard854 G 组（kernel 裸写恒零+W 组四链行为锁）承接。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ref } from 'vue';
import { writeStoredRaw, removeStoredRaw } from '../utils/safeJson';
import { useAppStore } from '../stores/app';
import { useTablePrefs } from '../composables/useTablePrefs';
import { writePagerSize } from '../composables/usePagerSize';
import { saveVars } from '../utils/vars';
import { setToken, clearToken, setTargetId } from '../api';
import { replayFavorite } from '../utils/favReplay';
import type { Router } from 'vue-router';

const srcDir = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(srcDir, rel), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const RAW_OP = /(localStorage|sessionStorage)\.(setItem|removeItem)\(/;

/* 配额抛写环境：setItem/removeItem 一律抛（模拟隐私模式/配额满）。
 * 852 探针课两则：①happy-dom 下 Storage.prototype spy 不经实例分发（原型 patch
 * 不拦截），须 spy 实例自身属性——双实例四通道同上膛；②vitest4 restoreAllMocks
 * 对本环境实例 spy 不还原（W1 的 mock 会泄漏进 W2 种子写），须持引用逐个
 * mockRestore（afterEach 显式拆膛）。 */
let quotaSpies: Array<{ mockRestore: () => void }> = [];
function armQuotaFailure() {
  quotaSpies = [];
  for (const st of [localStorage, sessionStorage] as const) {
    quotaSpies.push(
      vi.spyOn(st, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError (simulated)');
      }),
      vi.spyOn(st, 'removeItem').mockImplementation(() => {
        throw new Error('QuotaExceededError (simulated)');
      }),
    );
  }
}

const MINE_FILES = [
  'stores/app.ts',
  'composables/useTablePrefs.ts',
  'utils/favReplay.ts',
  'composables/tableSort.ts',
  'api.ts',
  'router.ts',
  'composables/usePagerSize.ts',
  'composables/useAggRow.ts',
  'utils/vars.ts',
];

/* 已护正面清单（852 时点实勘 11 文件 try 在册）——854 批已全部合并
 * writeStoredRaw/removeStoredRaw 单源（剥壳 15+保壳换芯 1+直换 2），清单清零、
 * 豁免面退役：下方 G2 断言语义随之升格为「kernel 层裸写文件集合恒零」，看守
 * 由 kernelStorageGuard854 G 组常驻承接（W 组行为锁四链抽针同在彼处）。 */
const FROZEN_GUARDED: string[] = [];

describe('storageWriteGuard852 · 存储通道写入防御', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    quotaSpies.forEach((s) => s.mockRestore());
    quotaSpies = [];
    vi.restoreAllMocks();
  });

  /* —— W 组：行为锁 —— */

  it('W1 writeStoredRaw 成功回执 true，配额抛写回执 false 且不外抛', () => {
    expect(writeStoredRaw(localStorage, 'w1key', 'v')).toBe(true);
    expect(localStorage.getItem('w1key')).toBe('v');
    armQuotaFailure();
    expect(writeStoredRaw(localStorage, 'w1key', 'v2')).toBe(false);
  });

  it('W2 removeStoredRaw 成功回执 true，配额抛写回执 false 且不外抛', () => {
    localStorage.setItem('w2key', 'v');
    expect(removeStoredRaw(localStorage, 'w2key')).toBe(true);
    armQuotaFailure();
    expect(removeStoredRaw(localStorage, 'w2key')).toBe(false);
  });

  it('W3 app.pick 配额抛写下不外抛，内存态照常推进', () => {
    const store = useAppStore();
    armQuotaFailure();
    expect(() => store.pick('idx-quota')).not.toThrow();
    expect(store.pickedIdx).toBe('idx-quota');
  });

  it('W4 useTablePrefs 行高/密度调节配额抛写下不外抛，档位照常切', () => {
    const dimension = ref('idx-a');
    const allCols = ref<string[]>(['c1', 'c2']);
    const prefs = useTablePrefs(dimension, allCols);
    armQuotaFailure();
    expect(() => prefs.setRowH('cozy')).not.toThrow();
    expect(prefs.rowH.value).toBe('cozy');
    expect(() => prefs.cycleRowH()).not.toThrow();
  });

  it('W5 writePagerSize 配额抛写下不外抛', () => {
    armQuotaFailure();
    expect(() => writePagerSize(50)).not.toThrow();
  });

  it('W6 saveVars 配额抛写下不外抛', () => {
    armQuotaFailure();
    expect(() => saveVars({ host: '127.0.0.1:9200' })).not.toThrow();
  });

  it('W7 api token/target 写清配额抛写下不外抛', () => {
    armQuotaFailure();
    expect(() => setToken('t-852')).not.toThrow();
    expect(() => setTargetId('conn-852')).not.toThrow();
    expect(() => clearToken()).not.toThrow();
  });

  it('W8 收藏回放（dsl carry 链）配额抛写下不外抛，跳转仍发生', () => {
    const push = vi.fn();
    const router = { push } as unknown as Router;
    const notify = vi.fn();
    armQuotaFailure();
    expect(() =>
      replayFavorite({ kind: 'dsl', payload: 'GET _search\n{"query":{"match_all":{}}}' }, router, notify),
    ).not.toThrow();
    expect(push).toHaveBeenCalled();
  });

  /* —— G 组：全站看守 —— */

  it('G1 九矿文件裸写恒零 + writeStoredRaw 单源接线在场', () => {
    for (const f of MINE_FILES) {
      const code = stripComments(read(f));
      const lines = code.split('\n');
      const dirty = lines
        .map((ln, i) => (RAW_OP.test(ln) ? `${f}:${i + 1}` : ''))
        .filter(Boolean);
      expect(dirty, `${f} 裸写复燃：\n${dirty.join('\n')}`).toEqual([]);
      expect(code, `${f} 缺 writeStoredRaw 接线`).toContain('writeStoredRaw(');
    }
  });

  it('G2 kernel 层裸写文件集合冻结在已护正面清单内（新文件禁引入）', () => {
    const isKernel = (rel: string) =>
      /^(composables|stores|utils)\//.test(rel) || rel === 'api.ts' || rel === 'router.ts';
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        const st = statSync(p);
        if (st.isDirectory()) { if (f !== '__tests__') walk(p); }
        else if (/\.(ts|vue)$/.test(f)) files.push(p);
      }
    };
    walk(srcDir);
    const rawFiles = new Set(
      files
        .map((p) => p.replace(/\\/g, '/').split('/src/').pop() as string)
        .filter((rel) => isKernel(rel) && RAW_OP.test(stripComments(readFileSync(join(srcDir, rel), 'utf8')))),
    );
    const strangers = [...rawFiles].filter((f) => !FROZEN_GUARDED.includes(f));
    expect(
      strangers,
      'kernel 层新增裸写文件（须走 writeStoredRaw/removeStoredRaw 单源）：\n' + strangers.join('\n'),
    ).toEqual([]);
  });
});
