import { useEffect, useRef } from "react";
import { X, Check } from "lucide-react";

const CROP_SIZE = 280;
const OUTPUT_SIZE = 400;

interface AvatarEditorProps {
  file: File;
  onSave: (blob: Blob) => void;
  onCancel: () => void;
}

export function AvatarEditor({ file, onSave, onCancel }: AvatarEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);

  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastPinchRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null);

  const redraw = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
    const drawW = img.naturalWidth * scaleRef.current;
    const drawH = img.naturalHeight * scaleRef.current;
    const x = (CROP_SIZE - drawW) / 2 + offsetRef.current.x;
    const y = (CROP_SIZE - drawH) / 2 + offsetRef.current.y;
    ctx.save();
    ctx.beginPath();
    ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, x, y, drawW, drawH);
    ctx.restore();
  };

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const minDim = Math.min(img.naturalWidth, img.naturalHeight);
      scaleRef.current = CROP_SIZE / minDim;
      offsetRef.current = { x: 0, y: 0 };
      redraw();
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Non-passive wheel listener so preventDefault works
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.07 : 0.93;
      const img = imgRef.current;
      if (img) {
        const minScale = (CROP_SIZE / Math.min(img.naturalWidth, img.naturalHeight)) * 0.5;
        scaleRef.current = Math.max(minScale, Math.min(scaleRef.current * factor, 6));
      }
      redraw();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastPinchRef.current = null;
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchRef.current = Math.sqrt(dx * dx + dy * dy);
      lastTouchRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && lastTouchRef.current) {
      const dx = e.touches[0].clientX - lastTouchRef.current.x;
      const dy = e.touches[0].clientY - lastTouchRef.current.y;
      offsetRef.current = { x: offsetRef.current.x + dx, y: offsetRef.current.y + dy };
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      redraw();
    } else if (e.touches.length === 2 && lastPinchRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const factor = dist / lastPinchRef.current;
      const img = imgRef.current;
      if (img) {
        const minScale = (CROP_SIZE / Math.min(img.naturalWidth, img.naturalHeight)) * 0.5;
        scaleRef.current = Math.max(minScale, Math.min(scaleRef.current * factor, 6));
      }
      lastPinchRef.current = dist;
      redraw();
    }
  };

  const handleTouchEnd = () => {
    lastTouchRef.current = null;
    lastPinchRef.current = null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !lastMouseRef.current) return;
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    offsetRef.current = { x: offsetRef.current.x + dx, y: offsetRef.current.y + dy };
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    redraw();
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    lastMouseRef.current = null;
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const out = document.createElement("canvas");
    out.width = OUTPUT_SIZE;
    out.height = OUTPUT_SIZE;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(canvas, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.restore();
    out.toBlob((blob) => {
      if (blob) onSave(blob);
    }, "image/png");
  };

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-4">
        <button
          onClick={onCancel}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white"
          aria-label="Cancel"
        >
          <X className="h-5 w-5" />
        </button>
        <p className="text-sm font-semibold text-white">Crop Photo</p>
        <button
          onClick={handleSave}
          className="rounded-full bg-[var(--orange)] px-5 py-2 text-sm font-semibold text-white active:opacity-80"
        >
          <Check className="inline h-4 w-4 -mt-0.5 mr-1" />
          Save
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={CROP_SIZE}
            height={CROP_SIZE}
            className="cursor-grab rounded-full active:cursor-grabbing touch-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          <div className="pointer-events-none absolute inset-0 rounded-full ring-4 ring-white/50" />
        </div>
        <p className="text-center text-xs text-white/50">
          Drag to reposition · Pinch or scroll to zoom
        </p>
      </div>
    </div>
  );
}
