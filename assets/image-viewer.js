// 私人版：共享的原图查看器（主控台剧情/末日卡面、剧情书官方扫描图共用）。
// 用法：window.atoImageViewer.open(src, alt, options)。首次打开时才创建对话框并注入样式。
// options.initial = "actual"：打开时按图片原始像素 100% 显示，并从图片顶部开始（剧情书扫描图用）；
// 默认按屏幕大小适配显示。
// 手势：双指缩放（0.3–6 倍，以两指中点为中心）、单指拖动、双击在适配大小与 2.5 倍间
// 切换（已缩放时双击还原）、鼠标滚轮缩放；右上角 × 或未放大时点图片外关闭。
(function () {
  "use strict";
  if (window.atoImageViewer) return;

  const STYLE = `
.card-image-viewer {
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: rgba(12, 14, 13, 0.92);
  overflow: hidden;
}

.card-image-viewer::backdrop {
  background: rgba(12, 14, 13, 0.92);
}

.card-image-viewer-stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.card-image-viewer-stage img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transform-origin: 0 0;
  will-change: transform;
  pointer-events: none;
  -webkit-user-drag: none;
}

.card-image-viewer-close {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
  width: 44px;
  min-height: 44px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 24px;
  line-height: 1;
}

.card-image-viewer-hint {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  pointer-events: none;
}
`;

  // 卡面原图查看器。双指缩放（0.3–6 倍，以两指中点为中心）、单指拖动、双击
  // 在适配大小与 2.5 倍间切换（已缩放时双击还原）、鼠标滚轮缩放；未放大时点空白处关闭。
  const createViewer = () => {
    const dialog = document.createElement("dialog");
    dialog.className = "card-image-viewer";
    dialog.setAttribute("aria-label", "查看原图");
    dialog.innerHTML = `<div class="card-image-viewer-stage"><img alt=""></div>
<button type="button" class="card-image-viewer-close" aria-label="关闭" data-dashboard-readonly-allowed>×</button>
<div class="card-image-viewer-hint">双指缩放 · 拖动移动 · 双击放大/还原</div>`;
    document.body.appendChild(dialog);
    const stage = dialog.querySelector(".card-image-viewer-stage");
    const img = stage.querySelector("img");
    const MIN = 0.3; // 可缩到原始适配大小的 30%
    let MAX = 6;
    let scale = 1, x = 0, y = 0;
    const pointers = new Map();
    let pinch = null, pan = null, moved = false, lastTap = 0;

    function base() {
      // 图片按 contain 放进舞台后的原始位置（未变换时）
      const rect = stage.getBoundingClientRect();
      return { left: img.offsetLeft, top: img.offsetTop, w: img.offsetWidth, h: img.offsetHeight, sw: rect.width, sh: rect.height };
    }
    function clamp() {
      const b = base();
      const w = b.w * scale, h = b.h * scale;
      // 放大后不让图片拖出可视区；比舞台小时居中
      const minX = Math.min(0, b.sw - w) - b.left, maxX = Math.max(0, b.sw - w) - b.left;
      const minY = Math.min(0, b.sh - h) - b.top, maxY = Math.max(0, b.sh - h) - b.top;
      if (w <= b.sw) x = (b.sw - w) / 2 - b.left; else x = Math.min(maxX, Math.max(minX, x));
      if (h <= b.sh) y = (b.sh - h) / 2 - b.top; else y = Math.min(maxY, Math.max(minY, y));
    }
    function apply() {
      clamp();
      img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    }
    function zoomAt(next, cx, cy) {
      // cx/cy 是舞台坐标；保持该点下的图片内容不动
      next = Math.min(MAX, Math.max(MIN, next));
      const b = base();
      const px = (cx - b.left - x) / scale, py = (cy - b.top - y) / scale;
      scale = next;
      x = cx - b.left - px * scale;
      y = cy - b.top - py * scale;
      apply();
    }
    function reset() {
      scale = 1; x = 0; y = 0;
      img.style.transform = "";
    }
    function local(event) {
      const rect = stage.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    stage.addEventListener("pointerdown", (event) => {
      try { stage.setPointerCapture(event.pointerId); } catch (_) {}
      pointers.set(event.pointerId, local(event));
      moved = false;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        pan = null;
      } else if (pointers.size === 1) {
        const p = pointers.get(event.pointerId);
        pan = { sx: p.x, sy: p.y, x, y };
      }
    });
    stage.addEventListener("pointermove", (event) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, local(event));
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        // 先按两指中点的移动平移，再以新中点缩放
        x += cx - pinch.cx; y += cy - pinch.cy;
        pinch.cx = cx; pinch.cy = cy;
        zoomAt(pinch.scale * dist / pinch.dist, cx, cy);
        moved = true;
      } else if (pan) {
        const p = pointers.get(event.pointerId);
        const dx = p.x - pan.sx, dy = p.y - pan.sy;
        if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
        if (scale > 1) { x = pan.x + dx; y = pan.y + dy; apply(); }
      }
    });
    function release(event) {
      if (!pointers.has(event.pointerId)) return;
      const p = pointers.get(event.pointerId);
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 1) {
        const rest = [...pointers.values()][0];
        pan = { sx: rest.x, sy: rest.y, x, y };
        return;
      }
      pan = null;
      if (event.type !== "pointerup" || moved) return;
      const now = Date.now();
      if (now - lastTap < 300) {
        lastTap = 0;
        if (Math.abs(scale - 1) > 0.05) { reset(); } else { zoomAt(2.5, p.x, p.y); }
        return;
      }
      lastTap = now;
      // 未缩放时单击图片以外的地方关闭
      const tapped = now;
      setTimeout(() => {
        if (lastTap !== tapped || scale > 1.05) return;
        const b = base();
        const inside = p.x >= b.left && p.x <= b.left + b.w && p.y >= b.top && p.y <= b.top + b.h;
        if (!inside) dialog.close();
      }, 310);
    }
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);
    stage.addEventListener("wheel", (event) => {
      event.preventDefault();
      const p = local(event);
      zoomAt(scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15), p.x, p.y);
    }, { passive: false });
    dialog.querySelector(".card-image-viewer-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => { pointers.clear(); pinch = null; pan = null; reset(); img.removeAttribute("src"); });
    window.addEventListener("resize", () => { if (dialog.open && scale > 1) apply(); });
    return {
      open(src, alt, options = {}) {
        if (!src) return;
        reset();
        MAX = 6;
        img.alt = alt || "";
        if (options.initial === "actual") {
          // 等图片排好版再换算：适配大小下的显示宽度 → 原始像素宽度的倍数。
          const showActual = () => {
            if (!img.offsetWidth || !img.naturalWidth) return;
            const actual = img.naturalWidth / img.offsetWidth;
            MAX = Math.max(6, actual * 2);
            scale = Math.min(MAX, Math.max(MIN, actual));
            const b = base();
            x = (b.sw - b.w * scale) / 2 - b.left; // 水平居中（比屏幕宽时 clamp 会贴到左边界范围内）
            y = -b.top; // 图片顶部贴住屏幕顶部
            apply();
          };
          img.addEventListener("load", () => requestAnimationFrame(showActual), { once: true });
        }
        img.src = src;
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
        if (options.initial === "actual" && img.complete && img.naturalWidth) requestAnimationFrame(() => img.dispatchEvent(new Event("load")));
      },
    };
  };

  let viewer = null;
  window.atoImageViewer = {
    open(src, alt, options) {
      if (!src) return;
      if (!viewer) {
        const style = document.createElement("style");
        style.textContent = STYLE;
        document.head.appendChild(style);
        viewer = createViewer();
      }
      viewer.open(src, alt, options);
    },
  };
})();
