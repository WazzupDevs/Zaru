import { describe, expect, it } from "vitest";

import { AttributeDataTypeSchema, AttributeScopeSchema } from "./attribute-definition.js";
import { SlugSchema, ServiceCategoryTypeSchema } from "./service-category.js";

describe("SlugSchema", () => {
  it.each(["wedding-car", "tow-truck", "valet", "shuttle-bus"])("accepts %s", (s) => {
    expect(SlugSchema.parse(s)).toBe(s);
  });

  it.each(["Wedding-Car", "WEDDING", "wedding car", "wedding--car", "-wedding", "wedding-"])(
    "rejects %s",
    (s) => {
      expect(() => SlugSchema.parse(s)).toThrow();
    },
  );
});

describe("ServiceCategoryTypeSchema", () => {
  it("accepts the three known types", () => {
    expect(ServiceCategoryTypeSchema.parse("PLANNED_EVENT")).toBe("PLANNED_EVENT");
    expect(ServiceCategoryTypeSchema.parse("ON_DEMAND_DISPATCH")).toBe("ON_DEMAND_DISPATCH");
    expect(ServiceCategoryTypeSchema.parse("SCHEDULED_TRANSPORT")).toBe("SCHEDULED_TRANSPORT");
  });
  it("rejects unknown type", () => {
    expect(() => ServiceCategoryTypeSchema.parse("UNKNOWN")).toThrow();
  });
});

describe("AttributeDataType + AttributeScope", () => {
  it("data type covers the polymorphic cases", () => {
    expect(AttributeDataTypeSchema.options).toEqual([
      "STRING",
      "NUMBER",
      "BOOLEAN",
      "ENUM",
      "DATE",
    ]);
  });
  it("scope is VEHICLE or BOOKING", () => {
    expect(AttributeScopeSchema.parse("VEHICLE")).toBe("VEHICLE");
    expect(AttributeScopeSchema.parse("BOOKING")).toBe("BOOKING");
    expect(() => AttributeScopeSchema.parse("DRIVER")).toThrow();
  });
});
