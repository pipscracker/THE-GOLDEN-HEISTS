// Supabase Edge Function: mt5-sync
//
// Routes (all POST, JSON body):
//   /functions/v1/mt5-sync/command  — called by the app to queue a
//                                     start/stop/pause/resume command
//   /functions/v1/mt5-sync/push     — called by the EA every ~10s to
//                                     push account/robot/trade state
//   /functions/v1/mt5-sync/pull     — called by the EA every ~30s to
//                                     fetch settings + the next queued command
//
// Deploy with: supabase functions deploy mt5-sync

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const route = url.pathname.split('/').pop();

  try {
    const body = await req.json().catch(() => ({}));
    const accountId = body.account_id as string | undefined;
    if (!accountId) return json({ error: 'account_id is required' }, 400);

    switch (route) {
      case 'command': {
        const command = body.command as string;
        if (!['start', 'stop', 'pause', 'resume'].includes(command)) {
          return json({ error: 'invalid command' }, 400);
        }
        const { error } = await supabase.from('robot_commands').insert({
          account_id: accountId,
          command,
        });
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      case 'push': {
        // EA push payload: account balance/equity + robot telemetry +
        // optional arrays of open/closed trades and new signals.
        if (body.balance !== undefined || body.equity !== undefined) {
          await supabase
            .from('mt5_accounts')
            .update({
              balance: body.balance,
              equity: body.equity,
              updated_at: new Date().toISOString(),
            })
            .eq('id', accountId);
        }

        if (body.robot_state) {
          await supabase
            .from('robot_state')
            .upsert({
              account_id: accountId,
              ...body.robot_state,
              updated_at: new Date().toISOString(),
            });
        }

        if (Array.isArray(body.open_trades)) {
          await supabase.from('open_trades').delete().eq('account_id', accountId);
          if (body.open_trades.length > 0) {
            await supabase
              .from('open_trades')
              .insert(body.open_trades.map((t: Record<string, unknown>) => ({ ...t, account_id: accountId })));
          }
        }

        if (Array.isArray(body.closed_trades) && body.closed_trades.length > 0) {
          await supabase
            .from('closed_trades')
            .insert(body.closed_trades.map((t: Record<string, unknown>) => ({ ...t, account_id: accountId })));
        }

        if (Array.isArray(body.signals) && body.signals.length > 0) {
          await supabase
            .from('signal_log')
            .insert(body.signals.map((s: Record<string, unknown>) => ({ ...s, account_id: accountId })));
        }

        return json({ ok: true });
      }

      case 'pull': {
        const { data: settings } = await supabase
          .from('ea_settings')
          .select('*')
          .eq('account_id', accountId)
          .maybeSingle();

        const { data: command } = await supabase
          .from('robot_commands')
          .select('*')
          .eq('account_id', accountId)
          .eq('consumed', false)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (command) {
          await supabase
            .from('robot_commands')
            .update({ consumed: true, delivered_at: new Date().toISOString() })
            .eq('id', command.id);
        }

        return json({ settings: settings ?? null, command: command?.command ?? null });
      }

      default:
        return json({ error: `unknown route: ${route}` }, 404);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'unexpected error' }, 500);
  }
});
