import React, { useState, useEffect } from "react";

interface PhoneNumberInputProps {
  value: string;
  onChange: (value: string) => void;
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

export const PhoneNumberInput: React.FC<PhoneNumberInputProps> = ({ value, onChange }) => {
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
    <div className="flex gap-2 w-full">
      <select
        value={prefix}
        onChange={handlePrefixChange}
        className="h-11 px-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200 bg-white text-gray-900"
        style={{ minWidth: 120 }}
      >
        {COUNTRY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        type="tel"
        value={number}
        onChange={handleNumberChange}
        placeholder="Número de teléfono"
        className="flex-1 h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200 bg-white text-gray-900"
      />
    </div>
  );
};
