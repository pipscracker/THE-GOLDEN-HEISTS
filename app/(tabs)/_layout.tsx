import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { LayoutDashboard, CandlestickChart, Zap, Bot, Settings } from 'lucide-react-native';
import { Colors } from '@/constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ size, color }) => (
            <LayoutDashboard size={size} color={color} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="trades"
        options={{
          title: 'Trades',
          tabBarIcon: ({ size, color }) => (
            <CandlestickChart size={size} color={color} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="robot"
        options={{
          title: 'Robot',
          tabBarIcon: ({ size, color }) => (
            <Bot size={size} color={color} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="signals"
        options={{
          title: 'Signals',
          tabBarIcon: ({ size, color }) => (
            <Zap size={size} color={color} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ size, color }) => (
            <Settings size={size} color={color} strokeWidth={2} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.bg,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: 88,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    marginTop: 2,
  },
});
