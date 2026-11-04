import { useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Button, colors, Empty, Heading, styles, SyncStatus } from '../../components/ui';
import { canReview } from '../../lib/properties';
import { usePortal } from '../../state/Portal';

export default function Reservations() {
  const portal = usePortal();
  const [filter, setFilter] = useState('all');
  const rows = portal.data.reservations.filter((item) => filter === 'all' || item.status === filter);
  const review = (id: number, action: 'approve' | 'decline') => Alert.alert(`${action === 'approve' ? 'Approve' : 'Decline'} reservation?`, 'This updates the same reservation in your web portal.', [
    { text: 'Cancel', style: 'cancel' }, { text: action === 'approve' ? 'Approve' : 'Decline', onPress: () => void portal.review(id, action).catch((error: Error) => Alert.alert('Review not confirmed', `${error.message}\nRefresh the list before trying again.`)) },
  ]);
  return <SafeAreaView edges={['top']} style={styles.page}><SyncStatus /><FlatList data={rows} keyExtractor={(item) => String(item.id)} refreshing={portal.refreshing} onRefresh={() => void portal.refresh().catch(() => {})} contentContainerStyle={styles.content}
    ListHeaderComponent={<View><Heading eyebrow="YOUR RESERVATION PORTAL" title={portal.user?.role === 'client' ? 'My reservations.' : 'Reservation desk.'} description={portal.user?.role === 'client' ? 'Every request, every update, all in one place.' : 'Follow requests and review the latest availability.'} /><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>{['all', 'pending', 'approved', 'declined', 'cancelled'].map((value) => <Pressable key={value} accessibilityRole="button" style={[styles.chip, filter === value && { backgroundColor: colors.green }]} onPress={() => setFilter(value)}><Text style={{ color: filter === value ? '#FFF' : colors.ink, textTransform: 'capitalize' }}>{value}</Text></Pressable>)}</ScrollView></View>}
    ListEmptyComponent={<Empty title="No reservations here yet" message="Your requests will appear here with their latest status." />}
    renderItem={({ item }) => <View style={styles.card}><View style={styles.row}><Text style={styles.eyebrow}>REQUEST #{item.id}</Text><Badge status={item.status} /></View><Text style={styles.cardTitle}>Lot {item.lot.lot_number} · Block {item.lot.block || '—'}</Text><Text style={styles.body}>{item.lot.subdivision_name || 'Subdivision'}</Text>{portal.user?.role !== 'client' && <Text style={styles.body}>Client: {item.client_username}</Text>}<Text style={styles.small}>Requested {new Date(item.created_at).toLocaleDateString()}</Text>{item.reviewed_by_username && <Text style={styles.small}>Reviewed by {item.reviewed_by_username}</Text>}
      {item.status === 'pending' && canReview(portal.user?.role || '') && <View style={[styles.row, { marginTop: 10 }]}><View style={{ flex: 1 }}><Button label="Approve" disabled={portal.busy || !!portal.error} onPress={() => review(item.id, 'approve')} /></View><View style={{ flex: 1 }}><Button label="Decline" secondary disabled={portal.busy || !!portal.error} onPress={() => review(item.id, 'decline')} /></View></View>}
    </View>} /></SafeAreaView>;
}
