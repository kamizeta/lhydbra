import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Loader2, Flag } from "lucide-react";

interface FeatureFlag {
  id: string;
  enabled: boolean;
  description: string | null;
}

export default function FeatureFlagsSection() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("feature_flags")
        .select("id, enabled, description")
        .order("id");
      setFlags((data as FeatureFlag[]) || []);
      setLoading(false);
    })();
  }, []);

  const toggle = async (flagId: string, current: boolean) => {
    setToggling(flagId);
    const newValue = !current;
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await supabase.functions.invoke("toggle-feature-flag", {
      body: { flagId, enabled: newValue },
    });
    if (resp.error) {
      toast.error("Error: " + (resp.error.message || "Unknown error"));
    } else {
      setFlags((prev) =>
        prev.map((f) => (f.id === flagId ? { ...f, enabled: !current } : f))
      );
      toast.success(`${flagId} → ${!current ? "ON" : "OFF"}`);
    }
    setToggling(null);
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Flag className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-mono font-medium text-foreground">
          Feature Flags
        </h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Toggle trading features without deploying code
      </p>
      <div className="space-y-2">
        {flags.map((flag) => (
          <div
            key={flag.id}
            className="flex items-center justify-between p-2.5 rounded border border-border"
          >
            <div className="flex-1 min-w-0 mr-3">
              <div className="text-xs font-mono font-medium text-foreground">
                {flag.id.replace(/_/g, " ")}
              </div>
              {flag.description && (
                <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {flag.description}
                </div>
              )}
            </div>
            <button
              onClick={() => toggle(flag.id, flag.enabled)}
              disabled={toggling === flag.id}
              className={cn(
                "px-3 py-1 rounded text-[10px] font-mono font-bold uppercase border transition-colors shrink-0",
                toggling === flag.id && "opacity-50",
                flag.enabled
                  ? "bg-green-500/10 text-green-400 border-green-500/30"
                  : "bg-muted text-muted-foreground border-border hover:border-primary/40"
              )}
            >
              {toggling === flag.id ? "..." : flag.enabled ? "ON" : "OFF"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
