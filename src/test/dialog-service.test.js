import { describe, expect, it } from "vitest";
import { appConfirm, appPrompt, peekDialog, settleDialog } from "../shared/ui/dialogService.js";

describe("application dialog service", () => {
  it("resolves confirmations through the shared queue", async () => {
    const result = appConfirm("Silinsin?");
    expect(peekDialog()?.kind).toBe("confirm");
    settleDialog(true);
    await expect(result).resolves.toBe(true);
  });

  it("returns prompt values without native browser APIs", async () => {
    const result = appPrompt("Səbəb", "");
    expect(peekDialog()?.kind).toBe("prompt");
    settleDialog("Təsdiqli səbəb");
    await expect(result).resolves.toBe("Təsdiqli səbəb");
  });
});
