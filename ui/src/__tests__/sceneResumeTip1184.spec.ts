/**
 * 1184：进站「上次工作现场」提示从右下 toast 改为左下常驻条。
 *
 * 现场：裸进站时右下角弹 toast（10 秒），右下正是结果表末行与回顶钮所在——
 * 一进站先被一块浮层压住数据（截图里「还要遮挡」的一处）。
 * 为什么不给 toast 指定落点：naive-ui 的 placement 是 provider 级，逐条传无效
 * （实测截图仍落右下），要换落点就得再叠一层 provider——不如把它做成导航侧的常驻提示。
 *
 * 锁：① 组件三态（显示标签 / 继续上次 / 关闭）；
 *     ② App 已改用提示组件、旧的右下 toast 调用已消失；
 *     ③ 负控：show=false 不渲染。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import SceneResumeTip from '../components/SceneResumeTip.vue';

const appSrc = readFileSync(join(__dirname, '../App.vue'), 'utf-8');
const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;

async function mountTip(show: boolean, label = '索引工作区') {
  host = document.createElement('div');
  document.body.appendChild(host);
  const events: string[] = [];
  const app = createApp({
    render: () => h(SceneResumeTip as any, {
      show, label,
      onResume: () => events.push('resume'),
      onClose: () => events.push('close'),
    }),
  });
  apps.push(app);
  app.mount(host);
  for (let i = 0; i < 4; i++) await nextTick();
  return events;
}
afterEach(() => { while (apps.length) apps.pop()!.unmount(); document.body.innerHTML = ''; });

describe('1184 上次工作现场提示', () => {
  it('显示时带现场名，两个动作各自发出事件', async () => {
    const ev = await mountTip(true);
    const tip = host.querySelector('.srt')!;
    expect(tip.textContent).toContain('上次工作现场');
    expect(tip.textContent).toContain('索引工作区');
    (host.querySelector('.srt-go') as HTMLButtonElement).click();
    (host.querySelector('.srt-x') as HTMLButtonElement).click();
    expect(ev).toEqual(['resume', 'close']);
  });

  it('负控：show=false 时不渲染（不留空壳占位）', async () => {
    await mountTip(false);
    expect(host.querySelector('.srt')).toBeNull();
  });

  it('App 已接入提示组件，右下角 toast 调用已移除', () => {
    expect(appSrc).toContain('<SceneResumeTip');
    expect(appSrc).toContain("import SceneResumeTip from './components/SceneResumeTip.vue';");
    expect(appSrc).toContain('resumeScene.value = { label: rst.name, fullPath: rst.fullPath };');
    expect(appSrc, '旧的右下 toast 必须消失（否则两处同时提示）').not.toContain("store.notify('info', '上次工作现场");
  });

  it('落点在左下（不压结果表右下角）', () => {
    const src = readFileSync(join(__dirname, '../components/SceneResumeTip.vue'), 'utf-8');
    expect(src).toMatch(/\.srt\s*\{[^}]*left:\s*12px/);
    expect(src).toMatch(/\.srt\s*\{[^}]*bottom:\s*12px/);
    expect(src).not.toMatch(/\.srt\s*\{[^}]*right:\s*12px/);
  });
});
