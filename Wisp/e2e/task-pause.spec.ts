import { test, expect, type Page } from "./offline-app";
import type { SingleTask, Task } from "../apps/web/src/domain/task";
import type { Watch } from "../apps/web/src/domain/watch";

interface WorkerProbe {
  tasks: SingleTask[];
  terminated: number;
  restore: () => void;
}
type ProbedWindow = Window & typeof globalThis & { pauseProbe: WorkerProbe };

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() =>
    localStorage.setItem("wisp-tour-seen", "true"),
  );
});

async function open(page: Page) {
  await page.goto("/");
  await expect(
    page.getByLabel("Bookstore event proposal reading view", { exact: true }),
  ).toBeVisible();
}

async function records(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("wisp-module-one");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = <T>(store: "tasks" | "watches") =>
      new Promise<T[]>((resolve, reject) => {
        const request = db.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const [tasks, watches] = await Promise.all([
      read<Task>("tasks"),
      read<Watch>("watches"),
    ]);
    db.close();
    return { tasks, watches };
  });
}

async function holdWorkers(page: Page) {
  await page.evaluate(() => {
    const Original = window.Worker;
    const probe: WorkerProbe = {
      tasks: [],
      terminated: 0,
      restore: () => {
        window.Worker = Original;
      },
    };
    (window as ProbedWindow).pauseProbe = probe;
    // Keep the actual task pending so pause must terminate execution, not just
    // repaint a status after a fast worker has already completed.
    window.Worker = class {
      postMessage(task: SingleTask) {
        probe.tasks.push(structuredClone(task));
      }
      terminate() {
        probe.terminated++;
      }
    } as unknown as typeof Worker;
  });
}

async function edit(page: Page, text: string) {
  await page
    .getByRole("button", { name: "Open Bookstore event proposal", exact: true })
    .click();
  const editor = page.getByLabel("Bookstore event proposal text", {
    exact: true,
  });
  if (!(await editor.isVisible()))
    await page
      .getByRole("button", {
        name: "Edit text of Bookstore event proposal",
        exact: true,
      })
      .click();
  await editor.fill(text);
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
}

