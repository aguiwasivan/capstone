import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Image, Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Button, Empty, Heading, money, styles, SyncStatus } from '../../components/ui';
import { canReserve } from '../../lib/properties';
import { usePortal } from '../../state/Portal';

export default function PropertyDetails() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const portal = usePortal();
  const property = portal.data.properties.find((item) => item.key === key);
  if (!portal.user) { return <SafeAreaView style={styles.page}><Button label="Return to sign in" onPress={() => router.replace('/')} /></SafeAreaView>; }
  if (!property) return <SafeAreaView style={styles.page}><Button secondary label="Back to properties" onPress={() => router.replace('/(tabs)/properties')} /><Empty title="Property unavailable" message="This lot may have changed. Return to properties and refresh." /></SafeAreaView>;
  const submit = () => Alert.alert('Request this lot?', `${property.title}${property.block ? `, Block ${property.block}` : ''} in ${property.subdivision}. Your request will be sent to staff for approval.`, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Submit request', onPress: () => { void portal.reserve(property).then(() => {
      Alert.alert('Request submitted', 'You can follow its status in Reservations.'); router.replace('/(tabs)/reservations');
    }).catch((error: Error) => Alert.alert('Reservation not confirmed', `${error.message}\nCheck Reservations before trying again.`)); } },
  ]);
  return <SafeAreaView style={styles.page}><SyncStatus /><ScrollView contentContainerStyle={styles.content}>
    <Button secondary label="← Back to properties" onPress={() => router.back()} />
    <View style={{ marginTop: 24 }}><Heading eyebrow={property.subdivision.toUpperCase()} title={property.title} description={property.block ? `Block ${property.block}` : 'Block number not recorded'} /></View>
    {property.image && <Image source={{ uri: property.image }} resizeMode="contain" style={{ height: 300, width: '100%', backgroundColor: '#FFF', borderRadius: 16, marginBottom: 20 }} accessibilityLabel="Property photo or subdivision plan" />}
    <View style={styles.card}><Badge status={property.status} /><Text style={[styles.title, { fontSize: 28 }]}>{property.price > 0 ? money(property.price) : 'Price on request'}</Text><Text style={styles.body}>{Number.isFinite(property.area) && property.area > 0 ? `${property.area} square metres` : 'Contact staff for the lot area.'}</Text><Text style={styles.small}>Availability is checked again when you submit your request.</Text></View>
    {property.needsReview && <Text style={[styles.error, { marginBottom: 15 }]}>This map has an incomplete or duplicate lot identifier. Ask staff to confirm its block and lot number before reserving.</Text>}
    {portal.user.role === 'client' ? <Button label={portal.busy ? 'Checking availability…' : 'Request reservation'} disabled={portal.busy || !!portal.error || !canReserve(portal.user.role, property)} onPress={submit} /> : <Text style={styles.body}>Clients submit reservation requests. Authorized staff can review them in the Reservations tab.</Text>}
    {!!property.location && /^https?:\/\//i.test(property.location) && <View style={{ marginTop: 12 }}><Button secondary label="Open location" onPress={() => void Linking.openURL(property.location!).catch(() => Alert.alert('Location unavailable', 'Unable to open this location.'))} /></View>}
  </ScrollView></SafeAreaView>;
}
