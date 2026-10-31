"use client";

import { Check, Circle } from "lucide-react";

interface PasswordRulesProps {
  value: string;
}

export function validatePasswordRules(password: string) {
  return {
    length: password.length > 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

export function PasswordRules({ value }: PasswordRulesProps) {
  const rules = validatePasswordRules(value);

  const items = [
    { label: "More than 8 characters", valid: rules.length },
    { label: "At least one uppercase letter", valid: rules.upper },
    { label: "At least one lowercase letter", valid: rules.lower },
    { label: "At least one special character", valid: rules.special },
  ];

  return (
    <div className="space-y-1.5 rounded-md border border-line bg-canvas/60 p-2.5 text-xs">
      <p className="font-medium text-ink-2">Password requirements:</p>
      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-1.5 transition-colors ${
              item.valid ? "text-teal font-medium" : "text-ink-3"
            }`}
          >
            {item.valid ? (
              <Check className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" />
            ) : (
              <Circle className="h-2 w-2 shrink-0 fill-current opacity-40 ml-0.5 mr-1" />
            )}
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
