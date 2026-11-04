import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, Empty, Heading, styles, SyncStatus } from '../../components/ui';
import { usePortal } from '../../state/Portal';
export default function Updates() {
  const { data, refreshing, refresh } = usePortal();
  return <SafeAreaView edges={['top']} style={styles.page}><SyncStatus /><FlatList data={data.notices} keyExtractor={(item) => String(item.id)} refreshing={refreshing} onRefresh={() => void refresh().catch(() => {})} contentContainerStyle={styles.content} ListHeaderComponent={<Heading eyebrow="STAY IN THE KNOW" title="Your updates." description="Reservation notifications from your portal." />} ListEmptyComponent={<Empty title="You’re all caught up" message="New reservation updates will appear here." />} renderItem={({ item }) => <View style={styles.card}><View style={styles.row}><Text style={[styles.cardTitle, { flex: 1, fontSize: 17 }]}>{item.title}</Text>{!item.is_read && <View style={[styles.dot, { backgroundColor: colors.gold }]} />}</View><Text style={styles.body}>{item.message}</Text><Text style={styles.small}>{new Date(item.created_at).toLocaleString()}</Text></View>} /></SafeAreaView>;
}
