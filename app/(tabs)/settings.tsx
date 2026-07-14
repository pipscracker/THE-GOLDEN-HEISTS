import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  User,
  Building2,
  KeyRound,
  Server,
  Copy,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  Info,
} from 'lucide-react-native';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useAccount } from '@/hooks/useAccount';
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const { accountId, account, loading, refreshAccount, selectAccount } = useAccount();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [accountName, setAccountName] = useState('');
  const [broker, setBroker] = useState('');
  const [loginId, setLoginId] = useState('');
  const [server, setServer] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [leverage, setLeverage] = useState('500');

  const handleAddAccount = useCallback(async () => {
    setError(null);
    if (!accountName.trim()) {
      setError('Account name is required');
      return;
    }
    if (!broker.trim()) {
      setError('Broker is required');
      return;
    }

    setSaving(true);
    try {
      const { data, error: insertError } = await supabase
        .from('mt5_accounts')
        .insert({
          account_name: accountName.trim(),
          broker: broker.trim(),
          login_id: loginId.trim() || null,
          server: server.trim() || null,
          currency: currency.trim() || 'USD',
          leverage: parseInt(leverage, 10) || 500,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      selectAccount(data.id);
      setShowForm(false);
      setAccountName('');
      setBroker('');
      setLoginId('');
      setServer('');
      setCurrency('USD');
      setLeverage('500');
      await refreshAccount();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save account');
    } finally {
      setSaving(false);
    }
  }, [accountName, broker, loginId, server, currency, leverage, selectAccount, refreshAccount]);

  const handleDeleteAccount = useCallback(async () => {
    if (!accountId) return;
    Alert.alert(
      'Delete Account',
      'This will permanently delete this account and all associated trades, signals, and robot state. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('mt5_accounts').delete().eq('id', accountId);
            selectAccount('');
            await refreshAccount();
          },
        },
      ],
    );
  }, [accountId, selectAccount, refreshAccount]);

  const handleCopyId = useCallback(() => {
    if (!accountId) return;
    // Clipboard is not available on web in all cases; use the web API
    if (Platform.OS === 'web' && navigator.clipboard) {
      navigator.clipboard.writeText(accountId);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [accountId]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>Settings</Text>

        {/* Connected Account */}
        {accountId && account ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Connected MT5 Account</Text>

            {/* Account UUID */}
            <View style={styles.uuidSection}>
              <Text style={styles.uuidLabel}>Account UUID (paste into EA Inp_AccountID)</Text>
              <Pressable style={styles.uuidBox} onPress={handleCopyId}>
                <Text style={styles.uuidText} selectable>
                  {accountId}
                </Text>
                {copied ? (
                  <Check size={18} color={Colors.success} strokeWidth={2} />
                ) : (
                  <Copy size={18} color={Colors.textMuted} strokeWidth={2} />
                )}
              </Pressable>
            </View>

            {/* Account info */}
            <View style={styles.infoRow}>
              <User size={16} color={Colors.textSecondary} strokeWidth={2} />
              <Text style={styles.infoLabel}>Account Name</Text>
              <Text style={styles.infoValue}>{account.account_name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Building2 size={16} color={Colors.textSecondary} strokeWidth={2} />
              <Text style={styles.infoLabel}>Broker</Text>
              <Text style={styles.infoValue}>{account.broker}</Text>
            </View>
            {account.login_id && (
              <View style={styles.infoRow}>
                <KeyRound size={16} color={Colors.textSecondary} strokeWidth={2} />
                <Text style={styles.infoLabel}>Login ID</Text>
                <Text style={styles.infoValue}>{account.login_id}</Text>
              </View>
            )}
            {account.server && (
              <View style={styles.infoRow}>
                <Server size={16} color={Colors.textSecondary} strokeWidth={2} />
                <Text style={styles.infoLabel}>Server</Text>
                <Text style={styles.infoValue}>{account.server}</Text>
              </View>
            )}
            <View style={styles.infoRowLast}>
              <Text style={styles.infoLabel}>Leverage / Currency</Text>
              <Text style={styles.infoValue}>
                1:{account.leverage} | {account.currency}
              </Text>
            </View>

            <View style={styles.actionRow}>
              <Pressable
                style={[styles.actionBtn, { borderColor: Colors.danger }]}
                onPress={handleDeleteAccount}
              >
                <Trash2 size={16} color={Colors.danger} strokeWidth={2} />
                <Text style={[styles.actionBtnText, { color: Colors.danger }]}>Delete</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, { borderColor: Colors.borderActive }]}
                onPress={refreshAccount}
              >
                <RefreshCw size={16} color={Colors.textSecondary} strokeWidth={2} />
                <Text style={[styles.actionBtnText, { color: Colors.textSecondary }]}>
                  Refresh
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Add Account Form */}
        {!accountId || showForm ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {accountId ? 'Add Another Account' : 'Add MT5 Account'}
            </Text>
            <Text style={styles.cardSubtitle}>
              Enter your MetaTrader 5 account details. You'll get a UUID to paste into the EA's
              Inp_AccountID input for live bot sync.
            </Text>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Account Name *</Text>
              <TextInput
                style={styles.input}
                value={accountName}
                onChangeText={setAccountName}
                placeholder="e.g. My Golden Heists Account"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Broker *</Text>
              <TextInput
                style={styles.input}
                value={broker}
                onChangeText={setBroker}
                placeholder="e.g. IC Markets, Exness, FXTM"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={styles.inputRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Login ID</Text>
                <TextInput
                  style={[styles.input, { marginRight: Spacing.sm }]}
                  value={loginId}
                  onChangeText={setLoginId}
                  placeholder="MT5 login number"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Server</Text>
                <TextInput
                  style={styles.input}
                  value={server}
                  onChangeText={setServer}
                  placeholder="e.g. ICMarketsSC-Demo"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>

            <View style={styles.inputRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Currency</Text>
                <TextInput
                  style={[styles.input, { marginRight: Spacing.sm }]}
                  value={currency}
                  onChangeText={setCurrency}
                  placeholder="USD"
                  placeholderTextColor={Colors.textMuted}
                  maxLength={4}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Leverage</Text>
                <TextInput
                  style={styles.input}
                  value={leverage}
                  onChangeText={setLeverage}
                  placeholder="500"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Pressable
              style={styles.saveBtn}
              onPress={handleAddAccount}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={Colors.bg} />
              ) : (
                <>
                  <Plus size={18} color={Colors.bg} strokeWidth={2.5} />
                  <Text style={styles.saveBtnText}>Save Account</Text>
                </>
              )}
            </Pressable>

            {accountId && (
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setShowForm(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {/* EA Setup Guide */}
        <View style={styles.card}>
          <View style={styles.guideHeader}>
            <Info size={18} color={Colors.primary} strokeWidth={2} />
            <Text style={styles.cardTitle}>EA Bridge Setup</Text>
          </View>
          <Text style={styles.guideStep}>1. Add your MT5 account above</Text>
          <Text style={styles.guideStep}>2. Copy the Account UUID</Text>
          <Text style={styles.guideStep}>
            3. In MT5, open the EA inputs and paste the UUID into Inp_AccountID
          </Text>
          <Text style={styles.guideStep}>
            4. Whitelist the Supabase URL in MT5 Tools {'>'} Options {'>'} Expert Advisors
          </Text>
          <Text style={styles.guideStep}>5. Attach the EA to an M1 chart</Text>
          <Text style={styles.guideStep}>6. The EA pushes data every 10s and polls commands every 30s</Text>
          <Text style={styles.guideNote}>
            Use the Dashboard tab to Start, Stop, or Pause the robot remotely. Commands are picked
            up by the EA on its next poll cycle.
          </Text>
        </View>

        {/* Robot Input Parameters */}
        {accountId && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Robot Input Parameters</Text>
            <Text style={styles.cardSubtitle}>
              These are configured in the EA inputs on MT5. The app reads the live state from the EA
              push data.
            </Text>
            <View style={styles.paramRow}>
              <Text style={styles.paramLabel}>Lot Size</Text>
              <Text style={styles.paramValue}>0.05 (auto-corrected to broker min)</Text>
            </View>
            <View style={styles.paramRow}>
              <Text style={styles.paramLabel}>Starting SL</Text>
              <Text style={styles.paramValue}>10 points (+10 loop on rejection)</Text>
            </View>
            <View style={styles.paramRow}>
              <Text style={styles.paramLabel}>Trades per Signal</Text>
              <Text style={styles.paramValue}>3 layered positions</Text>
            </View>
            <View style={styles.paramRow}>
              <Text style={styles.paramLabel}>Basket TP</Text>
              <Text style={[styles.paramValue, { color: Colors.success }]}>
                +$15.00
              </Text>
            </View>
            <View style={styles.paramRowLast}>
              <Text style={styles.paramLabel}>Basket SL</Text>
              <Text style={[styles.paramValue, { color: Colors.danger }]}>
                -$30.00
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  },
  pageTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 24,
    color: Colors.text,
    marginBottom: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  cardSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: Spacing.lg,
    lineHeight: 18,
  },
  uuidSection: {
    marginBottom: Spacing.lg,
  },
  uuidLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  uuidBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bgCardElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderActive,
  },
  uuidText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: Colors.primary,
    flex: 1,
    marginRight: Spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
  infoLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  infoValue: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: Colors.text,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
  },
  actionBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
  },
  errorBox: {
    backgroundColor: Colors.dangerGlow,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: Colors.danger,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
  },
  inputLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.bgCardElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  saveBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: Colors.bg,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  cancelBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: Colors.textMuted,
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  guideStep: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 6,
    lineHeight: 18,
  },
  guideNote: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: Colors.primary,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    lineHeight: 17,
  },
  paramRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  paramRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
  paramLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  paramValue: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: Colors.text,
  },
});
