import { Check, Circle } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/auth";

/** Live rule-by-rule feedback so nobody has to guess why a password was refused. */
export function PasswordChecklist({ value, id }: { value: string; id?: string }) {
  return (
    <ul id={id} className="grid grid-cols-1 gap-1.5 text-[13px] sm:grid-cols-2" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value);
        return (
          <li key={rule.id} className={`flex items-center gap-2 transition-colors ${ok ? "text-teal" : "text-ink-2"}`}>
            {ok ? <Check size={14} aria-hidden /> : <Circle size={14} aria-hidden />}
            <span>{rule.label}</span>
            <span className="sr-only">{ok ? "met" : "not met yet"}</span>
          </li>
        );
      })}
    </ul>
  );
}
