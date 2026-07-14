import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  TrendingUp,
} from 'lucide-react-native';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useAccount } from '@/hooks/useAccount';
import { supabase } from '@/lib/supabase';
import type { SignalLog } from '@/types/database';

export default function SignalsScreen() {
  const { accountId, loading } = useAccount();
  const [signals, setSignals] = useState<SignalLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSignals = useCallback(async () => {
    if (!accountId) return;
    const { data } = await supabase
      .from('signal_log')
      .select('*')
      .eq('account_id', accountId)
      .order('fired_at', { ascending: false })
      .limit(50);
    setSignals(data || []);
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    fetchSignals();

    const channel = supabase
      .channel(`signals-${accountId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'signal_log', filter: `account_id=eq.${accountId}` },
        (payload) => {
          setSignals((prev) => [payload.new as SignalLog, ...prev].slice(0, 50));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId, fetchSignals]);

  useFocusEffect(
    useCallback(() => {
      fetchSignals();
    }, [fetchSignals]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSignals();
    setRefreshing(false);
  }, [fetchSignals]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!accountId) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.emptyTitle}>No MT5 Account Connected</Text>
        <Text style={styles.emptySubtitle}>
          Go to Settings to add your MetaTrader 5 account details
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
      }
    >
      <Text style={styles.pageTitle}>Signal Log</Text>
      <Text style={styles.pageSubtitle}>Every blast event from the EA engines</Text>

      {signals.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Zap size={40} color={Colors.textMuted} strokeWidth={1.5} />
          <Text style={styles.emptyText}>No signals fired yet</Text>
          <Text style={styles.emptySubtext}>
            Signals will appear here when the EA detects entry conditions
          </Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          {signals.map((s) => {
            const isBuy = s.direction === 'BUY';
            const isReversion = s.engine === 'reversion';

            return (
              <View key={s.id} style={styles.signalCard}>
                <View style={styles.signalTop}>
                  <View
                    style={[
                      styles.signalIcon,
                      {
                        backgroundColor: isReversion ? Colors.primaryGlow : Colors.info + '20',
                      },
                    ]}
                  >
                    {isReversion ? (
                      <RotateCcw size={18} color={Colors.primary} strokeWidth={2} />
                    ) : (
                      <TrendingUp size={18} color={Colors.info} strokeWidth={2} />
                    )}
                  </View>
                  <View style={styles.signalInfo}>
                    <View style={styles.signalNameRow}>
                      <Text style={styles.signalType}>{s.signal_type}</Text>
                      <View
                        style={[
                          styles.directionBadge,
                          { backgroundColor: isBuy ? Colors.successGlow : Colors.dangerGlow },
                        ]}
                      >
                        {isBuy ? (
                          <ArrowUpRight size={12} color={Colors.success} strokeWidth={2.5} />
                        ) : (
                          <ArrowDownRight size={12} color={Colors.danger} strokeWidth={2.5} />
                        )}
                        <Text
                          style={[
                            styles.directionText,
                            { color: isBuy ? Colors.success : Colors.danger },
                          ]}
                        >
                          {s.direction}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.signalEngine}>
                      {isReversion ? 'Engine 1: Reversion' : 'Engine 2: Breakout'}
                    </Text>
                  </View>
                  <Text style={styles.signalTime}>
                    {new Date(s.fired_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </Text>
                </View>

                <View style={styles.signalStats}>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>RSI</Text>
                    <Text
                      style={[
                        styles.statValue,
                        {
                          color:
                            Number(s.rsi_value) <= 45
                              ? Colors.success
                              : Number(s.rsi_value) >= 55
                                ? Colors.danger
                                : Colors.text,
                        },
                      ]}
                    >
                      {Number(s.rsi_value).toFixed(1)}
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Bid</Text>
                    <Text style={styles.statValue}>
                      {Number(s.bid_price).toFixed(5)}
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>M5 Hi</Text>
                    <Text style={styles.statValue}>
                      {Number(s.m5_high).toFixed(5)}
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>M5 Lo</Text>
                    <Text style={styles.statValue}>
                      {Number(s.m5_low).toFixed(5)}
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Lots</Text>
                    <Text style={styles.statValue}>{Number(s.lot_size).toFixed(2)}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Fired</Text>
                    <Text style={[styles.statValue, { color: Colors.primary }]}>
                      {s.positions_fired}
                    </Text>
                  </View>
                </View>

                <View style={styles.signalFooter}>
                  <Text style={styles.footerTag}>SL: {s.sl_points} pts</Text>
                  <Text style={styles.footerTag}>TP: +{s.tp_points} pts</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  pageTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 24,
    color: Colors.text,
  },
  pageSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: Spacing.lg,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.sm,
  },
  emptyText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  listContainer: {
    gap: Spacing.md,
  },
  signalCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  signalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  signalIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signalInfo: {
    flex: 1,
  },
  signalNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  signalType: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: Colors.text,
  },
  directionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  directionText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  signalEngine: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 3,
  },
  signalTime: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.textMuted,
  },
  signalStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  statItem: {
    width: '31%',
  },
  statLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: Colors.textMuted,
    marginBottom: 3,
  },
  statValue: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: Colors.text,
  },
  signalFooter: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerTag: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.textSecondary,
  },
});
