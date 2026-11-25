/**
 * Biểu đồ thanh ngang cho kết quả quiz. Một màu chính cho mọi lựa chọn, đáp án đúng được nhấn
 * bằng màu xanh lá và dấu ✓ (không chỉ dựa vào màu). Số liệu ghi trực tiếp trên thanh.
 */
export function QuizChart({
  options,
  counts,
  correctIndex,
  size = "md",
}: {
  options: string[];
  counts: number[];
  correctIndex?: number;
  size?: "md" | "xl";
}) {
  const total = counts.reduce((a, b) => a + b, 0);
  const big = size === "xl";
  return (
    <div className={`w-full ${big ? "space-y-6" : "space-y-3"}`} role="img" aria-label={`Kết quả: ${options.map((o, i) => `${o} ${counts[i] ?? 0}`).join(", ")}`}>
      {options.map((opt, i) => {
        const c = counts[i] ?? 0;
        const pct = total ? Math.round((c / total) * 100) : 0;
        const correct = correctIndex === i;
        return (
          <div key={i}>
            <div className={`mb-1 flex items-baseline justify-between gap-4 ${big ? "text-[clamp(1.5rem,2.6vw,2.5rem)]" : "text-sm"}`}>
              <span className={`font-medium ${correct ? "text-ok" : "text-slate-800"}`}>
                {String.fromCharCode(65 + i)}. {opt} {correct && "✓"}
              </span>
              <span className="tabular-nums text-slate-600">
                {c} · {pct}%
              </span>
            </div>
            <div className={`w-full overflow-hidden rounded-md bg-slate-100 ${big ? "h-10" : "h-4"}`}>
              <div
                className={`h-full rounded-md transition-[width] duration-500 ${correct ? "bg-ok" : correctIndex === undefined ? "bg-brand" : "bg-slate-400"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className={`text-slate-500 ${big ? "text-2xl" : "text-xs"}`}>Tổng: {total} lượt nộp</p>
    </div>
  );
}
