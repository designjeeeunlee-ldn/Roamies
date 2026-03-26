import { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '../lib/supabase';
import { AppProvider } from '../context/AppContext';

export default function RootLayout() {
  const router = useRouter();
  const redirected = useRef(false);

  useEffect(() => {
    if (redirected.current) return;
    redirected.current = true;

    // Initial routing based on existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      router.replace(session ? '/(tabs)' : '/onboarding');
    });

    // Only react to explicit sign-in / sign-out — ignore INITIAL_SESSION, TOKEN_REFRESHED etc.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, _session) => {
      if (event === 'SIGNED_IN') {
        router.replace('/(tabs)');
      } else if (event === 'SIGNED_OUT') {
        router.replace('/onboarding');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProvider>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="create-trip" />
          <Stack.Screen name="invite" />
          <Stack.Screen name="location-consent" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="trip-detail" />
        </Stack>
        <StatusBar style="dark" />
      </SafeAreaProvider>
      </AppProvider>
    </GestureHandlerRootView>
  );
}
