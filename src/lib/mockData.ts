// Mock data simulating Twelve Data API responses
// Structured to be easily replaced with real API calls

export type AssetType = 'crypto' | 'stock' | 'etf' | 'commodity';

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

// Mock assets
export const mockAssets: Asset[] = [
  { symbol: 'BTC/USD', name: 'Bitcoin', type: 'crypto', price: 67842.50, change24h: 1523.40, changePercent: 2.29, volume: 28500000000, marketCap: 1330000000000, high24h: 68200, low24h: 65900, open: 66319, rsi: 62, macdSignal: 'bullish', trend: 'uptrend', volatility: 3.2, momentum: 72, relativeStrength: 85 },
  { symbol: 'ETH/USD', name: 'Ethereum', type: 'crypto', price: 3542.80, change24h: -45.20, changePercent: -1.26, volume: 15200000000, marketCap: 425000000000, high24h: 3620, low24h: 3480, open: 3588, rsi: 48, macdSignal: 'neutral', trend: 'sideways', volatility: 4.1, momentum: 45, relativeStrength: 62 },
  { symbol: 'SOL/USD', name: 'Solana', type: 'crypto', price: 178.35, change24h: 8.92, changePercent: 5.27, volume: 3800000000, marketCap: 78000000000, high24h: 182, low24h: 168, open: 169.43, rsi: 71, macdSignal: 'bullish', trend: 'uptrend', volatility: 6.8, momentum: 82, relativeStrength: 91 },
  { symbol: 'BNB/USD', name: 'BNB', type: 'crypto', price: 612.40, change24h: 12.30, changePercent: 2.05, volume: 1200000000, marketCap: 94000000000, high24h: 618, low24h: 598, open: 600.10, rsi: 58, macdSignal: 'bullish', trend: 'uptrend', volatility: 3.5, momentum: 60, relativeStrength: 70 },
  { symbol: 'XRP/USD', name: 'Ripple', type: 'crypto', price: 0.5842, change24h: -0.012, changePercent: -2.01, volume: 980000000, marketCap: 32000000000, high24h: 0.601, low24h: 0.571, open: 0.5962, rsi: 42, macdSignal: 'bearish', trend: 'downtrend', volatility: 5.2, momentum: 35, relativeStrength: 38 },
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', price: 192.53, change24h: 3.21, changePercent: 1.70, volume: 52000000, marketCap: 2980000000000, high24h: 193.80, low24h: 189.20, open: 189.32, rsi: 65, macdSignal: 'bullish', trend: 'uptrend', volatility: 1.8, momentum: 68, relativeStrength: 78 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', type: 'stock', price: 428.74, change24h: 5.62, changePercent: 1.33, volume: 21000000, marketCap: 3180000000000, high24h: 430.50, low24h: 422.10, open: 423.12, rsi: 61, macdSignal: 'bullish', trend: 'uptrend', volatility: 1.5, momentum: 64, relativeStrength: 75 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', type: 'stock', price: 875.30, change24h: 28.45, changePercent: 3.36, volume: 45000000, marketCap: 2150000000000, high24h: 882.00, low24h: 842.00, open: 846.85, rsi: 73, macdSignal: 'bullish', trend: 'uptrend', volatility: 3.8, momentum: 88, relativeStrength: 95 },
  { symbol: 'TSLA', name: 'Tesla Inc.', type: 'stock', price: 245.62, change24h: -8.30, changePercent: -3.27, volume: 98000000, marketCap: 780000000000, high24h: 255.40, low24h: 243.10, open: 253.92, rsi: 38, macdSignal: 'bearish', trend: 'downtrend', volatility: 5.2, momentum: 32, relativeStrength: 28 },
  { symbol: 'AMZN', name: 'Amazon.com', type: 'stock', price: 186.49, change24h: 2.15, changePercent: 1.17, volume: 38000000, marketCap: 1930000000000, high24h: 187.80, low24h: 183.90, open: 184.34, rsi: 56, macdSignal: 'neutral', trend: 'sideways', volatility: 2.1, momentum: 52, relativeStrength: 60 },
  { symbol: 'SPY', name: 'S&P 500 ETF', type: 'etf', price: 521.40, change24h: 4.82, changePercent: 0.93, volume: 72000000, high24h: 522.90, low24h: 516.30, open: 516.58, rsi: 59, macdSignal: 'bullish', trend: 'uptrend', volatility: 1.2, momentum: 58, relativeStrength: 65 },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF', type: 'etf', price: 445.82, change24h: 6.24, changePercent: 1.42, volume: 41000000, high24h: 447.10, low24h: 439.20, open: 439.58, rsi: 63, macdSignal: 'bullish', trend: 'uptrend', volatility: 1.6, momentum: 66, relativeStrength: 72 },
  { symbol: 'VTI', name: 'Total Stock Market', type: 'etf', price: 268.15, change24h: 2.10, changePercent: 0.79, volume: 3200000, high24h: 269.00, low24h: 265.80, open: 266.05, rsi: 55, macdSignal: 'neutral', trend: 'uptrend', volatility: 1.1, momentum: 54, relativeStrength: 58 },
  { symbol: 'ARKK', name: 'ARK Innovation', type: 'etf', price: 48.92, change24h: -1.35, changePercent: -2.69, volume: 18000000, high24h: 50.80, low24h: 48.50, open: 50.27, rsi: 35, macdSignal: 'bearish', trend: 'downtrend', volatility: 4.5, momentum: 28, relativeStrength: 22 },
  { symbol: 'XAU/USD', name: 'Gold', type: 'commodity', price: 2348.60, change24h: 18.40, changePercent: 0.79, volume: 182000, high24h: 2355, low24h: 2325, open: 2330.20, rsi: 64, macdSignal: 'bullish', trend: 'uptrend', volatility: 1.0, momentum: 62, relativeStrength: 70 },
  { symbol: 'XAG/USD', name: 'Silver', type: 'commodity', price: 27.85, change24h: 0.42, changePercent: 1.53, volume: 45000, high24h: 28.10, low24h: 27.30, open: 27.43, rsi: 58, macdSignal: 'bullish', trend: 'uptrend', volatility: 2.3, momentum: 55, relativeStrength: 62 },
  { symbol: 'CL', name: 'Crude Oil', type: 'commodity', price: 78.42, change24h: -1.23, changePercent: -1.54, volume: 320000, high24h: 80.10, low24h: 77.90, open: 79.65, rsi: 44, macdSignal: 'bearish', trend: 'downtrend', volatility: 2.8, momentum: 38, relativeStrength: 40 },
  { symbol: 'NG', name: 'Natural Gas', type: 'commodity', price: 2.34, change24h: 0.08, changePercent: 3.54, volume: 95000, high24h: 2.38, low24h: 2.22, open: 2.26, rsi: 52, macdSignal: 'neutral', trend: 'sideways', volatility: 6.2, momentum: 48, relativeStrength: 45 },
];

