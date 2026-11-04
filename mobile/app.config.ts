import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Reservation Portal', slug: 'reservation-portal', version: '1.0.0',
  scheme: 'reservationportal', platforms: ['android'], orientation: 'portrait', userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  android: { package: 'com.capstone.reservationportal', versionCode: 1, adaptiveIcon: { foregroundImage: './assets/android-icon-foreground.png', backgroundColor: '#EAF3ED' } },
  plugins: ['expo-router', 'expo-secure-store', 'expo-font', ['expo-build-properties', { android: { usesCleartextTraffic: process.env.EAS_BUILD_PROFILE !== 'production' } }]],
};
export default config;
