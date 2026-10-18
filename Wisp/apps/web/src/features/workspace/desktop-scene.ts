import type { Material } from "../../domain/model";

export const CHECKLIST_ID = "wisp-demo-checklist";

export function desktopApp(material: Material) {
  if (material.id === "venue")
    return {
      name: "Mail",
      icon: "envelope-simple",
      tone: "mail",
      file: "Character & story notes.docx",
      category: "CHARACTER & STORY",
      subtitle: "Deep Space Receiver · narrative room",
    };
  if (material.id === CHECKLIST_ID)
    return {
      name: "Sheets",
      icon: "file-xls",
      tone: "sheets",
      file: "Gameplay beats.xlsx",
      category: "SIGNAL TO STORY",
      subtitle: "Deep Space Receiver / click a beat to edit",
    };
  return {
    name: "Pages",
    icon: "file-doc",
    tone: "pages",
    file:
      material.id === "proposal"
        ? "Deep Space Receiver.docx"
        : (material.origin?.fileName ?? material.title + ".txt"),
    category:
      material.id === "proposal"
        ? "DEEP SPACE RECEIVER / CONCEPT"
        : "YOUR WORKING DOCUMENT",
    subtitle:
      material.id === "proposal"
        ? "Game concept draft / still taking shape"
        : "Your words, saved on this device",
  };
}
