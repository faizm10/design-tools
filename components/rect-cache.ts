export function createRectCache(element: HTMLElement) {
  let frame = 0;
  let rect = element.getBoundingClientRect();

  function refresh() {
    frame = 0;
    rect = element.getBoundingClientRect();
  }

  return {
    get current() {
      if (!frame) {
        frame = requestAnimationFrame(refresh);
      }

      return rect;
    },
    destroy() {
      if (frame) {
        cancelAnimationFrame(frame);
      }
    },
  };
}
