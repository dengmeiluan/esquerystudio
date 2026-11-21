/* 2.5.0 宿主主题跟随（菜单 SPI 配套）：嵌入 iframe 时 console 可跟随宿主明暗。
 双通道：URL ?hostTheme= 防首屏闪（index.html 内联 script 与本 store 初始化各读一次）；
 postMessage esquerystudio-host-theme 做运行期热切。用户手切主题档即反超（见 app store setHostTheme）。 */
export type HostThemeMode = 'dark' | 'light';

/** 从查询串解析 hostTheme（非法/缺省 → null，调用方兜底）。 */
export function readUrlHostTheme(search?: string): HostThemeMode | null {
  const raw = typeof search === 'string' ? search
    : (typeof window !== 'undefined' ? window.location.search : '');
  const v = new URLSearchParams(raw).get('hostTheme');
  return v === 'dark' || v === 'light' ? v : null;
}
