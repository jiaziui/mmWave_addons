import { describe, expect, it } from "vitest";
import { parseTagEventSnapshot } from "../src/domain/tagEvent";

describe("tag event parsing", () => {
  it("uses the MQTT topic route when the payload route is missing", () => {
    const event = parseTagEventSnapshot(
      "c4004_0/dfrobot_c4004/main/state/tag_event",
      JSON.stringify({
        schema: 1,
        type: "tag_event",
        tag_index: 2,
        tag_type: "people_counting",
        tag_type_code: 3,
        io_index: 3,
        center_x_cm: 100,
        center_y_cm: 200,
        moving_count: 1,
        static_count: 2,
      }),
    );

    expect(event).toMatchObject({
      topicPrefix: "c4004_0",
      mqttKey: "main",
      tagIndex: 2,
      tagType: "people_counting",
      movingCount: 1,
      staticCount: 2,
    });
  });

  it("keeps the topic route authoritative when payload metadata is stale", () => {
    const event = parseTagEventSnapshot(
      "c4004_2/dfrobot_c4004/main/state/tag_event",
      JSON.stringify({
        schema: 1,
        type: "tag_event",
        device_topic_prefix: "c4004_0",
        mqtt_key: "other",
        tag_index: 0,
        tag_type: "boundary",
        tag_type_code: 1,
        io_index: 2,
        center_x_cm: 0,
        center_y_cm: 100,
        boundary_state: "enter",
      }),
    );

    expect(event).toMatchObject({ topicPrefix: "c4004_2", mqttKey: "main" });
  });
});
