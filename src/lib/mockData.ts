// Mock data simulating Twelve Data API responses
// Structured to be easily replaced with real API calls

export type AssetType = 'crypto' | 'stock' | 'etf' | 'commodity' | 'forex';

export interface Asset {
  symbol: string;
  name: string;
  type: AssetType;
  price: number;
  change24h: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  high24h: number;
  low24h: number;
  open: number;
  rsi: number;
  macdSignal: 'bullish' | 'bearish' | 'neutral';
  trend: 'uptrend' | 'downtrend' | 'sideways';
  volatility: number;
  momentum: number;
  relativeStrength: number;
  isMock?: boolean;
  source?: string;
}

export interface PortfolioPosition {
  symbol: string;
  name: string;
  type: AssetType;
  quantity: number;
  avgEntry: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  allocation: number;
  stopLoss: number;
  takeProfit: number;
  strategy: string;
}

export interface TradeIdea {
  id: string;
  symbol: string;
  name: string;
  type: AssetType;
  direction: 'long' | 'short';
  strategy: string;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  positionSize: number;
  riskPercent: number;
  confidence: number;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'closed';
  reasoning: string;
  agentAnalysis: string;
  createdAt: string;
  result?: number;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  type: string;
  riskLevel: 'low' | 'medium' | 'high';
  timeHorizon: string;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  active: boolean;
  capitalAllocated: number;
  pnl: number;
  maxDrawdown: number;
  entryRules: string[];
  exitRules: string[];
  idealConditions: string[];
}

export interface AgentOutput {
  id: string;
  agent: string;
  timestamp: string;
  type: 'analysis' | 'signal' | 'alert' | 'risk' | 'recommendation';
  title: string;
  content: string;
  severity: 'info' | 'warning' | 'critical';
  data?: Record<string, unknown>;
}

export interface RiskMetrics {
  totalExposure: number;
  maxExposureLimit: number;
  dailyRiskUsed: number;
  dailyRiskLimit: number;
  weeklyRiskUsed: number;
  weeklyRiskLimit: number;
  currentDrawdown: number;
  maxDrawdownLimit: number;
  openPositions: number;
  maxPositions: number;
  correlationRisk: number;
  leverageUsed: number;
  maxLeverage: number;
}

