import { describe, expect, it } from "vitest";
import { createClientId } from "./clientId";

describe("createClientId", () => {
  it("uses randomUUID when the browser provides it", () => {
    expect(createClientId({ randomUUID: () => "native-id" })).toBe("native-id");
  });

  it("creates a UUID-compatible id when randomUUID is unavailable", () => {
    const id = createClientId({
      getRandomValues(values) {
        values.fill(0xab);
        return values;
      },
    });

    expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  });
});
