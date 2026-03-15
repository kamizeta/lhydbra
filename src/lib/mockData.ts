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
  { symbol: 'BTC/USD', name: 'Bitcoin', type: 'crypto', price: 83500.00, change24h: 1250.00, changePercent: 1.52, volume: 32000000000, marketCap: 1640000000000, high24h: 84200, low24h: 81800, open: 82250, rsi: 58, macdSignal: 'bullish', trend: 'uptrend', volatility: 3.5, momentum: 65, relativeStrength: 78 },
  { symbol: 'ETH/USD', name: 'Ethereum', type: 'crypto', price: 1905.40, change24h: -32.60, changePercent: -1.68, volume: 12800000000, marketCap: 229000000000, high24h: 1960, low24h: 1880, open: 1938, rsi: 42, macdSignal: 'bearish', trend: 'downtrend', volatility: 4.8, momentum: 38, relativeStrength: 45 },
  { symbol: 'SOL/USD', name: 'Solana', type: 'crypto', price: 128.50, change24h: 3.80, changePercent: 3.05, volume: 2900000000, marketCap: 59000000000, high24h: 131, low24h: 123, open: 124.70, rsi: 55, macdSignal: 'bullish', trend: 'sideways', volatility: 6.2, momentum: 58, relativeStrength: 65 },
  { symbol: 'BNB/USD', name: 'BNB', type: 'crypto', price: 635.20, change24h: 8.40, changePercent: 1.34, volume: 1400000000, marketCap: 95000000000, high24h: 640, low24h: 624, open: 626.80, rsi: 54, macdSignal: 'neutral', trend: 'sideways', volatility: 3.2, momentum: 52, relativeStrength: 58 },
  { symbol: 'XRP/USD', name: 'Ripple', type: 'crypto', price: 1.41, change24h: -0.02, changePercent: -1.40, volume: 3200000000, marketCap: 81000000000, high24h: 1.45, low24h: 1.38, open: 1.43, rsi: 45, macdSignal: 'bearish', trend: 'downtrend', volatility: 5.5, momentum: 42, relativeStrength: 40 },
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', price: 213.50, change24h: 1.80, changePercent: 0.85, volume: 48000000, marketCap: 3280000000000, high24h: 214.90, low24h: 211.20, open: 211.70, rsi: 52, macdSignal: 'neutral', trend: 'sideways', volatility: 1.6, momentum: 50, relativeStrength: 55 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', type: 'stock', price: 388.50, change24h: 3.20, changePercent: 0.83, volume: 19000000, marketCap: 2890000000000, high24h: 390.80, low24h: 384.60, open: 385.30, rsi: 48, macdSignal: 'neutral', trend: 'sideways', volatility: 1.8, momentum: 46, relativeStrength: 52 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', type: 'stock', price: 180.00, change24h: 3.50, changePercent: 1.98, volume: 52000000, marketCap: 4400000000000, high24h: 182.00, low24h: 176.50, open: 176.50, rsi: 58, macdSignal: 'bullish', trend: 'uptrend', volatility: 3.8, momentum: 65, relativeStrength: 75 },
  { symbol: 'TSLA', name: 'Tesla Inc.', type: 'stock', price: 252.80, change24h: -6.40, changePercent: -2.47, volume: 85000000, marketCap: 810000000000, high24h: 260.50, low24h: 250.10, open: 259.20, rsi: 44, macdSignal: 'bearish', trend: 'downtrend', volatility: 4.8, momentum: 38, relativeStrength: 35 },
  { symbol: 'AMZN', name: 'Amazon.com', type: 'stock', price: 198.30, change24h: 2.50, changePercent: 1.28, volume: 35000000, marketCap: 2080000000000, high24h: 199.80, low24h: 195.40, open: 195.80, rsi: 56, macdSignal: 'bullish', trend: 'uptrend', volatility: 2.0, momentum: 58, relativeStrength: 64 },
  { symbol: 'SPY', name: 'S&P 500 ETF', type: 'etf', price: 559.80, change24h: 3.20, changePercent: 0.57, volume: 68000000, high24h: 561.40, low24h: 555.80, open: 556.60, rsi: 50, macdSignal: 'neutral', trend: 'sideways', volatility: 1.1, momentum: 48, relativeStrength: 55 },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF', type: 'etf', price: 480.20, change24h: 5.10, changePercent: 1.07, volume: 38000000, high24h: 482.50, low24h: 474.60, open: 475.10, rsi: 52, macdSignal: 'neutral', trend: 'sideways', volatility: 1.5, momentum: 50, relativeStrength: 56 },
  { symbol: 'VTI', name: 'Total Stock Market', type: 'etf', price: 282.40, change24h: 1.60, changePercent: 0.57, volume: 3000000, high24h: 283.50, low24h: 280.20, open: 280.80, rsi: 50, macdSignal: 'neutral', trend: 'sideways', volatility: 1.0, momentum: 48, relativeStrength: 52 },
  { symbol: 'ARKK', name: 'ARK Innovation', type: 'etf', price: 52.80, change24h: -0.90, changePercent: -1.68, volume: 15000000, high24h: 54.20, low24h: 52.40, open: 53.70, rsi: 40, macdSignal: 'bearish', trend: 'downtrend', volatility: 4.2, momentum: 32, relativeStrength: 28 },
  { symbol: 'XAU/USD', name: 'Gold', type: 'commodity', price: 5019.00, change24h: 38.00, changePercent: 0.76, volume: 195000, high24h: 5035, low24h: 4980, open: 4981.00, rsi: 72, macdSignal: 'bullish', trend: 'uptrend', volatility: 0.9, momentum: 75, relativeStrength: 90 },
  { symbol: 'XAG/USD', name: 'Silver', type: 'commodity', price: 33.85, change24h: 0.52, changePercent: 1.56, volume: 48000, high24h: 34.10, low24h: 33.20, open: 33.33, rsi: 62, macdSignal: 'bullish', trend: 'uptrend', volatility: 2.1, momentum: 60, relativeStrength: 72 },
  { symbol: 'CL', name: 'Crude Oil', type: 'commodity', price: 67.20, change24h: -0.85, changePercent: -1.25, volume: 310000, high24h: 68.40, low24h: 66.80, open: 68.05, rsi: 38, macdSignal: 'bearish', trend: 'downtrend', volatility: 2.5, momentum: 32, relativeStrength: 35 },
  { symbol: 'NG', name: 'Natural Gas', type: 'commodity', price: 4.12, change24h: 0.15, changePercent: 3.78, volume: 102000, high24h: 4.18, low24h: 3.92, open: 3.97, rsi: 58, macdSignal: 'bullish', trend: 'uptrend', volatility: 5.8, momentum: 55, relativeStrength: 60 },
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
