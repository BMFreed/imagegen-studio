import type { Directive } from 'vue';

type OverflowTitleElement = HTMLElement & {
  __overflowTitleCleanup?: () => void;
};

function getText(el: HTMLElement) {
  return el.textContent?.trim().replaceAll(/\s+/g, ' ') ?? '';
}

function updateTitle(el: HTMLElement) {
  const text = getText(el);
  const hasOverflow = el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight;

  if (text && hasOverflow) {
    el.setAttribute('title', text);
    el.dataset.overflowTitle = 'managed';
    return;
  }

  if (el.dataset.overflowTitle === 'managed') {
    el.removeAttribute('title');
    delete el.dataset.overflowTitle;
  }
}

export const overflowTitleDirective: Directive<OverflowTitleElement> = {
  beforeUnmount(el) {
    el.__overflowTitleCleanup?.();
    delete el.__overflowTitleCleanup;
  },
  mounted(el) {
    const refresh = () => updateTitle(el);

    el.addEventListener('mouseenter', refresh);
    el.addEventListener('focus', refresh);
    window.addEventListener('resize', refresh);
    requestAnimationFrame(refresh);

    el.__overflowTitleCleanup = () => {
      el.removeEventListener('mouseenter', refresh);
      el.removeEventListener('focus', refresh);
      window.removeEventListener('resize', refresh);
    };
  },
  updated(el) {
    requestAnimationFrame(() => updateTitle(el));
  },
};
