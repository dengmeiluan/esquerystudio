import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 1124：`perm-scan` 自身的**反向**自检。
 *
 * <p>本轮踩到的教训：规则写成「文件里出现过 canEndpoint('admin'」时，能力定义行本身
 * 就满足了条件——调用处的守卫被删掉，扫描仍然全绿。规则失效比没有规则更危险，
 * 因为它给人一种「已经守住了」的错觉。</p>
 *
 * <p>这里对两条机械规则各做一次「注入违规 → 必须报红 → 复原」：
 * ① 回放通道直调执行函数（`if (runIt) doRun()` 须写成 `xxxAuto()`）；
 * ② 写 DevTools carry 前必须有门（窗口内 canDevtools，或文件内实际调用注入门）。</p>
 */
const ROOT = join(__dirname, '..', '..');
const SCAN = join(ROOT, 'scripts', 'perm-scan.mjs');
const VIEWS = join(ROOT, 'src', 'views');

function runScan(): { code: number; out: string } {
  const r = spawnSync(process.execPath, [SCAN], { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status ?? -1, out: `${r.stdout || ''}${r.stderr || ''}` };
}

function withTemporaryFile(name: string, body: string, fn: () => void) {
  const p = join(VIEWS, name);
  const had = existsSync(p);
  const before = had ? readFileSync(p, 'utf8') : null;
  try {
    writeFileSync(p, body, 'utf8');
    fn();
  } finally {
    if (before == null) { try { unlinkSync(p); } catch { /* ignore */ } }
    else writeFileSync(p, before, 'utf8');
  }
}

describe('perm-scan 规则自检（反向）', () => {
  it('基线：当前仓库扫描通过', () => {
    const { code, out } = runScan();
    expect(out).toContain('权限一致性扫描通过');
    expect(code).toBe(0);
  });

  it('回放通道直调执行函数会被报出', () => {
    withTemporaryFile('__scanProbeReplay.vue', `<script setup lang="ts">\nif (runIt) doRun();\n</script>\n`, () => {
      const { code, out } = runScan();
      expect(out).toContain('__scanProbeReplay.vue');
      expect(out).toContain('直调执行函数');
      expect(code).toBe(1);
    });
  });

  it('写 DevTools carry 不带门会被报出', () => {
    withTemporaryFile('__scanProbeCarry.vue',
      `<script setup lang="ts">\nfunction go() {\n  sessionStorage.setItem('esquerystudio.devtools.open', '{}');\n}\n</script>\n`,
      () => {
        const { code, out } = runScan();
        expect(out).toContain('__scanProbeCarry.vue');
        expect(out).toContain('没有 canDevtools');
        expect(code).toBe(1);
      });
  });

  it('门写在调用处（非能力定义行）才算数', () => {
    /* 只有定义、没有调用：这正是本轮踩到的假绿形态，必须仍然报红 */
    withTemporaryFile('__scanProbeDefOnly.vue',
      `<script setup lang="ts">\nconst canDevtools = computed(() => auth.canEndpoint('admin', 'POST', '/x'));\nfunction go() {\n  sessionStorage.setItem('esquerystudio.devtools.open', '{}');\n}\n</script>\n`,
      () => {
        const { code, out } = runScan();
        expect(out).toContain('__scanProbeDefOnly.vue');
        expect(code).toBe(1);
      });
  });

  /* 1129：视图/组件层写调用必须带能力门——注入「有写调用、无任何门」的组件必须报红 */
  it('写调用缺能力门会被报出', () => {
    withTemporaryFile('__scanProbeWriteGate.vue',
      `<script setup lang="ts">
import { api } from '../api';
async function go() { await api.deleteIndex('x'); }
</script>
`, () => {
      const { code, out } = runScan();
      expect(out).toContain('__scanProbeWriteGate.vue');
      expect(out).toContain('写调用缺少能力门');
      expect(code).not.toBe(0);
    });
  });

  it('同一文件带上能力门后不再报', () => {
    withTemporaryFile('__scanProbeWriteGate.vue',
      `<script setup lang="ts">
import { api } from '../api';
const canOps = computed(() => auth.canEndpoint('ops','POST','/internal/es/index/cluster/delete-index', store.target));
async function go() { if (!canOps.value) return; await api.deleteIndex('x'); }
</script>
`, () => {
      const { code, out } = runScan();
      expect(out).not.toContain('__scanProbeWriteGate.vue');
      expect(code).toBe(0);
    });
  });
});
