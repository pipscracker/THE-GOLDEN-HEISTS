import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ArrowUpRight, ArrowDownRight, History } from 'lucide-react-native';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useAccount } from '@/hooks/useAccount';
import { supabase } from '@/lib/supabase';
import type { OpenTrade, ClosedTrade } from '@/types/database';

type Tab = 'open' | 'history';

export default function TradesScreen() {
  const { accountId, account, loading } = useAccount();
  const [tab, setTab] = useState<Tab>('open');
  const [openTrades, setOpenTrades] = useState<OpenTrade[]>([]);
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOpenTrades = useCallback(async () => {
    if (!accountId) return;
    const { data } = await supabase
      .from('open_trades')
      .select('*')
      .eq('account_id', accountId)
      .order('open_time', { ascending: false });
    setOpenTrades(data || []);
  }, [accountId]);

  const fetchClosedTrades = useCallback(async () => {
    if (!accountId) return;
    const { data } = await supabase
      .from('closed_trades')
      .select('*')
      .eq('account_id', accountId)
      .order('close_time', { ascending: false })
      .limit(100);
    setClosedTrades(data || []);
  }, [accountId]);

  // Real-time subscriptions
  useEffect(() => {
    if (!accountId) return;
    fetchOpenTrades();
    fetchClosedTrades();

    const channel = supabase
      .channel(`trades-${accountId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'open_trades', filter: `account_id=eq.${accountId}` },
        () => fetchOpenTrades(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'closed_trades', filter: `account_id=eq.${accountId}` },
        () => fetchClosedTrades(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId, fetchOpenTrades, fetchClosedTrades]);

  useFocusEffect(
    useCallback(() => {
      fetchOpenTrades();
      fetchClosedTrades();
    }, [fetchOpenTrades, fetchClosedTrades]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchOpenTrades(), fetchClosedTrades()]);
    setRefreshing(false);
  }, [fetchOpenTrades, fetchClosedTrades]);

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
      <Text style={styles.pageTitle}>Trades</Text>

      {/* Tab Switcher */}
      <View style={styles.tabSwitcher}>
        <Pressable
          style={[styles.tabBtn, tab === 'open' && styles.tabBtnActive]}
          onPress={() => setTab('open')}
        >
          <Text style={[styles.tabBtnText, tab === 'open' && styles.tabBtnTextActive]}>
            Open ({openTrades.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, tab === 'history' && styles.tabBtnActive]}
          onPress={() => setTab('history')}
        >
          <Text style={[styles.tabBtnText, tab === 'history' && styles.tabBtnTextActive]}>
            History ({closedTrades.length})
          </Text>
        </Pressable>
      </View>

      {tab === 'open' ? (
        <TradesList
          trades={openTrades}
          emptyText="No active positions"
          currency={account.currency}
          type="open"
        />
      ) : (
        <TradesList
          trades={closedTrades}
          emptyText="No trade history yet"
          currency={account.currency}
          type="closed"
        />
      )}
    </ScrollView>
  );
}

function TradesList({
  trades,
  emptyText,
  currency,
  type,
}: {
  trades: OpenTrade[] | ClosedTrade[];
  emptyText: string;
  currency: string;
  type: 'open' | 'closed';
}) {
  if (trades.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <History size={40} color={Colors.textMuted} strokeWidth={1.5} />
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View style={styles.listContainer}>
      {trades.map((t) => {
        const isBuy = t.trade_type === 'BUY';
        const profit = Number(t.profit);
        const totalCost = Number(t.swap || 0) + Number(t.commission || 0);
        const net = profit + totalCost;

        return (
          <View key={t.id} style={styles.tradeCard}>
            <View style={styles.tradeCardTop}>
              <View
                style={[
                  styles.tradeTypeBadge,
                  { backgroundColor: isBuy ? Colors.successGlow : Colors.dangerGlow },
                ]}
              >
                {isBuy ? (
                  <ArrowUpRight size={14} color={Colors.success} strokeWidth={2.5} />
                ) : (
                  <ArrowDownRight size={14} color={Colors.danger} strokeWidth={2.5} />
                )}
                <Text
                  style={[
                    styles.tradeTypeText,
                    { color: isBuy ? Colors.success : Colors.danger },
                  ]}
                >
                  {t.trade_type}
                </Text>
              </View>
              <View style={styles.tradeSymbolInfo}>
                <Text style={styles.tradeSymbol}>{t.symbol}</Text>
                <Text style={styles.tradeTicket}>#{t.ticket}</Text>
              </View>
              <View style={styles.tradeProfitWrap}>
                <Text
                  style={[
                    styles.tradeProfit,
                    { color: net >= 0 ? Colors.success : Colors.danger },
                  ]}
                >
                  {net >= 0 ? '+' : ''}
                  {net.toFixed(2)} {currency}
                </Text>
                <Text style={styles.tradeProfitLabel}>
                  {type === 'open' ? 'Floating' : 'Realized'}
                </Text>
              </View>
            </View>

            <View style={styles.tradeCardBottom}>
              <View style={styles.tradeStat}>
                <Text style={styles.tradeStatLabel}>Volume</Text>
                <Text style={styles.tradeStatValue}>{t.volume}</Text>
              </View>
              <View style={styles.tradeStat}>
                <Text style={styles.tradeStatLabel}>Open Price</Text>
                <Text style={styles.tradeStatValue}>{Number(t.open_price).toFixed(5)}</Text>
              </View>
              {type === 'open' ? (
                <View style={styles.tradeStat}>
                  <Text style={styles.tradeStatLabel}>Current</Text>
                  <Text style={styles.tradeStatValue}>
                    {Number((t as OpenTrade).current_price).toFixed(5)}
                  </Text>
                </View>
              ) : (
                <View style={styles.tradeStat}>
                  <Text style={styles.tradeStatLabel}>Close Price</Text>
                  <Text style={styles.tradeStatValue}>
                    {Number((t as ClosedTrade).close_price).toFixed(5)}
                  </Text>
                </View>
              )}
              <View style={styles.tradeStat}>
                <Text style={styles.tradeStatLabel}>
                  {type === 'open' ? 'Opened' : 'Closed'}
                </Text>
                <Text style={styles.tradeStatValue}>
                  {type === 'open'
                    ? (t as OpenTrade).open_time
                      ? new Date((t as OpenTrade).open_time!).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'
                    : (t as ClosedTrade).close_time
                      ? new Date((t as ClosedTrade).close_time!).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                </Text>
              </View>
            </View>

            {(Number(t.swap) !== 0 || Number(t.commission) !== 0) && (
              <View style={styles.tradeCardFooter}>
                <Text style={styles.footerText}>
                  Swap: {Number(t.swap).toFixed(2)} | Commission: {Number(t.commission).toFixed(2)}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
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
    marginBottom: Spacing.lg,
  },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: Colors.bgCardElevated,
  },
  tabBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: Colors.textMuted,
  },
  tabBtnTextActive: {
    color: Colors.primary,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: Colors.textMuted,
  },
  listContainer: {
    gap: Spacing.md,
  },
  tradeCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tradeCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  tradeTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  tradeTypeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  tradeSymbolInfo: {
    flex: 1,
  },
  tradeSymbol: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: Colors.text,
  },
  tradeTicket: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  tradeProfitWrap: {
    alignItems: 'flex-end',
  },
  tradeProfit: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
  },
  tradeProfitLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  tradeCardBottom: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  tradeStat: {
    flex: 1,
  },
  tradeStatLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  tradeStatValue: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: Colors.text,
  },
  tradeCardFooter: {
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerText: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: Colors.textMuted,
  },
});
