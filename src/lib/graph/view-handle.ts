/** Imperative camera/export surface of GraphView and OrchgraphView. */
export interface GraphViewHandle {
  fit(): void;
  panScreen?(dx: number, dy: number): void;
  zoomBy?(factor: number): void;
  focusNode?(id: string): void;
  snapshotSvg?(): SVGSVGElement | null;
  copy?(): Promise<void>;
}
