/* 表格快照 PNG（破窗点立项——html-to-image 动态 import，
 独立 chunk 不进首屏；happy-dom 无布局引擎不可像素级测试，spec 走模块 mock）。
 背景色取 body 实时 computed（暗色主题还原），2x 像素密度保清晰度。 */

export async function snapshotTableToPng(el: HTMLElement, filename: string): Promise<boolean> {
  try {
    const { toPng } = await import('html-to-image');
    const bg = getComputedStyle(document.body).backgroundColor || '#111819';
    const dataUrl = await toPng(el, { backgroundColor: bg, pixelRatio: 2 });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
    return true;
  } catch {
    return false;
  }
}