async function startWatch(page: Page) {
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const proposals = page.getByRole("checkbox", { name: /Helpful proposals/ });
  if (!(await proposals.isChecked())) {
    await proposals.check();
    await expect(
      page.getByText("Settings saved", { exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Close Grimoire" }).click();
  await page
    .getByRole("button", { name: "Open Bookstore event proposal", exact: true })
    .click();
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Check", exact: true }).click();
  await page
    .getByRole("button", { name: "Run local check", exact: true })
    .click();
  await page.getByRole("button", { name: "Close check result" }).click();
  await page.getByRole("button", { name: "View watch scope" }).click();
  await page
    .getByRole("button", { name: "Confirm and start watching", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Confirm continuous watch" }),
  ).toHaveCount(0);
}

test("another tab pauses the actual worker and continues the same frozen one-time task", async ({
  page,
  context,
}) => {
  await open(page);
  await holdWorkers(page);
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Summon", exact: true }).click();
  await page.getByRole("button", { name: "Page Sprite", exact: false }).click();
  await page
    .getByLabel("Delegation instruction", { exact: false })
    .fill("Keep this original scope");
  await page
    .getByRole("button", { name: "Summon familiar", exact: true })
    .click();
  await expect
    .poll(async () =>
      page.evaluate(() => (window as ProbedWindow).pauseProbe.tasks.length),
    )
    .toBe(1);
  const original = (await records(page)).tasks[0] as SingleTask;
  expect(original.status).toBe("running");
  const other = await context.newPage();
  await open(other);
  await other.getByRole("button", { name: "View familiar tasks" }).click();
  await other.getByRole("button", { name: "Pause task", exact: true }).click();
  await expect(other.getByTestId("task-card")).toContainText("Paused");
  await expect
    .poll(async () =>
      page.evaluate(() => (window as ProbedWindow).pauseProbe.terminated),
    )
    .toBe(1);
  await expect
    .poll(async () => (await records(page)).tasks[0].status)
    .toBe("paused");
  await other.getByRole("button", { name: "Close Grimoire" }).click();
  await edit(other, "A newer source must not replace the paused copy.");
  await other.reload();
  await other.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(other.getByTestId("task-card")).toContainText("Paused");
  await expect(
    other.getByRole("button", { name: "View reply", exact: true }),
  ).toHaveCount(0);
  await other
    .getByRole("button", { name: "Continue task", exact: true })
    .click();
  await expect(other.getByTestId("task-card")).toContainText("Completed");
  const finished = (await records(other)).tasks;
  expect(finished).toHaveLength(1);
  expect(finished[0]).toMatchObject({
    id: original.id,
    snapshot: original.snapshot,
    instruction: original.instruction,
    status: "completed",
    unread: true,
    result: { snapshot: original.snapshot },
  });
});

test("cross-tab watch pause stops its worker and continue finishes the frozen version before newer changes", async ({
  page,
  context,
}) => {
  await open(page);
  await startWatch(page);
  await holdWorkers(page);
  await edit(
    page,
    "The event opens on November 8. The poster is finalized on November 10.",
  );
  await expect
    .poll(async () =>
      page.evaluate(() => (window as ProbedWindow).pauseProbe.tasks.length),
    )
    .toBe(1);
  const original = (await records(page)).tasks[0] as SingleTask;
  const originalWatch = (await records(page)).watches[0];
  const other = await context.newPage();
  await open(other);
  await other.getByRole("button", { name: "View familiar tasks" }).click();
  await other
    .getByTestId("watch-card")
    .getByRole("button", { name: "Pause watch", exact: true })
    .click();
  await expect
    .poll(async () =>
      page.evaluate(() => (window as ProbedWindow).pauseProbe.terminated),
    )
    .toBe(1);
  await expect(other.getByTestId("watch-card")).toContainText("Paused");
  await expect(other.getByTestId("task-card")).toContainText("Paused");
  await other.getByRole("button", { name: "Close Grimoire" }).click();
  await edit(
    other,
    "The event opens on November 12. The poster is finalized on November 14.",
  );
  await other.reload();
  await other.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(other.getByTestId("watch-card")).toContainText("Paused");
  expect((await records(other)).tasks).toHaveLength(1);
  await holdWorkers(other);
  await other
    .getByTestId("watch-card")
    .getByRole("button", { name: "Continue watch", exact: true })
    .click();
  await expect
    .poll(async () =>
      other.evaluate(() => (window as ProbedWindow).pauseProbe.tasks.length),
    )
    .toBe(1);
  expect(
    await other.evaluate(() => (window as ProbedWindow).pauseProbe.tasks[0]),
  ).toMatchObject({
    id: original.id,
    snapshot: original.snapshot,
    watchId: originalWatch.id,
  });
  expect((await records(other)).tasks).toHaveLength(1);
  await other
    .getByTestId("watch-card")
    .getByRole("button", { name: "Pause watch", exact: true })
    .click();
  await expect
    .poll(async () =>
      other.evaluate(() => (window as ProbedWindow).pauseProbe.terminated),
    )
    .toBe(1);
  await other.evaluate(() => (window as ProbedWindow).pauseProbe.restore());
  // Wait for the old watch lock to be released before asking to continue.
  await expect
    .poll(async () =>
      other.evaluate(async () =>
        (await navigator.locks.query()).held?.some((lock) =>
          lock.name?.startsWith("wisp-watch:"),
        ),
      ),
    )
    .toBe(false);
  await other
    .getByTestId("watch-card")
    .getByRole("button", { name: "Continue watch", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await records(other)).tasks.filter(
          (task) => task.status === "completed",
        ).length,
    )
    .toBe(2);
  const finished = await records(other);
  expect(finished.watches).toHaveLength(1);
  expect(finished.watches[0]).toMatchObject({
    id: originalWatch.id,
    status: "active",
  });
  expect(finished.tasks.find((task) => task.id === original.id)).toMatchObject({
    snapshot: original.snapshot,
    status: "completed",
    result: { snapshot: original.snapshot },
  });
  expect(finished.tasks.find((task) => task.id !== original.id)).toMatchObject({
    watchId: originalWatch.id,
    snapshot: { materialVersion: original.snapshot.materialVersion + 1 },
    status: "completed",
  });
  await other
    .getByTestId("watch-card")
    .getByRole("button", { name: "Stop watching", exact: true })
    .click();
  await expect(other.getByTestId("watch-card")).toContainText("Stopped");
});

test("an idle watch stays paused across reload and checks saved changes only after continue", async ({
  page,
}) => {
  await open(page);
  await startWatch(page);
  const original = (await records(page)).watches[0];
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await page
    .getByTestId("watch-card")
    .getByRole("button", { name: "Pause watch", exact: true })
    .click();
  await expect(page.getByTestId("watch-card")).toContainText("Paused");
  await page.getByRole("button", { name: "Close Grimoire" }).click();
  await edit(page, "A changed version saved while the watch is paused.");
  await page.reload();
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(page.getByTestId("watch-card")).toContainText("Paused");
  await expect(page.getByTestId("task-card")).toHaveCount(0);
  await page
    .getByTestId("watch-card")
    .getByRole("button", { name: "Continue watch", exact: true })
    .click();
  await expect(page.getByTestId("task-card")).toContainText("Completed");
  const finished = await records(page);
  expect(finished.watches).toHaveLength(1);
  expect(finished.watches[0]).toMatchObject({
    id: original.id,
    status: "active",
  });
  expect(finished.tasks).toHaveLength(1);
  expect(finished.tasks[0]).toMatchObject({
    watchId: original.id,
    snapshot: { text: "A changed version saved while the watch is paused." },
  });
  await page
    .getByTestId("watch-card")
    .getByRole("button", { name: "Stop watching", exact: true })
    .click();
});