// Mock assets (fallback when live data unavailable)
export const mockAssets: Asset[] = [
  // Crypto
  { symbol: 'BTC/USD', name: 'Bitcoin', type: 'crypto', price: 72500, change24h: 850, changePercent: 1.19, volume: 32000000000, high24h: 73100, low24h: 71600, open: 71650, rsi: 58, macdSignal: 'bullish', trend: 'uptrend', volatility: 3.5, momentum: 65, relativeStrength: 78 },
  { symbol: 'ETH/USD', name: 'Ethereum', type: 'crypto', price: 2165, change24h: 38, changePercent: 1.79, volume: 12800000000, high24h: 2200, low24h: 2120, open: 2127, rsi: 52, macdSignal: 'bullish', trend: 'uptrend', volatility: 4.8, momentum: 58, relativeStrength: 55 },
  { symbol: 'SOL/USD', name: 'Solana', type: 'crypto', price: 91.8, change24h: 3.1, changePercent: 3.49, volume: 2900000000, high24h: 93.1, low24h: 88.6, open: 88.7, rsi: 55, macdSignal: 'bullish', trend: 'uptrend', volatility: 6.2, momentum: 58, relativeStrength: 65 },
  { symbol: 'BNB/USD', name: 'BNB', type: 'crypto', price: 672, change24h: 8.4, changePercent: 1.27, volume: 1400000000, high24h: 678, low24h: 663, open: 663.9, rsi: 54, macdSignal: 'neutral', trend: 'sideways', volatility: 3.2, momentum: 52, relativeStrength: 58 },
  { symbol: 'ADA/USD', name: 'Cardano', type: 'crypto', price: 0.269, change24h: 0.005, changePercent: 1.89, volume: 800000000, high24h: 0.272, low24h: 0.264, open: 0.264, rsi: 50, macdSignal: 'neutral', trend: 'sideways', volatility: 4.5, momentum: 50, relativeStrength: 52 },
  { symbol: 'XRP/USD', name: 'Ripple', type: 'crypto', price: 1.44, change24h: 0.027, changePercent: 1.91, volume: 3200000000, high24h: 1.464, low24h: 1.416, open: 1.418, rsi: 52, macdSignal: 'bullish', trend: 'sideways', volatility: 5.5, momentum: 52, relativeStrength: 55 },
  { symbol: 'DOGE/USD', name: 'Dogecoin', type: 'crypto', price: 0.168, change24h: 0.003, changePercent: 1.82, volume: 1200000000, high24h: 0.172, low24h: 0.165, open: 0.165, rsi: 48, macdSignal: 'neutral', trend: 'sideways', volatility: 6.0, momentum: 50, relativeStrength: 48 },
  { symbol: 'AVAX/USD', name: 'Avalanche', type: 'crypto', price: 22.5, change24h: 0.8, changePercent: 3.69, volume: 450000000, high24h: 23.1, low24h: 21.6, open: 21.7, rsi: 56, macdSignal: 'bullish', trend: 'uptrend', volatility: 7.2, momentum: 60, relativeStrength: 62 },
  { symbol: 'DOT/USD', name: 'Polkadot', type: 'crypto', price: 4.35, change24h: 0.12, changePercent: 2.84, volume: 280000000, high24h: 4.48, low24h: 4.2, open: 4.23, rsi: 50, macdSignal: 'neutral', trend: 'sideways', volatility: 5.8, momentum: 52, relativeStrength: 50 },
  { symbol: 'LINK/USD', name: 'Chainlink', type: 'crypto', price: 14.2, change24h: 0.35, changePercent: 2.53, volume: 520000000, high24h: 14.6, low24h: 13.8, open: 13.85, rsi: 54, macdSignal: 'bullish', trend: 'sideways', volatility: 5.5, momentum: 55, relativeStrength: 56 },
  { symbol: 'MATIC/USD', name: 'Polygon', type: 'crypto', price: 0.22, change24h: -0.003, changePercent: -1.35, volume: 180000000, high24h: 0.225, low24h: 0.218, open: 0.223, rsi: 42, macdSignal: 'bearish', trend: 'downtrend', volatility: 4.8, momentum: 42, relativeStrength: 40 },
  { symbol: 'SHIB/USD', name: 'Shiba Inu', type: 'crypto', price: 0.0000125, change24h: 0.0000002, changePercent: 1.63, volume: 350000000, high24h: 0.0000128, low24h: 0.0000123, open: 0.0000123, rsi: 48, macdSignal: 'neutral', trend: 'sideways', volatility: 5.2, momentum: 50, relativeStrength: 48 },
  { symbol: 'UNI/USD', name: 'Uniswap', type: 'crypto', price: 6.8, change24h: 0.15, changePercent: 2.26, volume: 150000000, high24h: 7.0, low24h: 6.6, open: 6.65, rsi: 52, macdSignal: 'neutral', trend: 'sideways', volatility: 5.0, momentum: 52, relativeStrength: 54 },
  { symbol: 'ATOM/USD', name: 'Cosmos', type: 'crypto', price: 5.1, change24h: 0.08, changePercent: 1.59, volume: 120000000, high24h: 5.2, low24h: 5.0, open: 5.02, rsi: 50, macdSignal: 'neutral', trend: 'sideways', volatility: 4.5, momentum: 50, relativeStrength: 50 },
  { symbol: 'LTC/USD', name: 'Litecoin', type: 'crypto', price: 95, change24h: 1.2, changePercent: 1.28, volume: 420000000, high24h: 96.5, low24h: 93.5, open: 93.8, rsi: 50, macdSignal: 'neutral', trend: 'sideways', volatility: 3.8, momentum: 50, relativeStrength: 52 },
  { symbol: 'NEAR/USD', name: 'NEAR Protocol', type: 'crypto', price: 3.2, change24h: 0.1, changePercent: 3.23, volume: 180000000, high24h: 3.3, low24h: 3.1, open: 3.1, rsi: 55, macdSignal: 'bullish', trend: 'uptrend', volatility: 6.5, momentum: 58, relativeStrength: 58 },
  { symbol: 'SUI/USD', name: 'Sui', type: 'crypto', price: 2.45, change24h: 0.08, changePercent: 3.38, volume: 250000000, high24h: 2.52, low24h: 2.35, open: 2.37, rsi: 56, macdSignal: 'bullish', trend: 'uptrend', volatility: 7.0, momentum: 58, relativeStrength: 60 },
  { symbol: 'APT/USD', name: 'Aptos', type: 'crypto', price: 5.8, change24h: 0.15, changePercent: 2.65, volume: 130000000, high24h: 5.95, low24h: 5.6, open: 5.65, rsi: 52, macdSignal: 'neutral', trend: 'sideways', volatility: 6.0, momentum: 54, relativeStrength: 54 },
  { symbol: 'ARB/USD', name: 'Arbitrum', type: 'crypto', price: 0.38, change24h: 0.01, changePercent: 2.7, volume: 160000000, high24h: 0.39, low24h: 0.37, open: 0.37, rsi: 50, macdSignal: 'neutral', trend: 'sideways', volatility: 5.5, momentum: 52, relativeStrength: 52 },
  { symbol: 'OP/USD', name: 'Optimism', type: 'crypto', price: 0.85, change24h: 0.02, changePercent: 2.41, volume: 110000000, high24h: 0.87, low24h: 0.83, open: 0.83, rsi: 52, macdSignal: 'neutral', trend: 'sideways', volatility: 5.2, momentum: 52, relativeStrength: 54 },
  // Stocks
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', price: 213, change24h: -2.1, changePercent: -0.98, volume: 36890000, high24h: 216, low24h: 212, open: 215, rsi: 44, macdSignal: 'bearish', trend: 'downtrend', volatility: 1.6, momentum: 40, relativeStrength: 42 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', type: 'stock', price: 388, change24h: -3.5, changePercent: -0.89, volume: 26808000, high24h: 393, low24h: 386, open: 391, rsi: 45, macdSignal: 'bearish', trend: 'downtrend', volatility: 1.8, momentum: 42, relativeStrength: 44 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', type: 'stock', price: 117, change24h: -1.8, changePercent: -1.52, volume: 160514000, high24h: 120, low24h: 116, open: 119, rsi: 46, macdSignal: 'bearish', trend: 'downtrend', volatility: 3.8, momentum: 42, relativeStrength: 44 },
  { symbol: 'TSLA', name: 'Tesla Inc.', type: 'stock', price: 250, change24h: -5.2, changePercent: -2.04, volume: 58338000, high24h: 258, low24h: 248, open: 255, rsi: 44, macdSignal: 'bearish', trend: 'downtrend', volatility: 4.8, momentum: 45, relativeStrength: 42 },
  { symbol: 'AMZN', name: 'Amazon.com', type: 'stock', price: 197, change24h: -1.5, changePercent: -0.76, volume: 35606000, high24h: 200, low24h: 196, open: 199, rsi: 46, macdSignal: 'neutral', trend: 'sideways', volatility: 2.0, momentum: 46, relativeStrength: 46 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'stock', price: 167, change24h: -0.8, changePercent: -0.48, volume: 23661000, high24h: 169, low24h: 166, open: 168, rsi: 48, macdSignal: 'neutral', trend: 'sideways', volatility: 1.5, momentum: 48, relativeStrength: 48 },
  { symbol: 'META', name: 'Meta Platforms', type: 'stock', price: 585, change24h: -8.5, changePercent: -1.43, volume: 18904000, high24h: 595, low24h: 582, open: 593, rsi: 40, macdSignal: 'bearish', trend: 'downtrend', volatility: 3.2, momentum: 32, relativeStrength: 36 },
  { symbol: 'AMD', name: 'AMD Inc.', type: 'stock', price: 108, change24h: -1.5, changePercent: -1.37, volume: 45000000, high24h: 111, low24h: 107, open: 110, rsi: 42, macdSignal: 'bearish', trend: 'downtrend', volatility: 4.2, momentum: 38, relativeStrength: 40 },
  { symbol: 'NFLX', name: 'Netflix Inc.', type: 'stock', price: 985, change24h: 12, changePercent: 1.23, volume: 8500000, high24h: 992, low24h: 970, open: 973, rsi: 58, macdSignal: 'bullish', trend: 'uptrend', volatility: 2.5, momentum: 56, relativeStrength: 60 },
  { symbol: 'CRM', name: 'Salesforce Inc.', type: 'stock', price: 272, change24h: -2.1, changePercent: -0.77, volume: 6200000, high24h: 275, low24h: 270, open: 274, rsi: 46, macdSignal: 'neutral', trend: 'sideways', volatility: 2.2, momentum: 44, relativeStrength: 44 },
  { symbol: 'JPM', name: 'JPMorgan Chase', type: 'stock', price: 242, change24h: 1.2, changePercent: 0.50, volume: 9800000, high24h: 244, low24h: 240, open: 241, rsi: 52, macdSignal: 'neutral', trend: 'sideways', volatility: 1.5, momentum: 52, relativeStrength: 54 },
  { symbol: 'V', name: 'Visa Inc.', type: 'stock', price: 338, change24h: 2.1, changePercent: 0.63, volume: 5400000, high24h: 340, low24h: 335, open: 335.9, rsi: 54, macdSignal: 'neutral', trend: 'sideways', volatility: 1.2, momentum: 52, relativeStrength: 55 },
  { symbol: 'MA', name: 'Mastercard Inc.', type: 'stock', price: 545, change24h: 3.0, changePercent: 0.55, volume: 3200000, high24h: 548, low24h: 541, open: 542, rsi: 54, macdSignal: 'neutral', trend: 'sideways', volatility: 1.3, momentum: 52, relativeStrength: 55 },
  { symbol: 'WMT', name: 'Walmart Inc.', type: 'stock', price: 88, change24h: 0.3, changePercent: 0.34, volume: 8500000, high24h: 89, low24h: 87, open: 87.7, rsi: 50, macdSignal: 'neutral', trend: 'sideways', volatility: 1.0, momentum: 50, relativeStrength: 52 },
  { symbol: 'DIS', name: 'Walt Disney Co.', type: 'stock', price: 104, change24h: -0.8, changePercent: -0.76, volume: 12000000, high24h: 106, low24h: 103, open: 105, rsi: 44, macdSignal: 'bearish', trend: 'downtrend', volatility: 2.5, momentum: 44, relativeStrength: 42 },
  { symbol: 'BA', name: 'Boeing Co.', type: 'stock', price: 173, change24h: 1.8, changePercent: 1.05, volume: 7800000, high24h: 175, low24h: 170, open: 171, rsi: 52, macdSignal: 'neutral', trend: 'sideways', volatility: 3.0, momentum: 54, relativeStrength: 54 },
  { symbol: 'INTC', name: 'Intel Corp.', type: 'stock', price: 23, change24h: -0.4, changePercent: -1.71, volume: 35000000, high24h: 23.8, low24h: 22.8, open: 23.4, rsi: 38, macdSignal: 'bearish', trend: 'downtrend', volatility: 4.5, momentum: 38, relativeStrength: 36 },
  { symbol: 'KO', name: 'Coca-Cola Co.', type: 'stock', price: 61, change24h: 0.2, changePercent: 0.33, volume: 11000000, high24h: 61.5, low24h: 60.5, open: 60.8, rsi: 52, macdSignal: 'neutral', trend: 'sideways', volatility: 0.8, momentum: 50, relativeStrength: 52 },
  { symbol: 'PFE', name: 'Pfizer Inc.', type: 'stock', price: 25, change24h: -0.3, changePercent: -1.19, volume: 22000000, high24h: 25.5, low24h: 24.8, open: 25.3, rsi: 42, macdSignal: 'bearish', trend: 'downtrend', volatility: 2.0, momentum: 44, relativeStrength: 40 },
  { symbol: 'PYPL', name: 'PayPal Holdings', type: 'stock', price: 72, change24h: -0.8, changePercent: -1.10, volume: 9500000, high24h: 73, low24h: 71.5, open: 72.8, rsi: 42, macdSignal: 'bearish', trend: 'downtrend', volatility: 3.0, momentum: 42, relativeStrength: 40 },
  { symbol: 'UBER', name: 'Uber Technologies', type: 'stock', price: 77, change24h: 0.9, changePercent: 1.18, volume: 14000000, high24h: 78, low24h: 76, open: 76.1, rsi: 54, macdSignal: 'bullish', trend: 'sideways', volatility: 3.5, momentum: 54, relativeStrength: 56 },
  { symbol: 'COIN', name: 'Coinbase Global', type: 'stock', price: 195, change24h: 4.5, changePercent: 2.36, volume: 8200000, high24h: 198, low24h: 189, open: 190, rsi: 56, macdSignal: 'bullish', trend: 'uptrend', volatility: 5.5, momentum: 58, relativeStrength: 60 },
  { symbol: 'PLTR', name: 'Palantir Tech.', type: 'stock', price: 151, change24h: 3.5, changePercent: 2.37, volume: 52000000, high24h: 153, low24h: 147, open: 147.5, rsi: 62, macdSignal: 'bullish', trend: 'uptrend', volatility: 5.8, momentum: 62, relativeStrength: 66 },
  { symbol: 'SNOW', name: 'Snowflake Inc.', type: 'stock', price: 172, change24h: -2.0, changePercent: -1.15, volume: 4500000, high24h: 175, low24h: 170, open: 174, rsi: 44, macdSignal: 'bearish', trend: 'downtrend', volatility: 3.8, momentum: 42, relativeStrength: 42 },
  // ETFs
  { symbol: 'SPY', name: 'S&P 500 ETF', type: 'etf', price: 662, change24h: -3.8, changePercent: -0.57, volume: 96905000, high24h: 672, low24h: 661, open: 669, rsi: 46, macdSignal: 'neutral', trend: 'sideways', volatility: 1.1, momentum: 48, relativeStrength: 46 },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF', type: 'etf', price: 480, change24h: 5.1, changePercent: 1.07, volume: 38000000, high24h: 482.5, low24h: 474.6, open: 475.1, rsi: 52, macdSignal: 'neutral', trend: 'sideways', volatility: 1.5, momentum: 50, relativeStrength: 56 },
  { symbol: 'VTI', name: 'Total Stock Market', type: 'etf', price: 282, change24h: 1.6, changePercent: 0.57, volume: 3000000, high24h: 283.5, low24h: 280.2, open: 280.8, rsi: 50, macdSignal: 'neutral', trend: 'sideways', volatility: 1.0, momentum: 48, relativeStrength: 52 },
  { symbol: 'ARKK', name: 'ARK Innovation', type: 'etf', price: 52.8, change24h: -0.9, changePercent: -1.68, volume: 15000000, high24h: 54.2, low24h: 52.4, open: 53.7, rsi: 40, macdSignal: 'bearish', trend: 'downtrend', volatility: 4.2, momentum: 32, relativeStrength: 28 },
  { symbol: 'XLE', name: 'Energy Select', type: 'etf', price: 85, change24h: -0.8, changePercent: -0.93, volume: 12000000, high24h: 86, low24h: 84.5, open: 85.8, rsi: 46, macdSignal: 'neutral', trend: 'sideways', volatility: 1.5, momentum: 46, relativeStrength: 44 },
  { symbol: 'XLK', name: 'Technology Select', type: 'etf', price: 220, change24h: 2.5, changePercent: 1.15, volume: 8500000, high24h: 222, low24h: 217, open: 217.5, rsi: 52, macdSignal: 'neutral', trend: 'sideways', volatility: 1.8, momentum: 52, relativeStrength: 54 },
  { symbol: 'IWM', name: 'Russell 2000 ETF', type: 'etf', price: 205, change24h: -1.5, changePercent: -0.73, volume: 25000000, high24h: 207, low24h: 204, open: 206.5, rsi: 44, macdSignal: 'bearish', trend: 'downtrend', volatility: 1.8, momentum: 46, relativeStrength: 42 },
  { symbol: 'EEM', name: 'Emerging Markets', type: 'etf', price: 42.5, change24h: 0.3, changePercent: 0.71, volume: 35000000, high24h: 42.8, low24h: 42.1, open: 42.2, rsi: 50, macdSignal: 'neutral', trend: 'sideways', volatility: 1.5, momentum: 50, relativeStrength: 52 },
  { symbol: 'GLD', name: 'Gold ETF (SPDR)', type: 'etf', price: 290, change24h: 1.2, changePercent: 0.42, volume: 8000000, high24h: 291, low24h: 288, open: 288.8, rsi: 62, macdSignal: 'bullish', trend: 'uptrend', volatility: 0.8, momentum: 52, relativeStrength: 64 },
  { symbol: 'TLT', name: 'Treasury Bond 20Y+', type: 'etf', price: 88, change24h: 0.5, changePercent: 0.57, volume: 18000000, high24h: 88.5, low24h: 87.3, open: 87.5, rsi: 48, macdSignal: 'neutral', trend: 'sideways', volatility: 1.2, momentum: 50, relativeStrength: 50 },
  { symbol: 'DIA', name: 'Dow Jones ETF', type: 'etf', price: 410, change24h: 2.5, changePercent: 0.61, volume: 4200000, high24h: 412, low24h: 407, open: 407.5, rsi: 50, macdSignal: 'neutral', trend: 'sideways', volatility: 1.0, momentum: 50, relativeStrength: 52 },
  { symbol: 'XLF', name: 'Financial Select', type: 'etf', price: 48, change24h: 0.3, changePercent: 0.63, volume: 22000000, high24h: 48.3, low24h: 47.5, open: 47.7, rsi: 52, macdSignal: 'neutral', trend: 'sideways', volatility: 1.2, momentum: 52, relativeStrength: 54 },
  { symbol: 'XLV', name: 'Healthcare Select', type: 'etf', price: 142, change24h: 0.8, changePercent: 0.57, volume: 7500000, high24h: 143, low24h: 141, open: 141.2, rsi: 50, macdSignal: 'neutral', trend: 'sideways', volatility: 1.0, momentum: 50, relativeStrength: 52 },
  { symbol: 'SOXX', name: 'Semiconductor ETF', type: 'etf', price: 195, change24h: -3.5, changePercent: -1.76, volume: 5800000, high24h: 200, low24h: 194, open: 198.5, rsi: 42, macdSignal: 'bearish', trend: 'downtrend', volatility: 3.5, momentum: 42, relativeStrength: 40 },
  { symbol: 'VOO', name: 'Vanguard S&P 500', type: 'etf', price: 608, change24h: -3.5, changePercent: -0.57, volume: 4500000, high24h: 614, low24h: 607, open: 611.5, rsi: 46, macdSignal: 'neutral', trend: 'sideways', volatility: 1.1, momentum: 48, relativeStrength: 46 },
  { symbol: 'KWEB', name: 'China Internet ETF', type: 'etf', price: 32, change24h: 0.8, changePercent: 2.56, volume: 18000000, high24h: 32.5, low24h: 31.2, open: 31.2, rsi: 56, macdSignal: 'bullish', trend: 'uptrend', volatility: 4.0, momentum: 56, relativeStrength: 58 },
  // Commodities & Forex
  { symbol: 'XAU/USD', name: 'Gold', type: 'commodity', price: 4983, change24h: -36, changePercent: -0.72, volume: 195000, high24h: 5031, low24h: 4968, open: 5013, rsi: 62, macdSignal: 'neutral', trend: 'sideways', volatility: 0.9, momentum: 46, relativeStrength: 62 },
  { symbol: 'XAG/USD', name: 'Silver', type: 'commodity', price: 79.6, change24h: -0.97, changePercent: -1.21, volume: 48000, high24h: 80.6, low24h: 79.3, open: 80, rsi: 56, macdSignal: 'neutral', trend: 'sideways', volatility: 2.1, momentum: 44, relativeStrength: 54 },
  { symbol: 'CL', name: 'Crude Oil', type: 'commodity', price: 67.2, change24h: -0.85, changePercent: -1.25, volume: 310000, high24h: 68.4, low24h: 66.8, open: 68.05, rsi: 38, macdSignal: 'bearish', trend: 'downtrend', volatility: 2.5, momentum: 32, relativeStrength: 35 },
  { symbol: 'NG', name: 'Natural Gas', type: 'commodity', price: 4.12, change24h: 0.15, changePercent: 3.78, volume: 102000, high24h: 4.18, low24h: 3.92, open: 3.97, rsi: 58, macdSignal: 'bullish', trend: 'uptrend', volatility: 5.8, momentum: 55, relativeStrength: 60 },
  { symbol: 'HG', name: 'Copper', type: 'commodity', price: 4.52, change24h: 0.05, changePercent: 1.12, volume: 55000, high24h: 4.56, low24h: 4.46, open: 4.47, rsi: 52, macdSignal: 'neutral', trend: 'sideways', volatility: 2.0, momentum: 52, relativeStrength: 54 },
  { symbol: 'EUR/USD', name: 'Euro/Dollar', type: 'forex', price: 1.0885, change24h: 0.002, changePercent: 0.18, volume: 0, high24h: 1.0910, low24h: 1.0860, open: 1.0865, rsi: 52, macdSignal: 'neutral', trend: 'sideways', volatility: 0.5, momentum: 50, relativeStrength: 52 },
  { symbol: 'GBP/USD', name: 'Pound/Dollar', type: 'forex', price: 1.2935, change24h: 0.003, changePercent: 0.23, volume: 0, high24h: 1.2960, low24h: 1.2900, open: 1.2905, rsi: 54, macdSignal: 'neutral', trend: 'sideways', volatility: 0.4, momentum: 50, relativeStrength: 54 },
  { symbol: 'USD/JPY', name: 'Dollar/Yen', type: 'forex', price: 148.5, change24h: -0.3, changePercent: -0.20, volume: 0, high24h: 149.2, low24h: 148.1, open: 148.8, rsi: 48, macdSignal: 'neutral', trend: 'sideways', volatility: 0.6, momentum: 48, relativeStrength: 48 },
  { symbol: 'AUD/USD', name: 'Aussie/Dollar', type: 'forex', price: 0.6325, change24h: 0.001, changePercent: 0.16, volume: 0, high24h: 0.6345, low24h: 0.6305, open: 0.6315, rsi: 48, macdSignal: 'neutral', trend: 'sideways', volatility: 0.5, momentum: 50, relativeStrength: 48 },
  { symbol: 'USD/CAD', name: 'Dollar/CAD', type: 'forex', price: 1.3685, change24h: -0.001, changePercent: -0.07, volume: 0, high24h: 1.3710, low24h: 1.3660, open: 1.3690, rsi: 50, macdSignal: 'neutral', trend: 'sideways', volatility: 0.4, momentum: 50, relativeStrength: 50 },
  { symbol: 'USD/CHF', name: 'Dollar/Swiss', type: 'forex', price: 0.8845, change24h: -0.002, changePercent: -0.23, volume: 0, high24h: 0.8870, low24h: 0.8825, open: 0.8867, rsi: 46, macdSignal: 'neutral', trend: 'sideways', volatility: 0.5, momentum: 48, relativeStrength: 46 },
  { symbol: 'NZD/USD', name: 'Kiwi/Dollar', type: 'forex', price: 0.5742, change24h: 0.001, changePercent: 0.17, volume: 0, high24h: 0.5758, low24h: 0.5725, open: 0.5735, rsi: 48, macdSignal: 'neutral', trend: 'sideways', volatility: 0.5, momentum: 50, relativeStrength: 48 },
  { symbol: 'EUR/GBP', name: 'Euro/Pound', type: 'forex', price: 0.8415, change24h: -0.001, changePercent: -0.12, volume: 0, high24h: 0.8430, low24h: 0.8400, open: 0.8425, rsi: 48, macdSignal: 'neutral', trend: 'sideways', volatility: 0.3, momentum: 50, relativeStrength: 48 },
  { symbol: 'EUR/JPY', name: 'Euro/Yen', type: 'forex', price: 161.7, change24h: -0.2, changePercent: -0.12, volume: 0, high24h: 162.3, low24h: 161.2, open: 161.9, rsi: 48, macdSignal: 'neutral', trend: 'sideways', volatility: 0.5, momentum: 50, relativeStrength: 48 },
  { symbol: 'GBP/JPY', name: 'Pound/Yen', type: 'forex', price: 192.1, change24h: 0.3, changePercent: 0.16, volume: 0, high24h: 192.8, low24h: 191.5, open: 191.8, rsi: 50, macdSignal: 'neutral', trend: 'sideways', volatility: 0.6, momentum: 50, relativeStrength: 52 },
];

