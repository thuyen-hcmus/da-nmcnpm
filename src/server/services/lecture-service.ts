import { db, type Tx } from "../db";
import { AppError } from "@/shared/errors";
import type { SlideTemplate } from "@/shared/contracts";

/** Kiểm tra quyền sở hữu bài giảng (FR-002). Trả NOT_FOUND nếu không tồn tại, FORBIDDEN nếu của người khác. */
export async function ownedLecture(userId: string, lectureId: string) {
  const l = await db.lecture.findUnique({ where: { id: lectureId } });
  if (!l) throw new AppError("NOT_FOUND", "Không tìm thấy bài giảng");
  if (l.ownerId !== userId) throw new AppError("FORBIDDEN");
  return l;
}

export async function ownedSlide(userId: string, slideId: string) {
  const s = await db.slide.findUnique({ where: { id: slideId }, include: { lecture: true } });
  if (!s) throw new AppError("NOT_FOUND", "Không tìm thấy slide");
  if (s.lecture.ownerId !== userId) throw new AppError("FORBIDDEN");
  return s;
}

export async function listLectures(userId: string) {
  const ls = await db.lecture.findMany({
    where: { ownerId: userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { slides: true } }, sessions: { where: { status: "LIVE" }, select: { id: true } } },
  });
  return ls.map((l) => ({
    id: l.id,
    title: l.title,
    slideCount: l._count.slides,
    updatedAt: l.updatedAt.toISOString(),
    liveSessionId: l.sessions[0]?.id ?? null,
  }));
}

export function serializeQuestion(q: {
  id: string;
  prompt: string;
  options: string;
  correctIndex: number;
  explanation: string;
  sourceSlideIds: string;
  status: string;
  source: string;
  approvedAt: Date | null;
}) {
  return {
    id: q.id,
    prompt: q.prompt,
    options: JSON.parse(q.options) as string[],
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    sourceSlideIds: JSON.parse(q.sourceSlideIds) as string[],
    status: q.status as "DRAFT" | "APPROVED",
    source: q.source as "MANUAL" | "AI",
    approvedAt: q.approvedAt?.toISOString() ?? null,
  };
}

export type SerializedQuestion = ReturnType<typeof serializeQuestion>;

export function serializeSlide(s: {
  id: string;
  position: number;
  template: string;
  title: string;
  body: string;
  notes: string;
  questionId: string | null;
  source: string;
  isAiDraft: boolean;
}) {
  return {
    id: s.id,
    position: s.position,
    template: s.template as SlideTemplate,
    title: s.title,
    body: s.body,
    notes: s.notes,
    questionId: s.questionId,
    source: s.source as "MANUAL" | "AI" | "PPTX",
    isAiDraft: s.isAiDraft,
  };
}

export type SerializedSlide = ReturnType<typeof serializeSlide>;

export async function getLectureDetail(userId: string, lectureId: string) {
  const l = await ownedLecture(userId, lectureId);
  const [slides, questions, sessions] = await Promise.all([
    db.slide.findMany({ where: { lectureId }, orderBy: { position: "asc" } }),
    db.quizQuestion.findMany({ where: { lectureId }, orderBy: { createdAt: "asc" } }),
    db.session.findMany({
      where: { lectureId },
      orderBy: { startedAt: "desc" },
      select: { id: true, code: true, status: true, startedAt: true, endedAt: true },
    }),
  ]);
  return {
    lecture: { id: l.id, title: l.title, outline: l.outline, updatedAt: l.updatedAt.toISOString() },
    slides: slides.map(serializeSlide),
    questions: questions.map(serializeQuestion),
    sessions: sessions.map((s) => ({
      id: s.id,
      code: s.code,
      status: s.status,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
    })),
  };
}

export async function createLecture(userId: string, title: string) {
  return db.lecture.create({ data: { ownerId: userId, title } });
}

export async function updateLecture(userId: string, lectureId: string, data: { title?: string; outline?: string }) {
  await ownedLecture(userId, lectureId);
  return db.lecture.update({ where: { id: lectureId }, data });
}

export async function deleteLecture(userId: string, lectureId: string) {
  await ownedLecture(userId, lectureId);
  const live = await db.session.count({ where: { lectureId, status: "LIVE" } });
  if (live > 0) throw new AppError("CONFLICT", "Hãy kết thúc phiên đang diễn ra trước khi xóa bài giảng");
  await db.lecture.delete({ where: { id: lectureId } });
}

