import type { PublicSlide } from "@/shared/contracts";

/**
 * Hiển thị một slide theo 3 mẫu: tiêu đề, nội dung, quiz.
 * Cỡ chữ tính theo bề rộng khung (container query units) nên bản thu nhỏ, bản xem trước
 * và màn hình chiếu luôn giữ cùng tỉ lệ, không tràn khung 16:9.
 */
export function SlideView({
  slide,
  className = "",
  quizHint,
}: {
  slide: Pick<PublicSlide, "template" | "title" | "body">;
  /** giữ cho tương thích; cỡ chữ tự co theo khung */
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  quizHint?: string;
}) {
  const lines = slide.body.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <div className={`@container aspect-video w-full overflow-hidden rounded-xl bg-white text-slate-900 ${className}`}>
      <div className="flex h-full w-full flex-col p-[5cqw]">
        {slide.template === "TITLE" ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <h2 className="text-[6.5cqw] font-bold leading-tight">{slide.title || "(Chưa có tiêu đề)"}</h2>
            {slide.body && <p className="mt-[2cqw] text-[3.6cqw] text-slate-600">{slide.body}</p>}
          </div>
        ) : slide.template === "QUIZ" ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="mb-[2cqw] rounded-full bg-amber-100 px-[2cqw] py-[0.6cqw] text-[3cqw] font-semibold text-amber-800">Kiểm tra nhanh</span>
            <h2 className="text-[5.5cqw] font-bold leading-tight">{slide.title || "Câu hỏi trắc nghiệm"}</h2>
            {quizHint && <p className="mt-[1.5cqw] text-[3.2cqw] text-slate-600">{quizHint}</p>}
          </div>
        ) : (
          <>
            <h2 className="mb-[2.5cqw] text-[5cqw] font-bold leading-tight">{slide.title || "(Chưa có tiêu đề)"}</h2>
            <ul className="flex-1 space-y-[1.4cqw] text-[3.6cqw] leading-snug">
              {lines.map((l, i) => (
                <li key={i} className="flex gap-[1.5cqw]">
                  <span className="text-brand">•</span>
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
