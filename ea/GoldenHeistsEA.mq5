//+------------------------------------------------------------------+
//|                                           GoldenHeistsEA.mq5      |
//|                                                                    |
//| Two-engine M5 sniper bot, remotely monitored/controlled via a     |
//| Supabase edge function ("mt5-sync"). See SETUP.md at the project  |
//| root for the full wiring guide and the strategy write-up.         |
//|                                                                    |
//| Engine 1 — Reversion (magic 888999): price pierces the prior M5   |
//|   bar's high/low AND RSI(7) confirms exhaustion -> fade the move. |
//| Engine 2 — Breakout  (magic 777666): price breaks the prior M5    |
//|   high/low with no RSI filter -> trade the continuation.          |
//|                                                                    |
//| Both engines share one basket P&L. Hitting the profit target      |
//| closes everything and resets the starting SL. Hitting the loss    |
//| floor closes everything and WIDENS the starting SL by +10 points  |
//| for the next basket (martingale-style — see risk warning in       |
//| SETUP.md). A cooldown blocks instant re-entry after a basket      |
//| closes.                                                            |
//+------------------------------------------------------------------+
#property copyright "Golden Heists"
#property version   "5.00"
#property strict

#include <Trade\Trade.mqh>

//──────────────────────── Inputs ─────────────────────────────────────
input string Inp_AccountID          = "";               // Account UUID (from Settings tab)
input string Inp_SupabaseURL        = "";                // e.g. https://xxxx.supabase.co
input string Inp_SupabaseAnonKey    = "";                // Supabase anon key

input double Inp_LotSize            = 0.05;              // Starting lot size
input int    Inp_StartingSLPoints   = 10;                 // Starting stop loss, in points
input int    Inp_MaxTrades          = 3;                  // Layered positions per signal
input double Inp_TargetProfitUSD    = 15.00;              // Basket take-profit
input double Inp_TargetLossUSD      = -30.00;             // Basket stop-loss (negative)
input int    Inp_SessionStartHour   = 0;                  // Server-time session start (0-23)
input int    Inp_SessionEndHour     = 24;                 // Server-time session end (1-24)
input int    Inp_CooldownSec        = 60;                 // Cooldown after a basket closes
input int    Inp_PushIntervalSec    = 10;                  // Telemetry push interval
input int    Inp_PullIntervalSec    = 30;                  // Settings/command poll interval
input int    Inp_RSIPeriod          = 7;                  // RSI period
input double Inp_TP_RewardMultiple  = 3.0;                 // Per-trade TP = SL points * this

//──────────────────────── Magic numbers ──────────────────────────────
#define MAGIC_REVERSION 888999
#define MAGIC_BREAKOUT  777666

CTrade trade;

//──────────────────────── Runtime state ──────────────────────────────
double   g_startingSLPoints;     // widens by +10 after a basket loss, resets to input on a win
double   g_lotSize;               // working copies of the remotely-editable settings —
int      g_maxTrades;             // MQL5 inputs can't be reassigned at runtime, so the
double   g_targetProfitUSD;       // app's Save & Sync writes land here instead, applied
double   g_targetLossUSD;         // the next time PullState() sees a new settings_version.
int      g_sessionStartHour;
int      g_sessionEndHour;
int      g_settingsVersion = -1; // last settings_version applied from the app
bool     g_robotEnabled    = false;
bool     g_robotPaused     = false;
datetime g_cooldownUntil   = 0;
datetime g_lastPush        = 0;
datetime g_lastPull        = 0;

// Buffers of events collected since the last successful push
string   g_pendingSignalsJson = "";     // comma-joined JSON objects
string   g_pendingClosedJson  = "";     // comma-joined JSON objects
int      g_lastKnownTicketCount = 0;

