import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import Icon from "./Icon";

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownSelectProps {
  value: string;
  options: DropdownOption[];
  ariaLabel: string;
  className?: string;
  onChange: (value: string) => void;
}

export default function DropdownSelect({
  value,
  options,
  ariaLabel,
  className = "",
  onChange,
}: DropdownSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const selectedIndex = Math.max(
    options.findIndex((option) => option.value === value),
    0,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selectedOption = options[selectedIndex];

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function closeOnKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape" || event.key === "Tab") {
        setIsOpen(false);
        if (event.key === "Escape") {
          triggerRef.current?.focus();
        }
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnKeyboard);
    };
  }, [isOpen]);

  function toggleListbox() {
    setActiveIndex(selectedIndex);
    setIsOpen((open) => !open);
  }

  function chooseOption(index: number) {
    const option = options[index];
    if (!option) {
      return;
    }
    onChange(option.value);
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!options.length) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      if (!isOpen) {
        setActiveIndex(selectedIndex);
        setIsOpen(true);
      } else {
        setActiveIndex((current) => (current + direction + options.length) % options.length);
      }
    } else if (isOpen && event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (isOpen && event.key === "End") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (isOpen && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      chooseOption(activeIndex);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleListbox();
    }
  }

  return (
    <div className={`dropdown-select ${className}`.trim()} ref={rootRef}>
      <button
        aria-activedescendant={isOpen ? `${listboxId}-option-${activeIndex}` : undefined}
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`${ariaLabel}: ${selectedOption?.label ?? "Select an option"}`}
        className="dropdown-select-trigger"
        onClick={toggleListbox}
        onKeyDown={handleKeyDown}
        ref={triggerRef}
        role="combobox"
        type="button"
      >
        <span className="truncate">{selectedOption?.label ?? "Select an option"}</span>
        <Icon className="dropdown-select-chevron" name="selectChevron" />
      </button>
      {isOpen ? (
        <div
          aria-label={ariaLabel}
          className="dropdown-select-menu"
          id={listboxId}
          role="listbox"
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            const active = index === activeIndex;
            return (
              <div
                aria-selected={selected}
                className={[
                  "dropdown-select-option",
                  active ? "dropdown-select-option-active" : "",
                  selected ? "dropdown-select-option-selected" : "",
                ].filter(Boolean).join(" ")}
                id={`${listboxId}-option-${index}`}
                key={option.value}
                onClick={() => chooseOption(index)}
                onPointerDown={(event) => event.preventDefault()}
                onPointerMove={() => setActiveIndex(index)}
                role="option"
              >
                {option.label}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
