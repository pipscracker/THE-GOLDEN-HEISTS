import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Mt5Account, RobotState, EaSettings } from '@/types/database';

type PgPayload<T> = { new: T; old: T | null; eventType: string };

export function useAccount() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Mt5Account[]>([]);
  const [account, setAccount] = useState<Mt5Account | null>(null);
  const [robotState, setRobotState] = useState<RobotState | null>(null);
  const [eaSettings, setEaSettings] = useState<EaSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(async () => {
    const { data, error } = await supabase
      .from('mt5_accounts')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      setAccounts(data);
      setAccountId((prev) => {
        if (prev) return prev;
        return data.length > 0 ? data[0].id : null;
      });
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchAccounts();
      setLoading(false);
    })();
  }, [fetchAccounts]);

  useEffect(() => {
    if (!accountId) {
      setAccount(null);
      setRobotState(null);
      setEaSettings(null);
      return;
    }

    const fetchDetail = async () => {
      const { data: acc } = await supabase
        .from('mt5_accounts')
        .select('*')
        .eq('id', accountId)
        .maybeSingle();
      if (acc) setAccount(acc);

      const { data: rs } = await supabase
        .from('robot_state')
        .select('*')
        .eq('account_id', accountId)
        .maybeSingle();
      if (rs) setRobotState(rs);

      const { data: es } = await supabase
        .from('ea_settings')
        .select('*')
        .eq('account_id', accountId)
        .maybeSingle();
      if (es) setEaSettings(es);
    };

    fetchDetail();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch = supabase.channel(`account-${accountId}`) as any;
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'mt5_accounts', filter: `id=eq.${accountId}` }, (payload: PgPayload<Mt5Account>) => {
      if (payload.new) setAccount(payload.new);
    });
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'robot_state', filter: `account_id=eq.${accountId}` }, (payload: PgPayload<RobotState>) => {
      if (payload.new) setRobotState(payload.new);
    });
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'ea_settings', filter: `account_id=eq.${accountId}` }, (payload: PgPayload<EaSettings>) => {
      if (payload.new) setEaSettings(payload.new);
    });
    ch.subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [accountId]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch = supabase.channel('all-accounts') as any;
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'mt5_accounts' }, () => fetchAccounts());
    ch.subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [fetchAccounts]);

  const refreshAccount = useCallback(async () => {
    if (!accountId) return;
    const { data } = await supabase
      .from('mt5_accounts')
      .select('*')
      .eq('id', accountId)
      .maybeSingle();
    if (data) setAccount(data);

    const { data: rs } = await supabase
      .from('robot_state')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();
    if (rs) setRobotState(rs);

    const { data: es } = await supabase
      .from('ea_settings')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();
    if (es) setEaSettings(es);
  }, [accountId]);

  const selectAccount = useCallback((id: string) => {
    setAccountId(id);
  }, []);

  const saveEaSettings = useCallback(
    async (settings: Partial<EaSettings>) => {
      if (!accountId) return;
      const { data: existing } = await supabase
        .from('ea_settings')
        .select('*')
        .eq('account_id', accountId)
        .maybeSingle();

      if (existing) {
        const newVersion = Number(existing.settings_version) + 1;
        const { data, error } = await supabase
          .from('ea_settings')
          .update({
            ...settings,
            settings_version: newVersion,
            updated_at: new Date().toISOString(),
          })
          .eq('account_id', accountId)
          .select('*')
          .maybeSingle();
        if (!error && data) setEaSettings(data);
      } else {
        const { data, error } = await supabase
          .from('ea_settings')
          .insert({
            account_id: accountId,
            ...settings,
            settings_version: 1,
          })
          .select('*')
          .maybeSingle();
        if (!error && data) setEaSettings(data);
      }
    },
    [accountId],
  );

  return {
    accountId,
    accounts,
    account,
    robotState,
    eaSettings,
    loading,
    refreshAccount,
    selectAccount,
    fetchAccounts,
    saveEaSettings,
  };
}