// Mock portfolio
export const mockPortfolio: PortfolioPosition[] = [
  { symbol: 'BTC/USD', name: 'Bitcoin', type: 'crypto', quantity: 0.5, avgEntry: 62500, currentPrice: 67842.50, pnl: 2671.25, pnlPercent: 8.55, allocation: 28.5, stopLoss: 59000, takeProfit: 75000, strategy: 'Trend Following' },
  { symbol: 'NVDA', name: 'NVIDIA', type: 'stock', quantity: 15, avgEntry: 820, currentPrice: 875.30, pnl: 829.50, pnlPercent: 6.74, allocation: 22.1, stopLoss: 780, takeProfit: 950, strategy: 'Momentum' },
  { symbol: 'SPY', name: 'S&P 500 ETF', type: 'etf', quantity: 30, avgEntry: 508, currentPrice: 521.40, pnl: 402.00, pnlPercent: 2.64, allocation: 18.2, stopLoss: 495, takeProfit: 545, strategy: 'Dollar Cost Avg' },
  { symbol: 'XAU/USD', name: 'Gold', type: 'commodity', quantity: 5, avgEntry: 2280, currentPrice: 2348.60, pnl: 343.00, pnlPercent: 3.01, allocation: 12.4, stopLoss: 2220, takeProfit: 2450, strategy: 'Defensive' },
  { symbol: 'SOL/USD', name: 'Solana', type: 'crypto', quantity: 50, avgEntry: 155, currentPrice: 178.35, pnl: 1167.50, pnlPercent: 15.06, allocation: 10.8, stopLoss: 140, takeProfit: 210, strategy: 'Breakout' },
  { symbol: 'MSFT', name: 'Microsoft', type: 'stock', quantity: 8, avgEntry: 415, currentPrice: 428.74, pnl: 109.92, pnlPercent: 3.31, allocation: 8.0, stopLoss: 400, takeProfit: 460, strategy: 'Trend Following' },
];