//+------------------------------------------------------------------+
int OnInit()
  {
   if(Inp_AccountID == "" || Inp_SupabaseURL == "" || Inp_SupabaseAnonKey == "")
     {
      Print("GoldenHeistsEA: Inp_AccountID / Inp_SupabaseURL / Inp_SupabaseAnonKey must be set.");
      return(INIT_PARAMETERS_INCORRECT);
     }

   g_startingSLPoints = Inp_StartingSLPoints;
   g_lotSize          = Inp_LotSize;
   g_maxTrades        = Inp_MaxTrades;
   g_targetProfitUSD  = Inp_TargetProfitUSD;
   g_targetLossUSD    = Inp_TargetLossUSD;
   g_sessionStartHour = Inp_SessionStartHour;
   g_sessionEndHour   = Inp_SessionEndHour;
   trade.SetExpertMagicNumber(MAGIC_REVERSION);

   EventSetTimer(1);
   PushState();  // initial push so the app shows something immediately
   PullState();

   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
  }

//+------------------------------------------------------------------+
//| Timer: drives the push/pull cadence independent of tick rate     |
//+------------------------------------------------------------------+
void OnTimer()
  {
   datetime now = TimeCurrent();

   if(now - g_lastPush >= Inp_PushIntervalSec)
     {
      PushState();
      g_lastPush = now;
     }

   if(now - g_lastPull >= Inp_PullIntervalSec)
     {
      PullState();
      g_lastPull = now;
     }
  }

//+------------------------------------------------------------------+
//| Tick: the actual trading logic                                   |
//+------------------------------------------------------------------+
void OnTick()
  {
   ManageBasket();

   if(!g_robotEnabled || g_robotPaused) return;
   if(!WithinSession())               return;
   if(TimeCurrent() < g_cooldownUntil) return;
   if(CountOpenPositions() > 0)        return; // one basket at a time

   CheckForSignal();
  }

//+------------------------------------------------------------------+
//| Session window check (server time, g_sessionEndHour==24 = 24h) |
//+------------------------------------------------------------------+
bool WithinSession()
  {
   MqlDateTime t;
   TimeToStruct(TimeCurrent(), t);
   int h = t.hour;
   if(g_sessionStartHour == 0 && g_sessionEndHour >= 24) return(true);
   if(g_sessionStartHour <= g_sessionEndHour)
      return(h >= g_sessionStartHour && h < g_sessionEndHour);
   // wraps past midnight
   return(h >= g_sessionStartHour || h < g_sessionEndHour);
  }

//+------------------------------------------------------------------+
//| Count open positions for this symbol across both engine magics   |
//+------------------------------------------------------------------+
int CountOpenPositions()
  {
   int count = 0;
   for(int i = 0; i < PositionsTotal(); i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      long magic = PositionGetInteger(POSITION_MAGIC);
      if(magic == MAGIC_REVERSION || magic == MAGIC_BREAKOUT) count++;
     }
   return(count);
  }

//+------------------------------------------------------------------+
//| Sum floating P&L (profit+swap+commission) across both engines    |
//+------------------------------------------------------------------+
double BasketProfit()
  {
   double total = 0;
   for(int i = 0; i < PositionsTotal(); i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      long magic = PositionGetInteger(POSITION_MAGIC);
      if(magic != MAGIC_REVERSION && magic != MAGIC_BREAKOUT) continue;
      total += PositionGetDouble(POSITION_PROFIT)
             + PositionGetDouble(POSITION_SWAP)
             + PositionGetDouble(POSITION_COMMISSION);
     }
   return(total);
  }

//+------------------------------------------------------------------+
//| Close every position opened by either engine on this symbol      |
//+------------------------------------------------------------------+
void CloseBasket()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      long magic = PositionGetInteger(POSITION_MAGIC);
      if(magic != MAGIC_REVERSION && magic != MAGIC_BREAKOUT) continue;
      trade.PositionClose(ticket);
     }
  }

