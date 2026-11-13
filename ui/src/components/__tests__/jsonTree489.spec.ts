/**
 * 四百八十九批：JsonTree 行为单测——R92-D2 输出区统一组件（文档查看高频），
 * 此前无直测。四契约：递归渲染嵌套对象与数组/搜索词强制展开（命中节点可见）/
 * 深度≥2 默认折叠（性能防线）/复制全文按钮走 copyText。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';

vi.mock('../../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/format')>();
  return { ...actual, copyText: vi.fn(async () => true) };
});
import JsonTree from '../JsonTree.vue';
import { copyText } from '../../utils/format';
const copyTextMock = vi.mocked(copyText);

const apps: ReturnType<typeof createApp>[] = [];
const deep = { level1: { level2: { level3: { leaf: 'deep-value' } } }, plain: 'top' };

async function mountTree(data: any) {
  const app = createApp({ render: () => h(JsonTree, { data, tools: true }) });
  apps.push(app);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await nextTick();
  return host;
}

beforeEach(() => {
  apps.splice(0).forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('JsonTree 行为契约（489 批）', () => {
  it('递归渲染键与叶子值', async () => {
    const host = await mountTree({ name: 'alice', tags: ['a'] });
    expect(host.textContent).toContain('name');
    expect(host.textContent).toContain('alice');
    expect(host.textContent).toContain('tags');
  });

  it('深度≥2 默认折叠（level3 内容不可见），搜索词强制展开命中', async () => {
    const host = await mountTree(deep);
    expect(host.textContent).not.toContain('deep-value');
    const kwInput = host.querySelector('.jt-kw') as HTMLInputElement;
    kwInput.value = 'deep-value';
    kwInput.dispatchEvent(new Event('input'));
    await nextTick();
    expect(host.textContent, '搜索命中强制展开').toContain('deep-value');
  });

  it('复制全文按钮走 copyText（格式化 JSON）', async () => {
    const host = await mountTree({ plain: 'top' });
    const btn = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('复制'));
    (btn as HTMLButtonElement).click();
    await nextTick();
    expect(copyTextMock).toHaveBeenCalledWith(JSON.stringify({ plain: 'top' }, null, 2));
  });
});
