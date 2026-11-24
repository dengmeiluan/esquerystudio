import { describe, expect, it, beforeEach, afterAll } from 'vitest';

/**
 * 确认弹窗 z 序守卫:ModalShell 开层把 mask 注册进 naive 同款 z 计数器(vdirs z-index-manager)。
 * 背景:壳层消费方(确认弹窗/影响预估/原始 IO)常从 naive 弹层(集群连接管理等 preset=card 弹窗)
 * 内触发,naive 动态档从 2000 起自增,静态 CSS 档(--z-confirm 1300)永远压不过——确认窗被宿主
 * 弹层盖住,如同未弹出。开层动态注册后与 naive 层「后开者胜」;关层/卸载反注册,全域无层时
 * 计数器随 naive 同拍回落,不残留不无限攀升。
 * 挂载用裸 createApp(项目无 @vue/test-utils);teleport 断言查 document。
 */
import zIndexManager from 'vdirs/es/zindexable/z-index-manager';

let app: any = null;

const mountShell = async () => {
  const { createApp, h, nextTick } = await import('vue');
  const Shell = (await import('../components/ModalShell.vue')).default;
  app = createApp({ render: () => h(Shell as any, { show: true, label: 'z 序守卫' }) });
  app.mount(document.createElement('div'));
  await nextTick();
  await nextTick();
};

const maskZ = () => {
  const el = document.querySelector('.msk-mask') as HTMLElement | null;
  return Number(el?.style.zIndex || 0);
};

beforeEach(() => {
  if (app) { app.unmount(); app = null; }
  document.body.innerHTML = '';
});

afterAll(() => { if (app) app.unmount(); });

describe('ModalShell z 序(naive 同计数器)', () => {
  it('晚于 naive 动态层打开时 mask z 压其上(≥2000+)', async () => {
    const naive = document.createElement('div');
    zIndexManager.ensureZIndex(naive);
    expect(Number(naive.style.zIndex)).toBe(2000);
    await mountShell();
    expect(maskZ()).toBeGreaterThan(Number(naive.style.zIndex));
    zIndexManager.unregister(naive);
  });

  it('关层反注册:计数器回落同基线,再次开层不攀升', async () => {
    const { nextTick } = await import('vue');
    await mountShell();
    const z1 = maskZ();
    expect(z1).toBeGreaterThan(0);
    app!.unmount(); app = null;
    await nextTick();
    expect(zIndexManager.elementCount).toBe(0);
    await mountShell();
    expect(maskZ()).toBe(z1);
  });
});
