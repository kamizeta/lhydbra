import { useState, useEffect } from "react";
import { X, ArrowRight, ArrowLeft, Settings, BarChart3, Bot, Zap, PieChart, BookOpen, Shield } from "lucide-react";
import { useI18n } from "@/i18n";
import lhydbraLogo from "@/assets/lhydbra-logo.png";

const ONBOARDING_KEY = "lhydbra_onboarding_complete";

interface Step {
  icon: typeof Settings;
  titleKey: string;
  descKey: string;
  color: string;
}

export default function OnboardingTutorial() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const done = localStorage.getItem(ONBOARDING_KEY);
    if (!done) setVisible(true);
  }, []);

  if (!visible) return null;

  const steps: Step[] = [
    {
      icon: Settings,
      titleKey: "1. Configura tu Capital",
      descKey: "Ve a Settings y define tu capital inicial, porcentaje de riesgo por operación, drawdown máximo y reglas de gestión. Esto es lo PRIMERO que debes hacer.",
      color: "text-terminal-gold",
    },
    {
      icon: BarChart3,
      titleKey: "2. Explora el Mercado",
      descKey: "En Market Explorer verás precios en vivo de criptomonedas, acciones, ETFs y materias primas. Identifica activos con tendencia, momentum y volumen favorable.",
      color: "text-terminal-cyan",
    },
    {
      icon: Bot,
      titleKey: "3. Ejecuta los Agentes AI",
      descKey: "Ve a Agents AI y haz clic en 'Ejecutar Todos'. Los 7 agentes analizarán el mercado, seleccionarán activos, propondrán estrategias y validarán el riesgo automáticamente.",
      color: "text-primary",
    },
    {
      icon: Zap,
      titleKey: "4. Revisa las Ideas de Trade",
      descKey: "En Trade Ideas verás las propuestas generadas por los agentes con entrada, stop loss, take profit y tamaño de posición. Aprueba o rechaza cada idea.",
      color: "text-profit",
    },
    {
      icon: PieChart,
      titleKey: "5. Gestiona tus Posiciones",
      descKey: "En Positions puedes registrar tus operaciones abiertas, cerrarlas cuando alcancen el objetivo, o eliminarlas. Todo se guarda en tu cuenta.",
      color: "text-terminal-cyan",
    },
    {
      icon: Shield,
      titleKey: "6. Controla el Riesgo",
      descKey: "Risk Management te muestra tu exposición, drawdown, correlación y dimensionamiento en tiempo real. LHYDBRA nunca te dejará sobrepasar tus límites.",
      color: "text-warning",
    },
    {
      icon: BookOpen,
      titleKey: "7. Analiza en el Diario",
      descKey: "El Journal registra todas tus operaciones con P&L, tasa de acierto y factor de beneficio. Aprende de cada trade para mejorar tu sistema.",
      color: "text-primary",
    },
  ];

  const current = steps[step];
  const Icon = current.icon;

  const close = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 terminal-border rounded-xl bg-card p-6 space-y-5 animate-slide-in">
        {/* Close */}
        <button onClick={close} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-5 w-5" />
        </button>

        {/* Logo + Welcome (only step 0) */}
        {step === 0 && (
          <div className="text-center space-y-2">
            <img src={lhydbraLogo} alt="LHYDBRA" className="h-16 w-16 mx-auto" />
            <h1 className="text-xl font-bold text-foreground tracking-widest">LHYDBRA</h1>
            <p className="text-xs text-terminal-gold font-mono">Balanced Intelligence for Financial Evolution</p>
          </div>
        )}

        {/* Step content */}
        <div className="flex items-start gap-4">
          <div className={`rounded-lg p-3 bg-accent/50 shrink-0 ${current.color}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">{current.titleKey}</h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{current.descKey}</p>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : "w-1.5 bg-border"}`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Anterior
          </button>

          {step < steps.length - 1 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Siguiente <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={close}
              className="flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              ¡Empezar! <Zap className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Skip */}
        <div className="text-center">
          <button onClick={close} className="text-[10px] text-muted-foreground hover:text-foreground font-mono transition-colors">
            Saltar tutorial
          </button>
        </div>
      </div>
    </div>
  );
}
