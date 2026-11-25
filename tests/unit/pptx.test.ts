import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { extractPptx, PPTX_MAX_BYTES } from "@/server/pptx/extract";

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function sp(ph: string | null, ...paras: string[]) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="1" name="x"/><p:cNvSpPr/><p:nvPr>${ph ? `<p:ph type="${ph}"/>` : ""}</p:nvPr></p:nvSpPr><p:txBody>${paras
    .map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`)
    .join("")}</p:txBody></p:sp>`;
}

/** Dựng một .pptx tối giản: thứ tự slide trong presentation.xml khác tên file để kiểm tra thứ tự. */
export async function buildPptx(slides: { title: string; body: string[]; notes?: string }[]) {
  const zip = new JSZip();
  const order = slides.map((_, i) => slides.length - i); // slide3.xml, slide2.xml, slide1.xml
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0"?><p:presentation ${NS}><p:sldIdLst>${order.map((n, i) => `<p:sldId id="${256 + i}" r:id="rId${n}"/>`).join("")}</p:sldIdLst></p:presentation>`,
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${order
      .map((n) => `<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/>`)
      .join("")}</Relationships>`,
  );
  slides.forEach((s, i) => {
    const n = order[i];
    zip.file(`ppt/slides/slide${n}.xml`, `<?xml version="1.0"?><p:sld ${NS}><p:cSld><p:spTree>${sp("title", s.title)}${sp(null, ...s.body)}${sp("sldNum", "9")}</p:spTree></p:cSld></p:sld>`);
    if (s.notes) {
      zip.file(
        `ppt/slides/_rels/slide${n}.xml.rels`,
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/></Relationships>`,
      );
      zip.file(`ppt/notesSlides/notesSlide${n}.xml`, `<?xml version="1.0"?><p:notes ${NS}><p:cSld><p:spTree>${sp("body", s.notes)}</p:spTree></p:cSld></p:notes>`);
    }
  });
  return zip.generateAsync({ type: "uint8array" });
}

describe("Nhập PowerPoint (FR-061)", () => {
  it("trích tiêu đề, văn bản, ghi chú theo đúng thứ tự trình chiếu", async () => {
    const data = await buildPptx([
      { title: "Hai người một ghế", body: ["Mở đầu"], notes: "Chào lớp" },
      { title: "Bối cảnh", body: ["Ghế A5 trống", "An và Bình cùng thấy"] },
      { title: "Kết luận", body: ["Server quyết định"], notes: "Hỏi lớp" },
    ]);
    const out = await extractPptx(data);
    expect(out).toEqual([
      { title: "Hai người một ghế", body: "Mở đầu", notes: "Chào lớp" },
      { title: "Bối cảnh", body: "Ghế A5 trống\nAn và Bình cùng thấy", notes: "" },
      { title: "Kết luận", body: "Server quyết định", notes: "Hỏi lớp" },
    ]);
  });

  it("tệp hỏng / không phải pptx → PPTX_INVALID", async () => {
    await expect(extractPptx(new TextEncoder().encode("không phải zip"))).rejects.toMatchObject({ code: "PPTX_INVALID" });
    const zip = new JSZip();
    zip.file("hello.txt", "x");
    await expect(extractPptx(await zip.generateAsync({ type: "uint8array" }))).rejects.toMatchObject({ code: "PPTX_INVALID" });
  });

  it("tệp > 20 MB bị từ chối trước khi đọc", async () => {
    await expect(extractPptx(new Uint8Array(PPTX_MAX_BYTES + 1))).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });
});