export const mockStrategies: Strategy[] = [
  {
    id: 'trend-following', name: 'Trend Following', description: 'Identifies and rides established market trends using moving averages and trend indicators.',
    type: 'Directional', riskLevel: 'medium', timeHorizon: '1-4 weeks', winRate: 48, profitFactor: 1.85, totalTrades: 142, active: true, capitalAllocated: 35000, pnl: 8420, maxDrawdown: 8.2,
    entryRules: ['Price above 50 & 200 EMA', 'ADX > 25', 'Volume confirmation', 'RSI not overbought'],
    exitRules: ['Price closes below 20 EMA', 'Trailing stop 2 ATR', 'Take profit at 3:1 R/R'],
    idealConditions: ['Trending markets', 'Low chopiness', 'Clear directional bias'],
  },
  {
    id: 'momentum', name: 'Momentum', description: 'Captures strong directional moves in assets showing relative strength.',
    type: 'Directional', riskLevel: 'high', timeHorizon: '3-10 days', winRate: 52, profitFactor: 2.10, totalTrades: 98, active: true, capitalAllocated: 25000, pnl: 6230, maxDrawdown: 12.5,
    entryRules: ['RS rank top 20%', 'Volume spike > 2x avg', 'Price breakout above resistance', 'Momentum oscillator positive'],
    exitRules: ['RS drops below 50%', 'Volume dry-up', 'Fixed stop 1.5 ATR'],
    idealConditions: ['Strong market momentum', 'Risk-on environment', 'Sector rotation favorable'],
  },
  {
    id: 'swing-trading', name: 'Swing Trading', description: 'Captures medium-term price swings within established trends.',
    type: 'Directional', riskLevel: 'medium', timeHorizon: '3-14 days', winRate: 55, profitFactor: 1.65, totalTrades: 186, active: true, capitalAllocated: 20000, pnl: 4150, maxDrawdown: 6.8,
    entryRules: ['Pullback to support/MA', 'RSI oversold bounce', 'Bullish candlestick pattern', 'Volume increasing'],
    exitRules: ['Target previous high', 'Stop below swing low', 'Time stop 14 days'],
    idealConditions: ['Trending with pullbacks', 'Clear support/resistance', 'Moderate volatility'],
  },
  {
    id: 'mean-reversion', name: 'Mean Reversion', description: 'Exploits overextended price moves that revert to the mean.',
    type: 'Counter-trend', riskLevel: 'medium', timeHorizon: '1-5 days', winRate: 62, profitFactor: 1.45, totalTrades: 210, active: false, capitalAllocated: 0, pnl: 3890, maxDrawdown: 5.4,
    entryRules: ['Price > 2 std dev from mean', 'RSI extreme (>80 or <20)', 'Bollinger Band touch', 'Volume exhaustion'],
    exitRules: ['Return to 20 EMA', 'Opposite BB band', 'Max hold 5 days'],
    idealConditions: ['Range-bound markets', 'High mean-reversion tendency', 'Low trend strength'],
  },
  {
    id: 'breakout', name: 'Breakout', description: 'Captures explosive moves when price breaks key levels.',
    type: 'Directional', riskLevel: 'high', timeHorizon: '1-7 days', winRate: 38, profitFactor: 2.40, totalTrades: 76, active: true, capitalAllocated: 15000, pnl: 5620, maxDrawdown: 15.2,
    entryRules: ['Break above resistance with volume', 'Consolidation > 10 days', 'Increasing volume on breakout', 'ATR expansion'],
    exitRules: ['Failed breakout retest', 'Trailing stop 2.5 ATR', 'Take profit 4:1 R/R'],
    idealConditions: ['After consolidation', 'Increasing volatility', 'Catalyst present'],
  },
  {
    id: 'sector-rotation', name: 'Sector Rotation', description: 'Rotates capital into strongest sectors based on economic cycle.',
    type: 'Allocation', riskLevel: 'low', timeHorizon: '2-8 weeks', winRate: 58, profitFactor: 1.55, totalTrades: 42, active: false, capitalAllocated: 0, pnl: 2180, maxDrawdown: 4.2,
    entryRules: ['Sector RS rank top 3', 'Positive earnings momentum', 'Fund flows positive', 'Economic cycle alignment'],
    exitRules: ['Sector drops below rank 5', 'Earnings momentum fades', 'Rebalance monthly'],
    idealConditions: ['Clear economic cycle phase', 'Sector dispersion high', 'Macro trends defined'],
  },
  {
    id: 'defensive', name: 'Defensive', description: 'Capital preservation strategy for uncertain markets.',
    type: 'Protective', riskLevel: 'low', timeHorizon: '4-12 weeks', winRate: 65, profitFactor: 1.25, totalTrades: 34, active: true, capitalAllocated: 20000, pnl: 1540, maxDrawdown: 2.8,
    entryRules: ['VIX > 20', 'Market downtrend', 'Flight to safety confirmed', 'Gold/bonds strength'],
    exitRules: ['VIX < 15', 'Market reversal confirmed', 'Risk-on signals'],
    idealConditions: ['Bear markets', 'High uncertainty', 'Geopolitical risk'],
  },
  {
    id: 'dca', name: 'Dollar Cost Averaging', description: 'Systematic periodic buying to average entry prices.',
    type: 'Systematic', riskLevel: 'low', timeHorizon: 'Ongoing', winRate: 72, profitFactor: 1.35, totalTrades: 156, active: true, capitalAllocated: 30000, pnl: 4890, maxDrawdown: 3.5,
    entryRules: ['Fixed schedule (weekly/monthly)', 'Fixed dollar amount', 'Core holdings only', 'Increase on dips > 10%'],
    exitRules: ['Rebalance quarterly', 'Reduce on > 30% gain', 'Never full exit core'],
    idealConditions: ['All market conditions', 'Best in volatile markets', 'Long-term holdings'],
  },
  {
    id: 'volatility', name: 'Volatility Strategy', description: 'Profits from volatility expansion and contraction cycles.',
    type: 'Volatility', riskLevel: 'high', timeHorizon: '1-5 days', winRate: 44, profitFactor: 1.95, totalTrades: 64, active: false, capitalAllocated: 0, pnl: 3210, maxDrawdown: 18.0,
    entryRules: ['VIX term structure inversion', 'Implied > realized vol spread', 'Volatility squeeze detected', 'Options skew extreme'],
    exitRules: ['Vol normalization', 'Time decay threshold', 'Max loss 2% per trade'],
    idealConditions: ['Volatility regime change', 'Event-driven', 'Options market dislocation'],
  },
];

