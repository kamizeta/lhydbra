import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Trash2, BrainCircuit, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface Note {
  id: string;
  message: string;
  role: string;
  created_at: string;
}

export default function AlphaChat() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
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
    enabled: !!user,
    refetchInterval: 5000,
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

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center">
            <BrainCircuit className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide text-foreground">AlphaLink</h1>
            <p className="text-[10px] font-mono text-muted-foreground">INYECCIÓN DE CONTEXTO MACRO • AI FUND DIRECTOR</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => purgeMutation.mutate()}
          disabled={purgeMutation.isPending}
          className="text-xs text-muted-foreground hover:text-loss gap-1.5"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Purgar Memoria</span>
        </Button>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && notes.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-16">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <BrainCircuit className="h-8 w-8 text-primary/60" />
            </div>
            <p className="text-sm text-muted-foreground max-w-md">
              Inyecta contexto macroeconómico y noticias relevantes. La IA lo usará para sesgar la aprobación de señales en los próximos 3 días.
            </p>
          </div>
        )}

        {notes.map((note) => (
          <div
            key={note.id}
            className={`flex ${note.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                note.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-muted/60 text-foreground border border-border/50 rounded-bl-sm"
              }`}
            >
              {note.role === "assistant" ? (
                <div className="prose prose-sm prose-invert max-w-none [&_p]:m-0">
                  <ReactMarkdown>{note.message}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{note.message}</p>
              )}
              <p className={`text-[10px] mt-1.5 ${
                note.role === "user" ? "text-primary-foreground/50" : "text-muted-foreground/60"
              }`}>
                {new Date(note.created_at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}

        {sendMutation.isPending && (
          <div className="flex justify-start">
            <div className="bg-muted/60 border border-border/50 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-xs font-mono">PROCESANDO CONTEXTO...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border bg-card/50 backdrop-blur-sm p-3">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Inyectar contexto macro, noticias, o instrucciones de sesgo..."
            className="min-h-[44px] max-h-32 resize-none bg-background/80 border-border/60 rounded-xl text-sm"
            rows={1}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || sendMutation.isPending}
            className="h-11 w-11 rounded-xl shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
