import { fireEvent, render } from "@testing-library/react-native";

import { AddonSelector } from "../AddonSelector";

import type { PricingRuleResponse } from "../../lib/api/pricing";

const sampleAddons: PricingRuleResponse[] = [
  {
    id: "rule-1",
    type: "ADDON",
    categoryId: null,
    vehicleTypeId: null,
    name: "Tepe süslemesi",
    description: null,
    validFrom: null,
    validTo: null,
    daysOfWeek: null,
    multiplier: null,
    fixedAmount: "500.00",
    isOptional: true,
    sortOrder: 0,
    isActive: true,
  },
  {
    id: "rule-2",
    type: "ADDON",
    categoryId: null,
    vehicleTypeId: null,
    name: "Şoför smokin",
    description: null,
    validFrom: null,
    validTo: null,
    daysOfWeek: null,
    multiplier: null,
    fixedAmount: "750.00",
    isOptional: true,
    sortOrder: 0,
    isActive: true,
  },
];

describe("AddonSelector", () => {
  it("renders nothing when there are no addons", () => {
    const { toJSON } = render(<AddonSelector addons={[]} selectedIds={[]} onToggle={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it("renders each addon's name", () => {
    const { getByText } = render(
      <AddonSelector addons={sampleAddons} selectedIds={[]} onToggle={jest.fn()} />,
    );
    expect(getByText("Tepe süslemesi")).toBeTruthy();
    expect(getByText("Şoför smokin")).toBeTruthy();
  });

  it("calls onToggle with the addon id when tapped", () => {
    const onToggle = jest.fn();
    const { getByText } = render(
      <AddonSelector addons={sampleAddons} selectedIds={[]} onToggle={onToggle} />,
    );
    fireEvent.press(getByText("Tepe süslemesi"));
    expect(onToggle).toHaveBeenCalledWith("rule-1");
  });
});
