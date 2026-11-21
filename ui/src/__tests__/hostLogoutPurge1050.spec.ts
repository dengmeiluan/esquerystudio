import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../stores/auth';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 1050：宿主登出/跨标签登出时，控制台必须立即清账号工作现场（不能等下一次登录）。 */
describe('1050 宿主登出清理', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('purgeLocalUserState 清掉草稿/目标/词项/历史等账号视角键', () => {
    const keys = [
      'esquerystudio.qw.session:host:x',
      'esquerystudio_terms_stash::host|x|f',
      'esquerystudio.target',
      'esquerystudio.target.name',
      'esquerystudio.notify.log',
      'es_devtools_draft',
      'es_confirm_skip:z',
      'es_vars',
    ];
    for (const k of keys) localStorage.setItem(k, 'x');
    localStorage.setItem('esquerystudio.last-user', 'deng_test_x2');
    useAuthStore().purgeLocalUserState();
    for (const k of keys) expect(localStorage.getItem(k), k).toBeNull();
    expect(localStorage.getItem('esquerystudio.last-user')).toBeNull();
  });

  it('App 收到空 host token 时清现场并回到登录态', () => {
    const app = readFileSync(join(__dirname, '..', 'App.vue'), 'utf-8');
    expect(app).toContain("if (!d.token)");
    expect(app).toContain('auth.purgeLocalUserState();');
    expect(app).toContain('auth.showLogin = true;');
  });
});
