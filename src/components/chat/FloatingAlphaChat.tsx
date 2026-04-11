import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Trash2, BrainCircuit, Loader2, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface Note {
  id: string;
  message: string;
  role: string;
  created_at: string;
}

export default function FloatingAlphaChat() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["alpha_notes", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("alpha_notes")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data as Note[]) ?? [];
    },
    enabled: !!user && open,
    refetchInterval: open ? 5000 : false,
  });

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const { data, error } = await supabase.functions.invoke("alpha-ingestor", {
        body: { message },
      });
      if (error) throw new Error(error.message);
      return data as { reply: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alpha_notes"] });
      setInput("");
    },
    onError: (err) => toast.error(`Error: ${err.message}`),
  });

  const purgeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("alpha-ingestor", {
        body: { action: "purge" },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alpha_notes"] });
      toast.success("Memoria purgada exitosamente");
    },
    onError: (err) => toast.error(`Error: ${err.message}`),
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [notes]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!user) return null;

  return (
    <>
      {/* Floating bubble */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-5 right-5 z-[9999] h-14 w-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300",
          "bg-primary text-primary-foreground hover:scale-110 active:scale-95",
          open && "rotate-90 bg-destructive"
        )}
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-5 z-[9998] w-[380px] max-w-[calc(100vw-2.5rem)] h-[520px] max-h-[calc(100vh-8rem)] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center">
                <BrainCircuit className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h2 className="text-xs font-bold tracking-wide text-foreground">AlphaLink</h2>
                <p className="text-[9px] font-mono text-muted-foreground">CONTEXTO MACRO • AI DIRECTOR</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => purgeMutation.mutate()}
              disabled={purgeMutation.isPending}
              className="text-[10px] text-muted-foreground hover:text-destructive gap-1 h-7 px-2"
            >
              <Trash2 className="h-3 w-3" />
              <span className="hidden sm:inline">Purgar</span>
            </Button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
            {isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!isLoading && notes.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-12">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <BrainCircuit className="h-6 w-6 text-primary/60" />
                </div>
                <p className="text-xs text-muted-foreground max-w-[260px]">
                  Inyecta contexto macro y noticias. La IA lo usará para sesgar señales en los próximos 3 días.
                </p>
              </div>
            )}

            {notes.map((note) => (
              <div
                key={note.id}
                className={`flex ${note.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed",
                    note.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted/60 text-foreground border border-border/50 rounded-bl-sm"
                  )}
                >
                  {note.role === "assistant" ? (
                    <div className="prose prose-sm prose-invert max-w-none [&_p]:m-0 text-xs">
                      <ReactMarkdown>{note.message}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{note.message}</p>
                  )}
                  <p className={cn(
                    "text-[9px] mt-1",
                    note.role === "user" ? "text-primary-foreground/50" : "text-muted-foreground/60"
                  )}>
                    {new Date(note.created_at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}

            {sendMutation.isPending && (
              <div className="flex justify-start">
                <div className="bg-muted/60 border border-border/50 rounded-2xl rounded-bl-sm px-3 py-2.5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="text-[10px] font-mono">PROCESANDO...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border bg-card/80 backdrop-blur-sm p-2.5 shrink-0">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Contexto macro, noticias, instrucciones..."
                className="min-h-[38px] max-h-24 resize-none bg-background/80 border-border/60 rounded-xl text-xs"
                rows={1}
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim() || sendMutation.isPending}
                className="h-9 w-9 rounded-xl shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
