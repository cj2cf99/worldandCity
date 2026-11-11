// 地球内部地图的统一手势（3D 平铺世界图与局部 SVG 地图共用）：
//   单击（轻点）＝聚焦选中；鼠标双击／触屏连点（双击）／触屏长按＝进入下一层；
//   移动端长按不弹浏览器菜单（屏蔽 contextmenu 与长按选择）。拖拽（超过 6 像素）不算点击、也取消长按。
const MOVE = 6, LONG_MS = 520, TAP_GAP = 350, TAP_DIST = 30;
export function bindGestures(el, { hit, focus, enter, ready = () => true, moved = () => false }) {
  let down = null, timer = 0, long = false, touch = false, last = { t: 0, x: 0, y: 0, id: null };
  const clear = () => { clearTimeout(timer); timer = 0; };
  el.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    touch = e.pointerType !== 'mouse'; down = { x: e.clientX, y: e.clientY }; long = false; clear();
    if (touch) { const pt = { clientX: e.clientX, clientY: e.clientY }; timer = setTimeout(() => { timer = 0; if (!ready()) return; const id = hit(pt); if (id) { long = true; enter(id); } }, LONG_MS); } // 长按：进入
  });
  addEventListener('pointermove', (e) => { if (down && timer && Math.hypot(e.clientX - down.x, e.clientY - down.y) > MOVE) clear(); }, { passive: true });
  addEventListener('pointerup', clear); addEventListener('pointercancel', clear);
  el.addEventListener('click', (e) => {
    if (long) { long = false; return; }                                   // 长按已处理，吞掉随后的 click
    if (moved() || (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > MOVE)) return;
    if (!ready()) return;
    const id = hit(e), now = performance.now();
    if (touch && id && last.id === id && now - last.t < TAP_GAP && Math.hypot(e.clientX - last.x, e.clientY - last.y) < TAP_DIST) { last = { t: 0, x: 0, y: 0, id: null }; enter(id); return; } // 连点：进入
    last = { t: now, x: e.clientX, y: e.clientY, id };
    focus(id);                                                             // 单击：聚焦
  });
  el.addEventListener('dblclick', (e) => { if (touch || !ready()) return; const id = hit(e); if (id) enter(id); }); // 鼠标双击：进入
  el.addEventListener('contextmenu', (e) => { if (touch || long) e.preventDefault(); }); // 屏蔽移动端长按菜单
}
