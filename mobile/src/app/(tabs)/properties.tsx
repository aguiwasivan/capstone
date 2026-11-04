import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { FlatList, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, colors, Empty, Heading, money, styles, SyncStatus } from '../../components/ui';
import { usePortal } from '../../state/Portal';

export default function Properties() {
  const { data, user, refreshing, refresh } = usePortal();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [subdivision, setSubdivision] = useState('All locations');
  const locations = useMemo(() => ['All locations', ...new Set(data.properties.map((item) => item.subdivision))], [data.properties]);
  const rows = useMemo(() => data.properties.filter((item) =>
    (status === 'all' || item.status === status) &&
    (subdivision === 'All locations' || subdivision === item.subdivision) &&
    `${item.subdivision} ${item.title} block ${item.block}`.toLowerCase().includes(search.toLowerCase()),
  ), [data.properties, status, subdivision, search]);
  const available = data.properties.filter((item) => item.status === 'available' && !item.needsReview).length;
  return <SafeAreaView edges={['top']} style={styles.page}><SyncStatus /><FlatList data={rows} keyExtractor={(item) => item.key} refreshing={refreshing} onRefresh={() => void refresh().catch(() => {})} contentContainerStyle={styles.content}
    ListHeaderComponent={<View><Heading eyebrow={`WELCOME, ${user?.first_name || user?.username || 'HOME'}`} title="Find your place." description="Explore your communities. Reserve with confidence." />
      <View style={[styles.card, { backgroundColor: colors.green, borderWidth: 0, marginBottom: 22 }]}><Text style={{ color: '#C4DDC9', fontSize: 11, letterSpacing: 1.5, fontWeight: '700' }}>ROOM FOR YOUR NEXT CHAPTER</Text><View style={styles.row}><Text style={{ color: '#FFF', fontSize: 39, fontWeight: '700' }}>{available}</Text><Text style={{ color: '#E1EEE6', fontSize: 13 }}>lots ready to explore</Text></View></View>
      <TextInput accessibilityLabel="Search lots" style={[styles.input, { marginBottom: 12 }]} value={search} onChangeText={setSearch} placeholder="Search subdivision, block or lot" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>{locations.map((name) => <Pressable accessibilityRole="button" key={name} style={[styles.chip, subdivision === name && { backgroundColor: colors.pale, borderColor: colors.green }]} onPress={() => setSubdivision(name)}><Text style={{ color: colors.ink, fontSize: 12 }}>{name}</Text></Pressable>)}</ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>{['all', 'available', 'pending', 'reserved', 'sold'].map((value) => <Pressable accessibilityRole="button" key={value} style={[styles.chip, status === value && { backgroundColor: colors.green }]} onPress={() => setStatus(value)}><Text style={{ color: status === value ? '#FFF' : colors.muted, textTransform: 'capitalize', fontSize: 12 }}>{value}</Text></Pressable>)}</ScrollView>
      <Text style={[styles.small, { marginBottom: 14 }]}>{rows.length} properties · Pull down to refresh</Text>
    </View>}
    ListEmptyComponent={<Empty title={refreshing ? 'Loading properties…' : 'No matching lots'} message="Try a different location or filter. Check the connection status if properties haven’t loaded." />}
    renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.subdivision}, ${item.status}`} onPress={() => router.push({ pathname: '/property/[key]', params: { key: item.key } })} style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
      {item.image ? <Image source={{ uri: item.image }} style={{ width: '100%', height: 155, backgroundColor: colors.pale }} resizeMode="cover" accessibilityLabel={`${item.subdivision} property plan`} /> : <View style={{ height: 100, backgroundColor: colors.pale, justifyContent: 'center', padding: 24 }}><Text style={[styles.eyebrow, { color: '#6E9176' }]}>A PLACE TO CALL YOUR OWN</Text></View>}
      <View style={{ padding: 18, gap: 9 }}><View style={styles.row}><Text style={[styles.small, { flex: 1 }]}>{item.subdivision}</Text><Badge status={item.status} /></View><Text style={styles.cardTitle}>{item.title}{item.block ? ` · Block ${item.block}` : ''}</Text><View style={styles.row}><Text style={styles.body}>{Number.isFinite(item.area) && item.area > 0 ? `${item.area} m²` : 'Area to be confirmed'}</Text><Text style={{ fontSize: 19, fontWeight: '700', color: colors.green }}>{item.price > 0 ? money(item.price) : 'Price on request'}</Text></View>{item.needsReview && <Text style={styles.small}>Lot identification needs staff review</Text>}</View>
    </Pressable>} /></SafeAreaView>;
}