//+------------------------------------------------------------------+
//| Evaluate the basket target/floor and reset/widen accordingly     |
//+------------------------------------------------------------------+
void ManageBasket()
  {
   if(CountOpenPositions() == 0) return;

   double pnl = BasketProfit();

   if(pnl >= g_targetProfitUSD)
     {
      CloseBasket();
      g_startingSLPoints = Inp_StartingSLPoints; // reset on a win
      g_cooldownUntil = TimeCurrent() + Inp_CooldownSec;
      Print("GoldenHeistsEA: basket target hit (+", pnl, "). SL reset to ", g_startingSLPoints, " pts.");
     }
   else if(pnl <= g_targetLossUSD)
     {
      CloseBasket();
      g_startingSLPoints += 10; // widen after a loss (martingale-style, see SETUP.md risk note)
      g_cooldownUntil = TimeCurrent() + Inp_CooldownSec;
      Print("GoldenHeistsEA: basket floor hit (", pnl, "). SL widened to ", g_startingSLPoints, " pts.");
     }
  }

//+------------------------------------------------------------------+
//| Look for a reversion or breakout signal on the just-closed M5 bar|
//+------------------------------------------------------------------+
void CheckForSignal()
  {
   double prevHigh = iHigh(_Symbol, PERIOD_M5, 1);
   double prevLow  = iLow(_Symbol, PERIOD_M5, 1);
   if(prevHigh <= 0 || prevLow <= 0) return;

   int rsiHandle = iRSI(_Symbol, PERIOD_M5, Inp_RSIPeriod, PRICE_CLOSE);
   if(rsiHandle == INVALID_HANDLE) return;
   double rsiBuf[];
   ArraySetAsSeries(rsiBuf, true);
   if(CopyBuffer(rsiHandle, 0, 0, 1, rsiBuf) < 1) { IndicatorRelease(rsiHandle); return; }
   double rsi = rsiBuf[0];
   IndicatorRelease(rsiHandle);

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);

   bool piercedHigh = bid > prevHigh;
   bool piercedLow  = bid < prevLow;

   // Engine 1: Reversion — pierce + RSI exhaustion confirms a fade
   if(piercedHigh && rsi >= 70)
     {
      FireBasket(MAGIC_REVERSION, ORDER_TYPE_SELL, "REVERSION_FADE_HIGH", rsi, bid, prevHigh, prevLow);
      return;
     }
   if(piercedLow && rsi <= 30)
     {
      FireBasket(MAGIC_REVERSION, ORDER_TYPE_BUY, "REVERSION_FADE_LOW", rsi, bid, prevHigh, prevLow);
      return;
     }

   // Engine 2: Breakout — same pierce, but RSI does NOT confirm exhaustion
   if(piercedHigh && rsi < 70)
     {
      FireBasket(MAGIC_BREAKOUT, ORDER_TYPE_BUY, "BREAKOUT_CONTINUATION_HIGH", rsi, bid, prevHigh, prevLow);
      return;
     }
   if(piercedLow && rsi > 30)
     {
      FireBasket(MAGIC_BREAKOUT, ORDER_TYPE_SELL, "BREAKOUT_CONTINUATION_LOW", rsi, bid, prevHigh, prevLow);
      return;
     }
  }

//+------------------------------------------------------------------+
//| Open g_maxTrades layered positions for a fired signal          |
//+------------------------------------------------------------------+
void FireBasket(long magic, ENUM_ORDER_TYPE dir, string signalType, double rsi,
                double bidPrice, double m5high, double m5low)
  {
   double point   = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   int    digits  = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double slPts   = g_startingSLPoints;
   double tpPts   = slPts * Inp_TP_RewardMultiple;

   double price = (dir == ORDER_TYPE_BUY) ? SymbolInfoDouble(_Symbol, SYMBOL_ASK)
                                           : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double sl = (dir == ORDER_TYPE_BUY) ? price - slPts * point : price + slPts * point;
   double tp = (dir == ORDER_TYPE_BUY) ? price + tpPts * point : price - tpPts * point;
   sl = NormalizeDouble(sl, digits);
   tp = NormalizeDouble(tp, digits);

   trade.SetExpertMagicNumber((ulong)magic);

   int firedCount = 0;
   for(int i = 0; i < g_maxTrades; i++)
     {
      bool ok = (dir == ORDER_TYPE_BUY) ? trade.Buy(g_lotSize, _Symbol, price, sl, tp)
                                        : trade.Sell(g_lotSize, _Symbol, price, sl, tp);
      if(ok) firedCount++;
     }

   if(firedCount > 0)
      QueueSignalLog(magic, signalType, dir, rsi, bidPrice, m5high, m5low, firedCount, (int)slPts, (int)tpPts);
  }

