/**
 * Centralized Risk Engine
 * All position-level risk checks in one place.
 * Used by operator-mode, signal-engine, and frontend.
 */

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
  adjustedSize?: number;
}

export interface RiskContext {
  userId: string;
  symbol: string;
  direction: "long" | "short";
  requestedQty: number;
  entryPrice: number;
  stopLoss: number;
  capital: number;
  settings: {
    max_risk_per_trade: number;
    max_single_asset_pct: number;
    max_leverage: number;
    max_open_positions: number;
    max_daily_loss_pct: number;
  };
  currentState: {
    openPositions: Array<{
      symbol: string;
      quantity: number;
      avg_entry: number;
    }>;
    dailyPnl: number;
    totalExposure: number;
  };
}

export function checkAllRiskRules(ctx: RiskContext): RiskCheckResult {
  // 1. Daily loss guard
  const maxDailyLoss =
    (ctx.settings.max_daily_loss_pct / 100) * ctx.capital;
  if (ctx.currentState.dailyPnl < -maxDailyLoss) {
    return {
      allowed: false,
      reason: `Daily loss limit reached: $${ctx.currentState.dailyPnl.toFixed(2)}`,
    };
  }

  // 2. Max open positions
  if (
    ctx.currentState.openPositions.length >= ctx.settings.max_open_positions
  ) {
    return {
      allowed: false,
      reason: `Max ${ctx.settings.max_open_positions} positions reached`,
    };
  }

  // 3. Concentration limit
  const existingExposure = ctx.currentState.openPositions
    .filter((p) => p.symbol === ctx.symbol)
    .reduce((sum, p) => sum + Math.abs(p.quantity * p.avg_entry), 0);

  const maxAssetValue =
    (ctx.capital * ctx.settings.max_single_asset_pct) / 100;
  if (existingExposure >= maxAssetValue) {
    return {
      allowed: false,
      reason: `Concentration limit: ${ctx.symbol} already at ${((existingExposure / ctx.capital) * 100).toFixed(1)}%`,
    };
  }

  // 4. Leverage limit
  const newExposure = ctx.requestedQty * ctx.entryPrice;
  const totalAfter = ctx.currentState.totalExposure + newExposure;
  const maxTotal = ctx.capital * ctx.settings.max_leverage;
  if (totalAfter > maxTotal) {
    return {
      allowed: false,
      reason: `Leverage limit: ${(totalAfter / ctx.capital).toFixed(1)}x exceeds ${ctx.settings.max_leverage}x`,
    };
  }

  // 5. Risk per trade — adjust size if it exceeds budget
  const riskPerUnit = Math.abs(ctx.entryPrice - ctx.stopLoss);
  if (riskPerUnit <= 0) {
    return { allowed: false, reason: "Invalid stop loss (equal to entry)" };
  }

  const tradeRisk = riskPerUnit * ctx.requestedQty;
  const maxTradeRisk = (ctx.settings.max_risk_per_trade / 100) * ctx.capital;
  if (tradeRisk > maxTradeRisk) {
    const adjustedQty = Math.floor(maxTradeRisk / riskPerUnit);
    if (adjustedQty <= 0) {
      return {
        allowed: false,
        reason: `Trade risk $${tradeRisk.toFixed(2)} exceeds max $${maxTradeRisk.toFixed(2)}, cannot size down`,
      };
    }
    return {
      allowed: true,
      adjustedSize: adjustedQty,
      reason: `Risk capped: ${ctx.requestedQty} → ${adjustedQty} shares`,
    };
  }

  // 6. Remaining concentration room
  const roomLeft = maxAssetValue - existingExposure;
  const maxByConcentration = Math.floor(roomLeft / ctx.entryPrice);
  if (ctx.requestedQty > maxByConcentration && maxByConcentration > 0) {
    return {
      allowed: true,
      adjustedSize: maxByConcentration,
      reason: `Concentration adjusted: ${ctx.requestedQty} → ${maxByConcentration}`,
    };
  }
  if (maxByConcentration <= 0) {
    return {
      allowed: false,
      reason: `No concentration room left for ${ctx.symbol}`,
    };
  }

  return { allowed: true, adjustedSize: ctx.requestedQty };
}
