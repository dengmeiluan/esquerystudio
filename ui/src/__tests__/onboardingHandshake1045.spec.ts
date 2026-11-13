import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 1045：宿主握手与首启引导的可靠性锚。
   产线实报两态：
   ① 宿主监听晚于子页 ready → console 只播一次 ready，永久停在「身份未确认」；
   ② 回访用户 done 标志丢失（换域名/存储分区/清站点数据）→ 每次进页都弹引导。 */
const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf-8');
const app = read('App.vue');
const wizard = read('components/WelcomeWizard.vue');
const sideNav = read('components/SideNav.vue');

describe('1045 宿主握手：ready 多拍重播直到凭证到达', () => {
  it('iframe 分支按延迟表重播 ready（不再只发一拍）', () => {
    expect(app).toContain('function announceHostReady()');
    expect(app).toContain('for (const delay of [300, 900, 2000, 3500])');
    expect(app).toContain('readyTimers.push(window.setTimeout(announceHostReady, delay))');
  });

  it('拿到宿主 token / 卸载时停止重播（不留后台定时器）', () => {
    expect(app).toContain('function stopReadyAnnounce()');
    expect(app).toContain('if (d.type === \'esquerystudio-host-token\' && typeof d.token === \'string\') {\n    stopReadyAnnounce();');
    expect(app).toContain('onBeforeUnmount(() => {\n  stopReadyAnnounce();');
  });

  it('身份未确认态给出可操作的重试入口，且不再谎称“正在重试”', () => {
    expect(sideNav).toContain('重试身份探测');
    expect(sideNav).toContain('@click="retryIdentity"');
    expect(sideNav).toContain("window.parent.postMessage({ type: 'esquerystudio-ready' }, '*')");
    expect(sideNav).not.toContain('正在重试连接鉴权服务');
  });
});

describe('1045 首启引导：只对真正的首次使用自动弹', () => {
  it('已有身份记录（回访）在挂载时即跳过自动弹；主动取消勾选（0）仍尊重重看意图', () => {
    expect(wizard).toContain("if (done !== '0' && localStorage.getItem('esquerystudio.last-user')) return;");
    expect(wizard).toContain("writeStoredRaw(localStorage, LS_KEY, dontShow.value ? '1' : '0');");
  });

  it('身份未确认/探测未完成不弹（避免挡住鉴权失败的自救路径）', () => {
    expect(wizard).toContain('const ready = () => (store.indices || []).length > 0 && (auth.authDisabled || auth.me != null);');
  });

  it('延时落地前二次确认 done 标志（多实例竞态下先关者赢）', () => {
    expect(wizard).toContain("if (localStorage.getItem(LS_KEY) !== '1') show.value = true;");
  });
});
