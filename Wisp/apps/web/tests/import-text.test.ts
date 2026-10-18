import { afterEach, expect, it, vi } from "vitest";
import { readFileText } from "../src/services/import-text";

afterEach(() => vi.unstubAllGlobals());
const result = (format = "docx", text = "[正文]\n活动计划") => ({
  schemaVersion: "import-text-1",
  format,
  text,
  warnings: ["仅提取文字，不保留页面样式。"],
});
const file = (name = "私人文件名.docx") =>
  new File([new Uint8Array([80, 75, 3, 4])], name);
const signal = () => new AbortController().signal;
function respond(value: unknown, status = 200) {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(value), { status }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

it.each(["docx", "pptx", "xlsx", "pdf"])(
  "sends a %s binary only to the local parser and binds the returned format",
  async (format) => {
    const fetcher = respond(result(format));
    const chosen = file(`私人文件名.${format.toUpperCase()}`);
    await expect(readFileText(chosen, signal())).resolves.toEqual({
      text: "[正文]\n活动计划",
      warnings: ["仅提取文字，不保留页面样式。"],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(`/api/import-text?format=${format}`);
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      "Content-Type": "application/octet-stream",
    });
    expect(options.body).toBe(chosen);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(url).not.toContain("私人文件名");
  },
);

it("keeps UTF-8 TXT decoding local and normalizes line endings", async () => {
  const fetcher = respond(null);
  await expect(
    readFileText(
      new File(["\ufeff第一行\r\n第二行\r尾行"], "notes.TXT"),
      signal(),
    ),
  ).resolves.toEqual({ text: "第一行\n第二行\n尾行", warnings: [] });
  await expect(
    readFileText(new File([new Uint8Array([0xff])], "bad.txt"), signal()),
  ).rejects.toThrow("UTF-8");
  expect(fetcher).not.toHaveBeenCalled();
});

it("rejects unsupported and oversized input before sending file bytes", async () => {
  const fetcher = respond(null);
  await expect(readFileText(file("legacy.doc"), signal())).rejects.toThrow();
  await expect(
    readFileText(new File([new Uint8Array(20_000_001)], "large.pdf"), signal()),
  ).rejects.toThrow("20 MB");
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  null,
  [],
  { ...result(), schemaVersion: "import-text-2" },
  { ...result(), format: "pdf" },
  { ...result(), extra: "unexpected" },
  { ...result(), text: "   " },
  { ...result(), text: "a\r\nb" },
  { ...result(), text: "a\0b" },
  { ...result(), text: "😀".repeat(30_001) },
  { ...result(), warnings: null },
  { ...result(), warnings: [42] },
  { ...result(), warnings: [""] },
  { ...result(), warnings: ["x".repeat(201)] },
  { ...result(), warnings: ["a\0b"] },
  { ...result(), warnings: Array(11).fill("提示") },
  { ...result(), warnings: Array(10).fill("提".repeat(200)) },
])("rejects a malformed or unbound parser result %#", async (value) => {
  respond(value);
  await expect(readFileText(file(), signal())).rejects.toThrow("无效响应");
});

it("accepts the UTF-16 boundary and maximum warning list", async () => {
  const text = "😀".repeat(30_000);
  const warnings = [...Array(9).fill("提".repeat(200)), "提".repeat(191)];
  respond({ ...result("docx", text), warnings });
  await expect(readFileText(file(), signal())).resolves.toEqual({
    text,
    warnings,
  });
});

it.each([
  ["IMPORT_FORMAT_UNSUPPORTED", "仅支持"],
  ["IMPORT_FILE_TOO_LARGE", "20 MB"],
  ["IMPORT_TEXT_TOO_LARGE", "60,000"],
  ["IMPORT_FILE_INVALID", "损坏"],
  ["IMPORT_ENCRYPTED", "加密"],
  ["IMPORT_NO_TEXT", "不含 OCR"],
  ["IMPORT_LIMIT_EXCEEDED", "拆分"],
  ["IMPORT_TIMEOUT", "超时"],
  ["IMPORT_BUSY", "正忙"],
  ["IMPORT_FAILED", "读取失败"],
  ["unknown", "读取失败"],
  ["constructor", "读取失败"],
])(
  "maps %s to a fixed message without exposing server details",
  async (code, message) => {
    respond({ error: { code, message: "PRIVATE_SERVER_DETAIL" } }, 422);
    await expect(readFileText(file(), signal())).rejects.toThrow(message);
  },
);

it("rejects HTML and oversized responses without exposing raw data", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("<html>PRIVATE</html>")),
  );
  await expect(readFileText(file(), signal())).rejects.toThrow("无效响应");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(" ".repeat(512_001))),
  );
  await expect(readFileText(file(), signal())).rejects.toThrow("无效响应");
});

it("does not send an already cancelled read and rejects a late response", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetcher = respond(result());
  await expect(readFileText(file(), controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(fetcher).not.toHaveBeenCalled();

  const lateController = new AbortController();
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const reading = readFileText(file(), lateController.signal);
  lateController.abort();
  finish(new Response(JSON.stringify(result())));
  await expect(reading).rejects.toMatchObject({ name: "AbortError" });
});

it("reports network failures without exposing transport internals", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("PRIVATE_NETWORK_DETAIL")),
  );
  await expect(readFileText(file(), signal())).rejects.toThrow(
    "本机文件读取中断或超时",
  );
});