// Mock portfolio
export const mockPortfolio: PortfolioPosition[] = [
  { symbol: 'BTC/USD', name: 'Bitcoin', type: 'crypto', quantity: 0.5, avgEntry: 78000, currentPrice: 83500, pnl: 2750, pnlPercent: 7.05, allocation: 28.5, stopLoss: 72000, takeProfit: 95000, strategy: 'Trend Following' },
  { symbol: 'NVDA', name: 'NVIDIA', type: 'stock', quantity: 50, avgEntry: 108, currentPrice: 180.00, pnl: 3600, pnlPercent: 66.67, allocation: 22.1, stopLoss: 160, takeProfit: 200, strategy: 'Momentum' },
  { symbol: 'SPY', name: 'S&P 500 ETF', type: 'etf', quantity: 30, avgEntry: 545, currentPrice: 559.80, pnl: 444, pnlPercent: 2.72, allocation: 18.2, stopLoss: 530, takeProfit: 580, strategy: 'Dollar Cost Avg' },
  { symbol: 'XAU/USD', name: 'Gold', type: 'commodity', quantity: 5, avgEntry: 2850, currentPrice: 5019.00, pnl: 10845, pnlPercent: 76.11, allocation: 12.4, stopLoss: 4800, takeProfit: 5200, strategy: 'Defensive' },
  { symbol: 'SOL/USD', name: 'Solana', type: 'crypto', quantity: 50, avgEntry: 115, currentPrice: 128.50, pnl: 675, pnlPercent: 11.74, allocation: 10.8, stopLoss: 100, takeProfit: 160, strategy: 'Breakout' },
  { symbol: 'MSFT', name: 'Microsoft', type: 'stock', quantity: 8, avgEntry: 375, currentPrice: 388.50, pnl: 108, pnlPercent: 3.60, allocation: 8.0, stopLoss: 360, takeProfit: 420, strategy: 'Trend Following' },
];

