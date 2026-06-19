import React, { useState, useEffect } from "react";

interface PhoneNumberInputProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  autoComplete?: string;
}

const COUNTRY_OPTIONS = [
  { label: "Venezuela (+58)", value: "+58" },
];

function splitPhoneNumber(fullNumber: string) {
  for (const option of COUNTRY_OPTIONS) {
    if (fullNumber.startsWith(option.value)) {
      return {
        prefix: option.value,
        number: fullNumber.slice(option.value.length),
      };
    }
  }
  // Default to first option if not matched
  return { prefix: COUNTRY_OPTIONS[0].value, number: fullNumber };
}

export const PhoneNumberInput: React.FC<PhoneNumberInputProps> = ({ value, onChange, id, name, autoComplete }) => {
  const [prefix, setPrefix] = useState(COUNTRY_OPTIONS[0].value);
  const [number, setNumber] = useState("");

  useEffect(() => {
    const { prefix: p, number: n } = splitPhoneNumber(value);
    setPrefix(p);
    setNumber(n);
  }, [value]);

  const handlePrefixChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPrefix = e.target.value;
    setPrefix(newPrefix);
    onChange(newPrefix + number);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newNumber = e.target.value.replace(/[^0-9]/g, "");
    setNumber(newNumber);
    onChange(prefix + newNumber);
  };

  return (
    <div className="flex gap-2 w-full max-w-full">
      <select
        value={prefix}
        onChange={handlePrefixChange}
        aria-label="Código de país"
        className="h-11 px-3 border border-border rounded-xl focus:ring-2 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)] transition-[border-color,box-shadow] duration-200 bg-card/50 text-foreground shrink-0"
        style={{ width: 120 }}
      >
        {COUNTRY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        id={id}
        name={name}
        type="tel"
        value={number}
        onChange={handleNumberChange}
        placeholder="Número de teléfono"
        autoComplete={autoComplete}
        className="flex-1 min-w-0 h-11 px-4 border border-border rounded-xl focus:ring-2 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)] transition-[border-color,box-shadow] duration-200 bg-card/50 text-foreground"
      />
    </div>
  );
};
