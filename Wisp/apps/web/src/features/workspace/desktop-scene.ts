import type { Material } from "../../domain/model";

export const CHECKLIST_ID = "wisp-demo-checklist";

export function desktopApp(material: Material) {
  if (material.id === "venue")
    return {
      name: "Mail",
      icon: "envelope-simple",
      tone: "mail",
      file: "Venue notes.docx",
      category: "NOTES FROM THE VENUE",
      subtitle: "References for the event · click to edit",
    };
  if (material.id === CHECKLIST_ID)
    return {
      name: "Sheets",
      icon: "file-xls",
      tone: "sheets",
      file: "Event checklist.xlsx",
      category: "ONE SMALL THING AT A TIME",
      subtitle: "Nightjar Books / click a cell to edit",
    };
  return {
    name: "Pages",
    icon: "file-doc",
    tone: "pages",
    file:
      material.id === "proposal"
        ? "Weekend event.docx"
        : (material.origin?.fileName ?? material.title + ".txt"),
    category:
      material.id === "proposal"
        ? "WEEKEND AT THE BOOKSTORE"
        : "YOUR WORKING DOCUMENT",
    subtitle:
      material.id === "proposal"
        ? "Nightjar Books · event draft / still taking shape"
        : "Your words, saved on this device",
  };
}