export const mockStrategies: Strategy[] = [
  {
    id: 'trend-following', name: 'Trend Following', description: 'Identifies and rides established market trends using moving averages and trend indicators.',
    type: 'Directional', riskLevel: 'medium', timeHorizon: '1-4 weeks', winRate: 0, profitFactor: 0, totalTrades: 0, active: true, capitalAllocated: 0, pnl: 0, maxDrawdown: 0,
    entryRules: ['Price above 50 & 200 EMA', 'ADX > 25', 'Volume confirmation', 'RSI not overbought'],
    exitRules: ['Price closes below 20 EMA', 'Trailing stop 2 ATR', 'Take profit at 3:1 R/R'],
    idealConditions: ['Trending markets', 'Low chopiness', 'Clear directional bias'],
  },
  {
    id: 'momentum', name: 'Momentum', description: 'Captures strong directional moves in assets showing relative strength.',
    type: 'Directional', riskLevel: 'high', timeHorizon: '3-10 days', winRate: 0, profitFactor: 0, totalTrades: 0, active: true, capitalAllocated: 0, pnl: 0, maxDrawdown: 0,
    entryRules: ['RS rank top 20%', 'Volume spike > 2x avg', 'Price breakout above resistance', 'Momentum oscillator positive'],
    exitRules: ['RS drops below 50%', 'Volume dry-up', 'Fixed stop 1.5 ATR'],
    idealConditions: ['Strong market momentum', 'Risk-on environment', 'Sector rotation favorable'],
  },
  {
    id: 'swing-trading', name: 'Swing Trading', description: 'Captures medium-term price swings within established trends.',
    type: 'Directional', riskLevel: 'medium', timeHorizon: '3-14 days', winRate: 0, profitFactor: 0, totalTrades: 0, active: true, capitalAllocated: 0, pnl: 0, maxDrawdown: 0,
    entryRules: ['Pullback to support/MA', 'RSI oversold bounce', 'Bullish candlestick pattern', 'Volume increasing'],
    exitRules: ['Target previous high', 'Stop below swing low', 'Time stop 14 days'],
    idealConditions: ['Trending with pullbacks', 'Clear support/resistance', 'Moderate volatility'],
  },
  {
    id: 'mean-reversion', name: 'Mean Reversion', description: 'Exploits overextended price moves that revert to the mean.',
    type: 'Counter-trend', riskLevel: 'medium', timeHorizon: '1-5 days', winRate: 0, profitFactor: 0, totalTrades: 0, active: false, capitalAllocated: 0, pnl: 0, maxDrawdown: 0,
    entryRules: ['Price > 2 std dev from mean', 'RSI extreme (>80 or <20)', 'Bollinger Band touch', 'Volume exhaustion'],
    exitRules: ['Return to 20 EMA', 'Opposite BB band', 'Max hold 5 days'],
    idealConditions: ['Range-bound markets', 'High mean-reversion tendency', 'Low trend strength'],
  },
  {
    id: 'breakout', name: 'Breakout', description: 'Captures explosive moves when price breaks key levels.',
    type: 'Directional', riskLevel: 'high', timeHorizon: '1-7 days', winRate: 0, profitFactor: 0, totalTrades: 0, active: true, capitalAllocated: 0, pnl: 0, maxDrawdown: 0,
    entryRules: ['Break above resistance with volume', 'Consolidation > 10 days', 'Increasing volume on breakout', 'ATR expansion'],
    exitRules: ['Failed breakout retest', 'Trailing stop 2.5 ATR', 'Take profit 4:1 R/R'],
    idealConditions: ['After consolidation', 'Increasing volatility', 'Catalyst present'],
  },
  {
    id: 'sector-rotation', name: 'Sector Rotation', description: 'Rotates capital into strongest sectors based on economic cycle.',
    type: 'Allocation', riskLevel: 'low', timeHorizon: '2-8 weeks', winRate: 0, profitFactor: 0, totalTrades: 0, active: false, capitalAllocated: 0, pnl: 0, maxDrawdown: 0,
    entryRules: ['Sector RS rank top 3', 'Positive earnings momentum', 'Fund flows positive', 'Economic cycle alignment'],
    exitRules: ['Sector drops below rank 5', 'Earnings momentum fades', 'Rebalance monthly'],
    idealConditions: ['Clear economic cycle phase', 'Sector dispersion high', 'Macro trends defined'],
  },
  {
    id: 'defensive', name: 'Defensive', description: 'Capital preservation strategy for uncertain markets.',
    type: 'Protective', riskLevel: 'low', timeHorizon: '4-12 weeks', winRate: 0, profitFactor: 0, totalTrades: 0, active: true, capitalAllocated: 0, pnl: 0, maxDrawdown: 0,
    entryRules: ['VIX > 20', 'Market downtrend', 'Flight to safety confirmed', 'Gold/bonds strength'],
    exitRules: ['VIX < 15', 'Market reversal confirmed', 'Risk-on signals'],
    idealConditions: ['Bear markets', 'High uncertainty', 'Geopolitical risk'],
  },
  {
    id: 'dca', name: 'Dollar Cost Averaging', description: 'Systematic periodic buying to average entry prices.',
    type: 'Systematic', riskLevel: 'low', timeHorizon: 'Ongoing', winRate: 0, profitFactor: 0, totalTrades: 0, active: true, capitalAllocated: 0, pnl: 0, maxDrawdown: 0,
    entryRules: ['Fixed schedule (weekly/monthly)', 'Fixed dollar amount', 'Core holdings only', 'Increase on dips > 10%'],
    exitRules: ['Rebalance quarterly', 'Reduce on > 30% gain', 'Never full exit core'],
    idealConditions: ['All market conditions', 'Best in volatile markets', 'Long-term holdings'],
  },
  {
    id: 'volatility', name: 'Volatility Strategy', description: 'Profits from volatility expansion and contraction cycles.',
    type: 'Volatility', riskLevel: 'high', timeHorizon: '1-5 days', winRate: 0, profitFactor: 0, totalTrades: 0, active: false, capitalAllocated: 0, pnl: 0, maxDrawdown: 0,
    entryRules: ['VIX term structure inversion', 'Implied > realized vol spread', 'Volatility squeeze detected', 'Options skew extreme'],
    exitRules: ['Vol normalization', 'Time decay threshold', 'Max loss 2% per trade'],
    idealConditions: ['Volatility regime change', 'Event-driven', 'Options market dislocation'],
  },
];

