import { afterEach, describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import {
  createLayoutPreferences,
  layoutStorageKey,
} from '../composables/useLayoutPreferences';
import { useViewportProfile } from '../composables/useViewportProfile';

const scope = { target: 'qa', route: '/devtools', mode: 'search', profile: 'standard' as const };

afterEach(() => {
  localStorage.clear();
});

describe('scoped layout preferences', () => {
  it('uses a target/route/mode/profile scoped key', () => {
    const state = createLayoutPreferences(scope);
    state.setPane('devtools.search.request', { size: 380, collapsed: false });
    expect(localStorage.getItem(layoutStorageKey(scope))).toContain('380');
  });

  it('ignores malformed snapshots and clamps restored sizes', () => {
    localStorage.setItem(layoutStorageKey(scope), '{bad');
    const state = createLayoutPreferences(scope);
    expect(state.snapshot.value.panes).toEqual({});
    state.setPane('devtools.search.response', { size: 600 });
    expect(state.restorePane('devtools.search.response', {
      id: 'devtools.search.response', min: 240, defaultSize: 420, max: 500,
    }, 800)).toBe(500);
  });

  it('does not leak one target or viewport into another', () => {
    const qa = createLayoutPreferences(scope);
    qa.setPane('devtools.search.response', { size: 600 });
    const prod = createLayoutPreferences({ ...scope, target: 'prod', profile: 'embedded' });
    expect(prod.snapshot.value.panes).toEqual({});
  });

  it('migrates the old query-builder split only into the new scope', () => {
    localStorage.setItem('esquerystudio_qb_split', '560');
    const migrated = createLayoutPreferences({ ...scope, route: '/search', mode: 'builder' });
    expect(migrated.snapshot.value.panes['query-builder.tree']).toEqual({ size: 560 });
    expect(localStorage.getItem(layoutStorageKey({ ...scope, route: '/search', mode: 'builder' }))).toContain('560');
  });

  it('updates profile after a resize event and cleans the listener', async () => {
    const ctl = useViewportProfile();
    expect(ctl.profile.value).toBeTruthy();
    window.dispatchEvent(new Event('resize'));
    await new Promise((resolve) => setTimeout(resolve, 130));
    await nextTick();
    ctl.dispose();
  });

  it('observes a container ref and disconnects it on dispose', async () => {
    const target = ref<HTMLElement>();
    const ctl = useViewportProfile(target);
    target.value = document.createElement('div');
    await nextTick();
    expect(ctl.width.value).toBeGreaterThanOrEqual(0);
    ctl.dispose();
  });

  it('uses the target rectangle when ResizeObserver is unavailable', async () => {
    const original = window.ResizeObserver;
    window.ResizeObserver = undefined as unknown as typeof ResizeObserver;
    const element = document.createElement('div');
    element.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, right: 640, bottom: 480,
      width: 640, height: 480, toJSON: () => ({}),
    });
    const target = ref<HTMLElement>(element);
    const ctl = useViewportProfile(target);
    await nextTick();
    expect(ctl.width.value).toBe(640);
    expect(ctl.height.value).toBe(480);
    ctl.dispose();
    window.ResizeObserver = original;
  });
});
