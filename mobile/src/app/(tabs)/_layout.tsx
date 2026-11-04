import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '../../components/ui';
import { usePortal } from '../../state/Portal';

export default function TabLayout() {
  const { user } = usePortal();
  if (!user) return <Redirect href="/" />;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: '#FFF', borderTopColor: colors.border }, tabBarLabelStyle: { fontSize: 11, fontWeight: '600' } }}>
    <Tabs.Screen name="properties" options={{ title: 'Properties', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }}>⌂</Text> }} />
    <Tabs.Screen name="reservations" options={{ title: 'Reservations', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>▤</Text> }} />
    <Tabs.Screen name="updates" options={{ title: 'Updates', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 21 }}>◉</Text> }} />
    <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 22 }}>◎</Text> }} />
  </Tabs>;
}
