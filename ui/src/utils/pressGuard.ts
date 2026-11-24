/*
 * Copyright 2026 Meiluan Deng
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* 手势仲裁单源：拖选守卫 + 单击/双击消歧——
 * ① mousedown 锚定坐标，click 时位移超阈即「拖选文本松手」，不当作单击；
 * ② 单击动作经 single() 延迟仲裁，双击的第二 click 到达即取消首击——
 *    双击选词是普世文本手势，不该被单击导航（开抽屉/复制）抢先劫持；
 * ③ 键盘合成路径（KeyboardEvent.detail===0，Enter/Space 派生）不经守卫直认单击。
 * 消费分工：导航面（文档渲染三档）全量用；数据网格单元格只用 moved 阈值
 * （无导航代价，且存量 spec 以同位 .click() 断言，延迟会炸全量基线）。 */

export interface PressGuard {
  /** mousedown 时锚定起点坐标 */
  down(e: MouseEvent): void;
  /** click 相对按下起点位移超阈（默认 4px）= 拖选手势 */
  moved(e: MouseEvent, tol?: number): boolean;
  /** 单击延迟仲裁：延迟窗口内再次 click（双击的第二击）到达即取消 */
  single(action: () => void): void;
  /** 双击/外部的取消入口：丢弃尚未触发的延迟单击动作 */
  cancelPending(): void;
}

export function createPressGuard(delay = 260): PressGuard {
  let sx = 0;
  let sy = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    down(e) { sx = e.clientX; sy = e.clientY; },
    moved(e, tol = 4) { return Math.hypot(e.clientX - sx, e.clientY - sy) > tol; },
    single(action) {
      window.clearTimeout(timer);
      timer = setTimeout(action, delay);
    },
    cancelPending() { window.clearTimeout(timer); },
  };
}

/** 键盘派生的 click（detail===0）不走手势守卫：无坐标语义，直认单击 */
export function isKeyboardClick(e: MouseEvent): boolean {
  return e.detail === 0;
}
