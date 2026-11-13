import { beforeEach, describe, expect, it } from 'vitest';
import {
  profiles, activeProfile, dataProfile, upsertProfile, deleteProfile, setActiveProfile,
  __resetBrowserProfilesForTests, LEGACY_KEY, PROFILES_KEY, ACTIVE_KEY,
} from '../platform/browserProfiles';

describe('browser-mode local connection profiles', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetBrowserProfilesForTests();
  });

  it('旧单档自动迁移成一条档案，并镜像回旧键', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ url: 'http://es-a:9200', username: 'elastic', password: 'p1' }));
    const list = profiles();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'browser', url: 'http://es-a:9200', username: 'elastic', password: 'p1' });
    expect(activeProfile()?.id).toBe('browser');
    expect(JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}')).toMatchObject({ id: 'browser', url: 'http://es-a:9200' });
  });

  it('可保存多条连接，数据面跟随顶栏 target 切换', () => {
    const a = upsertProfile({ name: 'A', url: 'http://es-a:9200/' })!;
    const b = upsertProfile({ name: 'B', url: 'http://es-b:9200', username: 'u', password: 'p', authType: 'API_KEY' })!;
    expect(profiles()).toHaveLength(2);
    expect(activeProfile()?.id).toBe(b.id);
    expect(dataProfile()?.id).toBe(b.id);

    localStorage.setItem('esquerystudio.target', a.id);
    expect(dataProfile()).toMatchObject({ id: a.id, name: 'A', url: 'http://es-a:9200' });
    expect(JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]')).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}')).toMatchObject({ id: a.id });
  });

  it('编辑时空密码保留旧密码，切换 API Key 后按 API Key 形态保存', () => {
    const p = upsertProfile({ name: 'A', url: 'http://es-a:9200', username: 'elastic', password: 'secret' })!;
    const edited = upsertProfile({ id: p.id, name: 'A2', url: 'http://es-a:9200', username: 'elastic', password: '' })!;
    expect(edited.password).toBe('secret');
    const keyed = upsertProfile({ id: p.id, name: 'A3', url: 'https://es-a:9200', password: 'api-key', authType: 'API_KEY' })!;
    expect(keyed).toMatchObject({ authType: 'API_KEY', password: 'api-key', name: 'A3' });
  });

  it('删除激活档案自动回落到剩余第一条并同步镜像', () => {
    const a = upsertProfile({ name: 'A', url: 'http://es-a:9200' })!;
    const b = upsertProfile({ name: 'B', url: 'http://es-b:9200' })!;
    setActiveProfile(b.id);
    expect(deleteProfile(b.id)).toBe(true);
    expect(profiles().map(p => p.id)).toEqual([a.id]);
    expect(activeProfile()?.id).toBe(a.id);
    expect(localStorage.getItem(ACTIVE_KEY)).toBe(a.id);
    expect(JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}')).toMatchObject({ id: a.id });
  });
});
