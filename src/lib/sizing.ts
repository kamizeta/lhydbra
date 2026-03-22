export interface SizingParams {
  capital: number;
  riskPct: number;
  entryPrice: number;
  stopLoss: number;
  maxSingleAssetPct: number;
  existingSymbolExposure: number;
  existingTotalExposure: number;
  maxLeverage: number;
  isFractional: boolean;
}

export function calcPositionSize(p: SizingParams): number {
  if (p.capital <= 0 || p.entryPrice <= 0) return 0;
  const riskPerUnit = Math.abs(p.entryPrice - p.stopLoss);
  if (riskPerUnit <= 0) return 0;
  const dollarRisk = p.capital * (p.riskPct / 100);
  const riskBasedSize = dollarRisk / riskPerUnit;
  const maxAssetValue = Math.max(0, (p.capital * p.maxSingleAssetPct / 100) - p.existingSymbolExposure);
  const concentrationCap = maxAssetValue / p.entryPrice;
  const maxTotalExposure = p.capital * p.maxLeverage;
  const availableExposure = Math.max(0, maxTotalExposure - p.existingTotalExposure);
  const leverageCap = availableExposure / p.entryPrice;
  const idealSize = Math.max(0, Math.min(riskBasedSize, concentrationCap, leverageCap));
  if (p.isFractional) return parseFloat(idealSize.toFixed(6));
  return Math.floor(idealSize);
}

export function calcRiskReward(entry: number, stop: number, targets: number[]): number {
  const stopDist = Math.abs(entry - stop);
  if (stopDist === 0 || targets.length === 0) return 0;
  const avgTarget = targets.reduce((s, t) => s + t, 0) / targets.length;
  return parseFloat((Math.abs(avgTarget - entry) / stopDist).toFixed(2));
}