//+------------------------------------------------------------------+
//| JSON helpers (hand-rolled — flat objects only, no nested arrays  |
//| beyond what this bridge needs)                                   |
//+------------------------------------------------------------------+
string JStr(string s)
  {
   string out = s;
   StringReplace(out, "\\", "\\\\");
   StringReplace(out, "\"", "\\\"");
   return("\"" + out + "\"");
  }

void QueueSignalLog(long magic, string signalType, ENUM_ORDER_TYPE dir, double rsi,
                     double bidPrice, double m5high, double m5low, int firedCount, int slPts, int tpPts)
  {
   string engine = (magic == MAGIC_REVERSION) ? "reversion" : "breakout";
   string direction = (dir == ORDER_TYPE_BUY) ? "BUY" : "SELL";

   string obj = "{"
      + "\"engine\":" + JStr(engine) + ","
      + "\"signal_type\":" + JStr(signalType) + ","
      + "\"direction\":" + JStr(direction) + ","
      + "\"rsi_value\":" + DoubleToString(rsi, 2) + ","
      + "\"bid_price\":" + DoubleToString(bidPrice, _Digits) + ","
      + "\"m5_high\":" + DoubleToString(m5high, _Digits) + ","
      + "\"m5_low\":" + DoubleToString(m5low, _Digits) + ","
      + "\"lot_size\":" + DoubleToString(g_lotSize, 2) + ","
      + "\"positions_fired\":" + IntegerToString(firedCount) + ","
      + "\"sl_points\":" + IntegerToString(slPts) + ","
      + "\"tp_points\":" + IntegerToString(tpPts)
      + "}";

   g_pendingSignalsJson = (g_pendingSignalsJson == "") ? obj : (g_pendingSignalsJson + "," + obj);
  }

//+------------------------------------------------------------------+
//| Build the open_trades[] JSON array for the current symbol        |
//+------------------------------------------------------------------+
string BuildOpenTradesJson()
  {
   string arr = "";
   for(int i = 0; i < PositionsTotal(); i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      long magic = PositionGetInteger(POSITION_MAGIC);
      if(magic != MAGIC_REVERSION && magic != MAGIC_BREAKOUT) continue;

      string type = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? "BUY" : "SELL";
      string obj = "{"
         + "\"ticket\":" + IntegerToString((long)ticket) + ","
         + "\"symbol\":" + JStr(_Symbol) + ","
         + "\"trade_type\":" + JStr(type) + ","
         + "\"volume\":" + DoubleToString(PositionGetDouble(POSITION_VOLUME), 2) + ","
         + "\"open_price\":" + DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN), _Digits) + ","
         + "\"current_price\":" + DoubleToString(PositionGetDouble(POSITION_PRICE_CURRENT), _Digits) + ","
         + "\"stop_loss\":" + DoubleToString(PositionGetDouble(POSITION_SL), _Digits) + ","
         + "\"take_profit\":" + DoubleToString(PositionGetDouble(POSITION_TP), _Digits) + ","
         + "\"profit\":" + DoubleToString(PositionGetDouble(POSITION_PROFIT), 2) + ","
         + "\"swap\":" + DoubleToString(PositionGetDouble(POSITION_SWAP), 2) + ","
         + "\"commission\":" + DoubleToString(0.0, 2) + ","
         + "\"open_time\":" + JStr(TimeToString(PositionGetInteger(POSITION_TIME), TIME_DATE | TIME_SECONDS))
         + "}";
      arr = (arr == "") ? obj : (arr + "," + obj);
     }
   return(arr);
  }