export const mockTradeIdeas: TradeIdea[] = [
  {
    id: '1', symbol: 'NVDA', name: 'NVIDIA', type: 'stock', direction: 'long', strategy: 'Momentum',
    entry: 117, stopLoss: 108, takeProfit: 135, riskReward: 2.0, positionSize: 50, riskPercent: 1.5,
    confidence: 82, status: 'pending', reasoning: 'Strong momentum, AI sector leadership, volume breakout above consolidation.',
    agentAnalysis: 'Market Analyst: Bullish tech sector. Asset Selector: Top RS rank. Risk Manager: Approved at 1.5% risk.',
    createdAt: '2025-03-13T10:30:00Z',
  },
  {
    id: '2', symbol: 'SOL/USD', name: 'Solana', type: 'crypto', direction: 'long', strategy: 'Breakout',
    entry: 128, stopLoss: 115, takeProfit: 160, riskReward: 2.46, positionSize: 25, riskPercent: 1.0,
    confidence: 75, status: 'pending', reasoning: 'Breaking above key resistance with volume. DeFi activity surging.',
    agentAnalysis: 'Market Analyst: Crypto bullish regime. Asset Selector: High RS. Risk Manager: Approved with reduced size.',
    createdAt: '2025-03-13T09:15:00Z',
  },
  {
    id: '3', symbol: 'XAU/USD', name: 'Gold', type: 'commodity', direction: 'long', strategy: 'Defensive',
    entry: 2985, stopLoss: 2940, takeProfit: 3100, riskReward: 2.56, positionSize: 3, riskPercent: 0.8,
    confidence: 78, status: 'approved', reasoning: 'Geopolitical uncertainty, central bank buying, inflation hedge. Near all-time highs.',
    agentAnalysis: 'Market Analyst: Risk-off signals. Asset Selector: Safe haven demand. Risk Manager: Low risk approved.',
    createdAt: '2025-03-12T14:00:00Z',
  },
  {
    id: '4', symbol: 'TSLA', name: 'Tesla', type: 'stock', direction: 'short', strategy: 'Mean Reversion',
    entry: 253, stopLoss: 268, takeProfit: 225, riskReward: 1.87, positionSize: 8, riskPercent: 1.2,
    confidence: 65, status: 'rejected', reasoning: 'Overextended bounce, weak fundamentals, competition pressure.',
    agentAnalysis: 'Risk Manager: REJECTED - Correlation too high with existing positions. Reduce exposure first.',
    createdAt: '2025-03-12T11:45:00Z',
  },
];

