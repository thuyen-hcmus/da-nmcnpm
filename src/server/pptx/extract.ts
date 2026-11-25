/**
 * Trích xuất tiêu đề, văn bản và ghi chú từ .pptx (OOXML = zip + XML). Không giữ bố cục/hiệu ứng.
 * research.md R5.
 */
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { AppError } from "@/shared/errors";

export const PPTX_MAX_BYTES = 20 * 1024 * 1024;
const MAX_SLIDES = 200;

export type ExtractedSlide = { title: string; body: string; notes: string };

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true, isArray: () => false });

function arr<T>(x: T | T[] | undefined): T[] {
  return x === undefined ? [] : Array.isArray(x) ? x : [x];
}

/** Lấy text các đoạn (a:p) trong một txBody. */
function paragraphs(txBody: unknown): string[] {
  const out: string[] = [];
  for (const p of arr((txBody as { p?: unknown })?.p)) {
    const runs = [...arr((p as { r?: unknown }).r), ...arr((p as { fld?: unknown }).fld)];
    const text = runs
      .map((r) => {
        const t = (r as { t?: unknown }).t;
        return typeof t === "string" || typeof t === "number" ? String(t) : typeof t === "object" && t && "#text" in t ? String((t as { "#text": unknown })["#text"]) : "";
      })
      .join("")
      .trim();
    if (text) out.push(text);
  }
  return out;
}

/** Duyệt mọi shape (kể cả trong group). */
function shapes(tree: unknown): unknown[] {
  const t = tree as { sp?: unknown; grpSp?: unknown };
  return [...arr(t?.sp), ...arr(t?.grpSp).flatMap((g) => shapes(g))];
}

function placeholderType(sp: unknown): string | undefined {
  return (sp as { nvSpPr?: { nvPr?: { ph?: { "@type"?: string } } } })?.nvSpPr?.nvPr?.ph?.["@type"];
}

function relTarget(relsXml: string | undefined, type: string): string | undefined {
  if (!relsXml) return undefined;
  const rels = arr(parser.parse(relsXml)?.Relationships?.Relationship) as { "@Type": string; "@Target": string }[];
  return rels.find((r) => r["@Type"].endsWith(`/${type}`))?.["@Target"];
}

function resolve(base: string, target: string) {
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

export async function extractPptx(data: ArrayBuffer | Uint8Array): Promise<ExtractedSlide[]> {
  if (data.byteLength > PPTX_MAX_BYTES) throw new AppError("PAYLOAD_TOO_LARGE");
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new AppError("PPTX_INVALID");
  }
  try {
    const presXml = await zip.file("ppt/presentation.xml")?.async("string");
    const presRels = await zip.file("ppt/_rels/presentation.xml.rels")?.async("string");
    if (!presXml || !presRels) throw new AppError("PPTX_INVALID");

    const pres = parser.parse(presXml);
    const rels = arr(parser.parse(presRels)?.Relationships?.Relationship) as { "@Id": string; "@Target": string }[];
    const relMap = new Map(rels.map((r) => [r["@Id"], r["@Target"]]));
    const ids = arr(pres?.presentation?.sldIdLst?.sldId) as Record<string, string>[];
    const slidePaths = ids
      .map((s) => relMap.get(s["@id"] ?? s["@r:id"]))
      .filter((p): p is string => !!p)
      .map((p) => resolve("ppt/presentation.xml", p))
      .slice(0, MAX_SLIDES);

    const out: ExtractedSlide[] = [];
    for (const path of slidePaths) {
      const xml = await zip.file(path)?.async("string");
      if (!xml) continue;
      const doc = parser.parse(xml);
      let title = "";
      const body: string[] = [];
      for (const sp of shapes(doc?.sld?.cSld?.spTree)) {
        const ph = placeholderType(sp);
        const lines = paragraphs((sp as { txBody?: unknown }).txBody);
        if (!lines.length) continue;
        if (!title && (ph === "title" || ph === "ctrTitle")) title = lines.join(" ");
        else if (ph !== "sldNum" && ph !== "dt" && ph !== "ftr") body.push(...lines);
      }
      if (!title && body.length) title = body.shift()!;

      let notes = "";
      const relsPath = path.replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels");
      const notesTarget = relTarget(await zip.file(relsPath)?.async("string"), "notesSlide");
      if (notesTarget) {
        const nxml = await zip.file(resolve(path, notesTarget))?.async("string");
        if (nxml) {
          const ndoc = parser.parse(nxml);
          notes = shapes(ndoc?.notes?.cSld?.spTree)
            .filter((sp) => placeholderType(sp) === "body")
            .flatMap((sp) => paragraphs((sp as { txBody?: unknown }).txBody))
            .join("\n");
        }
      }
      out.push({ title: title.slice(0, 200), body: body.join("\n").slice(0, 5000), notes: notes.slice(0, 5000) });
    }
    if (out.length === 0) throw new AppError("PPTX_INVALID", "Tệp không có slide nào");
    return out;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("PPTX_INVALID");
  }
}
