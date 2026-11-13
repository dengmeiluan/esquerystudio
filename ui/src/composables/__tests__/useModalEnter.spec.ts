/**
 * R130 第六十六批：表单型 n-modal 的 Enter=提交。
 * 两层守卫（qrtSortable 样板——「能力」与「消费方接线」分离）：
 * 1) 行为层：useModalEnter 核心契约——仅「弹窗可见 + 焦点是 .n-modal-container 内的
 *    单行 INPUT + 非 IME 组合」才触发；TEXTAREA（多行 JSON 换行）/BUTTON/SELECT/
 *    容器外/无焦点一律放行原生行为；can() 闸与 show=false 不触发；卸载即摘监听。
 * 2) 接线层：8 文件 9 弹窗的静态锁（防接线回潮），自检防空跑假绿。
 * ConfirmModal 的 Enter=确认是「中性焦点才接管」（44 批 confirmKeyboard.spec），
 * 两者语义互补不冲突：确认弹窗无表单输入，表单弹窗焦点常驻 input。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, ref, defineComponent, h, type Ref } from 'vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useModalEnter } from '../useModalEnter';

const SRC = join(__dirname, '../..');

function mountHook(submit: () => void, can?: () => boolean): { show: Ref<boolean>; dispose: () => void } {
  const show = ref(false);
  const Host = defineComponent({
    setup() {
      useModalEnter(show, submit, can);
      return () => h('div');
    },
  });
  const app = createApp(Host);
  const root = document.createElement('div');
  document.body.appendChild(root);
  app.mount(root);
  return { show, dispose: () => app.unmount() };
}

function pressEnter(opts: { key?: string; isComposing?: boolean } = {}) {
  const ev = new KeyboardEvent('keydown', { key: opts.key ?? 'Enter', bubbles: true });
  if (opts.isComposing) Object.defineProperty(ev, 'isComposing', { value: true });
  window.dispatchEvent(ev);
}

describe('useModalEnter 行为契约（六十六批）', () => {
  let box: HTMLElement;
  let calls: number;
  let mounted: ReturnType<typeof mountHook> | null = null;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    box = document.createElement('div');
    box.className = 'n-modal-container';
    box.innerHTML = `
      <input id="in-box" />
      <textarea id="ta"></textarea>
      <button id="btn">go</button>
      <select id="sel"><option>a</option></select>
    `;
    document.body.appendChild(box);
    const outside = document.createElement('input');
    outside.id = 'outside';
    document.body.appendChild(outside);
    calls = 0;
  });

  afterEach(() => {
    mounted?.dispose();
    mounted = null;
    document.body.innerHTML = '';
  });

  function wire(can?: () => boolean) {
    mounted = mountHook(() => { calls++; }, can);
    mounted.show.value = true;
  }

  it('弹窗可见 + 容器内 INPUT 聚焦 → Enter 触发提交', () => {
    wire();
    (document.getElementById('in-box') as HTMLInputElement).focus();
    pressEnter();
    expect(calls).toBe(1);
  });

  it('TEXTAREA/BUTTON/SELECT 聚焦不接管（原生行为优先）', () => {
    wire();
    for (const id of ['ta', 'btn', 'sel']) {
      (document.getElementById(id) as HTMLElement).focus();
      pressEnter();
    }
    expect(calls).toBe(0);
  });

  it('焦点在容器外或无焦点不接管', () => {
    wire();
    (document.getElementById('outside') as HTMLInputElement).focus();
    pressEnter();
    (document.activeElement as HTMLElement)?.blur();
    pressEnter();
    expect(calls).toBe(0);
  });

  it('show=false（弹窗已关）不触发', () => {
    wire();
    mounted!.show.value = false;
    (document.getElementById('in-box') as HTMLInputElement).focus();
    pressEnter();
    expect(calls).toBe(0);
  });

  it('IME 组合输入中的 Enter（选词确认）不触发', () => {
    wire();
    (document.getElementById('in-box') as HTMLInputElement).focus();
    pressEnter({ isComposing: true });
    expect(calls).toBe(0);
  });

  it('非 Enter 键不触发', () => {
    wire();
    (document.getElementById('in-box') as HTMLInputElement).focus();
    pressEnter({ key: 'a' });
    expect(calls).toBe(0);
  });

  it('can() 闸为 false 不触发（与主按钮 disabled 同口径）', () => {
    wire(() => false);
    (document.getElementById('in-box') as HTMLInputElement).focus();
    pressEnter();
    expect(calls).toBe(0);
  });

  it('组件卸载后监听即摘（Enter 不再触发）', () => {
    wire();
    (document.getElementById('in-box') as HTMLInputElement).focus();
    mounted!.dispose();
    mounted = null;
    pressEnter();
    expect(calls).toBe(0);
  });

  /* 七十四批：确认层在场时让路——表单弹窗 Enter 弹出二次确认后焦点仍停在表单
     input，再按 Enter 用户意图是「确认」而非「再次提交」。两路判断都要锁。 */
  it('全局确认服务在场（confirmState.show）不触发', async () => {
    const { confirmState } = await import('../confirm');
    wire();
    (document.getElementById('in-box') as HTMLInputElement).focus();
    confirmState.show = true;
    pressEnter();
    expect(calls).toBe(0);
    confirmState.show = false;
    pressEnter();
    expect(calls).toBe(1);
  });

  it('模板内 ConfirmModal 实例在场（.cf-mask）不触发', () => {
    wire();
    (document.getElementById('in-box') as HTMLInputElement).focus();
    const mask = document.createElement('div');
    mask.className = 'cf-mask';
    document.body.appendChild(mask);
    pressEnter();
    expect(calls).toBe(0);
    mask.remove();
    pressEnter();
    expect(calls).toBe(1);
  });
});

describe('useModalEnter 消费方接线锁（六十六批）', () => {
  /* 文件 → 期望的 useModalEnter( 调用数；9 弹窗分布在 8 文件（MappingView 两个） */
  const WIRED: Array<[string, number]> = [
    ['components/CreateIndexModal.vue', 1],  // 新建索引（doCreate 自带 canSubmit+creating 防重入）
    ['views/SnapshotsView.vue', 2],          // 创建快照 / 恢复快照（均内置二次确认）
    ['views/IlmView.vue', 1],                // ILM 策略编辑（can=!policyBusy）
    ['views/MappingView.vue', 2],            // 添加字段 / 动态 settings（转 ConfirmModal 二次确认）
    ['views/XmigrateView.vue', 1],           // 续跑迁移凭据
    ['views/DslQueryView.vue', 1],           // 新建文档（can=newDocValid&&!saving）
    ['components/ClusterSwitcher.vue', 1],   // 集群连接表单（can=name&&url&&!saving）
  ];

  it('8 文件 9 弹窗全部接线 useModalEnter（防回潮）', () => {
    let total = 0;
    for (const [file, n] of WIRED) {
      const src = readFileSync(join(SRC, file), 'utf-8');
      const count = (src.match(/\buseModalEnter\(/g) ?? []).length;
      expect(count, `${file} 应有 ${n} 处 useModalEnter 接线`).toBe(n);
      total += count;
    }
    expect(total).toBe(9);
  });

  it('接线自检：清单文件全部存在（防空跑假绿）', () => {
    for (const [file] of WIRED) {
      expect(() => readFileSync(join(SRC, file), 'utf-8'), `${file} 应存在`).not.toThrow();
      expect(readFileSync(join(SRC, file), 'utf-8').includes('useModalEnter'), `${file} 应引用 useModalEnter`).toBe(true);
    }
  });
});
