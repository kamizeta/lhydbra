import { useState } from "react";
import { HelpCircle, X, Activity, Target, Brain, Shield, FileText, PieChart, GraduationCap } from "lucide-react";

const agentDetails = [
  {
    icon: Activity,
    name: "Analista de Mercado",
    color: "text-terminal-cyan",
    what: "Analiza el estado general del mercado: tendencias, volatilidad, momentum, eventos macro y niveles de liquidez.",
    when: "Se ejecuta primero para establecer el contexto del mercado antes de que los demás agentes actúen.",
    output: "Diagnóstico completo del mercado con señales de dirección y niveles clave.",
  },
  {
    icon: Target,
    name: "Selector de Activos",
    color: "text-primary",
    what: "Filtra y clasifica todos los activos por fuerza relativa, volumen, tendencia y momentum para encontrar los mejores candidatos.",
    when: "Después del diagnóstico de mercado, selecciona los activos con mayor probabilidad de éxito.",
    output: "Lista ordenada de activos recomendados con score de fuerza relativa.",
  },
  {
    icon: Brain,
    name: "Motor de Estrategias",
    color: "text-terminal-gold",
    what: "Evalúa las estrategias disponibles (Breakout, Mean Reversion, Trend Following, etc.) y selecciona la óptima para cada activo.",
    when: "Una vez seleccionados los activos, determina QUÉ estrategia aplicar y CÓMO.",
    output: "Estrategia seleccionada con reglas de entrada, salida y asignación de capital.",
  },
  {
    icon: Shield,
    name: "Gestor de Riesgo",
    color: "text-warning",
    what: "Valida que cada propuesta cumple tus reglas de riesgo: dimensionamiento, exposición máxima, correlación, drawdown y apalancamiento.",
    when: "ANTES de generar la orden final. Si el riesgo excede tus límites, bloquea la operación.",
    output: "Aprobación o rechazo del trade con justificación de riesgo detallada.",
  },
  {
    icon: FileText,
    name: "Preparador de Órdenes",
    color: "text-profit",
    what: "Genera la orden lista para ejecución: precio de entrada, stop loss, take profit, tamaño de posición y tipo de orden.",
    when: "Solo después de que el Gestor de Riesgo apruebe la operación.",
    output: "Orden estructurada exportable a MT4/MT5 o ejecución manual.",
  },
  {
    icon: PieChart,
    name: "Gestor de Portafolio",
    color: "text-terminal-cyan",
    what: "Monitorea la diversificación, rebalanceo, exposición sectorial y correlación entre posiciones abiertas.",
    when: "Continuamente evalúa la salud del portafolio y sugiere ajustes.",
    output: "Recomendaciones de rebalanceo y alertas de concentración excesiva.",
  },
  {
    icon: GraduationCap,
    name: "Agente de Aprendizaje",
    color: "text-primary",
    what: "Analiza operaciones pasadas (ganadoras y perdedoras) para identificar patrones y mejorar el sistema.",
    when: "Se ejecuta al final del pipeline para retroalimentar a los demás agentes.",
    output: "Recomendaciones de mejora basadas en datos históricos y patrones detectados.",
  },
];

export default function AgentsHelpButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
      >
        <HelpCircle className="h-3.5 w-3.5" /> ¿Qué hace cada agente?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl mx-4 max-h-[85vh] terminal-border rounded-xl bg-card overflow-hidden animate-slide-in">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border p-4 sticky top-0 bg-card z-10">
              <h2 className="text-base font-bold text-foreground">Los 7 Agentes de LHYDBRA AI</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Pipeline visual */}
            <div className="p-4 border-b border-border bg-accent/30">
              <p className="text-xs text-muted-foreground font-mono mb-2">PIPELINE DE EJECUCIÓN:</p>
              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                {agentDetails.map((a, i) => (
                  <div key={a.name} className="flex items-center gap-1 shrink-0">
                    <div className={`flex items-center gap-1 rounded bg-card border border-border px-2 py-1 ${a.color}`}>
                      <a.icon className="h-3 w-3" />
                      <span className="text-[10px] font-mono">{i + 1}</span>
                    </div>
                    {i < agentDetails.length - 1 && <span className="text-muted-foreground text-[10px]">→</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Agent cards */}
            <div className="overflow-y-auto max-h-[calc(85vh-140px)] p-4 space-y-3">
              {agentDetails.map((agent, i) => {
                const Icon = agent.icon;
                return (
                  <div key={agent.name} className="terminal-border rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`rounded-md p-2 bg-accent/50 ${agent.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-foreground">
                          <span className="text-primary font-mono mr-1">#{i + 1}</span>
                          {agent.name}
                        </h3>
                      </div>
                    </div>
                    <div className="space-y-1.5 ml-11">
                      <p className="text-xs text-muted-foreground">
                        <span className="text-foreground font-medium">¿Qué hace?</span> {agent.what}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="text-foreground font-medium">¿Cuándo?</span> {agent.when}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="text-foreground font-medium">Output:</span> {agent.output}
                      </p>
                    </div>
                  </div>
                );
              })}

              {/* How it works summary */}
              <div className="rounded-lg bg-primary/10 border border-primary/20 p-4 mt-4">
                <h3 className="text-sm font-bold text-primary mb-2">¿Cómo funciona el sistema completo?</h3>
                <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal list-inside">
                  <li>Configuras tu capital y reglas de riesgo en <span className="text-foreground">Settings</span></li>
                  <li>Los agentes analizan el mercado en tiempo real con datos de <span className="text-foreground">Twelve Data API</span></li>
                  <li>El pipeline se ejecuta en secuencia: Mercado → Activos → Estrategia → Riesgo → Orden</li>
                  <li>Las propuestas aprobadas aparecen en <span className="text-foreground">Trade Ideas</span> para tu revisión</li>
                  <li>TÚ decides si aprobar o rechazar cada operación — LHYDBRA nunca ejecuta sin tu permiso</li>
                  <li>Registras la operación en <span className="text-foreground">Positions</span> y la cierras cuando corresponda</li>
                  <li>El <span className="text-foreground">Agente de Aprendizaje</span> analiza tus resultados para mejorar futuras señales</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
