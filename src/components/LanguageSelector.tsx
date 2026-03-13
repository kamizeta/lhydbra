import { useState, useRef, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { useI18n, languageNames, languageFlags, type Language } from '@/i18n';
import { cn } from '@/lib/utils';

const languages: Language[] = ['es', 'en', 'pt', 'fr'];

export default function LanguageSelector({ collapsed }: { collapsed?: boolean }) {
  const { language, setLanguage } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
      >
        <Globe className="h-4 w-4 shrink-0" />
        {!collapsed && (
          <span className="text-xs font-mono">
            {languageFlags[language]} {languageNames[language]}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-40 rounded-md border border-border bg-popover p-1 shadow-lg z-50">
          {languages.map(lang => (
            <button
              key={lang}
              onClick={() => { setLanguage(lang); setOpen(false); }}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors",
                lang === language
                  ? "bg-primary/10 text-primary"
                  : "text-popover-foreground hover:bg-accent"
              )}
            >
              <span>{languageFlags[lang]}</span>
              <span>{languageNames[lang]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
