import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ focused, name, focusedName, color, size }: {
  focused: boolean;
  name: IoniconsName;
  focusedName: IoniconsName;
  color: string;
  size: number;
}) {
  return <Ionicons name={focused ? focusedName : name} size={size} color={color} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.brand,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 72,
          paddingBottom: 12,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.3,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              focused={focused}
              name="calendar-outline"
              focusedName="calendar"
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="group"
        options={{
          title: 'Trip',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              focused={focused}
              name="map-outline"
              focusedName="map"
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: 'Me',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              focused={focused}
              name="person-outline"
              focusedName="person"
              color={color}
              size={size}
            />
          ),
        }}
      />
      {/* Hidden legacy tabs — kept to avoid routing errors */}
      <Tabs.Screen name="map"    options={{ href: null }} />
      <Tabs.Screen name="ai"     options={{ href: null }} />
      <Tabs.Screen name="photos" options={{ href: null }} />
    </Tabs>
  );
}
