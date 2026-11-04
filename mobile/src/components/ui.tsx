import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePortal } from '../state/Portal';

export const colors = { ink: '#16342C', muted: '#63786F', green: '#17664C', pale: '#EAF3ED', background: '#F6F8F4', border: '#DEE7DF', gold: '#B18535' };
export const money = (value: number | string) => `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
export function Button({ label, onPress, disabled = false, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.button, secondary && styles.secondary, (disabled || pressed) && { opacity: 0.5 }]}><Text style={[styles.buttonText, secondary && { color: colors.green }]}>{label}</Text></Pressable>;
}
export function Badge({ status }: { status: string }) {
  const color = ['available', 'approved'].includes(status) ? colors.green : ['pending', 'reserved'].includes(status) ? '#8D651D' : '#7A5D5D';
  return <View style={[styles.badge, { backgroundColor: `${color}15` }]}><Text style={{ color, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 }}>{status}</Text></View>;
}
export function Heading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return <View style={{ gap: 7, marginBottom: 20 }}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{title}</Text>{description && <Text style={styles.body}>{description}</Text>}</View>;
}
export function SyncStatus() {
  const { error, lastSync, refreshing, refresh } = usePortal();
  return <Pressable accessibilityRole="button" accessibilityLabel="Refresh portal data" onPress={() => void refresh().catch(() => {})} style={[styles.sync, error && { backgroundColor: '#FFF1E6' }]}>
    {refreshing ? <ActivityIndicator size="small" color={colors.green} /> : <View style={[styles.dot, error && { backgroundColor: '#B76A35' }]} />}
    <Text style={[styles.small, { flex: 1 }]}>{error ? `Updates paused · ${error}` : lastSync ? `Updated ${new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Refreshes every 15s` : 'Connecting to your portal…'}</Text>
    <Text style={styles.link}>Refresh</Text>
  </Pressable>;
}
export function Empty({ title, message }: { title: string; message: string }) {
  return <View style={[styles.card, { alignItems: 'center', paddingVertical: 38 }]}><Text style={styles.cardTitle}>{title}</Text><Text style={[styles.body, { textAlign: 'center', marginTop: 9 }]}>{message}</Text></View>;
}
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, content: { padding: 22, paddingBottom: 36 },
  eyebrow: { color: colors.green, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { fontSize: 31, fontWeight: '700', color: colors.ink, letterSpacing: -0.7 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 22 }, small: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  card: { backgroundColor: '#FFF', padding: 19, borderRadius: 20, borderWidth: 1, borderColor: colors.border, marginBottom: 14, gap: 8 },
  cardTitle: { fontSize: 19, fontWeight: '700', color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  badge: { borderRadius: 7, paddingHorizontal: 9, paddingVertical: 6, alignSelf: 'flex-start' },
  button: { borderRadius: 13, backgroundColor: colors.green, padding: 16, alignItems: 'center', minHeight: 50 },
  secondary: { backgroundColor: colors.pale, borderWidth: 1, borderColor: colors.border },
  buttonText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFF', borderRadius: 13, padding: 15, color: colors.ink, fontSize: 15, minHeight: 52 },
  label: { color: colors.ink, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  error: { color: '#9A4337', backgroundColor: '#FFF0E9', padding: 13, borderRadius: 10, lineHeight: 21 },
  sync: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.pale, paddingHorizontal: 18, paddingVertical: 10, gap: 9 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  link: { color: colors.green, fontWeight: '700', fontSize: 12 },
  chip: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 22, borderWidth: 1, borderColor: colors.border, marginRight: 8, backgroundColor: '#FFF' },
});
