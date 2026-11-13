import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import SplitHandle from '../components/SplitHandle.vue';

// ·族3 泛 keydown 域收口（826 约定②备案域开刀）。
// Phase 0：全站泛 @keydown（无键位修饰符）37 站点/22 文件三路斥候逐 handler 裁决——
// 26 处泛 handler：豁免 24（combobox 输入框 14 + 原生 button roving 容器 2 + Monaco
// 编辑器 Ctrl 组合键面 3 + tabindex=-1 region 地标 2 + 输入框显式放行/纯导航 3）+
// 真缺口 2（SplitHandle onKeydown Enter 激活而 Space 不理；DevTools .dt-tab role=tab
// 有 .enter 无 .space——826 population（role=button）之外的新发现面）+轻缺口 1 备案
// 豁免（IndexHub .ih-list 滚层容器 Enter 激活而 Space 落滚动：滚层 Space=滚动是平台
// 惯例，行级 role=button 已双键齐备，内核加 Space 反伤滚动习惯）。
// .stop 纯冒泡修饰符 7 处豁免（输入框防全局快捷键劫持语义）+注释误抓 2 处排除。
// 刀面两件：件1 SplitHandle Enter 支并 Space（同一 preventDefault+reset 分支=
// role=separator tabindex=0 激活键契约对称，R/Enter 既有形态零回退）+件2 .dt-tab 补
// @keydown.space.self.prevent（.self 守卫=renaming input 冒泡放行——内嵌输入容器的
// 激活键孪生必须 .self：.prevent 无条件执行，renaming 态按空格会被冒泡级 .prevent
// 吞掉=字符无法输入）。约定：role=tab 激活键契约=Enter+Space（WAI-ARIA tabs
// pattern），826 全域守卫 population 扩员 role=tab（tablist 容器无激活契约不入）。

const rd = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('spaceGuard829 源码锚', () => {
  it('SplitHandle onKeydown Enter 支并 Space（同一 preventDefault+reset 分支）', () => {
    const v = rd('../components/SplitHandle.vue');
    expect(v).toMatch(/event\.key === 'Enter' \|\| event\.key === ' '/);
  });
  it('SplitHandle 既有激活键零回退（R/r/Enter/双击）', () => {
    const v = rd('../components/SplitHandle.vue');
    expect(v).toContain("event.key === 'r' || event.key === 'R'");
    expect(v).toContain("@dblclick=\"emit('reset')\"");
  });
  it('DevTools .dt-tab enter+space.self 孪生（同表达式逐字镜像）', () => {
    const v = rd('../views/DevToolsView.vue');
    const pair =
      /@keydown\.enter\.prevent="renamingIdx !== i && \(active = i\)"\s*@keydown\.space\.self\.prevent="renamingIdx !== i && \(active = i\)"/;
    expect(v).toMatch(pair);
  });
  it('.dt-tab Space 通道必须带 .self（renaming input 冒泡放行=空格输入不被 .prevent 吞）', () => {
    const v = rd('../views/DevToolsView.vue');
    const tabTag = v.match(/<div v-for="\(t, i\) in tabs"[\s\S]*?role="tab"[^>]*>/)?.[0] ?? '';
    expect(tabTag).toContain('role="tab"');
    expect(tabTag).toMatch(/@keydown\.space\.self\.prevent/);
    expect(tabTag).not.toMatch(/@keydown\.space\.prevent/); // 裸 .space.prevent=renaming 态吞空格
  });
});

describe('spaceGuard829 全域守卫：role=tab 激活键双通道（826 population 扩员）', () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap(n => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.vue') ? [p] : [];
    });
  }
  function readTag(text: string, i: number): string {
    let q: string | null = null;
    let j = i + 1;
    for (; j < text.length; j++) {
      const c = text[j];
      if (q) { if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '>') break;
    }
    return text.slice(i, j + 1);
  }
  it('views+components 全域零 role=tab「有 Enter 无 Space」（tablist 容器不入 population）', () => {
    const offenders: string[] = [];
    for (const base of ['../views', '../components']) {
      for (const f of walk(join(__dirname, base))) {
        const src = readFileSync(f, 'utf-8');
        const tm = src.match(/<template>([\s\S]*)<\/template>/);
        if (!tm) continue;
        const re = /<([a-zA-Z][\w-]*)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(tm[1]))) {
          const raw = readTag(tm[1], m.index);
          const roleAttr = raw.match(/\b(?::role|role)\s*=\s*"([^"]*)"/);
          if (!roleAttr) continue;
          if (roleAttr[1] !== 'tab') continue; // 精确匹配：tablist 容器无激活契约不入
          const pairs = [...raw.matchAll(/(?:@|v-on:)([\w.:-]*keydown[\w.:-]*)\s*=\s*"([^"]*)"/g)]
            .map(k => ({ mods: k[1] }));
          if (pairs.some(p => /\.space/.test(p.mods))) continue;
          if (pairs.some(p => /\.enter/.test(p.mods))) offenders.push(f.replace(/\\/g, '/').split('/src/')[1]);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('spaceGuard829 豁免约定锁', () => {
  it('useRowNav 内核滚层 Space=滚动豁免备案（829 裁决：禁 Space 激活分支回潮）', () => {
    const v = rd('../composables/useRowNav.ts');
    expect(v).toContain('裁决'); // 豁免约定注释锚
    expect(v).not.toMatch(/e\.key === ' '/); // 负向锁：滚层容器 Space 保持平台滚动语义
  });
});

describe('spaceGuard829 挂载级：SplitHandle Space 重置（role=separator 激活键契约）', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  let resetCount = 0;
  function mountComp() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      render: () =>
        h(SplitHandle, {
          axis: 'vertical', size: 300, min: 120, max: 600, label: '分栏',
          onReset: () => { resetCount++; },
        }),
    });
    app.mount(host);
    apps.push(app);
    return host;
  }
  beforeEach(() => {
    while (apps.length) apps.pop()!.unmount();
    document.body.innerHTML = '';
    resetCount = 0;
  });
  async function press(key: string) {
    const host = mountComp();
    const handle = host.querySelector('.split-handle') as HTMLElement;
    const ev = new KeyboardEvent('keydown', { key, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true });
    handle.dispatchEvent(ev);
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    return { ev, handle };
  }
  it('Space 同 Enter 触发 reset+defaultPrevented（契约对称）', async () => {
    const { ev } = await press(' ');
    expect(ev.defaultPrevented).toBe(true); // 防页面滚动
    expect(resetCount).toBe(1);
  });
  it('Enter reset 回归卫兵（既有语义零回退）', async () => {
    const { ev } = await press('Enter');
    expect(ev.defaultPrevented).toBe(true);
    expect(resetCount).toBe(1);
  });
});