export const mockTradeIdeas: TradeIdea[] = [
  {
    id: '1', symbol: 'NVDA', name: 'NVIDIA', type: 'stock', direction: 'long', strategy: 'Momentum',
    entry: 875, stopLoss: 830, takeProfit: 960, riskReward: 1.89, positionSize: 12, riskPercent: 1.5,
    confidence: 82, status: 'pending', reasoning: 'Strong momentum, AI sector leadership, volume breakout above consolidation.',
    agentAnalysis: 'Market Analyst: Bullish tech sector. Asset Selector: Top RS rank. Risk Manager: Approved at 1.5% risk.',
    createdAt: '2024-03-15T10:30:00Z',
  },
  {
    id: '2', symbol: 'SOL/USD', name: 'Solana', type: 'crypto', direction: 'long', strategy: 'Breakout',
    entry: 178, stopLoss: 160, takeProfit: 220, riskReward: 2.33, positionSize: 25, riskPercent: 1.0,
    confidence: 75, status: 'pending', reasoning: 'Breaking above key resistance with volume. DeFi activity surging.',
    agentAnalysis: 'Market Analyst: Crypto bullish regime. Asset Selector: High RS. Risk Manager: Approved with reduced size.',
    createdAt: '2024-03-15T09:15:00Z',
  },
  {
    id: '3', symbol: 'XAU/USD', name: 'Gold', type: 'commodity', direction: 'long', strategy: 'Defensive',
    entry: 2348, stopLoss: 2310, takeProfit: 2420, riskReward: 1.89, positionSize: 3, riskPercent: 0.8,
    confidence: 70, status: 'approved', reasoning: 'Geopolitical uncertainty, central bank buying, inflation hedge.',
    agentAnalysis: 'Market Analyst: Risk-off signals. Asset Selector: Safe haven demand. Risk Manager: Low risk approved.',
    createdAt: '2024-03-14T14:00:00Z',
  },
  {
    id: '4', symbol: 'TSLA', name: 'Tesla', type: 'stock', direction: 'short', strategy: 'Mean Reversion',
    entry: 246, stopLoss: 262, takeProfit: 218, riskReward: 1.75, positionSize: 8, riskPercent: 1.2,
    confidence: 65, status: 'rejected', reasoning: 'Overextended bounce, weak fundamentals, competition pressure.',
    agentAnalysis: 'Risk Manager: REJECTED - Correlation too high with existing positions. Reduce exposure first.',
    createdAt: '2024-03-14T11:45:00Z',
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

export function formatCurrency(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

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
  return formatCurrency(value);
}