export const mockRiskMetrics: RiskMetrics = {
  totalExposure: 72.5,
  maxExposureLimit: 85,
  dailyRiskUsed: 2.8,
  dailyRiskLimit: 5,
  weeklyRiskUsed: 6.2,
  weeklyRiskLimit: 10,
  currentDrawdown: 3.4,
  maxDrawdownLimit: 15,
  openPositions: 6,
  maxPositions: 10,
  correlationRisk: 42,
  leverageUsed: 1.0,
  maxLeverage: 2.0,
};

export const mockAgentOutputs: AgentOutput[] = [
  { id: '1', agent: 'Market Analyst', timestamp: '2024-03-15T10:30:00Z', type: 'analysis', title: 'Market Regime: Risk-On', content: 'Broad market showing bullish momentum. S&P 500 above all major MAs. VIX at 14.2 indicating low fear. Tech sector leading. Crypto showing strength. Recommendation: Increase equity exposure.', severity: 'info' },
  { id: '2', agent: 'Risk Manager', timestamp: '2024-03-15T10:28:00Z', type: 'alert', title: 'Correlation Warning', content: 'Portfolio crypto exposure at 39.3%. BTC and SOL correlation at 0.82. Consider reducing crypto allocation or hedging. Max recommended: 35%.', severity: 'warning' },
  { id: '3', agent: 'Asset Selector', timestamp: '2024-03-15T10:25:00Z', type: 'signal', title: 'Top Opportunities', content: 'Ranked by relative strength: 1) NVDA (RS: 95) 2) SOL (RS: 91) 3) BTC (RS: 85) 4) AAPL (RS: 78) 5) MSFT (RS: 75). Sector leaders: Tech, Crypto.', severity: 'info' },
  { id: '4', agent: 'Strategy Engine', timestamp: '2024-03-15T10:20:00Z', type: 'recommendation', title: 'Strategy Allocation Update', content: 'Current market favors Momentum and Trend Following. Recommending: Momentum 30%, Trend Following 25%, DCA 25%, Defensive 20%. Deactivate Mean Reversion in trending market.', severity: 'info' },
  { id: '5', agent: 'Risk Manager', timestamp: '2024-03-15T09:45:00Z', type: 'risk', title: 'Daily Risk Budget', content: 'Daily risk used: 2.8% of 5% limit. Remaining: 2.2%. 2 pending trades would use additional 2.5%. One trade must be reduced or postponed.', severity: 'warning' },
  { id: '6', agent: 'Portfolio Manager', timestamp: '2024-03-15T09:30:00Z', type: 'analysis', title: 'Portfolio Health Check', content: 'Diversification score: 72/100. Overweight: Crypto (39%), Tech (30%). Underweight: Commodities (12%), ETFs (18%). Suggestion: Increase commodity and broad ETF allocation.', severity: 'info' },
  { id: '7', agent: 'Learning Agent', timestamp: '2024-03-15T08:00:00Z', type: 'recommendation', title: 'Weekly Performance Review', content: 'Last 7 days: +3.2% P&L. Best: Momentum (+5.1%). Worst: Mean Reversion (-1.2%). Key insight: Breakout entries 15min after open perform 23% better. Recommendation: Delay breakout entries.', severity: 'info' },
];

export const portfolioValue = 119250;
export const portfolioChange = 5523.17;
export const portfolioChangePercent = 4.86;

// Re-export from utils for backward compatibility
export { formatCurrency, formatNumber } from "@/lib/utils";

export function formatVolume(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toString();
}

export function formatMarketCap(value: number | undefined): string {
  if (!value) return 'N/A';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  const { formatCurrency: fc } = await import("@/lib/utils");
  return fc(value);
}