export async function duplicateLecture(userId: string, lectureId: string) {
  const src = await ownedLecture(userId, lectureId);
  const [slides, questions] = await Promise.all([
    db.slide.findMany({ where: { lectureId }, orderBy: { position: "asc" } }),
    db.quizQuestion.findMany({ where: { lectureId } }),
  ]);
  return db.$transaction(async (tx) => {
    const copy = await tx.lecture.create({ data: { ownerId: userId, title: `${src.title} (bản sao)`, outline: src.outline } });
    const slideMap = new Map<string, string>();
    const qMap = new Map<string, string>();
    for (const q of questions) {
      const nq = await tx.quizQuestion.create({
        data: {
          lectureId: copy.id,
          prompt: q.prompt,
          options: q.options,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
          sourceSlideIds: "[]",
          status: q.status,
          source: q.source,
          approvedAt: q.approvedAt,
        },
      });
      qMap.set(q.id, nq.id);
    }
    for (const s of slides) {
      const ns = await tx.slide.create({
        data: {
          lectureId: copy.id,
          position: s.position,
          template: s.template,
          title: s.title,
          body: s.body,
          notes: s.notes,
          questionId: s.questionId ? (qMap.get(s.questionId) ?? null) : null,
          source: s.source,
          isAiDraft: s.isAiDraft,
        },
      });
      slideMap.set(s.id, ns.id);
    }
    for (const q of questions) {
      const ids = (JSON.parse(q.sourceSlideIds) as string[]).map((id) => slideMap.get(id)).filter(Boolean);
      await tx.quizQuestion.update({ where: { id: qMap.get(q.id)! }, data: { sourceSlideIds: JSON.stringify(ids) } });
    }
    return copy;
  });
}

async function touch(tx: Tx, lectureId: string) {
  await tx.lecture.update({ where: { id: lectureId }, data: { updatedAt: new Date() } });
}

/** Chèn slide (dịch các slide sau xuống). Dùng cho thủ công, AI, PPTX. */
export async function insertSlides(
  lectureId: string,
  items: { template: SlideTemplate; title: string; body: string; notes: string; source: "MANUAL" | "AI" | "PPTX"; isAiDraft: boolean; questionId?: string | null }[],
  position?: number,
) {
  return db.$transaction(async (tx) => {
    const count = await tx.slide.count({ where: { lectureId } });
    const at = position === undefined ? count : Math.min(Math.max(position, 0), count);
    if (at < count) {
      // dịch tạm sang vùng âm để tránh trùng unique (lectureId, position)
      const after = await tx.slide.findMany({ where: { lectureId, position: { gte: at } }, orderBy: { position: "desc" } });
      for (const s of after) await tx.slide.update({ where: { id: s.id }, data: { position: -1 - s.position } });
      for (const s of after) await tx.slide.update({ where: { id: s.id }, data: { position: s.position + items.length } });
    }
    const created = [];
    for (let i = 0; i < items.length; i++) {
      created.push(await tx.slide.create({ data: { lectureId, position: at + i, ...items[i], questionId: items[i].questionId ?? null } }));
    }
    await touch(tx, lectureId);
    return created.map(serializeSlide);
  });
}

export async function updateSlide(
  userId: string,
  slideId: string,
  data: { template?: SlideTemplate; title?: string; body?: string; notes?: string; questionId?: string | null; isAiDraft?: boolean },
) {
  const s = await ownedSlide(userId, slideId);
  if (data.questionId) {
    const q = await db.quizQuestion.findUnique({ where: { id: data.questionId } });
    if (!q || q.lectureId !== s.lectureId) throw new AppError("VALIDATION_ERROR", "Câu hỏi không thuộc bài giảng này");
  }
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.slide.update({ where: { id: slideId }, data });
    await touch(tx, s.lectureId);
    return u;
  });
  return serializeSlide(updated);
}

export async function deleteSlide(userId: string, slideId: string) {
  const s = await ownedSlide(userId, slideId);
  await db.$transaction(async (tx) => {
    await tx.slide.delete({ where: { id: slideId } });
    const rest = await tx.slide.findMany({ where: { lectureId: s.lectureId }, orderBy: { position: "asc" } });
    await renumber(tx, rest.map((r) => r.id));
    await touch(tx, s.lectureId);
  });
}

async function renumber(tx: Tx, ids: string[]) {
  for (let i = 0; i < ids.length; i++) await tx.slide.update({ where: { id: ids[i] }, data: { position: -1 - i } });
  for (let i = 0; i < ids.length; i++) await tx.slide.update({ where: { id: ids[i] }, data: { position: i } });
}

export async function reorderSlides(userId: string, lectureId: string, slideIds: string[]) {
  await ownedLecture(userId, lectureId);
  const existing = await db.slide.findMany({ where: { lectureId }, select: { id: true } });
  const set = new Set(existing.map((s) => s.id));
  if (slideIds.length !== set.size || new Set(slideIds).size !== slideIds.length || !slideIds.every((id) => set.has(id))) {
    throw new AppError("VALIDATION_ERROR", "Danh sách slide không khớp với bài giảng");
  }
  await db.$transaction(async (tx) => {
    await renumber(tx, slideIds);
    await touch(tx, lectureId);
  });
}