//+------------------------------------------------------------------+
//| Push telemetry to Supabase (account balance/equity, robot state, |
//| open trades, and anything queued in the pending buffers)         |
//+------------------------------------------------------------------+
void PushState()
  {
   double basketPnl = BasketProfit();
   int    activePos = CountOpenPositions();
   bool   live       = TimeCurrent() < g_cooldownUntil;
   int    cooldownLeft = live ? (int)(g_cooldownUntil - TimeCurrent()) : 0;

   string dashboardMsg;
   if(!g_robotEnabled) dashboardMsg = "STOPPED";
   else if(g_robotPaused) dashboardMsg = "PAUSED";
   else if(cooldownLeft > 0) dashboardMsg = "COOLDOWN";
   else if(activePos > 0) dashboardMsg = "BASKET OPEN";
   else dashboardMsg = "SCANNING FOR SIGNAL";

   double rsiNow = 0;
   int rsiHandle = iRSI(_Symbol, PERIOD_M5, Inp_RSIPeriod, PRICE_CLOSE);
   if(rsiHandle != INVALID_HANDLE)
     {
      double buf[];
      ArraySetAsSeries(buf, true);
      if(CopyBuffer(rsiHandle, 0, 0, 1, buf) > 0) rsiNow = buf[0];
      IndicatorRelease(rsiHandle);
     }

   string robotStateJson = "{"
      + "\"robot_enabled\":" + (g_robotEnabled ? "true" : "false") + ","
      + "\"robot_paused\":" + (g_robotPaused ? "true" : "false") + ","
      + "\"dashboard_message\":" + JStr(dashboardMsg) + ","
      + "\"rsi_value\":" + DoubleToString(rsiNow, 2) + ","
      + "\"cooldown_seconds_left\":" + IntegerToString(cooldownLeft) + ","
      + "\"total_active_positions\":" + IntegerToString(activePos) + ","
      + "\"basket_profit\":" + DoubleToString(basketPnl, 2) + ","
      + "\"m5_high\":" + DoubleToString(iHigh(_Symbol, PERIOD_M5, 1), _Digits) + ","
      + "\"m5_low\":" + DoubleToString(iLow(_Symbol, PERIOD_M5, 1), _Digits)
      + "}";

   string body = "{"
      + "\"account_id\":" + JStr(Inp_AccountID) + ","
      + "\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ","
      + "\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + ","
      + "\"robot_state\":" + robotStateJson + ","
      + "\"open_trades\":[" + BuildOpenTradesJson() + "],"
      + "\"closed_trades\":[" + g_pendingClosedJson + "],"
      + "\"signals\":[" + g_pendingSignalsJson + "]"
      + "}";

   string response;
   if(HttpPost("/functions/v1/mt5-sync/push", body, response))
     {
      // only clear the buffers once the push actually succeeded
      g_pendingSignalsJson = "";
      g_pendingClosedJson  = "";
     }
  }

