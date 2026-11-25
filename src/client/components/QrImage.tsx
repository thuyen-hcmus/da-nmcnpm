"use client";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function QrImage({ value, className = "", label }: { value: string; className?: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: 512 }).then(setSrc).catch(() => setSrc(null));
  }, [value]);
  if (!src) return <div className={`bg-slate-100 ${className}`} aria-label={label} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={label} className={className} />;
}
