import { expect, it } from "vitest";
import { documentSections } from "../src/features/documents/document-layout";

it.each([
  "",
  "One unchanged paragraph. 😀",
  "Title 😀\n\n01 / Intent\nA paragraph.\n\n02 / Next\nMore words.",
  "\r\n\r\nHeading\r\nOriginal Windows lines.\r\n\r\n\r\nEnding\r\n",
])("keeps source text and UTF-16 offsets intact: %s", (text) => {
  const sections = documentSections(text);
  expect(sections.map((section) => section.text).join("")).toBe(text);
  for (const section of sections)
    expect(text.slice(section.start, section.start + section.text.length)).toBe(
      section.text,
    );
});

it("formats short section headings without inventing or removing source content", () => {
  const sections = documentSections(
    "01 / Intent\nBody text.\n\nThis is a sentence.\nAnother line.",
  );
  expect(sections[0].headingLength).toBe("01 / Intent".length);
  expect(sections[2].headingLength).toBe(0);
});
