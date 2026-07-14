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
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Building2,
  Server,
  Gauge,
  Clock,
} from 'lucide-react-native';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useAccount } from '@/hooks/useAccount';
import { supabase } from '@/lib/supabase';
import type { OpenTrade, ClosedTrade } from '@/types/database';

type Tab = 'active' | 'history';

export default function DashboardScreen() {
  const { accounts, loading, selectAccount, fetchAccounts } = useAccount();
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('active');
  const [openTrades, setOpenTrades] = useState<OpenTrade[]>([]);
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);

  const fetchTrades = useCallback(async () => {
    if (accounts.length === 0) return;
    const accountIds = accounts.map((a) => a.id);

    const { data: open } = await supabase
      .from('open_trades')
      .select('*')
      .in('account_id', accountIds)
      .order('open_time', { ascending: false });
    setOpenTrades(open || []);

    const { data: closed } = await supabase
      .from('closed_trades')
      .select('*')
      .in('account_id', accountIds)
      .order('close_time', { ascending: false })
      .limit(100);
    setClosedTrades(closed || []);
  }, [accounts]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  // Real-time subscriptions for trades
  useEffect(() => {
    if (accounts.length === 0) return;
    const accountIds = accounts.map((a) => a.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch = supabase.channel('dashboard-trades') as any;
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'open_trades' }, () => fetchTrades());
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'closed_trades' }, () => fetchTrades());
    ch.subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [accounts, fetchTrades]);

  useFocusEffect(
    useCallback(() => {
      fetchAccounts();
      fetchTrades();
    }, [fetchAccounts, fetchTrades]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchAccounts(), fetchTrades()]);
    setRefreshing(false);
  }, [fetchAccounts, fetchTrades]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (accounts.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Wallet size={48} color={Colors.textMuted} strokeWidth={1.5} />
        <Text style={styles.emptyTitle}>No Accounts Connected</Text>
        <Text style={styles.emptySubtitle}>
          Go to the Settings tab to add your MetaTrader 5 account
        </Text>
      </View>
    );
  }

  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const totalEquity = accounts.reduce((s, a) => s + Number(a.equity || 0), 0);
  const totalPnl = totalEquity - totalBalance;
  const isProfit = totalPnl >= 0;
  const currency = accounts[0]?.currency || 'USD';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
      }
    >
      {/* Header */}
      <Text style={styles.appTitle}>Golden Heists</Text>
      <Text style={styles.appSubtitle}>MADUMONEY SNIPER v5.0</Text>

      {/* Portfolio P&L */}
      <View style={styles.pnlCard}>
        <View style={styles.pnlHeader}>
          <Text style={styles.pnlLabel}>Total P&amp;L</Text>
          <View style={[styles.pnlIcon, { backgroundColor: isProfit ? Colors.successBg : Colors.dangerBg }]}>
            {isProfit ? (
              <TrendingUp size={16} color={Colors.success} strokeWidth={2.5} />
            ) : (
              <TrendingDown size={16} color={Colors.danger} strokeWidth={2.5} />
            )}
          </View>
        </View>
        <Text style={[styles.pnlValue, { color: isProfit ? Colors.success : Colors.danger }]}>
          {isProfit ? '+' : ''}{totalPnl.toFixed(2)} {currency}
        </Text>
        <View style={styles.pnlStats}>
          <View style={styles.pnlStat}>
            <Text style={styles.pnlStatLabel}>Equity</Text>
            <Text style={styles.pnlStatValue}>{totalEquity.toFixed(2)}</Text>
          </View>
          <View style={styles.pnlStatDivider} />
          <View style={styles.pnlStat}>
            <Text style={styles.pnlStatLabel}>Balance</Text>
            <Text style={styles.pnlStatValue}>{totalBalance.toFixed(2)}</Text>
          </View>
          <View style={styles.pnlStatDivider} />
          <View style={styles.pnlStat}>
            <Text style={styles.pnlStatLabel}>Trades</Text>
            <Text style={styles.pnlStatValue}>{openTrades.length}</Text>
          </View>
        </View>
      </View>

      {/* Account Cards */}
      <Text style={styles.sectionTitle}>Accounts</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.accountPills}
      >
        {accounts.map((a) => {
          const pnl = Number(a.equity || 0) - Number(a.balance || 0);
          const accOpen = openTrades.filter((t) => t.account_id === a.id).length;
          return (
            <Pressable
              key={a.id}
              style={styles.accountCard}
              onPress={() => selectAccount(a.id)}
            >
              <View style={styles.accountCardHeader}>
                <View style={styles.accountIcon}>
                  <Building2 size={18} color={Colors.primary} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountName} numberOfLines={1}>{a.account_name}</Text>
                  <Text style={styles.accountBroker}>{a.broker}</Text>
                </View>
                <View style={styles.connectedBadge}>
                  <View style={styles.connectedDot} />
                  <Text style={styles.connectedText}>Synced</Text>
                </View>
              </View>
              <View style={styles.accountDetails}>
                <View style={styles.accountDetailItem}>
                  <Server size={12} color={Colors.textMuted} strokeWidth={2} />
                  <Text style={styles.accountDetailText}>{a.server || a.login_id || '—'}</Text>
                </View>
                <View style={styles.accountDetailItem}>
                  <Gauge size={12} color={Colors.textMuted} strokeWidth={2} />
                  <Text style={styles.accountDetailText}>1:{a.leverage}</Text>
                </View>
              </View>
              <View style={styles.accountBalanceRow}>
                <View>
                  <Text style={styles.accountBalanceLabel}>Balance</Text>
                  <Text style={styles.accountBalanceValue}>
                    {Number(a.balance || 0).toFixed(2)} {a.currency}
                  </Text>
                </View>
                <View style={styles.accountPnlWrap}>
                  <Text style={styles.accountPnlLabel}>P&amp;L</Text>
                  <Text style={[styles.accountPnlValue, { color: pnl >= 0 ? Colors.success : Colors.danger }]}>
                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                  </Text>
                </View>
              </View>
              {accOpen > 0 && (
                <View style={styles.accountTradesBadge}>
                  <Text style={styles.accountTradesText}>{accOpen} active trades</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Trades Section */}
      <View style={styles.tradesSection}>
        <View style={styles.tabSwitcher}>
          <Pressable
            style={[styles.tabBtn, tab === 'active' && styles.tabBtnActive]}
            onPress={() => setTab('active')}
          >
            <Text style={[styles.tabBtnText, tab === 'active' && styles.tabBtnTextActive]}>
              Active ({openTrades.length})
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

        {tab === 'active' ? (
          openTrades.length === 0 ? (
            <View style={styles.emptyTrades}>
              <Text style={styles.emptyTradesText}>No active positions</Text>
            </View>
          ) : (
            <View style={styles.tradeList}>
              {openTrades.map((t) => {
                const acc = accounts.find((a) => a.id === t.account_id);
                return <TradeRow key={t.id} trade={t} currency={acc?.currency || 'USD'} type="active" />;
              })}
            </View>
          )
        ) : (
          closedTrades.length === 0 ? (
            <View style={styles.emptyTrades}>
              <Text style={styles.emptyTradesText}>No trade history yet</Text>
            </View>
          ) : (
            <View style={styles.tradeList}>
              {closedTrades.map((t) => {
                const acc = accounts.find((a) => a.id === t.account_id);
                return <TradeRow key={t.id} trade={t} currency={acc?.currency || 'USD'} type="history" />;
              })}
            </View>
          )
        )}
      </View>
    </ScrollView>
  );
}

function TradeRow({ trade, currency, type }: { trade: OpenTrade | ClosedTrade; currency: string; type: 'active' | 'history' }) {
  const isBuy = trade.trade_type === 'BUY';
  const profit = Number(trade.profit);
  const net = profit + Number(trade.swap || 0) + Number(trade.commission || 0);
  const openPrice = Number(trade.open_price);
  const closeOrCurrent = type === 'active'
    ? Number((trade as OpenTrade).current_price)
    : Number((trade as ClosedTrade).close_price);
  const time = type === 'active'
    ? (trade as OpenTrade).open_time
    : (trade as ClosedTrade).close_time;

  return (
    <View style={styles.tradeRow}>
      <View style={styles.tradeRowTop}>
        <View style={styles.tradeRowLeft}>
          <View style={[styles.tradeTypeBadge, { backgroundColor: isBuy ? Colors.buyBg : Colors.sellBg }]}>
            {isBuy ? (
              <ArrowUpRight size={12} color={Colors.buy} strokeWidth={2.5} />
            ) : (
              <ArrowDownRight size={12} color={Colors.sell} strokeWidth={2.5} />
            )}
            <Text style={[styles.tradeTypeText, { color: isBuy ? Colors.buy : Colors.sell }]}>
              {trade.trade_type}
            </Text>
          </View>
          <View>
            <Text style={styles.tradeSymbol}>{trade.symbol}</Text>
            <Text style={styles.tradeTicket}>#{trade.ticket}</Text>
          </View>
        </View>
        <View style={styles.tradeRowRight}>
          <Text style={[styles.tradeProfit, { color: net >= 0 ? Colors.success : Colors.danger }]}>
            {net >= 0 ? '+' : ''}{net.toFixed(2)} {currency}
          </Text>
          <Text style={styles.tradeTime}>
            {time ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
          </Text>
        </View>
      </View>
      <View style={styles.tradeRowBottom}>
        <View style={styles.tradeStat}>
          <Text style={styles.tradeStatLabel}>Volume</Text>
          <Text style={styles.tradeStatValue}>{trade.volume}</Text>
        </View>
        <View style={styles.tradeStat}>
          <Text style={styles.tradeStatLabel}>Open</Text>
          <Text style={styles.tradeStatValue}>{openPrice.toFixed(5)}</Text>
        </View>
        <View style={styles.tradeStat}>
          <Text style={styles.tradeStatLabel}>{type === 'active' ? 'Current' : 'Close'}</Text>
          <Text style={styles.tradeStatValue}>{closeOrCurrent.toFixed(5)}</Text>
        </View>
        <View style={styles.tradeStat}>
          <Text style={styles.tradeStatLabel}>SL</Text>
          <Text style={styles.tradeStatValue}>{Number(trade.stop_loss || 0).toFixed(5)}</Text>
        </View>
        <View style={styles.tradeStat}>
          <Text style={styles.tradeStatLabel}>TP</Text>
          <Text style={styles.tradeStatValue}>{Number(trade.take_profit || 0).toFixed(5)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  loadingContainer: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyTitle: { fontFamily: 'Inter-SemiBold', fontSize: 18, color: Colors.text },
  emptySubtitle: { fontFamily: 'Inter-Regular', fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  appTitle: { fontFamily: 'Inter-Bold', fontSize: 26, color: Colors.text },
  appSubtitle: { fontFamily: 'Inter-Regular', fontSize: 12, color: Colors.textMuted, marginTop: 2, marginBottom: Spacing.lg },
  pnlCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.xl, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  pnlHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  pnlLabel: { fontFamily: 'Inter-Medium', fontSize: 13, color: Colors.textSecondary },
  pnlIcon: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  pnlValue: { fontFamily: 'Inter-Bold', fontSize: 30, marginBottom: Spacing.lg },
  pnlStats: { flexDirection: 'row', alignItems: 'center' },
  pnlStat: { flex: 1 },
  pnlStatDivider: { width: 1, height: 28, backgroundColor: Colors.border, marginHorizontal: Spacing.sm },
  pnlStatLabel: { fontFamily: 'Inter-Regular', fontSize: 11, color: Colors.textMuted, marginBottom: 3 },
  pnlStatValue: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: Colors.text },
  sectionTitle: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: Colors.text, marginBottom: Spacing.md },
  accountPills: { gap: Spacing.md, paddingRight: Spacing.lg, marginBottom: Spacing.lg },
  accountCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.lg, width: 240, borderWidth: 1, borderColor: Colors.border },
  accountCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  accountIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  accountName: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: Colors.text },
  accountBroker: { fontFamily: 'Inter-Regular', fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.connectedBg, paddingHorizontal: 6, paddingVertical: 3, borderRadius: Radius.sm },
  connectedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.connected },
  connectedText: { fontFamily: 'Inter-SemiBold', fontSize: 9, color: Colors.connected, letterSpacing: 0.5 },
  accountDetails: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  accountDetailItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  accountDetailText: { fontFamily: 'Inter-Regular', fontSize: 11, color: Colors.textMuted },
  accountBalanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  accountBalanceLabel: { fontFamily: 'Inter-Regular', fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
  accountBalanceValue: { fontFamily: 'Inter-SemiBold', fontSize: 16, color: Colors.text },
  accountPnlWrap: { alignItems: 'flex-end' },
  accountPnlLabel: { fontFamily: 'Inter-Regular', fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
  accountPnlValue: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  accountTradesBadge: { marginTop: Spacing.sm, backgroundColor: Colors.primaryLight, borderRadius: Radius.sm, paddingVertical: 4, paddingHorizontal: 8, alignSelf: 'flex-start' },
  accountTradesText: { fontFamily: 'Inter-Medium', fontSize: 10, color: Colors.primary },
  tradesSection: { marginTop: Spacing.sm },
  tabSwitcher: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: 4, marginBottom: Spacing.md },
  tabBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.sm, alignItems: 'center' },
  tabBtnActive: { backgroundColor: Colors.primaryLight },
  tabBtnText: { fontFamily: 'Inter-Medium', fontSize: 13, color: Colors.textMuted },
  tabBtnTextActive: { color: Colors.primary },
  emptyTrades: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  emptyTradesText: { fontFamily: 'Inter-Regular', fontSize: 14, color: Colors.textMuted },
  tradeList: { gap: Spacing.sm },
  tradeRow: { backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  tradeRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  tradeRowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  tradeTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 4, borderRadius: Radius.sm },
  tradeTypeText: { fontFamily: 'Inter-SemiBold', fontSize: 10, letterSpacing: 0.5 },
  tradeSymbol: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: Colors.text },
  tradeTicket: { fontFamily: 'Inter-Regular', fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  tradeRowRight: { alignItems: 'flex-end' },
  tradeProfit: { fontFamily: 'Inter-Bold', fontSize: 14 },
  tradeTime: { fontFamily: 'Inter-Regular', fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  tradeRowBottom: { flexDirection: 'row', gap: Spacing.xs, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  tradeStat: { flex: 1 },
  tradeStatLabel: { fontFamily: 'Inter-Regular', fontSize: 9, color: Colors.textMuted, marginBottom: 2 },
  tradeStatValue: { fontFamily: 'Inter-Medium', fontSize: 11, color: Colors.text },
});
