/**
 * 四百零三批：FocusableSurface 双态行为级验证（401 源码锁的行为面补齐）——
 * 真实挂载+点击驱动：进入钮→聚焦态（fs-active+role=dialog）→同钮变还原→点击退出
 * 全链路，附 Esc 退出与按钮语义切换。403 弹层开闭对称审计结论：13 个疑似状态
 * 全部甄别对称（toggle 同钮/ConfirmModal·NModal·v-model 包装/Esc 全局处理），零真缺口。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, defineComponent, ref, nextTick } from 'vue';
import FocusableSurface from '../FocusableSurface.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function mountHost() {
  const enabled = ref(false);
  const Host = defineComponent({
    setup() {
      return () => h('div', [
        h(FocusableSurface, {
          paneId: 'test.pane', title: '响应', enabled: enabled.value,
          'onUpdate:enabled': (v: boolean) => { enabled.value = v; },
        }, { default: () => h('div', 'body-content') }),
      ]);
    },
  });
  const app = createApp(Host);
  apps.push(app);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await nextTick();
  return { host, enabled };
}

function surfaceBtn(host: HTMLElement): HTMLButtonElement {
  const b = host.querySelector<HTMLButtonElement>('.fs-btn');
  if (!b) throw new Error('fs-btn 不存在');
  return b;
}

beforeEach(() => {
  apps.splice(0).forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  document.body.innerHTML = '';
});

describe('FocusableSurface 双态行为（403 批）', () => {
  it('点击进入→聚焦态→同钮变还原→点击退出（用户实报「放大后缩小不了」的行为级闭环）', async () => {
    const { host, enabled } = await mountHost();
    const section = host.querySelector('section.fs')!;
    expect(section.classList.contains('fs-active'), '初始非聚焦').toBe(false);
    expect(enabled.value).toBe(false);

    surfaceBtn(host).click();
    await nextTick();
    expect(enabled.value, '点击聚焦钮进入').toBe(true);
    expect(section.classList.contains('fs-active')).toBe(true);
    expect(section.getAttribute('role'), '聚焦态 dialog 语义').toBe('dialog');
    expect(surfaceBtn(host).getAttribute('aria-label'), '同钮变「还原」').toContain('还原');

    surfaceBtn(host).click();
    await nextTick();
    expect(enabled.value, '点击还原钮退出——401 前此路径不存在').toBe(false);
    expect(section.classList.contains('fs-active')).toBe(false);
    expect(surfaceBtn(host).getAttribute('aria-label')).toContain('聚焦');
  });

  it('Esc 退出双保险保留；body 滚动锁随态开关', async () => {
    const { host, enabled } = await mountHost();
    surfaceBtn(host).click();
    await nextTick();
    expect(enabled.value).toBe(true);
    expect(document.body.style.overflow, '聚焦时锁滚动').toBe('hidden');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(enabled.value, 'Esc 退出').toBe(false);
    await nextTick();
    expect(document.body.style.overflow, '退出还滚动').toBe('');
  });
});
