import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PortalProvider } from '../state/Portal';

export default function RootLayout() {
  return <SafeAreaProvider><PortalProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false }} /></PortalProvider></SafeAreaProvider>;
}
