import { Redirect } from "expo-router";

// Root index — G4 swaps this for an AuthContext-aware redirect that sends
// users to (app) when authenticated and (auth)/phone otherwise. Until then
// every cold start lands on the phone-entry screen.
export default function Index() {
  return <Redirect href="/(auth)/phone" />;
}
