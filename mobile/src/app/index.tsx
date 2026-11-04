import { useState } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, colors, Heading, styles } from '../components/ui';
import { usePortal } from '../state/Portal';

export default function Login() {
  const portal = usePortal();
  const [serverOverride, setServer] = useState<string | null>(null);
  const server = serverOverride ?? portal.server;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState(false);
  if (portal.booting) return <SafeAreaView style={[styles.page, { justifyContent: 'center' }]}><ActivityIndicator color={colors.green} /><Text style={[styles.body, { textAlign: 'center', marginTop: 16 }]}>Opening your portal…</Text></SafeAreaView>;
  if (portal.user) return <Redirect href="/(tabs)/properties" />;
  const signIn = async () => {
    setBusy(true); setError('');
    try { await portal.login(server, username, password); setPassword(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to sign in.'); }
    finally { setBusy(false); }
  };
  return <SafeAreaView style={styles.page}><KeyboardAvoidingView style={{ flex: 1 }} behavior="height"><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { flexGrow: 1, justifyContent: 'center' }]}>
    <View style={{ backgroundColor: colors.green, borderRadius: 23, width: 66, height: 66, justifyContent: 'center', alignItems: 'center', marginBottom: 30 }}><Text style={{ color: '#FFF', fontWeight: '700', fontSize: 30 }}>R</Text></View>
    <Heading eyebrow="RESERVATION PORTAL" title={'Your next chapter,\none lot closer.'} description="Sign in with your existing portal account to explore properties and follow your reservations." />
    <View style={[styles.card, { padding: 22, gap: 18 }]}>
      <View><Text style={styles.label}>Username or email</Text><TextInput accessibilityLabel="Username or email" style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="username" placeholder="Your portal account" /></View>
      <View><Text style={styles.label}>Password</Text><TextInput accessibilityLabel="Password" style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" placeholder="Enter your password" onSubmitEditing={() => { if (username && password && !busy) void signIn(); }} /></View>
      {!!(error || portal.error) && <Text accessibilityRole="alert" style={styles.error}>{error || portal.error}</Text>}
      <Button label={busy ? 'Signing in…' : 'Sign in to your portal'} onPress={() => void signIn()} disabled={busy || !username.trim() || !password} />
    </View>
    <Text style={[styles.small, { textAlign: 'center', marginBottom: 20 }]}>Clients · Agents · Brokers · Managers · Administrators</Text>
    <Button label={connection ? 'Hide connection settings' : 'Connection settings'} secondary onPress={() => setConnection(!connection)} />
    {connection && <View style={[styles.card, { marginTop: 14 }]}><Text style={styles.label}>Portal server address</Text><TextInput accessibilityLabel="Portal server address" style={styles.input} value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" /><Text style={styles.small}>On a physical phone, use your computer’s Wi-Fi IP or your hosted HTTPS address. 10.0.2.2 is for the Android emulator.</Text><Button secondary label="Retry saved session" disabled={busy} onPress={() => void portal.restore()} /></View>}
    <Text style={[styles.small, { textAlign: 'center', marginTop: 24 }]}>One account. The same properties and reservations.</Text>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
