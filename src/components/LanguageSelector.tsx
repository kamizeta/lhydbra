import { useState, useRef, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { useI18n, languageNames, languageFlags, type Language } from '@/i18n';
import { cn } from '@/lib/utils';

const languages: Language[] = ['en', 'es'];

export default function LanguageSelector({ collapsed, variant = 'sidebar' }: { collapsed?: boolean; variant?: 'sidebar' | 'header' }) {
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

  const isHeader = variant === 'header';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 rounded-md text-sm transition-colors",
          isHeader
            ? "px-2.5 py-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground border border-border"
            : "w-full px-3 py-2 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <Globe className="h-3.5 w-3.5 shrink-0" />
        {(!collapsed || isHeader) && (
          <span className="text-xs font-mono">
            {languageFlags[language]} {languageNames[language]}
          </span>
        )}
      </button>
      {open && (
        <div className={cn(
          "absolute w-40 rounded-md border border-border bg-popover p-1 shadow-lg z-50",
          isHeader ? "top-full right-0 mt-1" : "bottom-full left-0 mb-1"
        )}>
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
