import { Redirect } from 'expo-router';

/** The centre "+" tab opens /compose directly; this route only exists to hold the tab slot. */
export default function PostTab() {
  return <Redirect href="/" />;
}
