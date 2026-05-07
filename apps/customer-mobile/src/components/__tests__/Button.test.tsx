import { fireEvent, render } from "@testing-library/react-native";

import { Button } from "../Button";

describe("Button", () => {
  it("renders the label", () => {
    const { getByText } = render(<Button label="Devam Et" onPress={jest.fn()} />);
    expect(getByText("Devam Et")).toBeTruthy();
  });

  it("fires onPress when tapped", () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button label="Devam Et" onPress={onPress} />);
    fireEvent.press(getByText("Devam Et"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onPress while loading", () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Button label="Devam Et" onPress={onPress} loading />);
    fireEvent.press(getByRole("button"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("does NOT fire onPress when disabled", () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button label="Devam Et" onPress={onPress} disabled />);
    fireEvent.press(getByText("Devam Et"));
    expect(onPress).not.toHaveBeenCalled();
  });
});
