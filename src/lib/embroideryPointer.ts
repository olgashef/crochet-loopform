/** Capture embroidery clicks without painting, inspecting, or starting an orbit. */
export class EmbroideryPointer {
  private down: {id: number; x: number; y: number; dragged: boolean} | null = null;
  constructor(private element: HTMLElement, private options: {
    enabled(): boolean;
    click(x: number, y: number): void;
    hover(x: number, y: number): void;
    leave(): void;
  }) {
    element.addEventListener('pointerdown', this.start, true);
    element.addEventListener('pointermove', this.move, true);
    element.addEventListener('pointerup', this.end, true);
    element.addEventListener('pointercancel', this.cancel, true);
    element.addEventListener('lostpointercapture', this.cancel);
    element.addEventListener('pointerleave', this.leave);
    window.addEventListener('blur', this.cancel);
  }
  private stop(event: PointerEvent) { event.preventDefault(); event.stopImmediatePropagation(); }
  private start = (event: PointerEvent) => {
    if (!this.options.enabled() || event.button !== 0) return;
    this.stop(event);
    this.element.focus({preventScroll: true});
    this.down = {id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false};
    this.element.setPointerCapture(event.pointerId);
  };
  private move = (event: PointerEvent) => {
    if (!this.options.enabled()) return;
    if (this.down?.id === event.pointerId) {
      this.stop(event);
      if (Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) >= 5) this.down.dragged = true;
    }
    if (!event.buttons) this.options.hover(event.clientX, event.clientY);
  };
  private end = (event: PointerEvent) => {
    if (!this.down || this.down.id !== event.pointerId) return;
    this.stop(event);
    const down = this.down;
    this.cancel();
    if (this.options.enabled() && !down.dragged && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 5)
      this.options.click(event.clientX, event.clientY);
  };
  cancel = () => {
    const id = this.down?.id;
    this.down = null;
    if (id !== undefined && this.element.hasPointerCapture(id)) this.element.releasePointerCapture(id);
    this.options.leave();
  };
  private leave = () => this.options.leave();
  dispose() {
    this.cancel();
    this.element.removeEventListener('pointerdown', this.start, true);
    this.element.removeEventListener('pointermove', this.move, true);
    this.element.removeEventListener('pointerup', this.end, true);
    this.element.removeEventListener('pointercancel', this.cancel, true);
    this.element.removeEventListener('lostpointercapture', this.cancel);
    this.element.removeEventListener('pointerleave', this.leave);
    window.removeEventListener('blur', this.cancel);
  }
}
