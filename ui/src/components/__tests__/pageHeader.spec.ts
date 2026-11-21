/* PageHeader 看守：31 个 view 各写一套 {prefix}-hd/-l/-r/-ic/-tt/-sub，
 * 标题字号(15/16px)、副标题(11/11.5px)、图标色、gap 全在漂移。抽组件前先锁接口。
 * 范式同 emptyState.spec：项目无 @vue/test-utils，用 createApp 手工 mount。 */
import { describe, it, expect } from 'vitest';
import { createApp, h, type Slots } from 'vue';
import PageHeader from '../PageHeader.vue';
import { PackageOpen } from 'lucide-vue-next';

type PageHeaderProps = InstanceType<typeof PageHeader>['$props'];

function render(props: PageHeaderProps, slots?: Slots): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  createApp({ render: () => h(PageHeader, props, slots) }).mount(host);
  return host;
}

describe('PageHeader', () => {
  it('渲染标题与副标题', () => {
    const el = render({ title: '插件矩阵', subtitle: '_cat/plugins' });
    expect(el.querySelector('.ph-tt')?.textContent).toContain('插件矩阵');
    expect(el.querySelector('.ph-sub')?.textContent?.trim()).toBe('_cat/plugins');
  });

  it('无副标题时不渲染副标题节点——避免空行撑高页头', () => {
    expect(render({ title: '仅标题' }).querySelector('.ph-sub')).toBeNull();
  });

  it('无 actions 插槽时不渲染右侧容器', () => {
    expect(render({ title: 'T' }).querySelector('.ph-r')).toBeNull();
  });

  it('actions 插槽内容进右侧容器', () => {
    const el = render({ title: 'T' }, { actions: () => [h('button', { class: 'act' }, '刷新')] });
    expect(el.querySelector('.ph-r .act')).not.toBeNull();
  });

  it('icon 省略时不渲染图标位', () => {
    expect(render({ title: 'T' }).querySelector('.ph-ic')).toBeNull();
  });

  it('iconColor 覆盖默认品牌色', () => {
    const el = render({ title: 'T', icon: PackageOpen, iconColor: 'var(--ac-hi)' });
    expect(el.querySelector('.ph-ic')?.getAttribute('style')).toContain('var(--ac-hi)');
  });

  it('未传 iconColor 时不写内联 style，交给 CSS 默认值', () => {
    const el = render({ title: 'T', icon: PackageOpen });
    expect(el.querySelector('.ph-ic')?.getAttribute('style')).toBeNull();
  });

  it('title-extra 插槽渲染在标题行内', () => {
    const el = render({ title: 'T' }, { 'title-extra': () => [h('span', { class: 'badge' }, 'beta')] });
    expect(el.querySelector('.ph-tt .badge')).not.toBeNull();
  });

  it('subtitle 插槽优先于 subtitle prop', () => {
    const el = render({ title: 'T', subtitle: '纯文本' }, { subtitle: () => [h('em', { class: 'rich' }, '富结构')] });
    expect(el.querySelector('.ph-sub .rich')).not.toBeNull();
    expect(el.querySelector('.ph-sub')?.textContent).not.toContain('纯文本');
  });

  it('align=top 挂顶部对齐类，默认居中', () => {
    expect(render({ title: 'T', align: 'top' }).querySelector('.ph')?.classList.contains('ph-top')).toBe(true);
    expect(render({ title: 'T' }).querySelector('.ph')?.classList.contains('ph-top')).toBe(false);
  });
});
