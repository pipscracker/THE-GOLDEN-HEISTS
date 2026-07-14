import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Animated,
  Easing,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  Bot,
  Activity,
  Clock,
  Gauge,
  Play,
  Square,
  Pause,
  RotateCcw,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  TrendingUp,
  Settings2,
  Save,
  Check,
  Copy,
  Link,
  KeyRound,
  Fingerprint,
} from 'lucide-react-native';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useAccount } from '@/hooks/useAccount';
import { supabase } from '@/lib/supabase';
import type { SignalLog, EaSettings } from '@/types/database';

type RobotTab = 'status' | 'settings';

export default function RobotScreen() {
  const { accountId, account, robotState, eaSettings, loading, refreshAccount, saveEaSettings } = useAccount();
  const [tab, setTab] = useState<RobotTab>('status');
  const [signals, setSignals] = useState<SignalLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingCmd, setSendingCmd] = useState<string | null>(null);
  const [cmdError, setCmdError] = useState<string | null>(null);
  const [pulseAnim] = useState(new Animated.Value(0));

  // Settings form state
  const [settingsForm, setSettingsForm] = useState({
    lot_size: '0.05',
    starting_sl_points: '10',
    max_trades: '3',
    target_profit_usd: '15.00',
    target_loss_usd: '-30.00',
    session_start_hour: '0',
    session_end_hour: '24',
  });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Sync form from eaSettings
  useEffect(() => {
    if (eaSettings) {
      setSettingsForm({
        lot_size: String(eaSettings.lot_size),
        starting_sl_points: String(eaSettings.starting_sl_points),
        max_trades: String(eaSettings.max_trades),
        target_profit_usd: String(eaSettings.target_profit_usd),
        target_loss_usd: String(eaSettings.target_loss_usd),
        session_start_hour: String(eaSettings.session_start_hour),
        session_end_hour: String(eaSettings.session_end_hour),
      });
    }
  }, [eaSettings]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const fetchSignals = useCallback(async () => {
    if (!accountId) return;
    const { data } = await supabase
      .from('signal_log')
      .select('*')
      .eq('account_id', accountId)
      .order('fired_at', { ascending: false })
      .limit(20);
    setSignals(data || []);
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    fetchSignals();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = supabase.channel(`robot-signals-${accountId}`) as any;
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'signal_log', filter: `account_id=eq.${accountId}` },
      (payload: { new: SignalLog }) => setSignals((prev) => [payload.new, ...prev].slice(0, 20)),
    );
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId, fetchSignals]);

  useFocusEffect(
    useCallback(() => {
      refreshAccount();
      fetchSignals();
    }, [refreshAccount, fetchSignals]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshAccount(), fetchSignals()]);
    setRefreshing(false);
  }, [refreshAccount, fetchSignals]);

  const sendCommand = useCallback(
    async (command: 'start' | 'stop' | 'pause' | 'resume') => {
      if (!accountId) return;
      setSendingCmd(command);
      setCmdError(null);
      try {
        const res = await fetch(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/mt5-sync/command`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
              apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
            },
            body: JSON.stringify({ account_id: accountId, command }),
          },
        );
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.error || `HTTP ${res.status}`);
        }
      } catch (e) {
        setCmdError(e instanceof Error ? e.message : 'Command failed');
      } finally {
        setSendingCmd(null);
      }
    },
    [accountId],
  );

  const copyToClipboard = useCallback((text: string, field: string) => {
    if (Platform.OS === 'web' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  const handleSaveSettings = useCallback(async () => {
    setSavingSettings(true);
    const settings: Partial<EaSettings> = {
      lot_size: parseFloat(settingsForm.lot_size) || 0.05,
      starting_sl_points: parseInt(settingsForm.starting_sl_points, 10) || 10,
      max_trades: parseInt(settingsForm.max_trades, 10) || 3,
      target_profit_usd: parseFloat(settingsForm.target_profit_usd) || 15.0,
      target_loss_usd: parseFloat(settingsForm.target_loss_usd) || -30.0,
      session_start_hour: parseInt(settingsForm.session_start_hour, 10) || 0,
      session_end_hour: parseInt(settingsForm.session_end_hour, 10) || 24,
    };
    await saveEaSettings(settings);
    setSavingSettings(false);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  }, [settingsForm, saveEaSettings]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!accountId || !account) {
    return (
      <View style={styles.loadingContainer}>
        <Bot size={48} color={Colors.textMuted} strokeWidth={1.5} />
        <Text style={styles.emptyTitle}>No Account Connected</Text>
        <Text style={styles.emptySubtitle}>
          Go to the Settings tab to add your MetaTrader 5 account
        </Text>
      </View>
    );
  }

  const rsi = Number(robotState?.rsi_value || 0);
  const cooldown = Number(robotState?.cooldown_seconds_left) || 0;
  const activePos = Number(robotState?.total_active_positions) || 0;
  const basketProfit = Number(robotState?.basket_profit) || 0;
  const isLive = robotState?.updated_at
    ? Date.now() - new Date(robotState.updated_at).getTime() < 30000
    : false;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.robotIcon}>
              <Bot size={26} color={Colors.primary} strokeWidth={2} />
            </View>
            <View>
              <Text style={styles.appTitle}>Golden Heists</Text>
              <Text style={styles.appSubtitle}>{account.account_name}</Text>
            </View>
          </View>
          <View style={styles.liveBadge}>
            <Animated.View
              style={[
                styles.liveDot,
                {
                  opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
                  backgroundColor: isLive ? Colors.connected : Colors.textMuted,
                },
              ]}
            />
            <Text style={[styles.liveText, { color: isLive ? Colors.connected : Colors.textMuted }]}>
              {isLive ? 'LIVE' : 'OFFLINE'}
            </Text>
          </View>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabSwitcher}>
          <Pressable
            style={[styles.tabBtn, tab === 'status' && styles.tabBtnActive]}
            onPress={() => setTab('status')}
          >
            <Activity size={16} color={tab === 'status' ? Colors.primary : Colors.textMuted} strokeWidth={2} />
            <Text style={[styles.tabBtnText, tab === 'status' && styles.tabBtnTextActive]}>Status</Text>
          </Pressable>
          <Pressable
            style={[styles.tabBtn, tab === 'settings' && styles.tabBtnActive]}
            onPress={() => setTab('settings')}
          >
            <Settings2 size={16} color={tab === 'settings' ? Colors.primary : Colors.textMuted} strokeWidth={2} />
            <Text style={[styles.tabBtnText, tab === 'settings' && styles.tabBtnTextActive]}>EA Settings</Text>
          </Pressable>
        </View>

        {tab === 'status' ? (
          <>
            {/* Status Banner */}
            <View style={[styles.statusBanner, { backgroundColor: Colors.primaryLight }]}>
              <Activity size={16} color={Colors.primary} strokeWidth={2} />
              <Text style={styles.statusText}>{robotState?.dashboard_message || 'AWAITING EA CONNECTION'}</Text>
            </View>

            {/* Connection Details */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>MT5 Connection Details</Text>
                <Text style={styles.connectionHint}>Enter these in your EA inputs</Text>
              </View>

              <Pressable style={styles.connectionRow} onPress={() => copyToClipboard(accountId!, 'uuid')}>
                <View style={styles.connectionIcon}>
                  <Fingerprint size={16} color={Colors.primary} strokeWidth={2} />
                </View>
                <View style={styles.connectionInfo}>
                  <Text style={styles.connectionLabel}>Account UUID</Text>
                  <Text style={styles.connectionValue} numberOfLines={1} ellipsizeMode="middle">{accountId}</Text>
                </View>
                {copiedField === 'uuid' ? (
                  <Check size={16} color={Colors.success} strokeWidth={2.5} />
                ) : (
                  <Copy size={16} color={Colors.textMuted} strokeWidth={2} />
                )}
              </Pressable>

              <Pressable style={styles.connectionRow} onPress={() => copyToClipboard(process.env.EXPO_PUBLIC_SUPABASE_URL!, 'url')}>
                <View style={styles.connectionIcon}>
                  <Link size={16} color={Colors.info} strokeWidth={2} />
                </View>
                <View style={styles.connectionInfo}>
                  <Text style={styles.connectionLabel}>Supabase URL</Text>
                  <Text style={styles.connectionValue} numberOfLines={1} ellipsizeMode="middle">{process.env.EXPO_PUBLIC_SUPABASE_URL}</Text>
                </View>
                {copiedField === 'url' ? (
                  <Check size={16} color={Colors.success} strokeWidth={2.5} />
                ) : (
                  <Copy size={16} color={Colors.textMuted} strokeWidth={2} />
                )}
              </Pressable>

              <Pressable style={styles.connectionRow} onPress={() => copyToClipboard(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, 'key')}>
                <View style={styles.connectionIcon}>
                  <KeyRound size={16} color={Colors.warning} strokeWidth={2} />
                </View>
                <View style={styles.connectionInfo}>
                  <Text style={styles.connectionLabel}>Anon Key</Text>
                  <Text style={styles.connectionValue} numberOfLines={1} ellipsizeMode="middle">{process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}</Text>
                </View>
                {copiedField === 'key' ? (
                  <Check size={16} color={Colors.success} strokeWidth={2.5} />
                ) : (
                  <Copy size={16} color={Colors.textMuted} strokeWidth={2} />
                )}
              </Pressable>
            </View>

            {/* Robot State */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Robot State</Text>
                <View
                  style={[
                    styles.stateBadge,
                    {
                      backgroundColor: robotState?.robot_paused
                        ? Colors.warningBg
                        : robotState?.robot_enabled
                          ? Colors.connectedBg
                          : Colors.dangerBg,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.stateBadgeText,
                      {
                        color: robotState?.robot_paused
                          ? Colors.warning
                          : robotState?.robot_enabled
                            ? Colors.connected
                            : Colors.danger,
                      },
                    ]}
                  >
                    {robotState?.robot_paused ? 'PAUSED' : robotState?.robot_enabled ? 'RUNNING' : 'STOPPED'}
                  </Text>
                </View>
              </View>

              <View style={styles.metricsGrid}>
                <MetricCell icon={<Gauge size={16} color={Colors.textSecondary} strokeWidth={2} />} label="RSI(7)" value={rsi.toFixed(1)} valueColor={rsi <= 45 ? Colors.success : rsi >= 55 ? Colors.danger : Colors.text} />
                <MetricCell icon={<Clock size={16} color={Colors.textSecondary} strokeWidth={2} />} label="Cooldown" value={cooldown > 0 ? `${Math.floor(cooldown / 60)}m ${cooldown % 60}s` : 'Ready'} />
                <MetricCell icon={<Activity size={16} color={Colors.textSecondary} strokeWidth={2} />} label="Active" value={String(activePos)} />
              </View>

              <View style={styles.m5Row}>
                <View style={styles.m5Cell}>
                  <Text style={styles.m5Label}>M5 High</Text>
                  <Text style={styles.m5Value}>{Number(robotState?.m5_high || 0).toFixed(5)}</Text>
                </View>
                <View style={styles.m5Cell}>
                  <Text style={styles.m5Label}>M5 Low</Text>
                  <Text style={styles.m5Value}>{Number(robotState?.m5_low || 0).toFixed(5)}</Text>
                </View>
              </View>
            </View>

            {/* Engines */}
            <View style={styles.enginesRow}>
              <EngineCard number="1" name="Reversion" magic="888999" description="Price pierces M5 level + RSI confirms exhaustion" color={Colors.primary} bgColor={Colors.primaryLight} />
              <EngineCard number="2" name="Breakout" magic="777666" description="Pure momentum continuation, no RSI filter" color={Colors.info} bgColor={Colors.infoBg} />
            </View>

            {/* Basket P&L */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Basket P&amp;L</Text>
              <Text style={[styles.basketValue, { color: basketProfit >= 0 ? Colors.success : Colors.danger }]}>
                {basketProfit >= 0 ? '+' : ''}{basketProfit.toFixed(2)} {account.currency}
              </Text>
              <View style={styles.basketBar}>
                <View
                  style={[
                    styles.basketBarFill,
                    {
                      width: `${Math.min(100, Math.max(0, (basketProfit / 15) * 100))}%`,
                      backgroundColor: basketProfit >= 0 ? Colors.success : Colors.danger,
                    },
                  ]}
                />
              </View>
              <View style={styles.basketTargets}>
                <Text style={styles.basketTarget}>Target: +$15.00</Text>
                <Text style={styles.basketTarget}>Floor: -$30.00</Text>
              </View>
            </View>

            {/* Remote Controls */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Remote Controls</Text>
              {cmdError && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{cmdError}</Text>
                </View>
              )}
              <View style={styles.controlsRow}>
                <Pressable style={[styles.controlBtn, { borderColor: Colors.success }]} onPress={() => sendCommand('start')} disabled={sendingCmd !== null}>
                  <Play size={18} color={Colors.success} strokeWidth={2} fill={Colors.success} />
                  <Text style={[styles.controlBtnText, { color: Colors.success }]}>{sendingCmd === 'start' ? '...' : 'START'}</Text>
                </Pressable>
                <Pressable style={[styles.controlBtn, { borderColor: Colors.warning }]} onPress={() => sendCommand('pause')} disabled={sendingCmd !== null}>
                  <Pause size={18} color={Colors.warning} strokeWidth={2} fill={Colors.warning} />
                  <Text style={[styles.controlBtnText, { color: Colors.warning }]}>{sendingCmd === 'pause' ? '...' : 'PAUSE'}</Text>
                </Pressable>
                <Pressable style={[styles.controlBtn, { borderColor: Colors.danger }]} onPress={() => sendCommand('stop')} disabled={sendingCmd !== null}>
                  <Square size={18} color={Colors.danger} strokeWidth={2} fill={Colors.danger} />
                  <Text style={[styles.controlBtnText, { color: Colors.danger }]}>{sendingCmd === 'stop' ? '...' : 'STOP'}</Text>
                </Pressable>
              </View>
              <Text style={styles.controlsHint}>Commands are queued and picked up by the EA on its next poll cycle (every 30s).</Text>
            </View>

            {/* Signal Log */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Signal Log</Text>
                <Text style={styles.seeAllText}>{signals.length} events</Text>
              </View>
              {signals.length === 0 ? (
                <View style={styles.emptySignals}>
                  <Zap size={32} color={Colors.textMuted} strokeWidth={1.5} />
                  <Text style={styles.emptySignalsText}>No signals fired yet</Text>
                </View>
              ) : (
                <View style={styles.signalList}>
                  {signals.slice(0, 5).map((s) => {
                    const isBuy = s.direction === 'BUY';
                    const isReversion = s.engine === 'reversion';
                    return (
                      <View key={s.id} style={styles.signalRow}>
                        <View style={[styles.signalIcon, { backgroundColor: isReversion ? Colors.primaryLight : Colors.infoBg }]}>
                          {isReversion ? <RotateCcw size={14} color={Colors.primary} strokeWidth={2} /> : <TrendingUp size={14} color={Colors.info} strokeWidth={2} />}
                        </View>
                        <View style={styles.signalInfo}>
                          <Text style={styles.signalType}>{s.signal_type}</Text>
                          <Text style={styles.signalEngine}>{isReversion ? 'Reversion' : 'Breakout'} · RSI {Number(s.rsi_value).toFixed(1)}</Text>
                        </View>
                        <View style={[styles.signalDir, { backgroundColor: isBuy ? Colors.buyBg : Colors.sellBg }]}>
                          {isBuy ? <ArrowUpRight size={12} color={Colors.buy} strokeWidth={2.5} /> : <ArrowDownRight size={12} color={Colors.sell} strokeWidth={2.5} />}
                          <Text style={[styles.signalDirText, { color: isBuy ? Colors.buy : Colors.sell }]}>{s.direction}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        ) : (
          <>
            {/* EA Settings Editor */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Master EA Settings</Text>
                {eaSettings && (
                  <View style={styles.versionBadge}>
                    <Text style={styles.versionText}>v{eaSettings.settings_version}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.settingsHint}>
                Edit EA parameters remotely. Changes are picked up by the EA on its next poll cycle.
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Lot Size</Text>
                <TextInput
                  style={styles.input}
                  value={settingsForm.lot_size}
                  onChangeText={(v) => setSettingsForm({ ...settingsForm, lot_size: v })}
                  keyboardType="decimal-pad"
                  placeholder="0.05"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: Spacing.sm }]}>
                  <Text style={styles.inputLabel}>Starting SL (points)</Text>
                  <TextInput
                    style={styles.input}
                    value={settingsForm.starting_sl_points}
                    onChangeText={(v) => setSettingsForm({ ...settingsForm, starting_sl_points: v })}
                    keyboardType="numeric"
                    placeholder="10"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Max Trades</Text>
                  <TextInput
                    style={styles.input}
                    value={settingsForm.max_trades}
                    onChangeText={(v) => setSettingsForm({ ...settingsForm, max_trades: v })}
                    keyboardType="numeric"
                    placeholder="3"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Basket Targets</Text>
              <Text style={styles.settingsHint}>Auto-close all positions when basket hits target or floor.</Text>

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: Spacing.sm }]}>
                  <Text style={styles.inputLabel}>Target Profit (USD)</Text>
                  <TextInput
                    style={[styles.input, { color: Colors.success }]}
                    value={settingsForm.target_profit_usd}
                    onChangeText={(v) => setSettingsForm({ ...settingsForm, target_profit_usd: v })}
                    keyboardType="decimal-pad"
                    placeholder="15.00"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Max Loss (USD)</Text>
                  <TextInput
                    style={[styles.input, { color: Colors.danger }]}
                    value={settingsForm.target_loss_usd}
                    onChangeText={(v) => setSettingsForm({ ...settingsForm, target_loss_usd: v })}
                    keyboardType="decimal-pad"
                    placeholder="-30.00"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Operational Time Window</Text>
              <Text style={styles.settingsHint}>Broker hours. Set 0-24 for 24H trading.</Text>

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: Spacing.sm }]}>
                  <Text style={styles.inputLabel}>Start Hour (0-23)</Text>
                  <TextInput
                    style={styles.input}
                    value={settingsForm.session_start_hour}
                    onChangeText={(v) => setSettingsForm({ ...settingsForm, session_start_hour: v })}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>End Hour (1-24)</Text>
                  <TextInput
                    style={styles.input}
                    value={settingsForm.session_end_hour}
                    onChangeText={(v) => setSettingsForm({ ...settingsForm, session_end_hour: v })}
                    keyboardType="numeric"
                    placeholder="24"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              </View>
            </View>

            {/* Save Button */}
            <Pressable
              style={[styles.saveBtn, settingsSaved && { backgroundColor: Colors.success }]}
              onPress={handleSaveSettings}
              disabled={savingSettings}
            >
              {savingSettings ? (
                <ActivityIndicator size="small" color={Colors.primaryText} />
              ) : settingsSaved ? (
                <>
                  <Check size={18} color={Colors.primaryText} strokeWidth={2.5} />
                  <Text style={styles.saveBtnText}>Saved — EA will sync on next poll</Text>
                </>
              ) : (
                <>
                  <Save size={18} color={Colors.primaryText} strokeWidth={2.5} />
                  <Text style={styles.saveBtnText}>Save &amp; Sync to EA</Text>
                </>
              )}
            </Pressable>

            <Text style={styles.syncHint}>
              Settings version: v{eaSettings?.settings_version || 1} · Last updated: {
                eaSettings?.updated_at
                  ? new Date(eaSettings.updated_at).toLocaleString()
                  : 'never'
              }
            </Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function MetricCell({ icon, label, value, valueColor }: { icon: React.ReactNode; label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.metricCell}>
      {icon}
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
    </View>
  );
}

function EngineCard({ number, name, magic, description, color, bgColor }: { number: string; name: string; magic: string; description: string; color: string; bgColor: string }) {
  return (
    <View style={styles.engineCard}>
      <View style={styles.engineHeader}>
        <View style={[styles.engineNumber, { backgroundColor: bgColor }]}>
          <Text style={[styles.engineNumberText, { color }]}>{number}</Text>
        </View>
        <View>
          <Text style={styles.engineName}>{name}</Text>
          <Text style={styles.engineMagic}>Magic {magic}</Text>
        </View>
      </View>
      <Text style={styles.engineDesc}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  loadingContainer: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyTitle: { fontFamily: 'Inter-SemiBold', fontSize: 18, color: Colors.text },
  emptySubtitle: { fontFamily: 'Inter-Regular', fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  robotIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  appTitle: { fontFamily: 'Inter-Bold', fontSize: 20, color: Colors.text },
  appSubtitle: { fontFamily: 'Inter-Regular', fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgCard, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 1 },
  tabSwitcher: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: 4, marginBottom: Spacing.lg, gap: Spacing.xs },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.md, borderRadius: Radius.sm },
  tabBtnActive: { backgroundColor: Colors.primaryLight },
  tabBtnText: { fontFamily: 'Inter-Medium', fontSize: 13, color: Colors.textMuted },
  tabBtnTextActive: { color: Colors.primary },
  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.lg },
  statusText: { fontFamily: 'Inter-Medium', fontSize: 13, color: Colors.primary, flex: 1 },
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  cardTitle: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: Colors.text },
  seeAllText: { fontFamily: 'Inter-Medium', fontSize: 12, color: Colors.textMuted },
  stateBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.sm },
  stateBadgeText: { fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 0.5 },
  metricsGrid: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  metricCell: { flex: 1, backgroundColor: Colors.bgCardElevated, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', gap: 4 },
  metricLabel: { fontFamily: 'Inter-Regular', fontSize: 10, color: Colors.textMuted, letterSpacing: 0.5 },
  metricValue: { fontFamily: 'Inter-SemiBold', fontSize: 16, color: Colors.text },
  m5Row: { flexDirection: 'row', gap: Spacing.sm },
  m5Cell: { flex: 1, backgroundColor: Colors.bgCardElevated, borderRadius: Radius.md, padding: Spacing.md },
  m5Label: { fontFamily: 'Inter-Regular', fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
  m5Value: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: Colors.text },
  enginesRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  engineCard: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  engineHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  engineNumber: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  engineNumberText: { fontFamily: 'Inter-Bold', fontSize: 14 },
  engineName: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: Colors.text },
  engineMagic: { fontFamily: 'Inter-Regular', fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  engineDesc: { fontFamily: 'Inter-Regular', fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
  basketValue: { fontFamily: 'Inter-Bold', fontSize: 22, marginBottom: Spacing.sm },
  basketBar: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden', marginBottom: Spacing.sm },
  basketBarFill: { height: '100%', borderRadius: 4 },
  basketTargets: { flexDirection: 'row', justifyContent: 'space-between' },
  basketTarget: { fontFamily: 'Inter-Regular', fontSize: 10, color: Colors.textMuted },
  errorBox: { backgroundColor: Colors.dangerBg, borderRadius: Radius.sm, padding: Spacing.md, marginBottom: Spacing.md },
  errorText: { fontFamily: 'Inter-Medium', fontSize: 12, color: Colors.danger },
  controlsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  controlBtn: { flex: 1, borderWidth: 1.5, borderRadius: Radius.md, paddingVertical: Spacing.md, alignItems: 'center', gap: 6 },
  controlBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 12, letterSpacing: 0.5 },
  controlsHint: { fontFamily: 'Inter-Regular', fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  emptySignals: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  emptySignalsText: { fontFamily: 'Inter-Regular', fontSize: 13, color: Colors.textMuted },
  signalList: { gap: Spacing.sm },
  signalRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  signalIcon: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  signalInfo: { flex: 1 },
  signalType: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: Colors.text },
  signalEngine: { fontFamily: 'Inter-Regular', fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  signalDir: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: Radius.sm },
  signalDirText: { fontFamily: 'Inter-SemiBold', fontSize: 10, letterSpacing: 0.5 },
  versionBadge: { backgroundColor: Colors.primaryLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.sm },
  versionText: { fontFamily: 'Inter-SemiBold', fontSize: 10, color: Colors.primary },
  settingsHint: { fontFamily: 'Inter-Regular', fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.md, lineHeight: 17 },
  inputGroup: { marginBottom: Spacing.md },
  inputRow: { flexDirection: 'row' },
  inputLabel: { fontFamily: 'Inter-Regular', fontSize: 12, color: Colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: Colors.bgInput, borderRadius: Radius.md, padding: Spacing.md, fontFamily: 'Inter-Regular', fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: Spacing.md, marginBottom: Spacing.md },
  saveBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: Colors.primaryText },
  syncHint: { fontFamily: 'Inter-Regular', fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  connectionHint: { fontFamily: 'Inter-Regular', fontSize: 11, color: Colors.textMuted },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  connectionIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCardElevated, justifyContent: 'center', alignItems: 'center' },
  connectionInfo: { flex: 1 },
  connectionLabel: { fontFamily: 'Inter-Regular', fontSize: 10, color: Colors.textMuted, marginBottom: 2, letterSpacing: 0.5 },
  connectionValue: { fontFamily: 'Inter-Medium', fontSize: 12, color: Colors.text },
});
