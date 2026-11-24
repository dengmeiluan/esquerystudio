import { describe, expect, it, beforeEach, afterEach } from 'vitest';

/**
 * ConfirmModal facts 具名标识符区。
 * 背景：高危确认弹窗正文里最该盯住的标识符（快照名/别名→索引/taskId）此前与普通句子
 * 同权重——挪进 facts 逐行 label+mono 值强调，正文只留动作语句。
 * 挂载用裸 createApp（项目无 @vue/test-utils）；teleport 断言查 document（同 confirmKeyboard.spec）。
 */
let app: any = null;

const mountModal = async (props: Record<string, unknown> = {}) => {
  const { createApp, h, nextTick } = await import('vue');
  const Modal = (await import('../components/ConfirmModal.vue')).default;
  app = createApp({
    render() {
      return h(Modal as any, { show: true, title: '确认操作', message: '将执行某动作。', ...props });
    },
  });
  app.mount(document.createElement('div'));
  await nextTick();
};

beforeEach(() => {
  if (app) { app.unmount(); app = null; }
  document.body.innerHTML = '';
});

afterEach(() => {
  if (app) { app.unmount(); app = null; }
  document.body.innerHTML = '';
});

describe('ConfirmModal facts 渲染', () => {
  it('facts 逐行渲染：label + b.mono 值（关键标识符强调形态）', async () => {
    await mountModal({
      facts: [{ label: '任务 ID', value: 'task-abc-123' }, { label: 'action', value: 'indices:data/write/reindex' }],
    });
    const facts = document.querySelector('.cf-facts');
    expect(facts, 'facts 区渲染').not.toBeNull();
    const rows = document.querySelectorAll('.cf-fact');
    expect(rows.length).toBe(2);
    const [k, v] = Array.from(rows[0].querySelectorAll('.cf-fact-k, .cf-fact-v'));
    expect(k.textContent).toBe('任务 ID');
    expect(v.textContent).toBe('task-abc-123');
    expect(v.classList.contains('mono'), '值用 mono 强调').toBe(true);
    expect(v.tagName).toBe('B');
    expect((rows[1].querySelector('.cf-fact-v') as HTMLElement).textContent).toBe('indices:data/write/reindex');
  });

  it('facts 区位于正文之后、守卫框之前（默认插槽下方、guard 上方）', async () => {
    await mountModal({
      level: 'critical', guardText: 'snap-1',
      facts: [{ label: '快照名', value: 'snap-1' }],
    });
    const body = document.querySelector('.cf-body')!;
    const facts = document.querySelector('.cf-facts')!;
    const guard = document.querySelector('.cf-guard')!;
    expect(
      body.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING,
      'facts 在 body 之后',
    ).toBeTruthy();
    expect(
      facts.compareDocumentPosition(guard) & Node.DOCUMENT_POSITION_FOLLOWING,
      'facts 在 guard 之前（不抢守卫框形态）',
    ).toBeTruthy();
  });

  it('不传 facts 零渲染（既有调用点零回归）', async () => {
    await mountModal();
    expect(document.querySelector('.cf-facts')).toBeNull();
  });

  it('传空数组同样零渲染', async () => {
    await mountModal({ facts: [] });
    expect(document.querySelector('.cf-facts')).toBeNull();
  });

  it('critical + facts + guardText 三者共存：值随 critical 用 err 色，守卫框照常', async () => {
    await mountModal({
      level: 'critical', guardText: 'old-snap',
      facts: [{ label: '快照名', value: 'old-snap' }, { label: '仓库', value: 'repo-a' }],
    });
    expect(document.querySelector('.cf-guard'), '守卫框照常渲染').not.toBeNull();
    const vs = document.querySelectorAll('.cf-fact-v');
    expect(vs.length).toBe(2);
    expect(document.querySelectorAll('.cf-fact-v.cf-fact-err').length).toBe(2);
  });

  it('critical 但无 guardText 降级 warn 时 facts 不用 err 色（随 effLevel 降级）', async () => {
    await mountModal({ level: 'critical', facts: [{ label: '任务 ID', value: 't-1' }] });
    expect(document.querySelector('.cf-fact-v')!.classList.contains('cf-fact-err')).toBe(false);
  });

  it('长值 word-break:all（窄名长值不断行溢出）——happy-dom 算不出 scoped 计算样式，锁源码规则', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '../components/ConfirmModal.vue'), 'utf-8');
    expect(src).toMatch(/\.cf-fact-v\s*\{[^}]*word-break:\s*break-all/);
  });
});

describe('askConfirm facts 透传与复位（confirm.ts 服务层）', () => {
  it('askConfirm 写入 confirmState.facts；下次不带 facts 的调用复位为空（防残留串扰）', async () => {
    const { askConfirm, confirmState, resolveConfirm } = await import('../composables/confirm');
    const p = askConfirm({
      title: '删除快照',
      level: 'critical', guardText: 's1',
      facts: [{ label: '快照名', value: 's1' }],
    });
    expect(confirmState.facts).toEqual([{ label: '快照名', value: 's1' }]);
    resolveConfirm(false);
    await expect(p).resolves.toBe(false);

    const p2 = askConfirm({ title: '普通确认', message: 'm' });
    expect(confirmState.facts, '上一次的 facts 不得残留').toEqual([]);
    resolveConfirm(false);
    await expect(p2).resolves.toBe(false);
  });

  it('opts.facts 显式 undefined 也规范成空数组', async () => {
    const { askConfirm, confirmState, resolveConfirm } = await import('../composables/confirm');
    const p = askConfirm({ title: 't', message: 'm', facts: undefined });
    expect(confirmState.facts).toEqual([]);
    resolveConfirm(false);
    await p;
  });
});
