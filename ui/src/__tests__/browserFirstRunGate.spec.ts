import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* 回归锁：浏览器模式首屏只能有一个全屏门禁。
 * 曾经的缺陷：LoginOverlay + SetupWizard + BrowserConnect 三层同时挂载，
 * SetupWizard 的 autofocus 把焦点抢到 BrowserConnect 背后；用户输入/回车会在
 * 隐藏表单与顶层面板之间来回触发，表现为集群录入后页面狂闪、不可用。 */
const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('browser first-run overlay gate', () => {
  it('App.vue: browser mode mounts BrowserConnect only', () => {
    const app = read('App.vue');
    /* 静态演示可以追加 !isDemoMode；浏览器模式必须仍然隐藏两个服务端门禁。 */
    expect(app).toMatch(/<LoginOverlay v-if="!isBrowserMode(?: && !isDemoMode)?" \/>/);
    expect(app).toMatch(/<SetupWizard v-if="!isBrowserMode(?: && !isDemoMode)?" \/>/);
    expect(app).toContain('<BrowserConnect v-if="isBrowserMode" />');
    expect(app).not.toMatch(/<LoginOverlay\s*\/>/);
    expect(app).not.toMatch(/<SetupWizard\s*\/>/);
  });

  it('api.ts: browser /auth/me 401 is a setup probe, not a login-session loss', () => {
    const api = read('api.ts');
    expect(api).toContain('browserSetupProbe');
    expect(api).toContain("isBrowserMode && path.includes('/auth/me')");
    expect(api).toMatch(/resp\.status === 401[\s\S]*!browserSetupProbe/);
  });

  it('BrowserConnect: failed profile save does not reload the page', () => {
    const connect = read('components/BrowserConnect.vue');
    expect(connect).toContain('const saved = upsertProfile');
    expect(connect).toMatch(/if \(!saved\) \{[\s\S]*busy\.value = false;[\s\S]*return;/);
  });
});
