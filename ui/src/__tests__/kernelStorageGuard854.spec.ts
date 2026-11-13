/* kernel 层存储写入残量合并看守（854 批·851~853 存储防御族收官件）。
 *
 * 病灶家族：852 批 G2 正面清单 FROZEN_GUARDED 11 文件的 try 壳/裸写残量 18 位点
 * （stripComments 口径实勘：同行 try 壳 10+多行纯壳 5+真裸写 3）。854 合并
 * utils/safeJson writeStoredRaw/removeStoredRaw 单源（852 约定：try+吞异常+回执
 * 布尔——存储不可用 ≠ 功能不可用，内存态照常可用）；冗余存储壳剥除（单源语义
 * 承载），混合域 try（useLinkCarry.receive 读+焚+解析链）保壳只换芯；读侧
 * try-getItem（readRaw/readLegacySplit/restore）归 851 读侧域不动。
 *
 * ── 断言口径 ─────────────────────────────────────────────────
 * G 组：kernel 层（composables/stores/utils + api.ts + router.ts）裸写恒零——
 *       852 G2「正面清单内豁免」语义升格为「清单清零后无豁免面」。
 * W 组：行为锁——配额抛写环境下四条高频链零外抛+内存态照常推进
 *       （草稿 clear 同步链/跨页携带焚链/查询历史 push 链/布局偏好 setPane·reset 链）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { nextTick } from 'vue';
import { writeStoredRaw, removeStoredRaw } from '../utils/safeJson';
import { useScopedDraft } from '../composables/useScopedDraft';
import { useLinkCarry } from '../composables/useLinkCarry';
import { createLayoutPreferences } from '../composables/useLayoutPreferences';
import { useQueryHistoryStore } from '../stores/queryHistory';

const srcDir = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(srcDir, rel), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const RAW_OP = /(localStorage|sessionStorage)\.(setItem|removeItem)\(/;

/* 852 时点 FROZEN_GUARDED 正面清单（854 合并对象）——合并后恒零，清单只减不增 */
const KERNEL_GUARD_FILES = [
  'composables/confirm.ts',
  'composables/continuity.ts',
  'composables/urlState.ts',
  'composables/useLayoutPreferences.ts',
  'composables/useLinkCarry.ts',
  'composables/useScopedDraft.ts',
  'composables/useTermsSuggest.ts',
  'utils/fieldSearch.ts',
  'stores/queryHistory.ts',
  'stores/liveMonitor.ts',
  'stores/jobTracker.ts',
];

/* 配额抛写环境：setItem/removeItem 一律抛（模拟隐私模式/配额满）。
 * 852 探针课两则：happy-dom 下须 spy 实例自身属性（原型 patch 不经实例分发）；
 * vitest4 restoreAllMocks 对实例 spy 不还原——持引用逐个 mockRestore 显式拆膛。 */
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

describe('kernelStorageGuard854 · kernel 存储残量合并', () => {
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

  /* —— 单源自证（改用基建在场）—— */

  it('S1 writeStoredRaw/removeStoredRaw 成功与配额抛写双态回执', () => {
    expect(writeStoredRaw(localStorage, 's1key', 'v')).toBe(true);
    expect(removeStoredRaw(localStorage, 's1key')).toBe(true);
    armQuotaFailure();
    expect(writeStoredRaw(localStorage, 's1key', 'v2')).toBe(false);
    expect(removeStoredRaw(sessionStorage, 's1key')).toBe(false);
  });

  /* —— W 组：行为锁（配额抛写环境四链抽针）—— */

  it('W1 useScopedDraft 配额抛写下 clear/编辑链零外抛，内存态照常推进', async () => {
    const d = useScopedDraft('w1field', { route: 'w1-route' }, '');
    d.text.value = 'seed-draft';
    await nextTick();
    armQuotaFailure();
    expect(() => d.clear()).not.toThrow();
    expect(d.text.value).toBe('');
    d.text.value = 'edited-after-quota';
    await nextTick();
    expect(d.text.value).toBe('edited-after-quota');
  });

  it('W2 useLinkCarry 配额抛写下 send 零外抛、receive 取不到即焚返回 null', () => {
    const lc = useLinkCarry<{ a: number }>('w2key');
    armQuotaFailure();
    expect(() => lc.send({ a: 1 })).not.toThrow();
    expect(lc.receive()).toBeNull();
  });

  it('W3 查询历史 push 配额抛写下零外抛，内存条目照常入列', () => {
    const st = useQueryHistoryStore();
    armQuotaFailure();
    expect(() => st.push('dsl', 'GET _search\n{"query":{"match_all":{}}}', 'idx-w3')).not.toThrow();
    expect(st.items.length).toBe(1);
  });

  it('W4 布局偏好 setPane/reset 配额抛写下零外抛，内存快照照常推进', () => {
    const prefs = createLayoutPreferences(
      { target: 'host', route: '/w4', mode: '-', profile: 'wide' },
      { p1: { id: 'p1', min: 200, max: 800, defaultSize: 360 } },
    );
    armQuotaFailure();
    expect(() => prefs.setPane('p1', { size: 420 })).not.toThrow();
    expect(prefs.snapshot.value.panes.p1?.size).toBe(420);
    expect(() => prefs.reset()).not.toThrow();
    expect(prefs.snapshot.value.panes.p1).toBeUndefined();
  });

  /* —— G 组：kernel 层裸写恒零（852 G2 正面清单语义升格）—— */

  it('G1 原 FROZEN_GUARDED 11 文件裸写恒零 + 单源接线在场', () => {
    for (const f of KERNEL_GUARD_FILES) {
      const code = stripComments(read(f));
      const lines = code.split('\n');
      const dirty = lines
        .map((ln, i) => (RAW_OP.test(ln) ? `${f}:${i + 1}` : ''))
        .filter(Boolean);
      expect(dirty, `${f} 裸写/try 壳残量复燃：\n${dirty.join('\n')}`).toEqual([]);
      expect(code, `${f} 缺 writeStoredRaw/removeStoredRaw 单源接线`).toMatch(/writeStoredRaw\(|removeStoredRaw\(/);
    }
  });

  it('G2 kernel 层全集裸写文件集合恒零（无豁免面，新文件禁引入）', () => {
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
    const rawFiles = files
      .map((p) => p.replace(/\\/g, '/').split('/src/').pop() as string)
      .filter((rel) => isKernel(rel) && RAW_OP.test(stripComments(readFileSync(join(srcDir, rel), 'utf8'))));
    expect(
      rawFiles,
      'kernel 层裸写文件（须走 writeStoredRaw/removeStoredRaw 单源）：\n' + rawFiles.join('\n'),
    ).toEqual([]);
  });
});