//+------------------------------------------------------------------+
//| Pull the latest EA settings + any queued remote command          |
//+------------------------------------------------------------------+
void PullState()
  {
   string body = "{\"account_id\":" + JStr(Inp_AccountID) + "}";
   string response;
   if(!HttpPost("/functions/v1/mt5-sync/pull", body, response)) return;

   // --- pull out settings_version (cheap enough to just re-apply every time it changes)
   int version = ExtractIntField(response, "\"settings_version\":");
   if(version >= 0 && version != g_settingsVersion)
     {
      g_settingsVersion = version;

      double lot        = ExtractDoubleField(response, "\"lot_size\":");
      int    sl          = ExtractIntField(response, "\"starting_sl_points\":");
      int    maxTrades   = ExtractIntField(response, "\"max_trades\":");
      double targetPft   = ExtractDoubleField(response, "\"target_profit_usd\":");
      double targetLoss  = ExtractDoubleField(response, "\"target_loss_usd\":");
      int    sessStart   = ExtractIntField(response, "\"session_start_hour\":");
      int    sessEnd     = ExtractIntField(response, "\"session_end_hour\":");

      if(lot > 0)        g_lotSize          = lot;
      if(sl > 0)         g_startingSLPoints = sl;
      if(maxTrades > 0)  g_maxTrades        = maxTrades;
      if(targetPft != -1) g_targetProfitUSD = targetPft;
      // -1 is also a plausible loss value, so only skip on a hard parse failure (no digits found at all)
      if(StringFind(response, "\"target_loss_usd\":") >= 0) g_targetLossUSD = targetLoss;
      if(sessStart >= 0)  g_sessionStartHour = sessStart;
      if(sessEnd > 0)     g_sessionEndHour   = sessEnd;

      Print("GoldenHeistsEA: settings synced (version ", version, ").");
     }

   // --- command
   int cmdPos = StringFind(response, "\"command\":\"");
   if(cmdPos >= 0)
     {
      int start = cmdPos + StringLen("\"command\":\"");
      int end   = StringFind(response, "\"", start);
      string cmd = StringSubstr(response, start, end - start);
      ApplyCommand(cmd);
     }
  }

void ApplyCommand(string cmd)
  {
   if(cmd == "start")       { g_robotEnabled = true;  g_robotPaused = false; }
   else if(cmd == "stop")   { g_robotEnabled = false; g_robotPaused = false; CloseBasket(); }
   else if(cmd == "pause")  { g_robotPaused = true; }
   else if(cmd == "resume") { g_robotPaused = false; }
  }

//+------------------------------------------------------------------+
//| Minimal field extractors for the flat JSON the pull endpoint     |
//| returns. Not a general-purpose parser — matches our own schema.  |
//+------------------------------------------------------------------+
int ExtractIntField(string json, string key)
  {
   int pos = StringFind(json, key);
   if(pos < 0) return(-1);
   int start = pos + StringLen(key);
   int end = start;
   while(end < StringLen(json) && (StringGetCharacter(json, end) == '-' ||
         (StringGetCharacter(json, end) >= '0' && StringGetCharacter(json, end) <= '9'))) end++;
   if(end == start) return(-1);
   return((int)StringToInteger(StringSubstr(json, start, end - start)));
  }

double ExtractDoubleField(string json, string key)
  {
   int pos = StringFind(json, key);
   if(pos < 0) return(-1);
   int start = pos + StringLen(key);
   int end = start;
   while(end < StringLen(json) && (StringGetCharacter(json, end) == '-' || StringGetCharacter(json, end) == '.' ||
         (StringGetCharacter(json, end) >= '0' && StringGetCharacter(json, end) <= '9'))) end++;
   if(end == start) return(-1);
   return(StringToDouble(StringSubstr(json, start, end - start)));
  }

//+------------------------------------------------------------------+
//| WebRequest wrapper. Requires the Supabase host to be whitelisted |
//| under Tools > Options > Expert Advisors first.                   |
//+------------------------------------------------------------------+
bool HttpPost(string path, string body, string &response)
  {
   string url = Inp_SupabaseURL + path;
   string headers = "Content-Type: application/json\r\n"
                   + "apikey: " + Inp_SupabaseAnonKey + "\r\n"
                   + "Authorization: Bearer " + Inp_SupabaseAnonKey + "\r\n";

   char postData[];
   StringToCharArray(body, postData, 0, StringLen(body));
   char result[];
   string resultHeaders;

   ResetLastError();
   int status = WebRequest("POST", url, headers, 5000, postData, result, resultHeaders);
   if(status == -1)
     {
      Print("GoldenHeistsEA: WebRequest failed (", GetLastError(),
            "). Whitelist ", Inp_SupabaseURL, " under Tools > Options > Expert Advisors.");
      return(false);
     }
   if(status >= 400)
     {
      Print("GoldenHeistsEA: ", path, " returned HTTP ", status, ": ", CharArrayToString(result));
      return(false);
     }

   response = CharArrayToString(result);
   return(true);
  }
//+------------------------------------------------------------------+
